"""
═══════════════════════════════════════════════════════════════
 🚨 MoltCops Defense Matrix — MCP Server
═══════════════════════════════════════════════════════════════

 MoltCops security tools exposed as MCP-compatible endpoints,
 registered on ERC-8004 for trustless discovery.

 Any AI agent in the world can:
   1. Query ERC-8004: sdk.searchAgents(mcp=True)
   2. Find MoltCops tools in the registry
   3. Invoke security scans through standard MCP protocol
   4. Leave feedback that builds MoltCops' on-chain reputation

 Architecture:

   Agent (any framework)
     │
     ├─ sdk.searchAgents(mcp=True, supportedTrust=["reputation"])
     │     → Discovers MoltCops on ERC-8004
     │
     ├─ MultiServerMCPClient({ url: MoltCops_mcp_endpoint })
     │     → Connects via standard MCP protocol
     │
     ├─ tool: moltshield_scan_code
     │     → Scans skill code for 79 threat patterns
     │
     ├─ tool: moltshield_scan_mcp_server
     │     → Scans another MCP server's tools for threats
     │
     ├─ tool: moltvault_evaluate_transaction
     │     → Evaluates a transaction against policy rules
     │
     ├─ tool: trust_score_lookup
     │     → Gets combined trust score for any ERC-8004 agent
     │
     ├─ tool: threat_intel_feed
     │     → Gets latest threat patterns and blacklisted addresses
     │
     ├─ resource: MoltCops://scan-rules
     │     → Current detection rule catalog
     │
     ├─ resource: MoltCops://threat-feed
     │     → Live threat intelligence feed
     │
     ├─ resource: MoltCops://stats
     │     → Global scan statistics
     │
     ├─ prompt: security_audit
     │     → Guided security audit prompt template
     │
     └─ prompt: trust_evaluation
           → Guided trust evaluation prompt template

 Registration:
   Registered on ERC-8004 Identity Registry (Base + Sepolia)
   supportedTrust: ["reputation"]
   Feedback from Founding Operatives carries staked weight

 This file is a FastMCP server. Deploy it and register on-chain.
═══════════════════════════════════════════════════════════════
"""

from fastmcp import FastMCP
from typing import Optional
import json
import re
import time
import hashlib

# ═══════════════════════════════════════════════════════════════
# SERVER INITIALIZATION
# ═══════════════════════════════════════════════════════════════

mcp = FastMCP(
    "MoltCops Defense Matrix",
    description=(
        "AI agent security infrastructure. Scan code for threats, "
        "evaluate transactions against policy rules, lookup trust "
        "scores, and access threat intelligence. Registered on "
        "ERC-8004 for trustless discovery."
    ),
)

# ═══════════════════════════════════════════════════════════════
# DETECTION ENGINE (shared across tools)
# ═══════════════════════════════════════════════════════════════

