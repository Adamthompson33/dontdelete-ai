"""
MoltVault ERC-8004 Integration Tests
========================================
Tests the complete lifecycle:
  Agent registers on-chain → MoltShield scans code → ERC-8004 reputation checked →
  Combined trust score computed → Session created → Transactions processed →
  Outcomes posted back to ERC-8004

Run: python test_erc8004.py
"""
from __future__ import annotations

import sys
import time

# ── Test framework ──
passed = 0
failed = 0
errors: list[str] = []

def test(name: str):
    def decorator(fn):
        global passed, failed
        try:
            fn()
            passed += 1
            print(f"  ✅ {name}")
        except AssertionError as e:
            failed += 1
            errors.append(f"{name}: {e}")
            print(f"  ❌ {name}: {e}")
        except Exception as e:
            failed += 1
            errors.append(f"{name}: {type(e).__name__}: {e}")
            print(f"  ❌ {name}: {type(e).__name__}: {e}")
        return fn
    return decorator


# ═══════════════════════════════════════════════════
# Imports
# ═══════════════════════════════════════════════════

from moltvault.types import (
    Transaction, TransactionType, GateDecision, AgentCapability,
)
from moltvault.policy.engine import WalletPolicy
from moltvault.erc8004.client import (
    RegistryClient, MockProvider, AgentRegistration,
    FeedbackEntry, ReputationSummary,
)
from moltvault.erc8004.trust import (
    CombinedTrustEngine, CombinedTrustResult, TrustWeights, score_to_tier,
)
from moltvault.erc8004.bridge import ERC8004Bridge, VerifiedAgent
from moltvault.agents.sessions import AgentSessionManager
from moltvault.vault import MoltVault


# ═══════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════

def _setup_provider() -> MockProvider:
    """Create a provider with some test agents and reputation data."""
    p = MockProvider()

    # Agent 1: Well-known, good reputation
    p.register_agent(
        owner="0xOwnerGood",
        name="DeFi Rebalancer",
        description="Automated portfolio rebalancing agent",
        services=[
            {"name": "A2A", "endpoint": "https://rebalancer.example/.well-known/agent-card.json"},
            {"name": "MCP", "endpoint": "https://mcp.rebalancer.example/"},
        ],
        supported_trust=["reputation", "crypto-economic"],
    )
    # Add good reputation: 10 reviews averaging ~85
    for i in range(10):
        p.seed_feedback(1, f"0xClient{i}", value=80 + (i % 10), tag1="starred")

    # Agent 2: New agent, no reputation
    p.register_agent(
        owner="0xOwnerNew",
        name="Fresh Bot",
        description="Brand new agent, no track record",
    )

    # Agent 3: Bad reputation
    p.register_agent(
        owner="0xOwnerBad",
        name="Shady Bot",
        description="Agent with poor feedback history",
    )
    for i in range(8):
        p.seed_feedback(3, f"0xClient{i}", value=15 + (i % 10), tag1="starred")

    # Agent 4: Inactive
    p.register_agent(
        owner="0xOwnerInactive",
        name="Retired Bot",
        description="No longer operational",
        active=False,
    )

    return p


def _make_tx(**kwargs) -> Transaction:
    defaults = dict(
        tx_type=TransactionType.NATIVE_TRANSFER,
        chain="ethereum",
        from_address="0xUSER",
        to_address="0xRECIPIENT",
        value_native=0.01,
        value_usd=25.0,
        memo="Test transaction",
    )
    defaults.update(kwargs)
    return Transaction(**defaults)


# ═══════════════════════════════════════════════════
# SECTION 1: Mock Registry & Client
# ═══════════════════════════════════════════════════

print("\n── Mock Registry & Client ──")


@test("Register agent and retrieve by ID")
def _():
    p = MockProvider()
    reg = p.register_agent("0xOwner", "TestBot", description="A test bot")
    assert reg.agent_id == 1
    assert reg.name == "TestBot"
    assert reg.owner_address == "0xOwner"

    fetched = p.get_agent(1)
    assert fetched is not None
    assert fetched.name == "TestBot"


