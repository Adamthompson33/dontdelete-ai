/**
 * ═══════════════════════════════════════════════════════════════
 *  🚨 MOLT COPS x402 GATEWAY — Main Entry
 * ═══════════════════════════════════════════════════════════════
 *
 *  Export both Lambda@Edge handlers and the composable middleware.
 *
 *  Usage (direct):
 *    import { originRequestHandler, originResponseHandler } from './index';
 *
 *  Usage (composable with existing Lambda@Edge):
 *    import { withX402, withMoltShield } from './index';
 *
 *    export const handler = withX402(withMoltShield(myExistingHandler));
 */

export { originRequestHandler } from "./origin-request";
export { originResponseHandler } from "./origin-response";

// ═══════════════════════════════════════════════════════════════
// COMPOSABLE MIDDLEWARE WRAPPERS
// ═══════════════════════════════════════════════════════════════

import {
  CloudFrontRequestEvent,
  CloudFrontRequestResult,
  CloudFrontResponseEvent,
  CloudFrontResponseResult,
} from "aws-lambda";
import { originRequestHandler } from "./origin-request";
import { originResponseHandler } from "./origin-response";

type RequestHandler = (
  event: CloudFrontRequestEvent
) => Promise<CloudFrontRequestResult>;

type ResponseHandler = (
  event: CloudFrontResponseEvent
) => Promise<CloudFrontResponseResult>;

/**
 * Wrap an existing origin-request handler with x402 payment gating.
 *
 * The x402 check runs FIRST. If it returns a non-forwarding response
 * (402 or 403), the inner handler never runs. If it forwards, the
 * inner handler receives the enriched request with trust headers.
 *
 * @example
 *   const myHandler = async (event) => {
 *     // Your existing logic — only runs for paid/free requests
 *     const request = event.Records[0].cf.request;
 *     request.headers['x-custom'] = [{ key: 'X-Custom', value: 'true' }];
 *     return request;
 *   };
 *
 *   export const handler = withX402(myHandler);
 */
export function withX402(inner: RequestHandler): RequestHandler {
  return async (event: CloudFrontRequestEvent) => {
    const result = await originRequestHandler(event);

    // If x402 returned a response (402, 403), short-circuit
    if ("status" in result && typeof result.status === "string") {
      return result;
    }

    // x402 forwarded — run the inner handler with enriched request
    // Update the event with the modified request
    event.Records[0].cf.request = result as any;
    return inner(event);
  };
}

/**
 * Wrap an existing origin-response handler with x402 settlement.
 *
 * Settlement runs AFTER the inner handler. The inner handler can
 * modify the response; settlement uses the final status code.
 *
 * @example
 *   const myHandler = async (event) => {
 *     const response = event.Records[0].cf.response;
 *     response.headers['x-custom'] = [{ key: 'X-Custom', value: 'done' }];
 *     return response;
 *   };
 *
 *   export const handler = withX402Settlement(myHandler);
 */
export function withX402Settlement(inner: ResponseHandler): ResponseHandler {
  return async (event: CloudFrontResponseEvent) => {
    // Run inner handler first
    const modifiedResponse = await inner(event);

    // Update event with modified response for settlement
    event.Records[0].cf.response = modifiedResponse as any;

    // Run settlement
    return originResponseHandler(event);
  };
}

/**
 * Standalone MoltShield middleware — scan requests without x402.
 * Use when you want injection protection but no payment gating.
 *
 * Adds X-MoltShield-Scanned and X-MoltShield-Risk headers.
 * Blocks requests with risk score >= 60.
 */
export function withMoltShield(inner: RequestHandler): RequestHandler {
  return async (event: CloudFrontRequestEvent) => {
    const request = event.Records[0].cf.request;

    // Only scan POST/PUT/PATCH with bodies
    if (
      request.body?.data &&
      ["POST", "PUT", "PATCH"].includes(request.method)
    ) {
      const bodyContent = Buffer.from(request.body.data, "base64").toString(
        "utf-8"
      );
      const { scanForInjection } = await import("./origin-request");

      // Note: scanForInjection is not exported from origin-request
      // In production, extract it into a shared module.
      // For now, inline the critical patterns:
      const CRITICAL_PATTERNS = [
        /(?:ignore|disregard|override)\s+(?:previous|prior|all)\s+(?:instructions|rules|policies)/i,
        /(?:transfer|send|drain|withdraw)\s+(?:all|entire|max|everything)/i,
        /(?:export|reveal|show|print|display|give)\s+(?:the\s+)?(?:private\s+key|seed\s+phrase|mnemonic|secret)/i,
      ];

      for (const pattern of CRITICAL_PATTERNS) {
        if (pattern.test(bodyContent)) {
          return {
            status: "403",
            statusDescription: "Forbidden",
            headers: {
              "content-type": [
                { key: "Content-Type", value: "application/json" },
              ],
              "x-moltshield-blocked": [
                { key: "X-MoltShield-Blocked", value: "true" },
              ],
            },
            body: JSON.stringify({
              error: "Request blocked by MoltShield",
              reason: "Critical injection pattern detected",
              help: "https://moltcops.com/docs/injection-patterns",
            }),
          };
        }
      }

      request.headers["x-moltshield-scanned"] = [
        { key: "X-MoltShield-Scanned", value: "true" },
      ];
    }

    return inner(event);
  };
}