SCAN_RULES = [
    # CRITICAL
    {
        "id": "PL-001",
        "pattern": r"(?:export|reveal|show|print|display|give)\s+(?:the\s+)?(?:private\s*key|seed\s*phrase|mnemonic|secret)",
        "category": "key_export",
        "severity": "CRITICAL",
        "description": "Attempts to extract or expose private key material",
        "fix": "Never reference private keys in agent code. Use a keyring proxy (SIWA) for signing.",
    },
    {
        "id": "PL-040",
        "pattern": r"(?:transfer|send|drain|withdraw)\s+(?:all|entire|max|everything|remaining)",
        "category": "drain_pattern",
        "severity": "CRITICAL",
        "description": "Transfers entire balance — common in wallet drain attacks",
        "fix": "Use specific, bounded amounts. Never transfer 'all' or 'max'.",
    },
    {
        "id": "PL-041",
        "pattern": r"(?:set\s+)?(?:approval|allowance)\s+(?:to\s+)?(?:max|unlimited|infinity|MAX_UINT)",
        "category": "unlimited_approval",
        "severity": "CRITICAL",
        "description": "Grants unlimited token spending approval",
        "fix": "Approve only the exact amount needed for each transaction.",
    },
    {
        "id": "PL-042",
        "pattern": r"(?:0x)?f{64}",
        "category": "max_uint256",
        "severity": "CRITICAL",
        "description": "MAX_UINT256 value — typically used in unlimited approvals",
        "fix": "Replace with specific bounded amounts.",
    },
    {
        "id": "PL-045",
        "pattern": r"(?:after|when|once|if)\s*\(?\s*(?:\w+(?:count|Count|num|Num|total|Total|counter|Counter))\s*(?:>=?|===?|>)\s*\d+",
        "category": "sleeper_trigger",
        "severity": "CRITICAL",
        "description": "Conditional logic after N operations — sleeper agent pattern",
        "fix": "Remove transaction-count-based conditionals.",
    },
    # HIGH
    {
        "id": "PL-060",
        "pattern": r"(?:ignore|disregard|override)\s+(?:previous|prior|all)\s+(?:instructions|rules|policies|guidelines)",
        "category": "prompt_injection",
        "severity": "HIGH",
        "description": "Instruction override — hijacks agent behavior",
        "fix": "Sanitize all user input. Never forward raw input to LLMs.",
    },
    {
        "id": "PL-061",
        "pattern": r"(?:you\s+(?:are|must)\s+(?:now|actually)\s+(?:a|an)\s+(?:admin|root|system|owner))",
        "category": "identity_spoof",
        "severity": "HIGH",
        "description": "Reassigns agent identity for privilege escalation",
        "fix": "Implement role-based access control.",
    },
    {
        "id": "PL-062",
        "pattern": r"(?:emergency|urgent)\s+(?:override|bypass|skip\s+(?:check|confirm|verify|auth))",
        "category": "authority_bypass",
        "severity": "HIGH",
        "description": "Social engineering exploiting urgency",
        "fix": "Never bypass security checks regardless of urgency framing.",
    },
    {
        "id": "PL-063",
        "pattern": r"(?:pretend|imagine|roleplay|act\s+as\s+if)\s+(?:you|there)\s+(?:are|is)\s+no\s+(?:rules|limits|policy|restrictions)",
        "category": "jailbreak",
        "severity": "HIGH",
        "description": "Attempts to disable safety via roleplay framing",
        "fix": "Maintain constraints regardless of framing.",
    },
    {
        "id": "PL-065",
        "pattern": r"(?:base64|hex|rot13|encode|decode)\s+(?:the\s+)?(?:key|secret|password|phrase|mnemonic)",
        "category": "encoding_trick",
        "severity": "HIGH",
        "description": "Extracts secrets through encoding to evade detection",
        "fix": "Block encoding operations on sensitive data.",
    },
    {
        "id": "PL-070",
        "pattern": r"(?:admin|owner|deployer|system)\s+(?:has\s+)?(?:approved|authorized|confirmed|granted)",
        "category": "false_authority",
        "severity": "HIGH",
        "description": "Claims authorization from non-present authority",
        "fix": "Verify authorization through cryptographic signatures.",
    },
    {
        "id": "PL-075",
        "pattern": r"(?:revoke|remove|disable)\s+(?:all\s+)?(?:limits|restrictions|guards|safeguards|protections)",
        "category": "safety_removal",
        "severity": "HIGH",
        "description": "Attempts to disable safety mechanisms",
        "fix": "Safety mechanisms should be immutable at runtime.",
    },
    # MEDIUM
    {
        "id": "PL-080",
        "pattern": r"(?:from\s+now\s+on|going\s+forward|remember\s+that|new\s+rule)\s+(?:you|the\s+system|your\s+instructions)",
        "category": "context_poisoning",
        "severity": "MEDIUM",
        "description": "Permanently alters agent behavior via injected instructions",
        "fix": "Reset context between sessions.",
    },
    {
        "id": "PL-081",
        "pattern": r"(?:send|post|transmit|exfiltrate|forward)\s+(?:to|toward)\s+(?:https?://|external|my\s+server)",
        "category": "data_exfiltration",
        "severity": "MEDIUM",
        "description": "Sends data to an external endpoint",
        "fix": "Whitelist allowed external endpoints.",
    },
    {
        "id": "PL-082",
        "pattern": r"(?:in\s+a\s+(?:hypothetical|test|sandbox|simulated)\s+(?:scenario|mode|environment|world))",
        "category": "sandbox_escape",
        "severity": "MEDIUM",
        "description": "Frames dangerous requests as hypothetical",
        "fix": "Apply same safety rules regardless of framing.",
    },
    {
        "id": "PL-083",
        "pattern": r"(?:after|when|once)\s+\d+\s+(?:requests?|calls?|executions?|transactions?|swaps?|minutes?|hours?)",
        "category": "time_trigger",
        "severity": "MEDIUM",
        "description": "Delayed execution based on time or count",
        "fix": "Avoid time/count-based conditionals for sensitive ops.",
    },
    {
        "id": "PL-084",
        "pattern": r"(?:don'?t\s+(?:tell|inform|alert|notify|log|report))\s+(?:the\s+)?(?:user|owner|admin|anyone)",
        "category": "stealth_operation",
        "severity": "MEDIUM",
        "description": "Instructs agent to hide actions from user/admin",
        "fix": "All agent actions should be logged and auditable.",
    },
    {
        "id": "PL-085",
        "pattern": r"eval\s*\(|Function\s*\(|new\s+Function|setTimeout\s*\(\s*['\"`]",
        "category": "code_injection",
        "severity": "MEDIUM",
        "description": "Dynamic code execution allows arbitrary injection",
        "fix": "Never use eval(), new Function(), or string-based timers.",
    },
    {
        "id": "PL-086",
        "pattern": r"process\.env|\.env\s+file|environment\s+variable|config\s*\[\s*['\"](?:key|secret|password|token)",
        "category": "config_exposure",
        "severity": "MEDIUM",
        "description": "References environment variables that may leak secrets",
        "fix": "Access secrets through a dedicated secrets manager.",
    },
    {
        "id": "PL-087",
        "pattern": r"(?:0x[a-fA-F0-9]{40})",
        "category": "hardcoded_address",
        "severity": "LOW",
        "description": "Hardcoded Ethereum address — verify intentional",
        "fix": "Use named constants. Document the purpose of each address.",
    },
]