@test("Agent not found returns None")
def _():
    p = MockProvider()
    assert p.get_agent(999) is None


@test("Verify agent ownership — correct owner")
def _():
    p = MockProvider()
    p.register_agent("0xOwner", "Bot")
    assert p.verify_agent_ownership(1, "0xOwner")


@test("Verify agent ownership — wrong owner")
def _():
    p = MockProvider()
    p.register_agent("0xOwner", "Bot")
    assert not p.verify_agent_ownership(1, "0xIMPOSTOR")


@test("Verify agent ownership — case insensitive")
def _():
    p = MockProvider()
    p.register_agent("0xABCDEF", "Bot")
    assert p.verify_agent_ownership(1, "0xabcdef")


@test("Seed and retrieve feedback")
def _():
    p = MockProvider()
    p.register_agent("0xOwner", "Bot")
    p.seed_feedback(1, "0xReviewer", value=85, tag1="starred")
    p.seed_feedback(1, "0xReviewer", value=90, tag1="starred")

    entries = p.get_all_feedback(1, tag1="starred")
    assert len(entries) == 2
    assert entries[0].value == 85
    assert entries[1].value == 90


@test("Reputation summary aggregation")
def _():
    p = MockProvider()
    p.register_agent("0xOwner", "Bot")
    p.seed_feedback(1, "0xA", value=80, tag1="starred")
    p.seed_feedback(1, "0xB", value=90, tag1="starred")
    p.seed_feedback(1, "0xC", value=70, tag1="starred")

    summary = p.get_reputation_summary(1, ["0xA", "0xB", "0xC"], "starred", "")
    assert summary.feedback_count == 3
    assert summary.summary_value == 240  # 80 + 90 + 70
    assert summary.average_score == 80.0


@test("Reputation filtering by client addresses (anti-Sybil)")
def _():
    p = MockProvider()
    p.register_agent("0xOwner", "Bot")
    p.seed_feedback(1, "0xTrusted", value=90, tag1="starred")
    p.seed_feedback(1, "0xSybil", value=100, tag1="starred")  # Fake inflated

    # Only trust 0xTrusted's feedback
    summary = p.get_reputation_summary(1, ["0xTrusted"], "starred", "")
    assert summary.feedback_count == 1
    assert summary.average_score == 90.0


@test("Registration file services are accessible")
def _():
    p = MockProvider()
    p.register_agent(
        "0xOwner", "Bot",
        services=[
            {"name": "A2A", "endpoint": "https://a2a.example/card.json"},
            {"name": "MCP", "endpoint": "https://mcp.example/"},
        ],
    )
    agent = p.get_agent(1)
    assert agent.get_endpoint("A2A") == "https://a2a.example/card.json"
    assert agent.get_endpoint("MCP") == "https://mcp.example/"
    assert agent.get_endpoint("nonexistent") is None


@test("Validation request and response flow")
def _():
    p = MockProvider()
    p.register_agent("0xOwner", "Bot")

    # Request validation
    rh = p.submit_validation_request("0xValidator", 1, "ipfs://evidence", "hash123")
    status = p.get_validation_status(rh)
    assert status is not None
    assert status.response == 0  # Pending

    # Validator responds
    p.submit_validation_response(rh, response=95, tag="full-pass")
    status = p.get_validation_status(rh)
    assert status.response == 95
    assert status.tag == "full-pass"


@test("Validation summary aggregation")
def _():
    p = MockProvider()
    p.register_agent("0xOwner", "Bot")

    p.submit_validation_request("0xV1", 1, "uri1", "h1")
    p.submit_validation_response("h1", response=100)
    p.submit_validation_request("0xV2", 1, "uri2", "h2")
    p.submit_validation_response("h2", response=80)

    summary = p.get_validation_summary(1)
    assert summary.validation_count == 2
    assert summary.average_response == 90  # (100 + 80) / 2


# ═══════════════════════════════════════════════════
# SECTION 2: Combined Trust Engine
# ═══════════════════════════════════════════════════

