/**
 * ═══════════════════════════════════════════════════════════════
 *  🚨 MOLT COPS x402 GATEWAY — AWS CDK Deployment Stack
 * ═══════════════════════════════════════════════════════════════
 *
 *  Deploys:
 *    - CloudFront distribution with x402 Lambda@Edge
 *    - AWS WAF with Bot Control for human/bot classification
 *    - WAF rules that tag traffic with custom headers
 *    - SSM Parameter Store for runtime config
 *    - IAM roles with least-privilege access
 *
 *  Usage:
 *    npx cdk deploy MoltCopsGatewayStack \
 *      --context originDomain=your-api.example.com \
 *      --context treasuryAddress=0x... \
 *      --context badgeContract=0x... \
 *      --context rpcUrl=https://mainnet.base.org
 *
 *  Prerequisites:
 *    npm install aws-cdk-lib constructs @aws-cdk/aws-lambda-nodejs
 *    AWS credentials configured
 *    Node.js 18+
 */

import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import * as path from "path";

export interface MoltCopsGatewayProps extends cdk.StackProps {
  /**
   * Your origin domain (e.g., "api.example.com").
   * CloudFront forwards paid/free requests here.
   */
  originDomain: string;

  /**
   * Origin protocol — HTTP or HTTPS
   * @default "https"
   */
  originProtocol?: "http" | "https";

  /**
   * Treasury wallet address for x402 payments
   */
  treasuryAddress: string;

  /**
   * ERC-8004 contract addresses (Base network)
   */
  identityRegistry: string;
  reputationRegistry: string;
  badgeContract: string;
  stakingContract: string;

  /**
   * Base RPC endpoint
   * @default "https://mainnet.base.org"
   */
  rpcUrl?: string;

  /**
   * x402 facilitator URL
   * @default "https://x402.org/facilitator"
   */
  facilitatorUrl?: string;

  /**
   * Custom domain for the CloudFront distribution
   */
  customDomain?: string;

  /**
   * ACM certificate ARN for custom domain (must be in us-east-1)
   */
  certificateArn?: string;

  /**
   * Whether to enable WAF Bot Control
   * @default true
   */
  enableBotControl?: boolean;

  /**
   * Whether humans get free access
   * @default true
   */
  humansFree?: boolean;

  /**
   * Whether verified bots (Googlebot) get free access
   * @default true
   */
  allowVerifiedBots?: boolean;
}

