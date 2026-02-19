"""
═══════════════════════════════════════════════════════════════
 🚨 MoltCops — ERC-8004 On-Chain Registration
═══════════════════════════════════════════════════════════════

 Registers the MoltCops Defense Matrix on ERC-8004 using the
 Agent0 SDK. After registration, any AI agent can discover
 MoltCops via:

   sdk.searchAgents(mcp=True)

 IMPORTANT: The MCP server must be deployed and accessible
 BEFORE running this script. The SDK pings the server during
 registerIPFS() to auto-discover tools, resources, and prompts.

 Usage:
   1. Deploy the MCP server:
        fastmcp deploy MoltCops_mcp_server.py
      This gives you a URL like: https://xxx.fastmcp.app/mcp

   2. Set environment variables:
        export RPC_URL="https://sepolia.base.org"
        export SIGNER_PVT_KEY="0x..."
        export PINATA_JWT="..."
        export MoltCops_MCP_URL="https://xxx.fastmcp.app/mcp"

   3. Register:
        python register_MoltCops.py

   4. Verify:
        python register_MoltCops.py verify <agent_id>

 Registration cost: ~0.001 ETH on Sepolia
═══════════════════════════════════════════════════════════════
"""

import os
import sys
import json
import requests
from pprint import pprint
from agent0_sdk import SDK


# ═══════════════════════════════════════════════════════════════
# REGISTRATION
# ═══════════════════════════════════════════════════════════════


def register():
    """
    Register MoltCops on ERC-8004.

    This is 5 SDK calls. The SDK handles:
    - Minting an ERC-8004 Identity NFT
    - Pinging the MCP server to discover tools/resources/prompts
    - Building the registration JSON with the correct schema
    - Uploading to IPFS via Pinata
    - Setting the tokenURI on-chain

    After this, MoltCops appears in sdk.searchAgents(mcp=True).
    """
    rpc_url = os.environ.get("RPC_URL")
    signer_key = os.environ.get("SIGNER_PVT_KEY")
    pinata_jwt = os.environ.get("PINATA_JWT")
    mcp_url = os.environ.get("MoltCops_MCP_URL")

    if not all([rpc_url, signer_key, pinata_jwt, mcp_url]):
        print("❌ Missing environment variables. Need all of:")
        print("   RPC_URL, SIGNER_PVT_KEY, PINATA_JWT, MoltCops_MCP_URL")
        return None

    chain_id = int(os.environ.get("CHAIN_ID", "11155111"))
    sdk = SDK(
        chainId=chain_id,
        rpcUrl=rpc_url,
        signer=signer_key,
        ipfs="pinata",
        pinataJwt=pinata_jwt,
    )

    # ── Step 1: Create the agent ──
    print("🤖 Creating MoltCops agent on ERC-8004...")
    agent = sdk.createAgent(
        name="MoltCops Defense Matrix",
        description=(
            "AI agent security infrastructure. Scan code for threats "
            "(MoltShield), evaluate transactions against 79 policy rules "
            "(MoltVault), lookup trust scores, and access threat intelligence. "
            "Free 20-rule tier. Full engine via x402. By MoltCops."
        ),
        image="https://moltcops.com/MoltCops-badge.png",
    )

    # ── Step 2: Set MCP endpoint ──
    # The SDK pings this URL during registerIPFS() to discover
    # our tools, resources, and prompts automatically.
    print(f"🔌 Setting MCP endpoint: {mcp_url}")
    agent.setMCP(mcp_url)

    # ── Step 3: Enable reputation trust + x402 ──
    # Opts MoltCops into the ERC-8004 reputation system.
    # Anyone can submit feedback. Our Founding Operatives'
    # feedback carries staked weight in the MoltCops trust engine.
    #
    # x402 support means agents can pay for full 79-rule scans
    # using the x402 micropayment protocol. Free tier: 20 rules.
    print("⭐ Enabling reputation trust + x402 support...")
    agent.setTrust(reputation=True)
    # Declare x402 support so agents searching for paid security
    # services can filter: sdk.searchAgents(mcp=True, x402support=True)
    try:
        agent.setX402(True)
    except AttributeError:
        # SDK may not have setX402 yet — set it in extras or
        # manually in the registration JSON post-upload
        print("   (x402 flag will be set manually in registration JSON)")

    # ── Step 4: Register on IPFS + chain ──
    # The SDK:
    #   1. Pings MCP server → discovers tools/resources/prompts
    #   2. Builds registration JSON (eip-8004#registration-v1)
    #   3. Uploads to IPFS via Pinata
    #   4. Sets tokenURI on Identity Registry
    print("📝 Registering on IPFS and ERC-8004...")
    print("   (SDK is pinging the MCP server to discover tools...)")
    reg_file = agent.registerIPFS()

    reg_data = json.loads(reg_file) if isinstance(reg_file, str) else reg_file
    print(f"\n✅ MoltCops registered!")
    print(json.dumps(reg_data, indent=2))

    # ── Extract agent ID ──
    registrations = reg_data.get("registrations", [])
    if registrations:
        agent_id = registrations[0].get("agentId")
        full_id = f"{chain_id}:{agent_id}"
        print(f"\n🆔 Agent ID: {full_id}")
        print(f"🌐 View: https://8004scan.io/agent/{full_id}")
        return full_id

    return None