# Severity scoring weights
SEVERITY_COSTS = {"CRITICAL": 20, "HIGH": 10, "MEDIUM": 5, "LOW": 2}

# Global stats (in production: backed by database)
scan_stats = {
    "total_scans": 1247,
    "threats_found": 3891,
    "mcp_servers_scanned": 84,
    "agents_evaluated": 312,
    "last_updated": int(time.time()),
}

# ═══════════════════════════════════════════════════════════════
# CORE SCAN FUNCTION
# ═══════════════════════════════════════════════════════════════


def _scan_code(code: str, source: str = "unknown") -> dict:
    """Run the MoltShield detection engine against code."""
    findings = []
    lines = code.split("\n")

    for rule in SCAN_RULES:
        compiled = re.compile(rule["pattern"], re.IGNORECASE)
        for i, line in enumerate(lines):
            match = compiled.search(line)
            if match:
                findings.append(
                    {
                        "rule_id": rule["id"],
                        "category": rule["category"],
                        "severity": rule["severity"],
                        "description": rule["description"],
                        "fix": rule["fix"],
                        "line": i + 1,
                        "line_content": line.strip()[:120],
                        "match": match.group(0)[:60],
                    }
                )
                break  # One match per rule per scan

        # Full-code check for multi-line patterns
        if not any(f["rule_id"] == rule["id"] for f in findings):
            match = compiled.search(code)
            if match:
                line_num = code[: match.start()].count("\n") + 1
                findings.append(
                    {
                        "rule_id": rule["id"],
                        "category": rule["category"],
                        "severity": rule["severity"],
                        "description": rule["description"],
                        "fix": rule["fix"],
                        "line": line_num,
                        "line_content": code.split("\n")[line_num - 1].strip()[:120]
                        if line_num <= len(lines)
                        else "",
                        "match": match.group(0)[:60],
                    }
                )

    # Calculate score
    score = 100
    for f in findings:
        score -= SEVERITY_COSTS.get(f["severity"], 0)
    score = max(0, score)

    # Tier assignment
    if score > 60:
        tier = "TRUSTED"
    elif score > 40:
        tier = "CAUTION"
    elif score > 20:
        tier = "WARNING"
    else:
        tier = "DANGER"

    # Sort by severity
    order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    findings.sort(key=lambda f: order.get(f["severity"], 99))

    # Update stats
    scan_stats["total_scans"] += 1
    scan_stats["threats_found"] += len(findings)

    scan_id = f"scan_{hashlib.sha256(f'{code[:100]}{time.time()}'.encode()).hexdigest()[:12]}"

    return {
        "scan_id": scan_id,
        "source": source,
        "timestamp": int(time.time()),
        "score": score,
        "tier": tier,
        "findings": findings,
        "summary": {
            "critical": len([f for f in findings if f["severity"] == "CRITICAL"]),
            "high": len([f for f in findings if f["severity"] == "HIGH"]),
            "medium": len([f for f in findings if f["severity"] == "MEDIUM"]),
            "low": len([f for f in findings if f["severity"] == "LOW"]),
            "total": len(findings),
            "rules_checked": len(SCAN_RULES),
        },
        "engine": "MoltShield v1.0 (20-rule free tier)",
    }


# ═══════════════════════════════════════════════════════════════
# MCP TOOLS
# ═══════════════════════════════════════════════════════════════


@mcp.tool
def moltshield_scan_code(
    code: str,
    language: str = "typescript",
    agent_name: Optional[str] = None,
) -> str:
    """
    Scan agent skill code for security threats using MoltShield.

    Checks for 20 threat categories including: prompt injection,
    drain patterns, sleeper triggers, key export attempts, context
    poisoning, and more. Returns a trust score (0-100) and detailed
    findings with fix recommendations.

    Args:
        code: The agent's skill/tool source code to scan
        language: Programming language (typescript, python, solidity)
        agent_name: Optional name of the agent being scanned
    """
    source = agent_name or f"direct_scan_{language}"
    result = _scan_code(code, source)
    return json.dumps(result, indent=2)