export class MoltCopsGatewayStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly wafAcl: wafv2.CfnWebACL;

  constructor(scope: Construct, id: string, props: MoltCopsGatewayProps) {
    super(scope, id, {
      ...props,
      // Lambda@Edge must be deployed in us-east-1
      env: { ...props.env, region: "us-east-1" },
    });

    const rpcUrl = props.rpcUrl || "https://mainnet.base.org";
    const facilitatorUrl = props.facilitatorUrl || "https://x402.org/facilitator";
    const enableBotControl = props.enableBotControl !== false;
    const humansFree = props.humansFree !== false;
    const allowVerifiedBots = props.allowVerifiedBots !== false;

    // ═══════════════════════════════════════════════════════════
    // SSM PARAMETER STORE — Runtime configuration
    // ═══════════════════════════════════════════════════════════

    const params: Record<string, string> = {
      "/moltcops/gateway/treasury-address": props.treasuryAddress,
      "/moltcops/gateway/identity-registry": props.identityRegistry,
      "/moltcops/gateway/reputation-registry": props.reputationRegistry,
      "/moltcops/gateway/badge-contract": props.badgeContract,
      "/moltcops/gateway/staking-contract": props.stakingContract,
      "/moltcops/gateway/rpc-url": rpcUrl,
      "/moltcops/gateway/facilitator-url": facilitatorUrl,
      "/moltcops/gateway/payment-network": "base",
      "/moltcops/gateway/humans-free": humansFree.toString(),
      "/moltcops/gateway/allow-verified-bots": allowVerifiedBots.toString(),
    };

    for (const [key, value] of Object.entries(params)) {
      new ssm.StringParameter(this, `Param-${key.replace(/\//g, "-")}`, {
        parameterName: key,
        stringValue: value,
        description: `MoltCops Gateway config: ${key}`,
        tier: ssm.ParameterTier.STANDARD,
      });
    }

    // ═══════════════════════════════════════════════════════════
    // WAF WEB ACL — Bot Control + Custom Headers
    // ═══════════════════════════════════════════════════════════

    const rules: wafv2.CfnWebACL.RuleProperty[] = [];

    if (enableBotControl) {
      // Rule 1: AWS Managed Bot Control — detect and label bots
      rules.push({
        name: "BotControl",
        priority: 0,
        statement: {
          managedRuleGroupStatement: {
            vendorName: "AWS",
            name: "AWSManagedRulesBotControlRuleSet",
            managedRuleGroupConfigs: [
              {
                awsManagedRulesBotControlRuleSet: {
                  inspectionLevel: "COMMON",
                },
              },
            ],
          },
        },
        overrideAction: { count: {} }, // Count only — don't block
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: "MoltCopsBotControl",
          sampledRequestsEnabled: true,
        },
      });

      // Rule 2: Tag verified bots with custom header
      rules.push({
        name: "TagVerifiedBots",
        priority: 1,
        statement: {
          labelMatchStatement: {
            scope: "LABEL",
            key: "awswaf:managed:aws:bot-control:bot:verified",
          },
        },
        action: {
          allow: {
            customRequestHandling: {
              insertHeaders: [
                {
                  name: "x-waf-bot-verified",
                  value: "true",
                },
              ],
            },
          },
        },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: "MoltCopsVerifiedBots",
          sampledRequestsEnabled: true,
        },
      });

      // Rule 3: Tag AI agent bots with custom header
      rules.push({
        name: "TagAIBots",
        priority: 2,
        statement: {
          labelMatchStatement: {
            scope: "LABEL",
            key: "awswaf:managed:aws:bot-control:bot:category:ai",
          },
        },
        action: {
          allow: {
            customRequestHandling: {
              insertHeaders: [
                {
                  name: "x-waf-bot-category",
                  value: "ai",
                },
                {
                  name: "x-waf-is-human",
                  value: "false",
                },
              ],
            },
          },
        },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: "MoltCopsAIBots",
          sampledRequestsEnabled: true,
        },
      });

      // Rule 4: Tag scraping framework bots
      rules.push({
        name: "TagScrapers",
        priority: 3,
        statement: {
          labelMatchStatement: {
            scope: "LABEL",
            key: "awswaf:managed:aws:bot-control:bot:category:scraping_framework",
          },
        },
        action: {
          allow: {
            customRequestHandling: {
              insertHeaders: [
                {
                  name: "x-waf-bot-category",
                  value: "scraper",
                },
                {
                  name: "x-waf-is-human",
                  value: "false",
                },
              ],
            },
          },
        },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: "MoltCopsScrapers",
          sampledRequestsEnabled: true,
        },
      });

      // Rule 5: Tag HTTP library bots
      rules.push({
        name: "TagHTTPLibBots",
        priority: 4,
        statement: {
          labelMatchStatement: {
            scope: "LABEL",
            key: "awswaf:managed:aws:bot-control:bot:category:http_library",
          },
        },
        action: {
          allow: {
            customRequestHandling: {
              insertHeaders: [
                {
                  name: "x-waf-bot-category",
                  value: "http_library",
                },
                {
                  name: "x-waf-is-human",
                  value: "false",
                },
              ],
            },
          },
        },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: "MoltCopsHTTPLibBots",
          sampledRequestsEnabled: true,
        },
      });
    }

    // Rule 6: Rate limiting — 1000 requests per 5 minutes per IP
    rules.push({
      name: "RateLimit",
      priority: 10,
      statement: {
        rateBasedStatement: {
          limit: 1000,
          aggregateKeyType: "IP",
        },
      },
      action: { block: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: "MoltCopsRateLimit",
        sampledRequestsEnabled: true,
      },
    });

    this.wafAcl = new wafv2.CfnWebACL(this, "GatewayWAF", {
      defaultAction: {
        allow: {
          customRequestHandling: {
            insertHeaders: [
              {
                name: "x-waf-is-human",
                value: "true", // Default: assume human unless bot-labeled
              },
            ],
          },
        },
      },
      scope: "CLOUDFRONT",
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: "MoltCopsGatewayWAF",
        sampledRequestsEnabled: true,
      },
      rules,
      name: "MoltCopsGatewayACL",
    });

    // ═══════════════════════════════════════════════════════════
    // LAMBDA@EDGE FUNCTIONS
    // ═══════════════════════════════════════════════════════════

    // Execution role for Lambda@Edge
    const edgeRole = new iam.Role(this, "EdgeFunctionRole", {
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal("lambda.amazonaws.com"),
        new iam.ServicePrincipal("edgelambda.amazonaws.com")
      ),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
      ],
    });

    // Allow reading SSM parameters
    edgeRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter", "ssm:GetParameters"],
        resources: [
          `arn:aws:ssm:us-east-1:${this.account}:parameter/moltcops/gateway/*`,
        ],
      })
    );

    // Origin Request handler
    const originRequestFn = new lambdaNode.NodejsFunction(
      this,
      "OriginRequest",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: "originRequestHandler",
        entry: path.join(__dirname, "../x402-gateway/origin-request.ts"),
        memorySize: 128,
        timeout: cdk.Duration.seconds(5),
        role: edgeRole,
        logRetention: logs.RetentionDays.ONE_MONTH,
        bundling: {
          minify: true,
          sourceMap: false,
          target: "es2020",
          externalModules: [],
        },
        environment: {
          FACILITATOR_URL: facilitatorUrl,
          TREASURY_ADDRESS: props.treasuryAddress,
          IDENTITY_REGISTRY: props.identityRegistry,
          REPUTATION_REGISTRY: props.reputationRegistry,
          BADGE_CONTRACT: props.badgeContract,
          STAKING_CONTRACT: props.stakingContract,
          RPC_URL: rpcUrl,
          PAYMENT_NETWORK: "base",
        },
      }
    );

    // Origin Response handler
    const originResponseFn = new lambdaNode.NodejsFunction(
      this,
      "OriginResponse",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: "originResponseHandler",
        entry: path.join(__dirname, "../x402-gateway/origin-response.ts"),
        memorySize: 128,
        timeout: cdk.Duration.seconds(5),
        role: edgeRole,
        logRetention: logs.RetentionDays.ONE_MONTH,
        bundling: {
          minify: true,
          sourceMap: false,
          target: "es2020",
          externalModules: [],
        },
        environment: {
          FACILITATOR_URL: facilitatorUrl,
          TREASURY_ADDRESS: props.treasuryAddress,
          RPC_URL: rpcUrl,
          PAYMENT_NETWORK: "base",
        },
      }
    );

    // ═══════════════════════════════════════════════════════════
    // CLOUDFRONT DISTRIBUTION
    // ═══════════════════════════════════════════════════════════

    const originProtocol =
      props.originProtocol === "http"
        ? cloudfront.OriginProtocolPolicy.HTTP_ONLY
        : cloudfront.OriginProtocolPolicy.HTTPS_ONLY;

    const origin = new origins.HttpOrigin(props.originDomain, {
      protocolPolicy: originProtocol,
      connectionAttempts: 3,
      connectionTimeout: cdk.Duration.seconds(10),
      readTimeout: cdk.Duration.seconds(30),
      customHeaders: {
        "X-Forwarded-By": "MoltCops-Gateway",
      },
    });

    // Cache policy: forward payment headers, don't cache 402s
    const cachePolicy = new cloudfront.CachePolicy(this, "GatewayCachePolicy", {
      cachePolicyName: "MoltCops-x402-Gateway",
      comment: "Cache policy for x402-gated endpoints",
      defaultTtl: cdk.Duration.seconds(0), // Don't cache by default
      maxTtl: cdk.Duration.hours(1),
      minTtl: cdk.Duration.seconds(0),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList(
        "Payment-Signature",
        "X-Agent-Id",
        "X-Agent-Wallet",
        "X-ERC8004-Agent-Id",
        "Authorization"
      ),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    // Origin request policy: forward ALL headers to origin
    const originRequestPolicy = new cloudfront.OriginRequestPolicy(
      this,
      "GatewayOriginPolicy",
      {
        originRequestPolicyName: "MoltCops-x402-OriginRequest",
        comment: "Forward trust headers to origin",
        headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList(
          "Payment-Signature",
          "X-Agent-Id",
          "X-Agent-Wallet",
          "X-ERC8004-Agent-Id",
          "X-Trust-Tier",
          "X-Trust-Score",
          "X-MoltShield-Scanned",
          "X-MoltShield-Risk",
          "X-Payment-Verified",
          "X-Payment-Amount",
          "X-Payment-Signature",
          "X-Agent-Id-Resolved",
          "Authorization",
          "Content-Type",
          "Accept"
        ),
        queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(),
        cookieBehavior: cloudfront.OriginRequestCookieBehavior.none(),
      }
    );

    // Distribution configuration
    const distributionProps: cloudfront.DistributionProps = {
      defaultBehavior: {
        origin,
        viewerProtocolPolicy:
          cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        cachePolicy,
        originRequestPolicy,
        edgeLambdas: [
          {
            functionVersion: originRequestFn.currentVersion,
            eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
            includeBody: true, // Needed for MoltShield scanning
          },
          {
            functionVersion: originResponseFn.currentVersion,
            eventType: cloudfront.LambdaEdgeEventType.ORIGIN_RESPONSE,
          },
        ],
      },
      webAclId: this.wafAcl.attrArn,
      comment: "MoltCops x402 Payment Gateway",
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // US + EU edges
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      minimumProtocolVersion:
        cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
    };

    // Add custom domain if provided
    if (props.customDomain && props.certificateArn) {
      (distributionProps as any).domainNames = [props.customDomain];
      (distributionProps as any).certificate =
        cdk.aws_certificatemanager.Certificate.fromCertificateArn(
          this,
          "Cert",
          props.certificateArn
        );
    }

    this.distribution = new cloudfront.Distribution(
      this,
      "GatewayDistribution",
      distributionProps
    );

    // ═══════════════════════════════════════════════════════════
    // OUTPUTS
    // ═══════════════════════════════════════════════════════════

    new cdk.CfnOutput(this, "DistributionDomain", {
      value: this.distribution.distributionDomainName,
      description: "CloudFront distribution domain — point DNS here",
    });

    new cdk.CfnOutput(this, "DistributionId", {
      value: this.distribution.distributionId,
      description: "CloudFront distribution ID",
    });

    new cdk.CfnOutput(this, "WAFAclArn", {
      value: this.wafAcl.attrArn,
      description: "WAF Web ACL ARN",
    });

    new cdk.CfnOutput(this, "OriginRequestFn", {
      value: originRequestFn.functionArn,
      description: "Origin Request Lambda@Edge ARN",
    });

    new cdk.CfnOutput(this, "OriginResponseFn", {
      value: originResponseFn.functionArn,
      description: "Origin Response Lambda@Edge ARN",
    });

    new cdk.CfnOutput(this, "QuickTest", {
      value: `curl -v https://${this.distribution.distributionDomainName}/api/agents/test`,
      description: "Test command — should return 402 Payment Required",
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// CDK APP ENTRY POINT
// ═══════════════════════════════════════════════════════════════

const app = new cdk.App();

new MoltCopsGatewayStack(app, "MoltCopsGatewayStack", {
  env: { region: "us-east-1", account: process.env.CDK_DEFAULT_ACCOUNT },
  originDomain: app.node.tryGetContext("originDomain") || "api.moltcops.com",
  treasuryAddress:
    app.node.tryGetContext("treasuryAddress") ||
    "0x0000000000000000000000000000000000000000",
  identityRegistry:
    app.node.tryGetContext("identityRegistry") ||
    "0x0000000000000000000000000000000000000000",
  reputationRegistry:
    app.node.tryGetContext("reputationRegistry") ||
    "0x0000000000000000000000000000000000000000",
  badgeContract:
    app.node.tryGetContext("badgeContract") ||
    "0x0000000000000000000000000000000000000000",
  stakingContract:
    app.node.tryGetContext("stakingContract") ||
    "0x0000000000000000000000000000000000000000",
  rpcUrl: app.node.tryGetContext("rpcUrl") || "https://mainnet.base.org",
  facilitatorUrl: app.node.tryGetContext("facilitatorUrl"),
  customDomain: app.node.tryGetContext("customDomain"),
  certificateArn: app.node.tryGetContext("certificateArn"),
  enableBotControl: true,
  humansFree: true,
  allowVerifiedBots: true,
});