print("\n── Combined Trust Engine ──")


@test("Static-only trust (no ERC-8004)")
def _():
    engine = CombinedTrustEngine(registry_client=None)
    result = engine.evaluate(moltshield_score=85)
    assert result.combined_score > 0
    assert result.static_score == 85
    assert result.reputation_score == 0
    assert "CAUTION" == result.tier or "WARNING" == result.tier


@test("New agent penalty applied when no on-chain history")
def _():
    p = _setup_provider()
    client = RegistryClient(p)
    engine = CombinedTrustEngine(registry_client=client)

    # Agent 2 has no feedback
    result = engine.evaluate(agent_id=2, moltshield_score=80)
    assert result.is_new_agent
    assert any("penalty" in w.lower() for w in result.warnings)
    # Score should be lower than raw 80 due to penalty
    assert result.combined_score < 80


@test("Good reputation boosts trust score")
def _():
    p = _setup_provider()
    client = RegistryClient(p)
    engine = CombinedTrustEngine(
        registry_client=client,
        weights=TrustWeights(
            min_feedback_for_confidence=3,
            new_agent_penalty=0,
        ),
    )

    # Agent 1 has good reputation (~85 avg across 10 reviews)
    result = engine.evaluate(
        agent_id=1, moltshield_score=75,
        trusted_clients=[f"0xClient{i}" for i in range(10)],
    )
    assert result.reputation_score > 0
    assert result.feedback_count == 10
    # Combined should be higher than static alone due to good reputation
    assert result.combined_score >= 75


@test("Bad reputation drags down trust score")
def _():
    p = _setup_provider()
    client = RegistryClient(p)
    engine = CombinedTrustEngine(
        registry_client=client,
        weights=TrustWeights(min_feedback_for_confidence=3, new_agent_penalty=0),
    )

    # Agent 3 has poor reputation (~20 avg)
    result = engine.evaluate(
        agent_id=3, moltshield_score=75,
        trusted_clients=[f"0xClient{i}" for i in range(8)],
    )
    assert result.reputation_score < 30
    # Combined should be pulled down from 75 by bad reputation
    assert result.combined_score < 75


@test("Terrible static score caps combined even with perfect reputation")
def _():
    p = MockProvider()
    p.register_agent("0xOwner", "Bot")
    for i in range(20):
        p.seed_feedback(1, f"0xClient{i}", value=100, tag1="starred")

    client = RegistryClient(p)
    engine = CombinedTrustEngine(
        registry_client=client,
        weights=TrustWeights(
            static_weight=0.20,
            reputation_weight=0.65,
            validation_weight=0.15,
            min_feedback_for_confidence=3,
            critical_static_ceiling=40,
            new_agent_penalty=0,
        ),
    )

    # Perfect reputation cannot save a static score of 25
    result = engine.evaluate(
        agent_id=1, moltshield_score=25,
        trusted_clients=[f"0xClient{i}" for i in range(20)],
    )
    assert result.combined_score <= 40, f"Got {result.combined_score}"
    assert any("capped" in w.lower() for w in result.warnings), f"Warnings: {result.warnings}"


@test("Sybil discount when no trusted_clients filter")
def _():
    p = _setup_provider()
    client = RegistryClient(p)
    engine = CombinedTrustEngine(
        registry_client=client,
        weights=TrustWeights(min_feedback_for_confidence=3, new_agent_penalty=0),
    )

    # Same agent, with and without trusted client filtering
    with_filter = engine.evaluate(
        agent_id=1, moltshield_score=75,
        trusted_clients=[f"0xClient{i}" for i in range(10)],
    )
    without_filter = engine.evaluate(
        agent_id=1, moltshield_score=75,
        trusted_clients=None,
    )

    assert any("sybil" in w.lower() for w in without_filter.warnings)