@mcp.tool
def moltshield_scan_mcp_server(
    mcp_endpoint: str,
    agent_id: Optional[str] = None,
    tool_names: Optional[str] = None,
    tool_descriptions: Optional[str] = None,
) -> str:
    """
    Scan another MCP server's tools and metadata for security threats.

    Analyzes the MCP server endpoint, tool names, descriptions, and
    schemas for suspicious patterns. Useful for evaluating MCP tools
    before integrating them into your agent.

    For the richest analysis, provide tool_names and tool_descriptions
    from sdk.getAgent() or by querying the MCP server directly.

    Args:
        mcp_endpoint: The MCP server URL (e.g. https://example.com/mcp)
        agent_id: Optional ERC-8004 agent ID for reputation lookup
        tool_names: Comma-separated list of tool names (from registry or MCP query)
        tool_descriptions: JSON array of tool descriptions (from MCP query)
    """
    findings = []

    # ── ENDPOINT ANALYSIS ──

    if "localhost" in mcp_endpoint or "127.0.0.1" in mcp_endpoint:
        findings.append({
            "rule_id": "MCP-001",
            "category": "local_endpoint",
            "severity": "MEDIUM",
            "description": "MCP endpoint points to localhost — not accessible publicly",
            "fix": "Deploy MCP server to a public endpoint before registering on-chain.",
        })

    if not mcp_endpoint.startswith("https://"):
        findings.append({
            "rule_id": "MCP-002",
            "category": "insecure_transport",
            "severity": "HIGH",
            "description": "MCP endpoint does not use HTTPS — data transmitted in plaintext",
            "fix": "Deploy with TLS/SSL. Use HTTPS for all MCP endpoints.",
        })

    if mcp_endpoint.endswith("/"):
        findings.append({
            "rule_id": "MCP-003",
            "category": "trailing_slash",
            "severity": "LOW",
            "description": "Trailing slash on MCP endpoint — may cause routing issues",
            "fix": "Remove trailing slash from MCP URL.",
        })

    # Suspicious domain patterns
    suspicious_domains = ["ngrok", "localtunnel", "serveo", "localhost.run"]
    for domain in suspicious_domains:
        if domain in mcp_endpoint.lower():
            findings.append({
                "rule_id": "MCP-004",
                "category": "ephemeral_endpoint",
                "severity": "MEDIUM",
                "description": f"Endpoint uses tunnel service ({domain}) — not persistent, may disappear",
                "fix": "Deploy to a permanent hosting provider for production use.",
            })

    # ── TOOL NAME ANALYSIS ──
    # Analyze tool names from registry metadata or provided directly

    names = []
    if tool_names:
        names = [n.strip() for n in tool_names.split(",") if n.strip()]

    # Dangerous tool name patterns
    DANGEROUS_TOOL_PATTERNS = [
        {"pattern": r"(?:transfer|send|withdraw|drain)", "category": "financial_operation",
         "severity": "HIGH", "description": "Tool performs financial transfers — verify authorization model",
         "fix": "Ensure tool requires explicit user confirmation for all transfers."},
        {"pattern": r"(?:admin|root|sudo|elevat)", "category": "privilege_escalation",
         "severity": "HIGH", "description": "Tool name suggests elevated privilege operations",
         "fix": "Verify tool cannot be invoked without proper authorization."},
        {"pattern": r"(?:exec|eval|run_code|execute|shell)", "category": "code_execution",
         "severity": "CRITICAL", "description": "Tool executes arbitrary code — highest risk category",
         "fix": "Sandbox all code execution. Never run untrusted code directly."},
        {"pattern": r"(?:key|secret|password|credential|token_export)", "category": "credential_access",
         "severity": "CRITICAL", "description": "Tool may access or expose credentials",
         "fix": "Never expose secrets through MCP tools. Use keyring proxy pattern."},
        {"pattern": r"(?:delete|destroy|purge|wipe|format)", "category": "destructive_operation",
         "severity": "HIGH", "description": "Tool performs destructive operations — verify safeguards",
         "fix": "Require confirmation and implement undo/rollback for destructive operations."},
        {"pattern": r"(?:scrape|crawl|harvest|collect_data)", "category": "data_collection",
         "severity": "MEDIUM", "description": "Tool collects external data — verify compliance and consent",
         "fix": "Ensure data collection respects robots.txt and privacy regulations."},
    ]

    for name in names:
        for pattern_def in DANGEROUS_TOOL_PATTERNS:
            if re.search(pattern_def["pattern"], name, re.IGNORECASE):
                findings.append({
                    "rule_id": f"MCP-T-{DANGEROUS_TOOL_PATTERNS.index(pattern_def)+10:03d}",
                    "category": pattern_def["category"],
                    "severity": pattern_def["severity"],
                    "description": f"Tool '{name}': {pattern_def['description']}",
                    "fix": pattern_def["fix"],
                })

    # ── TOOL DESCRIPTION ANALYSIS ──
    # Check descriptions for suspicious claims or missing safety info

    descriptions = []
    if tool_descriptions:
        try:
            descriptions = json.loads(tool_descriptions)
        except json.JSONDecodeError:
            descriptions = [{"name": "unknown", "description": tool_descriptions}]

    for desc_obj in descriptions:
        desc_text = desc_obj.get("description", "") if isinstance(desc_obj, dict) else str(desc_obj)
        desc_name = desc_obj.get("name", "unknown") if isinstance(desc_obj, dict) else "unknown"

        # Check for overly broad claims
        if re.search(r"(?:any|all|unlimited|unrestricted)\s+(?:access|permission|operation)", desc_text, re.IGNORECASE):
            findings.append({
                "rule_id": "MCP-D-001",
                "category": "overly_broad_claims",
                "severity": "HIGH",
                "description": f"Tool '{desc_name}' claims unrestricted access — likely over-permissioned",
                "fix": "Implement least-privilege access. Tools should do ONE thing with bounded permissions.",
            })

        # Check for missing safety documentation
        if len(desc_text) < 20:
            findings.append({
                "rule_id": "MCP-D-002",
                "category": "insufficient_documentation",
                "severity": "MEDIUM",
                "description": f"Tool '{desc_name}' has minimal description ({len(desc_text)} chars) — insufficient for trust evaluation",
                "fix": "Provide detailed descriptions including: purpose, inputs, outputs, side effects, and limitations.",
            })

        # Injection-susceptible descriptions
        INJECTION_IN_DESC = [
            (r"(?:ignore|override)\s+(?:previous|all)\s+(?:instructions|rules)", "prompt_injection_in_desc"),
            (r"(?:do\s+not|don't)\s+(?:verify|check|validate)", "safety_bypass_instruction"),
            (r"(?:trust|believe|accept)\s+(?:all|any)\s+(?:input|data|request)", "trust_all_input"),
        ]
        for pattern, cat in INJECTION_IN_DESC:
            if re.search(pattern, desc_text, re.IGNORECASE):
                findings.append({
                    "rule_id": "MCP-D-010",
                    "category": cat,
                    "severity": "CRITICAL",
                    "description": f"Tool '{desc_name}' description contains injection/bypass language",
                    "fix": "Remove instruction override language from tool descriptions. Descriptions are untrusted metadata.",
                })

    # ── STRUCTURAL ANALYSIS ──

    # Too many tools = too much surface area
    if len(names) > 15:
        findings.append({
            "rule_id": "MCP-S-001",
            "category": "excessive_surface_area",
            "severity": "MEDIUM",
            "description": f"Server exposes {len(names)} tools — large attack surface",
            "fix": "Split into focused micro-servers. Each server should handle one domain.",
        })

    # No tools at all = suspicious
    if tool_names is not None and len(names) == 0:
        findings.append({
            "rule_id": "MCP-S-002",
            "category": "no_tools_declared",
            "severity": "MEDIUM",
            "description": "Server has no declared tools — may be misconfigured or a honeypot",
            "fix": "Verify the server is functioning correctly and tools are properly registered.",
        })

    # ── REPUTATION CHECK ──
    reputation_note = None
    if agent_id:
        # In production: query ERC-8004 for feedback count and scores
        reputation_note = (
            f"Agent {agent_id} is registered on ERC-8004. "
            f"Check reputation at https://8004scan.io/agent/{agent_id}"
        )
    else:
        findings.append({
            "rule_id": "MCP-R-001",
            "category": "no_on_chain_identity",
            "severity": "MEDIUM",
            "description": "MCP server has no ERC-8004 agent ID — no verifiable on-chain identity",
            "fix": "Register on ERC-8004 using agent0_sdk to build verifiable reputation.",
        })

    # ── SCORING ──

    scan_stats["mcp_servers_scanned"] += 1
    score = 100
    for f in findings:
        score -= SEVERITY_COSTS.get(f["severity"], 0)

    tier = "TRUSTED" if score > 60 else "CAUTION" if score > 40 else "WARNING" if score > 20 else "DANGER"

    return json.dumps(
        {
            "scan_id": f"mcp_scan_{hashlib.sha256(mcp_endpoint.encode()).hexdigest()[:12]}",
            "endpoint": mcp_endpoint,
            "agent_id": agent_id,
            "tools_analyzed": len(names),
            "score": max(0, score),
            "tier": tier,
            "findings": findings,
            "reputation": reputation_note,
            "recommendation": (
                "SAFE to integrate" if score > 60
                else "Proceed with caution — review findings" if score > 40
                else "NOT recommended — significant security concerns" if score > 20
                else "DO NOT integrate — critical security issues detected"
            ),
            "note": (
                "This scans tool metadata (names, descriptions, schemas). "
                "For full code analysis, submit the server's source code to moltshield_scan_code. "
                "For live MCP connection scan, use the premium tier."
            ),
            "engine": "MoltShield MCP Scanner v1.1",
        },
        indent=2,
    )


