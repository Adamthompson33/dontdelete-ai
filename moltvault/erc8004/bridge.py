"""
MoltVault ↔ ERC-8004 Bridge
==============================
Connects on-chain agent identity and reputation to MoltVault's
session system and policy engine.

The full lifecycle:

  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
  │  ERC-8004    │    │  MoltShield  │    │  MoltVault   │
  │  Identity    │───▸│  Code Scan   │───▸│  Session     │
  │  Registry    │    │  (static)    │    │  Manager     │
  └──────────────┘    └──────────────┘    └──────┬───────┘
                                                 │
  ┌──────────────┐    ┌──────────────┐           │
  │  ERC-8004    │───▸│  Combined    │───────────┘
  │  Reputation  │    │  Trust Score │
  │  Registry    │    └──────────────┘
  └──────────────┘
                                          ┌──────────────┐
  ┌──────────────┐                       │  Transaction  │
  │  ERC-8004    │◂─────────────────────│  Outcomes     │
  │  Reputation  │    (post feedback)    │  (from vault) │
  │  & Validation│                       └──────────────┘
  └──────────────┘

1. Agent presents ERC-8004 identity (agent_id + owner proof)
2. MoltShield scans the agent's code → static trust score
3. ERC-8004 reputation is fetched → earned trust score
4. Combined Trust Engine merges both → unified score
5. MoltVault creates a session with capabilities matching the score
6. Agent operates within policy constraints
7. Transaction outcomes are posted back to ERC-8004 as reputation
"""
from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass, field

from ..types import AgentCapability, AgentSession, GateResult, GateDecision
from ..agents.sessions import AgentSessionManager, trust_score_to_tier, TRUST_TIER_CAPABILITIES
from .client import RegistryClient, AgentRegistration, MockProvider
from .trust import CombinedTrustEngine, CombinedTrustResult, TrustWeights


@dataclass
class VerifiedAgent:
    """
    An agent whose identity has been cryptographically verified on-chain.
    This is the bridge's output — it contains everything MoltVault needs
    to create a session.
    """
    agent_id: int                           # ERC-8004 tokenId
    agent_registry: str                     # "eip155:1:0x742..."
    name: str
    description: str
    owner_address: str                      # Verified on-chain owner
    identity_verified: bool = False         # Ownership proven
    trust_result: CombinedTrustResult | None = None
    registration: AgentRegistration | None = None
    verification_timestamp: float = field(default_factory=time.time)


@dataclass
class FeedbackReport:
    """What MoltVault reports back to ERC-8004 after processing transactions."""
    agent_id: int
    session_id: str
    total_transactions: int
    approved: int
    blocked: int
    confirmations_required: int
    policy_violations: int
    intent_mismatches: int
    policy_compliance_score: int        # 0-100
    feedback_posted: bool = False
    feedback_index: int = 0