# ═══════════════════════════════════════════════════════════════
# VERIFICATION
# ═══════════════════════════════════════════════════════════════


def verify(agent_id: str):
    """
    Verify a registered agent. Follows the same chain another
    agent uses to discover and connect to MoltCops:

    1. sdk.getAgent() → on-chain summary
    2. tokenURI() → IPFS CID
    3. Fetch IPFS → registration JSON
    4. Extract MCP URL from endpoints[]
    5. Ping MCP server → list tools
    """
    rpc_url = os.environ.get("RPC_URL")
    chain_id = int(os.environ.get("CHAIN_ID", "11155111"))
    sdk = SDK(chainId=chain_id, rpcUrl=rpc_url)

    # Step 1: On-chain summary
    print(f"🔍 Fetching agent {agent_id} from ERC-8004...")
    summary = sdk.getAgent(agent_id)
    print(f"\n   Name:        {summary.name}")
    print(f"   Description: {summary.description[:80]}...")
    print(f"   MCP:         {summary.mcp}")
    print(f"   Tools:       {summary.mcpTools}")
    print(f"   Resources:   {summary.mcpResources}")
    print(f"   Prompts:     {summary.mcpPrompts}")
    print(f"   Trust:       {summary.supportedTrusts}")
    print(f"   Feedback:    {summary.totalFeedback}")

    # Step 2: Resolve tokenURI → IPFS
    token_id = int(agent_id.split(":")[1])
    print(f"\n📦 Resolving tokenURI for token #{token_id}...")
    token_uri = sdk.identity_registry.functions.tokenURI(token_id).call()
    print(f"   Token URI: {token_uri}")

    # Step 3: Fetch from IPFS gateway
    ipfs_hash = token_uri.split("//")[1]
    ipfs_url = f"https://dweb.link/ipfs/{ipfs_hash}"
    print(f"   Fetching: {ipfs_url}")
    reg_json = requests.get(ipfs_url).json()

    # Step 4: Extract MCP endpoint
    mcp_url = None
    for ep in reg_json.get("endpoints", []):
        if ep.get("name") == "MCP":
            mcp_url = ep["endpoint"]
            print(f"\n🔌 MCP Endpoint: {mcp_url}")
            print(f"   Tools:     {ep.get('mcpTools', [])}")
            print(f"   Resources: {ep.get('mcpResources', [])}")
            print(f"   Prompts:   {ep.get('mcpPrompts', [])}")
            break

    if not mcp_url:
        print("❌ No MCP endpoint found in registration JSON")
        return

    # Step 5: Ping MCP server
    print(f"\n🏓 Pinging MCP server...")
    try:
        from fastmcp import Client
        import asyncio

        async def ping():
            client = Client(mcp_url)
            async with client:
                await client.ping()
                tools = await client.list_tools()
                resources = await client.list_resources()
                prompts = await client.list_prompts()
                return tools, resources, prompts

        tools, resources, prompts = asyncio.run(ping())
        print(f"   ✅ Server alive")
        print(f"   Live tools ({len(tools)}):")
        for t in tools:
            desc = t.description[:60] if t.description else "no description"
            print(f"      • {t.name}: {desc}")
        print(f"   Live resources ({len(resources)}):")
        for r in resources:
            print(f"      • {r.name} ({r.uri})")
        print(f"   Live prompts ({len(prompts)}):")
        for p in prompts:
            print(f"      • {p.name}")
    except Exception as e:
        print(f"   ⚠️  Could not ping: {e}")

    print(f"\n✅ Verification complete")
    return reg_json


# ═══════════════════════════════════════════════════════════════
# DISCOVERY
# ═══════════════════════════════════════════════════════════════


