"""
═══════════════════════════════════════════════════════════════
 🚨 MOLTCOPS — Founding Operative Review System
═══════════════════════════════════════════════════════════════

 Founding Operatives review MCP tools and submit weighted
 feedback to the ERC-8004 Reputation Registry.

 Key insight from the ERC-8004 spec:
   "Feedback submission is permissionless: anyone can leave
    feedback. The on-chain registry acts as a neutral log of
    signals, while reputation aggregators decide how to filter,
    weight, and interpret them to produce trust scores."

 MoltCops IS the reputation aggregator. The on-chain feedback
 is the raw signal. Our staking weights are the interpretation.

 Feedback is per-capability AND per-tool-name:
   capability: "tools"
   name: "moltshield_scan_code"

 This means each MoltCops tool gets independent reputation.

 Usage:
   python operative_feedback.py review <agent_id> <tool_name>
   python operative_feedback.py batch <agent_id>
═══════════════════════════════════════════════════════════════
"""

import os
import sys
import json
import time
import math
from agent0_sdk import SDK


# ═══════════════════════════════════════════════════════════════
# STAKING TIERS
# ═══════════════════════════════════════════════════════════════

STAKING_TIERS = {
    "OBSERVER":   {"min_stake": 100,   "base_weight": 1},
    "OPERATIVE":  {"min_stake": 1000,  "base_weight": 3},
    "SENIOR":     {"min_stake": 5000,  "base_weight": 5},
    "COMMANDER":  {"min_stake": 25000, "base_weight": 10},
}


def review_weight(tier: str, stake: int) -> float:
    """
    Sub-linear staking weight: base × √(stake / minimum).
    10× stake = ~3.2× weight. Prevents plutocracy.
    """
    cfg = STAKING_TIERS.get(tier.upper())
    if not cfg:
        return 0.5  # Non-staked reviewer
    return cfg["base_weight"] * math.sqrt(stake / cfg["min_stake"])


# ═══════════════════════════════════════════════════════════════
# REVIEW A SINGLE TOOL
# ═══════════════════════════════════════════════════════════════


def review_tool(
    agent_id: str,
    tool_name: str,
    score: int,
    tag1: str,
    tag2: str,
    notes: str,
    operative_id: int = 0,
    staking_tier: str = "OBSERVER",
    stake_amount: int = 100,
):
    """
    Review a single MCP tool and submit feedback on-chain.

    The feedback file includes MoltCops-specific context:
    - operative_id: which Founding Operative reviewed
    - staking_tier: their tier at time of review
    - review_weight: calculated weight for aggregation
    - tool_tested: which specific tool was invoked

    This context is stored on IPFS. The on-chain feedback has
    the score + tags. Reputation aggregators (including MoltCops)
    read both to produce weighted trust scores.
    """
    sdk = SDK(
        chainId=int(os.environ.get("CHAIN_ID", "11155111")),
        rpcUrl=os.environ.get("RPC_URL"),
        signer=os.environ.get("SIGNER_PVT_KEY"),
        ipfs="pinata",
        pinataJwt=os.environ.get("PINATA_JWT"),
    )

    weight = review_weight(staking_tier, stake_amount)

    # ── Prepare feedback file ──
    # Matches ERC-8004 format: capability + name = per-tool granularity
    # Context includes MoltCops-specific fields for weighted aggregation
    feedback_data = {
        "text": notes,
        "capability": "tools",
        "name": tool_name,
        "context": {
            "experience_level": "founding_operative",
            "use_case": "mcp_tool_security_review",
            "integration": "MoltCops_mcp",
            "environment": "production",
            "timestamp": int(time.time()),
            # MoltCops extensions (for our reputation aggregator)
            "operative_id": operative_id,
            "staking_tier": staking_tier,
            "stake_amount": stake_amount,
            "review_weight": round(weight, 2),
        },
    }

    feedback_file = sdk.prepareFeedbackFile(feedback_data)

    # ── Submit on-chain ──
    # SDK signature: giveFeedback(agentId, score, tag1, tag2, feedbackFile)
    feedback = sdk.giveFeedback(
        agentId=agent_id,
        score=score,
        tag1=tag1,
        tag2=tag2,
        feedbackFile=feedback_file,
    )

    print(f"✅ Feedback submitted")
    print(f"   Agent:     {feedback.agentId}")
    print(f"   Tool:      {feedback.name}")
    print(f"   Score:     {feedback.score}/100")
    print(f"   Tags:      {feedback.tags}")
    print(f"   Reviewer:  {feedback.reviewer}")
    print(f"   Weight:    {weight:.1f}× ({staking_tier})")
    print(f"   IPFS:      {feedback.fileURI}")

    return feedback


# ═══════════════════════════════════════════════════════════════
# BATCH REVIEW — Review all tools of an MCP agent
# ═══════════════════════════════════════════════════════════════