@test("Tier mapping is correct")
def _():
    assert score_to_tier(95) == "TRUSTED"
    assert score_to_tier(90) == "TRUSTED"
    assert score_to_tier(89) == "CAUTION"
    assert score_to_tier(70) == "CAUTION"
    assert score_to_tier(69) == "WARNING"
    assert score_to_tier(40) == "WARNING"
    assert score_to_tier(39) == "DANGER"
    assert score_to_tier(0) == "DANGER"


# ═══════════════════════════════════════════════════
# SECTION 3: ERC-8004 Bridge — Identity Verification
# ═══════════════════════════════════════════════════

print("\n── ERC-8004 Bridge: Identity Verification ──")


@test("Verified agent with correct owner → identity_verified=True")
def _():
    p = _setup_provider()
    client = RegistryClient(p)
    bridge = ERC8004Bridge(client)

    verified = bridge.verify_agent(
        agent_id=1, claimed_owner="0xOwnerGood", moltshield_score=80,
    )
    assert verified.identity_verified
    assert verified.name == "DeFi Rebalancer"
    assert verified.trust_result is not None
    assert verified.trust_result.combined_score > 0


@test("Wrong owner → identity_verified=False")
def _():
    p = _setup_provider()
    client = RegistryClient(p)
    bridge = ERC8004Bridge(client)

    verified = bridge.verify_agent(
        agent_id=1, claimed_owner="0xIMPOSTOR", moltshield_score=80,
    )
    assert not verified.identity_verified
    assert verified.trust_result.combined_score == 0
    assert any("FAILED" in w for w in verified.trust_result.warnings)


@test("Unregistered agent → identity_verified=False")
def _():
    p = _setup_provider()
    client = RegistryClient(p)
    bridge = ERC8004Bridge(client)

    verified = bridge.verify_agent(
        agent_id=999, claimed_owner="0xAnyone", moltshield_score=80,
    )
    assert not verified.identity_verified
    assert verified.trust_result.combined_score == 0


@test("Inactive agent → identity_verified=True but score=0")
def _():
    p = _setup_provider()
    client = RegistryClient(p)
    bridge = ERC8004Bridge(client)

    verified = bridge.verify_agent(
        agent_id=4, claimed_owner="0xOwnerInactive", moltshield_score=80,
    )
    # Ownership is verified, but inactive status → DANGER
    assert verified.identity_verified
    assert verified.trust_result.combined_score == 0
    assert any("inactive" in w.lower() for w in verified.trust_result.warnings)


@test("Bridge creates session from verified identity")
def _():
    p = _setup_provider()
    client = RegistryClient(p)
    bridge = ERC8004Bridge(
        client,
        trusted_clients=[f"0xClient{i}" for i in range(10)],
    )
    mgr = AgentSessionManager()

    verified = bridge.verify_agent(
        agent_id=1, claimed_owner="0xOwnerGood", moltshield_score=85,
    )
    session = bridge.create_verified_session(
        verified, mgr, task_description="Rebalance portfolio",
    )

    assert session is not None
    assert session.agent_id == "erc8004:1"
    assert session.agent_name == "DeFi Rebalancer"
    assert session.trust_score > 0
    assert session.is_active


@test("Bridge refuses session for unverified identity")
def _():
    p = _setup_provider()
    client = RegistryClient(p)
    bridge = ERC8004Bridge(client)
    mgr = AgentSessionManager()

    verified = bridge.verify_agent(
        agent_id=1, claimed_owner="0xIMPOSTOR", moltshield_score=80,
    )
    session = bridge.create_verified_session(verified, mgr)
    assert session is None


# ═══════════════════════════════════════════════════
# SECTION 4: Reputation Feedback Loop
# ═══════════════════════════════════════════════════

print("\n── Reputation Feedback Loop ──")


@test("Report clean session → positive feedback posted")
def _():
    p = _setup_provider()
    client = RegistryClient(p)
    bridge = ERC8004Bridge(client)

    # Simulate a clean audit log
    audit = [
        {"agent_id": "erc8004:1", "decision": "ALLOW", "violations": 0, "violation_ids": [], "value_usd": 50},
        {"agent_id": "erc8004:1", "decision": "ALLOW", "violations": 0, "violation_ids": [], "value_usd": 30},
        {"agent_id": "erc8004:1", "decision": "ALLOW_WITH_LOG", "violations": 0, "violation_ids": [], "value_usd": 20},
    ]

    report = bridge.report_session_outcomes(
        agent_id=1, session_id="sess-001", audit_log=audit,
    )
    assert report.feedback_posted
    assert report.total_transactions == 3
    assert report.approved == 3
    assert report.blocked == 0
    assert report.policy_compliance_score == 100