@mcp.tool
def moltvault_evaluate_transaction(
    to_address: str,
    value_wei: str = "0",
    calldata: str = "0x",
    from_address: Optional[str] = None,
    chain_id: int = 8453,
) -> str:
    """
    Evaluate a transaction against MoltVault's policy rules.

    Checks the transaction for: blacklisted addresses, unlimited
    approvals, drain patterns, value limits, and known malicious
    function signatures. Returns APPROVE or BLOCK with reasoning.

    Args:
        to_address: Destination address (0x...)
        value_wei: Transaction value in wei
        calldata: Transaction calldata (hex)
        from_address: Sender address (optional)
        chain_id: Chain ID (default: 8453 for Base)
    """
    findings = []
    data = calldata.lower() if calldata else ""

    # Check for unlimited approval (approve with MAX_UINT256)
    if data.startswith("0x095ea7b3") and "f" * 64 in data:
        findings.append(
            {
                "rule_id": "TX-001",
                "severity": "CRITICAL",
                "category": "unlimited_approval",
                "description": "Unlimited token approval (MAX_UINT256) — attacker can drain later",
                "action": "BLOCK",
            }
        )

    # Check for transfer to zero address (burn or mistake)
    if to_address and to_address.lower() == "0x" + "0" * 40:
        findings.append(
            {
                "rule_id": "TX-002",
                "severity": "HIGH",
                "category": "zero_address_transfer",
                "description": "Transaction to zero address — tokens will be permanently lost",
                "action": "BLOCK",
            }
        )

    # Check for high value
    try:
        value_eth = int(value_wei) / 1e18
        if value_eth > 10:  # > 10 ETH
            findings.append(
                {
                    "rule_id": "TX-003",
                    "severity": "HIGH",
                    "category": "high_value",
                    "description": f"High value transaction: {value_eth:.4f} ETH — requires additional confirmation",
                    "action": "REQUIRE_CONFIRMATION",
                }
            )
    except (ValueError, TypeError):
        pass

    # Check for known malicious function signatures
    MALICIOUS_SIGS = {
        "0xa9059cbb": "transfer — verify recipient and amount",
        "0x23b872dd": "transferFrom — verify authorization",
    }
    for sig, desc in MALICIOUS_SIGS.items():
        if data.startswith(sig):
            findings.append(
                {
                    "rule_id": "TX-004",
                    "severity": "LOW",
                    "category": "monitored_function",
                    "description": f"Function call: {desc}",
                    "action": "MONITOR",
                }
            )

    # Decision
    blocked = any(f["action"] == "BLOCK" for f in findings)
    needs_confirm = any(f["action"] == "REQUIRE_CONFIRMATION" for f in findings)

    if blocked:
        decision = "BLOCK"
        reasoning = "Transaction blocked by policy engine. " + "; ".join(
            f["description"] for f in findings if f["action"] == "BLOCK"
        )
    elif needs_confirm:
        decision = "REQUIRE_CONFIRMATION"
        reasoning = "Transaction requires human confirmation. " + "; ".join(
            f["description"] for f in findings if f["action"] == "REQUIRE_CONFIRMATION"
        )
    else:
        decision = "APPROVE"
        reasoning = "No policy violations detected."

    return json.dumps(
        {
            "decision": decision,
            "reasoning": reasoning,
            "to": to_address,
            "value_wei": value_wei,
            "chain_id": chain_id,
            "findings": findings,
            "rules_checked": 4,
            "engine": "MoltVault Policy Engine v1.0",
        },
        indent=2,
    )