def batch_review(agent_id: str, operative_id: int = 0,
                 staking_tier: str = "OBSERVER", stake_amount: int = 100):
    """
    Review all declared MCP tools for an agent.
    Fetches the tool list from on-chain, then prompts for
    a score and tags for each tool.
    """
    sdk = SDK(
        chainId=int(os.environ.get("CHAIN_ID", "11155111")),
        rpcUrl=os.environ.get("RPC_URL"),
    )

    # Get agent's declared tools
    summary = sdk.getAgent(agent_id)
    tools = summary.mcpTools

    if not tools:
        print(f"❌ Agent {agent_id} has no declared MCP tools")
        return

    print(f"🔍 Agent: {summary.name} ({agent_id})")
    print(f"   Tools to review: {tools}\n")

    for tool_name in tools:
        print(f"── Reviewing: {tool_name} ──")
        try:
            score = int(input(f"   Score (0-100): "))
            tag1 = input(f"   Tag 1: ").strip() or "reviewed"
            tag2 = input(f"   Tag 2: ").strip() or "moltcops_operative"
            notes = input(f"   Notes: ").strip() or f"Reviewed by Operative #{operative_id}"

            review_tool(
                agent_id=agent_id,
                tool_name=tool_name,
                score=score,
                tag1=tag1,
                tag2=tag2,
                notes=notes,
                operative_id=operative_id,
                staking_tier=staking_tier,
                stake_amount=stake_amount,
            )
        except (ValueError, KeyboardInterrupt):
            print(f"   ⏭️  Skipping {tool_name}")
            continue
        print()


# ═══════════════════════════════════════════════════════════════
# AGGREGATE — Read and weight existing feedback
# ═══════════════════════════════════════════════════════════════


def aggregate_feedback(agent_id: str):
    """
    Read all on-chain feedback for an agent and calculate
    MoltCops' weighted trust score.

    The raw feedback is permissionless (anyone can submit).
    The weighted interpretation is MoltCops' value-add:
    - Founding Operative reviews get staking weight
    - Non-operative reviews get 0.5× weight
    - Sub-linear scaling prevents plutocratic capture
    """
    sdk = SDK(
        chainId=int(os.environ.get("CHAIN_ID", "11155111")),
        rpcUrl=os.environ.get("RPC_URL"),
    )

    summary = sdk.getAgent(agent_id)
    total_feedback = int(summary.totalFeedback) if summary.totalFeedback else 0

    print(f"📊 Feedback aggregation for {summary.name} ({agent_id})")
    print(f"   Total on-chain feedback: {total_feedback}")

    if total_feedback == 0:
        print("   No feedback yet. Submit reviews to build reputation.")
        return

    # In production: fetch all feedback entries from the Reputation Registry
    # and apply staking weights from the context field.
    #
    # For each feedback entry:
    #   1. Read score + tags from on-chain
    #   2. Fetch IPFS context (fileURI)
    #   3. Check context.staking_tier and context.review_weight
    #   4. Apply: weighted_score = score × review_weight
    #   5. Average across all weighted scores
    #
    # This is the reputation aggregation that the ERC-8004 spec
    # explicitly delegates to aggregators like MoltCops.

    print("\n   Weighted aggregation:")
    print("   (In production, this reads all feedback entries,")
    print("    applies staking weights from IPFS context,")
    print("    and calculates per-tool trust scores)")
    print(f"\n   Per-tool breakdown:")
    for tool in summary.mcpTools:
        print(f"   • {tool}: awaiting per-tool feedback data")


# ═══════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════

USAGE = """
MoltCops Founding Operative Review System

Commands:
  python operative_feedback.py review <agent_id> <tool> <score> <tag1> <tag2> "<notes>"
  python operative_feedback.py batch <agent_id>
  python operative_feedback.py aggregate <agent_id>

Examples:
  python operative_feedback.py review 11155111:275 echo_tool 85 accurate fast "Tool responded correctly"
  python operative_feedback.py batch 11155111:275
  python operative_feedback.py aggregate 11155111:275

Environment:
  CHAIN_ID, RPC_URL, SIGNER_PVT_KEY, PINATA_JWT
"""

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(USAGE)
    elif sys.argv[1] == "review" and len(sys.argv) >= 7:
        review_tool(
            agent_id=sys.argv[2],
            tool_name=sys.argv[3],
            score=int(sys.argv[4]),
            tag1=sys.argv[5],
            tag2=sys.argv[6],
            notes=sys.argv[7] if len(sys.argv) > 7 else "",
        )
    elif sys.argv[1] == "batch" and len(sys.argv) >= 3:
        batch_review(sys.argv[2])
    elif sys.argv[1] == "aggregate" and len(sys.argv) >= 3:
        aggregate_feedback(sys.argv[2])
    else:
        print(USAGE)