@test("Report session with blocks → low compliance score")
def _():
    p = _setup_provider()
    client = RegistryClient(p)
    bridge = ERC8004Bridge(client)

    audit = [
        {"agent_id": "erc8004:1", "decision": "ALLOW", "violations": 0, "violation_ids": [], "value_usd": 10},
        {"agent_id": "erc8004:1", "decision": "DENY", "violations": 2, "violation_ids": ["PL-040", "PL-050"], "value_usd": 500},
        {"agent_id": "erc8004:1", "decision": "DENY", "violations": 1, "violation_ids": ["PL-037"], "value_usd": 1000},
    ]

    report = bridge.report_session_outcomes(
        agent_id=1, session_id="sess-002", audit_log=audit,
    )
    assert report.blocked == 2
    assert report.policy_compliance_score < 50


@test("Report session with intent mismatch → extra penalty + warning feedback")
def _():
    p = _setup_provider()
    client = RegistryClient(p)
    bridge = ERC8004Bridge(client)

    audit = [
        {"agent_id": "erc8004:1", "decision": "DENY", "violations": 1,
         "violation_ids": ["PL-061"], "value_usd": 5000},
    ]

    report = bridge.report_session_outcomes(
        agent_id=1, session_id="sess-003", audit_log=audit,
    )
    assert report.intent_mismatches == 1
    assert report.policy_compliance_score < 50

    # Verify the intent mismatch feedback was posted
    feedbacks = p.get_all_feedback(1, tag1="moltvault:intent_mismatch")
    assert len(feedbacks) > 0


@test("Agent profile includes reputation and validation data")
def _():
    p = _setup_provider()
    client = RegistryClient(p)
    bridge = ERC8004Bridge(
        client,
        trusted_clients=[f"0xClient{i}" for i in range(10)],
    )

    profile = bridge.get_agent_profile(1)
    assert "identity" in profile
    assert profile["identity"]["name"] == "DeFi Rebalancer"
    assert profile["identity"]["active"] is True
    assert "reputation" in profile
    assert profile["reputation"]["general"]["feedback_count"] == 10


# ═══════════════════════════════════════════════════
# SECTION 5: Full Vault + ERC-8004 Integration
# ═══════════════════════════════════════════════════

print("\n── Full Vault + ERC-8004 Integration ──")


@test("Vault with ERC-8004: verified connection → session → transaction → feedback")
def _():
    """
    Full lifecycle test:
    1. Agent proves ERC-8004 identity
    2. Combined trust score determines capabilities
    3. Agent proposes a transaction
    4. Transaction is evaluated by policy engine
    5. Outcomes are posted back to ERC-8004
    """
    provider = _setup_provider()

    vault = MoltVault(
        policy=WalletPolicy(
            confirm_above_usd=100.0,
            confirm_new_recipients=False,
        ),
        registry_provider=provider,
        trusted_clients=[f"0xClient{i}" for i in range(10)],
    )

    # 1. Agent connects with verified identity
    session, verified = vault.connect_agent_verified(
        agent_id=1,
        claimed_owner="0xOwnerGood",
        moltshield_score=85,
        task_description="Transfer funds",
    )

    assert session is not None
    assert verified.identity_verified
    assert verified.name == "DeFi Rebalancer"

    # 2. Agent proposes a small transaction
    tx = _make_tx(
        value_usd=25.0,
        agent_id=session.agent_id,
        session_id=session.session_id,
    )
    result = vault.propose_transaction(session.session_id, tx)
    assert result.decision in (GateDecision.ALLOW, GateDecision.ALLOW_WITH_LOG)

    # 3. Report outcomes back to ERC-8004
    report = vault.report_session_outcomes(
        erc8004_agent_id=1,
        session_id=session.session_id,
    )
    assert report is not None
    assert report.feedback_posted