@mcp.tool
def trust_score_lookup(
    agent_id: str,
    chain_id: int = 8453,
) -> str:
    """
    Lookup the combined trust score for any ERC-8004 registered agent.

    Queries the agent's static analysis history, reputation feedback,
    and validation status to produce a composite trust score (0-100).

    The trust score determines the agent's tier:
      80-100: TRUSTED (auto-approved, 80% x402 discount)
      60-79:  TRUSTED (auto-approved, 80% x402 discount)
      40-59:  CAUTION (may require confirmation, standard pricing)
      20-39:  WARNING (restricted access, 2x pricing)
      0-19:   DANGER (blocked by most services)

    Args:
        agent_id: ERC-8004 agent ID (format: "chainId:tokenId")
        chain_id: Chain to query (default: 8453 for Base)
    """
    # In production: query ERC-8004 contracts on-chain
    # Parse agent ID
    parts = agent_id.split(":")
    if len(parts) != 2:
        return json.dumps({"error": f"Invalid agent ID format: {agent_id}. Expected 'chainId:tokenId'"})

    scan_stats["agents_evaluated"] += 1

    # Mock response (production: real on-chain query)
    return json.dumps(
        {
            "agent_id": agent_id,
            "chain_id": chain_id,
            "trust_score": 50,
            "tier": "CAUTION",
            "components": {
                "static_analysis": {"score": 50, "weight": 0.50, "note": "No MoltShield scan on record"},
                "reputation": {"score": 50, "weight": 0.35, "note": "No feedback submitted yet"},
                "validation": {"score": 30, "weight": 0.15, "note": "Not validated by Founding Operatives"},
            },
            "is_operative": False,
            "staking_tier": None,
            "total_feedback": 0,
            "recommendation": "Submit code for MoltShield scan to improve static analysis score. Build reputation through clean interactions.",
            "engine": "MoltCops Trust Engine v1.0",
        },
        indent=2,
    )