def discover():
    """
    Search ERC-8004 for all MCP agents with non-empty tool lists.
    This is what a consuming agent runs to find MoltCops.
    """
    rpc_url = os.environ.get("RPC_URL")
    chain_id = int(os.environ.get("CHAIN_ID", "11155111"))
    sdk = SDK(chainId=chain_id, rpcUrl=rpc_url)

    print(f"🔍 Searching ERC-8004 (chain {chain_id}) for MCP agents...")
    cursor = None
    all_mcp_agents = []

    while True:
        results = sdk.searchAgents(page_size=50, cursor=cursor, mcp=True)
        for agent in results["items"]:
            if len(agent.get("mcpTools", [])) > 0:
                all_mcp_agents.append(agent)
        cursor = results.get("nextCursor")
        if not cursor:
            break

    print(f"   Found {len(all_mcp_agents)} MCP agents with declared tools\n")

    for agent in all_mcp_agents:
        name = agent.get("name", "Unknown")
        aid = agent.get("agentId", "?")
        tools = agent.get("mcpTools", [])
        trust = agent.get("supportedTrusts", [])
        fb = agent.get("totalFeedback", "0")

        # Flag security-related agents
        all_text = f"{name} {' '.join(tools)}".lower()
        is_security = any(kw in all_text for kw in
                          ["scan", "shield", "vault", "security", "threat", "molt"])
        icon = "🛡️" if is_security else "🤖"

        print(f"   {icon} {name} ({aid})")
        print(f"      Tools:    {tools}")
        print(f"      Trust:    {trust}")
        print(f"      Feedback: {fb}")
        print()

    return all_mcp_agents


# ═══════════════════════════════════════════════════════════════
# FEEDBACK
# ═══════════════════════════════════════════════════════════════


def feedback(agent_id: str, tool_name: str, score: int,
             tag1: str, tag2: str, notes: str):
    """
    Submit feedback for a specific MoltCops tool.

    Feedback is per-capability AND per-tool-name:
      capability: "tools"
      name: "moltshield_scan_code"

    This means each MoltCops tool gets independent reputation.
    The SDK handles IPFS upload and on-chain submission.
    """
    sdk = SDK(
        chainId=int(os.environ.get("CHAIN_ID", "11155111")),
        rpcUrl=os.environ.get("RPC_URL"),
        signer=os.environ.get("SIGNER_PVT_KEY"),
        ipfs="pinata",
        pinataJwt=os.environ.get("PINATA_JWT"),
    )

    import time

    # Prepare feedback file — matches ERC-8004 format exactly
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
        },
    }

    feedback_file = sdk.prepareFeedbackFile(feedback_data)

    # Submit — two tags max, score 0-100
    result = sdk.giveFeedback(
        agentId=agent_id,
        score=score,
        tag1=tag1,
        tag2=tag2,
        feedbackFile=feedback_file,
    )

    print(f"✅ Feedback submitted for {tool_name}")
    print(f"   Agent:    {result.agentId}")
    print(f"   Reviewer: {result.reviewer}")
    print(f"   Score:    {result.score}/100")
    print(f"   Tags:     {result.tags}")
    print(f"   Tool:     {result.name}")
    print(f"   IPFS:     {result.fileURI}")

    return result


# ═══════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════

USAGE = """
MoltCops ERC-8004 Registration & Discovery

Commands:
  python register_MoltCops.py                     Register MoltCops on-chain
  python register_MoltCops.py verify <agent_id>   Verify + ping MCP server
  python register_MoltCops.py discover             Search for all MCP agents
  python register_MoltCops.py feedback <agent_id> <tool> <score> <tag1> <tag2> "<notes>"

Examples:
  python register_MoltCops.py
  python register_MoltCops.py verify 11155111:275
  python register_MoltCops.py discover
  python register_MoltCops.py feedback 11155111:275 moltshield_scan_code 85 accurate fast "Found 3 real threats"
"""

if __name__ == "__main__":
    if len(sys.argv) < 2:
        aid = register()
        if aid:
            print(f"\n💡 Next: python register_MoltCops.py verify {aid}")
    elif sys.argv[1] == "verify" and len(sys.argv) > 2:
        verify(sys.argv[2])
    elif sys.argv[1] == "discover":
        discover()
    elif sys.argv[1] == "feedback" and len(sys.argv) >= 7:
        feedback(sys.argv[2], sys.argv[3], int(sys.argv[4]),
                 sys.argv[5], sys.argv[6],
                 sys.argv[7] if len(sys.argv) > 7 else "")
    else:
        print(USAGE)