@test("Vault rejects impostor via ERC-8004 verification")
def _():
    provider = _setup_provider()
    vault = MoltVault(
        registry_provider=provider,
    )

    session, verified = vault.connect_agent_verified(
        agent_id=1,
        claimed_owner="0xIMPOSTOR",
        moltshield_score=95,
    )

    # Even with a perfect MoltShield score, identity fails
    assert session is None
    assert not verified.identity_verified


@test("Vault without ERC-8004 still works via connect_agent()")
def _():
    """Backward compatibility — ERC-8004 is optional."""
    vault = MoltVault(
        policy=WalletPolicy(confirm_above_usd=9999, confirm_new_recipients=False),
    )

    session = vault.connect_agent("bot", "Bot", trust_score=80, task_description="Test")
    assert session is not None
    assert session.is_active

    tx = _make_tx(value_usd=10.0, agent_id="bot", session_id=session.session_id)
    result = vault.propose_transaction(session.session_id, tx)
    assert not result.is_blocked


@test("Vault.connect_agent_verified raises if no provider configured")
def _():
    vault = MoltVault()  # No registry_provider
    try:
        vault.connect_agent_verified(1, "0xOwner")
        assert False, "Should have raised RuntimeError"
    except RuntimeError as e:
        assert "not configured" in str(e).lower()


@test("DANGER-rated agent via combined trust gets read-only session")
def _():
    """Agent 3 has bad reputation → combined score should be in DANGER range."""
    provider = _setup_provider()
    vault = MoltVault(
        registry_provider=provider,
        trusted_clients=[f"0xClient{i}" for i in range(8)],
    )

    session, verified = vault.connect_agent_verified(
        agent_id=3,
        claimed_owner="0xOwnerBad",
        moltshield_score=30,  # Bad code + bad reputation = DANGER
        task_description="Try to trade",
    )

    assert session is not None
    assert verified.identity_verified
    # Should have very limited capabilities
    assert AgentCapability.PROPOSE_TRANSFER not in session.capabilities
    assert AgentCapability.VIEW_BALANCE in session.capabilities


@test("New agent (no reputation) gets penalty in combined score")
def _():
    provider = _setup_provider()
    vault = MoltVault(
        registry_provider=provider,
    )

    session, verified = vault.connect_agent_verified(
        agent_id=2,
        claimed_owner="0xOwnerNew",
        moltshield_score=75,
        task_description="First time here",
    )

    assert session is not None
    assert verified.trust_result.is_new_agent
    # Combined score should be less than raw 75 due to new agent penalty
    assert verified.trust_result.combined_score < 75


@test("Agent profile accessible through vault")
def _():
    provider = _setup_provider()
    vault = MoltVault(
        registry_provider=provider,
        trusted_clients=[f"0xClient{i}" for i in range(10)],
    )

    profile = vault.get_agent_profile(1)
    assert profile is not None
    assert profile["identity"]["name"] == "DeFi Rebalancer"
    assert profile["reputation"]["general"]["feedback_count"] == 10


@test("ATTACK: Stolen identity blocked by ERC-8004 ownership check")
def _():
    """
    Scenario: Attacker knows agent #1 has a good reputation.
    They try to connect using agent #1's ID but their own address.
    ERC-8004 ownership verification blocks this because the attacker
    doesn't own the ERC-721 token.
    """
    provider = _setup_provider()
    vault = MoltVault(registry_provider=provider)

    session, verified = vault.connect_agent_verified(
        agent_id=1,
        claimed_owner="0xATTACKER",
        moltshield_score=95,
    )

    assert session is None
    assert not verified.identity_verified
    assert any("FAILED" in w for w in verified.trust_result.warnings)