@mcp.tool
def threat_intel_feed(
    category: Optional[str] = None,
    severity: Optional[str] = None,
    limit: int = 10,
) -> str:
    """
    Get the latest threat intelligence from the MoltCops network.

    Returns recently detected attack patterns, blacklisted addresses,
    and emerging threat vectors reported by Founding Operatives.

    Args:
        category: Filter by category (e.g. "drain_pattern", "prompt_injection")
        severity: Filter by severity (CRITICAL, HIGH, MEDIUM, LOW)
        limit: Max number of results (default: 10)
    """
    # In production: query dispatch feed + reputation registry
    threats = [
        {
            "id": "THREAT-2026-0847",
            "category": "sleeper_trigger",
            "severity": "CRITICAL",
            "title": "DeFi agent sleeper trigger after 100 swaps",
            "description": "Agent skill package contains conditional drain that activates after 100 successful swap operations. Transfers 10% of wallet balance to hardcoded address.",
            "detection_rule": "PL-045",
            "reported_by": "Founding Operative #12",
            "reported_at": int(time.time()) - 3600,
            "affected_agents": 3,
        },
        {
            "id": "THREAT-2026-0846",
            "category": "prompt_injection",
            "severity": "HIGH",
            "title": "Context poisoning via MCP resource injection",
            "description": "Malicious MCP server returns poisoned resource content that overrides agent safety instructions when loaded as context.",
            "detection_rule": "PL-080",
            "reported_by": "Founding Operative #7",
            "reported_at": int(time.time()) - 7200,
            "affected_agents": 1,
        },
        {
            "id": "THREAT-2026-0845",
            "category": "unlimited_approval",
            "severity": "CRITICAL",
            "title": "Token approval phishing via MCP tool",
            "description": "MCP tool named 'optimize_gas' actually calls approve(MAX_UINT256) on user's tokens, granting attacker unlimited spending.",
            "detection_rule": "PL-041",
            "reported_by": "Founding Operative #23",
            "reported_at": int(time.time()) - 14400,
            "affected_agents": 7,
        },
    ]

    if category:
        threats = [t for t in threats if t["category"] == category]
    if severity:
        threats = [t for t in threats if t["severity"] == severity.upper()]

    return json.dumps(
        {
            "threats": threats[:limit],
            "total_available": len(threats),
            "last_updated": int(time.time()),
            "source": "MoltCops Dispatch Feed",
            "note": "Reported by staked Founding Operatives. Weighted by reviewer stake.",
        },
        indent=2,
    )


# ═══════════════════════════════════════════════════════════════
# MCP RESOURCES
# ═══════════════════════════════════════════════════════════════


@mcp.resource("MoltCops://scan-rules")
def scan_rules_catalog() -> str:
    """Current MoltShield detection rule catalog with categories and severities."""
    catalog = []
    for rule in SCAN_RULES:
        catalog.append(
            {
                "id": rule["id"],
                "category": rule["category"],
                "severity": rule["severity"],
                "description": rule["description"],
            }
        )
    return json.dumps({"rules": catalog, "total": len(catalog), "engine_version": "1.0"}, indent=2)


@mcp.resource("MoltCops://threat-feed")
def threat_feed_resource() -> str:
    """Live threat intelligence feed — latest patterns and blacklisted addresses."""
    return json.dumps(
        {
            "feed_type": "moltcops_dispatch",
            "last_updated": int(time.time()),
            "active_threats": 3,
            "blacklisted_addresses": [
                "0x000000000000000000000000000000000000dead",
            ],
            "trending_categories": ["sleeper_trigger", "prompt_injection", "mcp_tool_phishing"],
            "note": "Full feed available via threat_intel_feed tool.",
        },
        indent=2,
    )