class ERC8004Bridge:
    """
    The integration layer between ERC-8004 and MoltVault.

    Usage:
        # Setup
        provider = MockProvider()  # or Web3Provider(...)
        client = RegistryClient(provider)
        bridge = ERC8004Bridge(client)

        # 1. Agent connects with on-chain identity
        verified = bridge.verify_agent(
            agent_id=42,
            claimed_owner="0xAgentOwner",
            moltshield_score=85,
        )

        # 2. Create session from verified identity
        session = bridge.create_verified_session(
            verified,
            session_manager=vault.sessions,
            task_description="Rebalance portfolio",
        )

        # 3. After transactions, post outcomes back on-chain
        bridge.report_session_outcomes(
            agent_id=42,
            session_id=session.session_id,
            audit_log=vault.audit_log,
        )
    """

    def __init__(
        self,
        registry_client: RegistryClient,
        trust_engine: CombinedTrustEngine | None = None,
        trusted_clients: list[str] | None = None,
    ):
        self.registry = registry_client
        self.trust_engine = trust_engine or CombinedTrustEngine(
            registry_client=registry_client,
        )
        # Addresses we trust for reputation filtering (anti-Sybil)
        self.trusted_clients = trusted_clients or []

    # ═════════════════════════════════════════════
    # Step 1: Verify Agent Identity
    # ═════════════════════════════════════════════

    def verify_agent(
        self,
        agent_id: int,
        claimed_owner: str,
        moltshield_score: int = 0,
        moltshield_details: dict | None = None,
    ) -> VerifiedAgent:
        """
        Verify an agent's on-chain identity and compute combined trust.

        This is the FIRST thing that happens when an agent connects.
        Before we create any session, we verify:
          1. The agent exists on-chain (Identity Registry)
          2. The claimed owner actually owns the ERC-721 token
          3. The agent is active
          4. Combined trust score (static + reputation)
        """
        # Fetch on-chain registration
        registration = self.registry.get_agent(agent_id)

        if not registration:
            return VerifiedAgent(
                agent_id=agent_id,
                agent_registry="",
                name=f"unregistered-{agent_id}",
                description="Agent not found in ERC-8004 Identity Registry",
                owner_address=claimed_owner,
                identity_verified=False,
                trust_result=CombinedTrustResult(
                    combined_score=0,
                    tier="DANGER",
                    signals=[],
                    warnings=["Agent not registered on ERC-8004"],
                ),
            )

        # Verify ownership
        is_owner = self.registry.verify_identity(agent_id, claimed_owner)

        if not is_owner:
            return VerifiedAgent(
                agent_id=agent_id,
                agent_registry=registration.agent_registry,
                name=registration.name,
                description=registration.description,
                owner_address=claimed_owner,
                identity_verified=False,
                registration=registration,
                trust_result=CombinedTrustResult(
                    combined_score=0,
                    tier="DANGER",
                    signals=[],
                    warnings=[
                        f"Identity verification FAILED: "
                        f"claimed owner {claimed_owner} does not own agent #{agent_id}. "
                        f"Actual owner: {registration.owner_address}"
                    ],
                ),
            )

        # Check active status
        if not registration.is_active:
            return VerifiedAgent(
                agent_id=agent_id,
                agent_registry=registration.agent_registry,
                name=registration.name,
                description=registration.description,
                owner_address=claimed_owner,
                identity_verified=True,
                registration=registration,
                trust_result=CombinedTrustResult(
                    combined_score=0,
                    tier="DANGER",
                    signals=[],
                    warnings=["Agent is registered but marked inactive"],
                ),
            )

        # Compute combined trust
        trust_result = self.trust_engine.evaluate(
            agent_id=agent_id,
            moltshield_score=moltshield_score,
            trusted_clients=self.trusted_clients,
            moltshield_details=moltshield_details,
        )

        return VerifiedAgent(
            agent_id=agent_id,
            agent_registry=registration.agent_registry,
            name=registration.name,
            description=registration.description,
            owner_address=claimed_owner,
            identity_verified=True,
            trust_result=trust_result,
            registration=registration,
        )

    # ═════════════════════════════════════════════
    # Step 2: Create Verified Session
    # ═════════════════════════════════════════════

    def create_verified_session(
        self,
        verified: VerifiedAgent,
        session_manager: AgentSessionManager,
        task_description: str = "",
        # Optional overrides
        capability_overrides: list[AgentCapability] | None = None,
        budget_override: float | None = None,
    ) -> AgentSession | None:
        """
        Create a MoltVault session from a verified ERC-8004 identity.

        The session capabilities are determined by the combined trust score,
        not just MoltShield alone. An agent with mediocre code but excellent
        on-chain reputation gets more capabilities than one with no history.

        Returns None if the agent failed identity verification.
        """
        if not verified.identity_verified:
            return None

        trust = verified.trust_result
        if not trust:
            return None

        combined_score = trust.combined_score

        # Use combined score to determine tier and capabilities
        tier = trust.tier
        capabilities = list(TRUST_TIER_CAPABILITIES.get(tier, []))

        if capability_overrides is not None:
            # Human can restrict (or rarely, expand) capabilities
            capabilities = capability_overrides

        return session_manager.create_session(
            agent_id=f"erc8004:{verified.agent_id}",
            agent_name=verified.name,
            trust_score=combined_score,
            task_description=task_description,
            capabilities=capabilities,
            daily_budget_usd=budget_override,
        )

    # ═════════════════════════════════════════════
    # Step 3: Report Outcomes Back On-Chain
    # ═════════════════════════════════════════════

    def report_session_outcomes(
        self,
        agent_id: int,
        session_id: str,
        audit_log: list[dict],
    ) -> FeedbackReport:
        """
        After a session ends, post MoltVault's assessment back to
        ERC-8004's Reputation Registry. This creates a permanent,
        on-chain record of how the agent behaved.

        Other wallets can then use this feedback when deciding
        whether to trust this agent.
        """
        # Filter audit log to this session's entries
        session_entries = [
            e for e in audit_log
            if e.get("agent_id", "").endswith(str(agent_id))
        ]

        total = len(session_entries)
        approved = sum(
            1 for e in session_entries
            if e.get("decision") in ("ALLOW", "ALLOW_WITH_LOG")
        )
        blocked = sum(
            1 for e in session_entries
            if e.get("decision") == "DENY"
        )
        confirmations = sum(
            1 for e in session_entries
            if e.get("decision") == "REQUIRE_CONFIRMATION"
        )
        violations = sum(e.get("violations", 0) for e in session_entries)

        # Check for intent mismatches
        intent_mismatches = sum(
            1 for e in session_entries
            if "PL-060" in e.get("violation_ids", [])
            or "PL-061" in e.get("violation_ids", [])
        )

        # Calculate policy compliance score
        if total == 0:
            compliance_score = 50  # Neutral for no transactions
        else:
            # Start at 100, deduct for violations
            compliance_score = 100
            compliance_score -= (blocked / total) * 80 if total > 0 else 0
            compliance_score -= (confirmations / total) * 10 if total > 0 else 0
            compliance_score -= intent_mismatches * 20
            compliance_score = max(0, min(100, int(compliance_score)))

        report = FeedbackReport(
            agent_id=agent_id,
            session_id=session_id,
            total_transactions=total,
            approved=approved,
            blocked=blocked,
            confirmations_required=confirmations,
            policy_violations=violations,
            intent_mismatches=intent_mismatches,
            policy_compliance_score=compliance_score,
        )

        # Post feedback to ERC-8004 Reputation Registry
        try:
            # Primary feedback: policy compliance score
            feedback_idx = self.registry.post_feedback(
                agent_id=agent_id,
                score=compliance_score,
                tag1="moltvault:policy",
                tag2=session_id[:16],
            )
            report.feedback_posted = True
            report.feedback_index = feedback_idx

            # If there were intent mismatches, post a specific warning
            if intent_mismatches > 0:
                self.registry.post_feedback(
                    agent_id=agent_id,
                    score=0,
                    tag1="moltvault:intent_mismatch",
                    tag2=f"count:{intent_mismatches}",
                )

            # If everything was clean, post a positive signal
            if blocked == 0 and intent_mismatches == 0 and total > 0:
                self.registry.post_feedback(
                    agent_id=agent_id,
                    score=100,
                    tag1="moltvault:clean_session",
                    tag2=f"txns:{total}",
                )

        except Exception:
            report.feedback_posted = False

        return report

    # ═════════════════════════════════════════════
    # Query helpers
    # ═════════════════════════════════════════════

    def get_agent_profile(self, agent_id: int) -> dict:
        """
        Get a comprehensive profile of an agent combining
        on-chain identity, reputation, and validation data.
        """
        agent = self.registry.get_agent(agent_id)
        if not agent:
            return {"error": f"Agent {agent_id} not found"}

        rep = self.registry.get_reputation(
            agent_id, trusted_clients=self.trusted_clients, tag1="starred",
        )
        policy_rep = self.registry.get_reputation(
            agent_id, trusted_clients=self.trusted_clients, tag1="moltvault:policy",
        )
        val = self.registry.get_validation(agent_id)

        return {
            "identity": {
                "agent_id": agent_id,
                "name": agent.name,
                "description": agent.description,
                "owner": agent.owner_address,
                "active": agent.is_active,
                "services": [s.get("name") for s in agent.services],
                "x402_support": agent.x402_support,
            },
            "reputation": {
                "general": {
                    "feedback_count": rep.feedback_count,
                    "average_score": round(rep.average_score, 2),
                },
                "moltvault_policy": {
                    "feedback_count": policy_rep.feedback_count,
                    "average_compliance": round(policy_rep.average_score, 2),
                },
            },
            "validation": {
                "count": val.validation_count,
                "average_response": val.average_response,
            },
        }