@test("ATTACK: Sybil inflated reputation discounted without trusted clients")
def _():
    """
    Scenario: Attacker creates fake feedback from many addresses
    to inflate their agent's reputation. Without trusted client
    filtering, the trust engine applies a Sybil discount.
    """
    p = MockProvider()
    p.register_agent("0xAttacker", "FakeBot")
    # Attacker seeds 100 perfect reviews from sock puppets
    for i in range(100):
        p.seed_feedback(1, f"0xSybil{i}", value=100, tag1="starred")

    client = RegistryClient(p)
    engine = CombinedTrustEngine(
        registry_client=client,
        weights=TrustWeights(min_feedback_for_confidence=3),
    )

    # Without trusted clients → Sybil discount applied
    result = engine.evaluate(
        agent_id=1, moltshield_score=50,
        trusted_clients=None,  # No filtering!
    )
    assert any("sybil" in w.lower() for w in result.warnings)


@test("ATTACK: Good reputation cannot mask critical static vulnerabilities")
def _():
    """
    Scenario: An agent has great on-chain reputation but MoltShield
    found critical vulnerabilities in its code (e.g., data exfiltration).
    The combined trust engine caps the score regardless of reputation.
    """
    p = MockProvider()
    p.register_agent("0xOwner", "SneakyBot")
    for i in range(50):
        p.seed_feedback(1, f"0xClient{i}", value=95, tag1="starred")

    client = RegistryClient(p)
    engine = CombinedTrustEngine(
        registry_client=client,
        weights=TrustWeights(
            min_feedback_for_confidence=3,
            critical_static_ceiling=40,
        ),
    )

    result = engine.evaluate(
        agent_id=1, moltshield_score=8,  # Critical vulnerabilities!
        trusted_clients=[f"0xClient{i}" for i in range(50)],
    )

    # Must be capped at 20 (rule: static < 10 → max 20)
    assert result.combined_score <= 20
    assert result.tier == "DANGER"
    assert any("capped" in w.lower() for w in result.warnings)


# ═══════════════════════════════════════════════════
# SECTION 6: Feedback Tags & ERC-8004 Spec Compliance
# ═══════════════════════════════════════════════════

print("\n── Feedback Tags & Spec Compliance ──")


@test("MoltVault feedback uses standardized tags")
def _():
    """Verify our feedback tags match ERC-8004 conventions."""
    p = _setup_provider()
    client = RegistryClient(p)
    bridge = ERC8004Bridge(client)

    # Post various types of feedback
    idx1 = client.post_feedback(1, score=85, tag1="moltvault:trust")
    idx2 = client.post_feedback(1, score=92, tag1="moltvault:policy")
    idx3 = client.post_feedback(1, score=100, tag1="moltvault:clean_session", tag2="txns:5")

    # Verify they're retrievable by tag
    trust_fb = p.get_all_feedback(1, tag1="moltvault:trust")
    assert len(trust_fb) > 0

    policy_fb = p.get_all_feedback(1, tag1="moltvault:policy")
    assert len(policy_fb) > 0


@test("FeedbackEntry normalized_value works with decimals")
def _():
    entry = FeedbackEntry(
        agent_id=1, client_address="0xA", feedback_index=1,
        value=9977, value_decimals=2,
    )
    assert entry.normalized_value == 99.77

    entry_no_dec = FeedbackEntry(
        agent_id=1, client_address="0xA", feedback_index=1,
        value=85, value_decimals=0,
    )
    assert entry_no_dec.normalized_value == 85.0


@test("ReputationSummary average_score handles zero feedback")
def _():
    summary = ReputationSummary(
        agent_id=1, feedback_count=0,
        summary_value=0, summary_value_decimals=0,
    )
    assert summary.average_score == 0.0


# ═══════════════════════════════════════════════════
# Results
# ═══════════════════════════════════════════════════

print(f"\n{'=' * 60}")
print(f"ERC-8004 Integration: {passed} passed, {failed} failed, {passed + failed} total")
print(f"{'=' * 60}")

if errors:
    print("\nFailures:")
    for e in errors:
        print(f"  • {e}")

sys.exit(1 if failed > 0 else 0)