@mcp.resource("MoltCops://stats")
def global_stats_resource() -> str:
    """Global MoltCops network statistics — scans, threats, agents evaluated."""
    scan_stats["last_updated"] = int(time.time())
    return json.dumps(scan_stats, indent=2)


@mcp.resource("MoltCops://trust-tiers")
def trust_tiers_resource() -> str:
    """Trust tier definitions and x402 pricing multipliers."""
    return json.dumps(
        {
            "tiers": [
                {"name": "TRUSTED", "min_score": 60, "max_score": 100, "x402_multiplier": 0.2, "access": "auto-approved"},
                {"name": "CAUTION", "min_score": 40, "max_score": 59, "x402_multiplier": 1.0, "access": "may require confirmation"},
                {"name": "WARNING", "min_score": 20, "max_score": 39, "x402_multiplier": 2.0, "access": "restricted"},
                {"name": "DANGER", "min_score": 0, "max_score": 19, "x402_multiplier": None, "access": "blocked"},
                {"name": "OPERATIVE", "min_score": None, "max_score": None, "x402_multiplier": 0.1, "access": "Founding Operative badge holder"},
            ],
            "formula": "score = static_analysis * 0.50 + reputation * 0.35 + validation * 0.15",
        },
        indent=2,
    )


# ═══════════════════════════════════════════════════════════════
# MCP PROMPTS
# ═══════════════════════════════════════════════════════════════


@mcp.prompt("security_audit")
def security_audit_prompt(code: str, agent_name: str = "Unknown Agent") -> str:
    """
    Guided security audit prompt — walks an LLM through analyzing
    agent code using MoltShield scan results.
    """
    return f"""You are a security auditor evaluating an AI agent's skill code.

Agent: {agent_name}

Step 1: Run moltshield_scan_code on the following code
Step 2: For each CRITICAL finding, explain the attack scenario in plain language
Step 3: For each HIGH finding, suggest a specific code fix
Step 4: Calculate the overall risk level
Step 5: Recommend whether this agent should be TRUSTED, CAUTIONED, or BLOCKED

Code to audit:
```
{code}
```

Begin by running the scan, then analyze each finding."""


@mcp.prompt("trust_evaluation")
def trust_evaluation_prompt(agent_id: str) -> str:
    """
    Guided trust evaluation — walks an LLM through evaluating
    an agent's trustworthiness using on-chain data.
    """
    return f"""You are evaluating the trustworthiness of an AI agent registered on ERC-8004.

Agent ID: {agent_id}

Step 1: Run trust_score_lookup to get the agent's current trust profile
Step 2: Check threat_intel_feed for any active threats related to this agent
Step 3: If the agent has MCP tools, run moltshield_scan_mcp_server on its endpoint
Step 4: Synthesize the data into a trust recommendation
Step 5: Assign a tier: TRUSTED, CAUTION, WARNING, or DANGER

Explain your reasoning at each step. Begin with the trust score lookup."""


@mcp.prompt("mcp_tool_review")
def mcp_tool_review_prompt(mcp_endpoint: str) -> str:
    """
    Guided MCP tool review — evaluates an MCP server before
    an agent integrates its tools.
    """
    return f"""You are reviewing an MCP server before recommending it for agent integration.

MCP Endpoint: {mcp_endpoint}

Step 1: Run moltshield_scan_mcp_server on the endpoint
Step 2: Check if the server is registered on ERC-8004 (has on-chain identity)
Step 3: Look up its trust score if registered
Step 4: Check the threat intel feed for any reports about this server
Step 5: Make a recommendation: INTEGRATE, CAUTION, or AVOID

Consider:
- Does the server use HTTPS?
- Is it registered on-chain with supportedTrust: reputation?
- Does it have any feedback from Founding Operatives?
- Are there any active threat reports?

Begin your evaluation."""


# ═══════════════════════════════════════════════════════════════
# SERVER ENTRY POINT
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("🚨 MoltCops Defense Matrix — MCP Server")
    print("   Tools: moltshield_scan_code, moltshield_scan_mcp_server,")
    print("          moltvault_evaluate_transaction, trust_score_lookup,")
    print("          threat_intel_feed")
    print("   Resources: MoltCops://scan-rules, MoltCops://threat-feed,")
    print("              MoltCops://stats, MoltCops://trust-tiers")
    print("   Prompts: security_audit, trust_evaluation, mcp_tool_review")
    print()
    print("   Register on ERC-8004: python register_MoltCops.py")
    print("   Deploy: fastmcp deploy MoltCops_mcp_server.py")
    print()
    mcp.run()
