"""
MoltVault — Top-Level Orchestrator
=====================================
Ties together the policy engine, session manager, confirmation service,
and transaction classifier into a single, clean API.

This is what an integration calls. One class, four methods:

    vault = MoltVault(policy)

    # 1. Agent connects → gets a session token (not the private key)
    session = vault.connect_agent(agent_id, trust_score, task)

    # 2. Agent proposes a transaction
    result = vault.propose_transaction(session.session_id, tx_params)

    # 3. If confirmation needed → human approves via separate channel
    status = vault.confirm(confirmation_id, human_code)

    # 4. If approved → execute (signing happens in the enclave)
    vault.execute(result.transaction.request_id)

The private key NEVER leaves the secure enclave.
The agent NEVER sees the confirmation code.
Every decision is auditable.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field

from .types import (
    AgentCapability,
    AgentSession,
    GateDecision,
    GateResult,
    RiskLevel,
    Transaction,
    TransactionType,
)
from .policy.engine import PolicyEngine, WalletPolicy
from .agents.sessions import AgentSessionManager, trust_score_to_tier
from .confirm.protocol import (
    ConfirmationService,
    ConfirmationMethod,
    ConfirmationStatus,
    PendingConfirmation,
)
from .transactions.classifier import (
    classify_transaction,
    detect_key_export_attempt,
)
from .erc8004.client import RegistryClient, RegistryProvider, MockProvider
from .erc8004.trust import CombinedTrustEngine, CombinedTrustResult
from .erc8004.bridge import ERC8004Bridge, VerifiedAgent, FeedbackReport


@dataclass
class ExecutionResult:
    """Result of attempting to execute a confirmed transaction."""
    success: bool
    request_id: str
    tx_hash: str | None = None          # Blockchain tx hash (if executed)
    error: str = ""
    confirmation_id: str | None = None


class MoltVault:
    """
    The AI Agent Crypto Wallet.

    Security architecture:
      ┌─────────────┐     ┌──────────────┐     ┌─────────────┐
      │   AI Agent   │────▸│  MoltVault   │────▸│  Signing    │
      │  (untrusted) │     │  (firewall)  │     │  Enclave    │
      └─────────────┘     └──────┬───────┘     └─────────────┘
                                 │
                          ┌──────┴───────┐
                          │    Human     │
                          │  (confirms)  │
                          └──────────────┘

      The agent proposes. The vault evaluates. The human confirms.
      The enclave signs. At no point does the agent touch the key.
    """

    def __init__(
        self,
        policy: WalletPolicy | None = None,
        confirmation_method: ConfirmationMethod = ConfirmationMethod.CHALLENGE,
        totp_secret: bytes | None = None,
        confirmation_timeout: int = 300,
        registry_provider: RegistryProvider | None = None,
        trusted_clients: list[str] | None = None,
    ):
        self.policy = policy or WalletPolicy()
        self.engine = PolicyEngine(self.policy)
        self.sessions = AgentSessionManager(
            max_session_hours=self.policy.agent_session_max_hours,
        )
        self.confirmations = ConfirmationService(
            method=confirmation_method,
            totp_secret=totp_secret,
            timeout_seconds=confirmation_timeout,
        )

        # ERC-8004 integration (optional — works without it)
        self._bridge: ERC8004Bridge | None = None
        if registry_provider:
            client = RegistryClient(registry_provider)
            self._bridge = ERC8004Bridge(
                registry_client=client,
                trusted_clients=trusted_clients or [],
            )

        # Execution tracking
        self._confirmed_txs: dict[str, GateResult] = {}
        self._executed_txs: dict[str, ExecutionResult] = {}
        self._blocked_txs: list[dict] = []

    @property
    def bridge(self) -> ERC8004Bridge | None:
        """ERC-8004 bridge (None if no registry provider configured)."""
        return self._bridge

    # ═════════════════════════════════════════════
    # 1. Agent Connection
    # ═════════════════════════════════════════════

    def connect_agent(
        self,
        agent_id: str,
        agent_name: str,
        trust_score: int = 0,
        task_description: str = "",
        **kwargs,
    ) -> AgentSession:
        """
        Agent requests access to the wallet.
        Returns a session token with policy-bound capabilities.
        The agent NEVER receives the private key.

        The trust_score should come from MoltShield scanning the agent's
        skill files before connection.
        """
        session = self.sessions.create_session(
            agent_id=agent_id,
            agent_name=agent_name,
            trust_score=trust_score,
            task_description=task_description,
            **kwargs,
        )
        return session

    def connect_agent_verified(
        self,
        agent_id: int,
        claimed_owner: str,
        moltshield_score: int = 0,
        task_description: str = "",
        moltshield_details: dict | None = None,
    ) -> tuple[AgentSession | None, VerifiedAgent]:
        """
        Connect an agent using ERC-8004 on-chain identity verification.

        This is the PREFERRED connection method when ERC-8004 is configured.
        Instead of trusting the agent's self-reported identity:
          1. Verifies ownership of the ERC-8004 identity token (ERC-721)
          2. Fetches on-chain reputation from the Reputation Registry
          3. Combines MoltShield static score + on-chain reputation
          4. Creates a session with capabilities matching the combined score

        Returns (session, verified_agent). Session is None if verification failed.
        """
        if not self._bridge:
            raise RuntimeError(
                "ERC-8004 not configured. Pass registry_provider to MoltVault() "
                "or use connect_agent() for unverified connections."
            )

        # Step 1+2+3: Verify identity + fetch reputation + compute combined trust
        verified = self._bridge.verify_agent(
            agent_id=agent_id,
            claimed_owner=claimed_owner,
            moltshield_score=moltshield_score,
            moltshield_details=moltshield_details,
        )

        if not verified.identity_verified:
            return None, verified

        # Step 4: Create session from verified identity
        session = self._bridge.create_verified_session(
            verified=verified,
            session_manager=self.sessions,
            task_description=task_description,
        )

        return session, verified

    def report_session_outcomes(
        self,
        erc8004_agent_id: int,
        session_id: str,
    ) -> FeedbackReport | None:
        """
        Post transaction outcomes back to ERC-8004's Reputation Registry.
        Call this when a session ends to build the agent's on-chain reputation.

        Other wallets that check this agent's reputation will see MoltVault's
        assessment of how the agent behaved.
        """
        if not self._bridge:
            return None

        return self._bridge.report_session_outcomes(
            agent_id=erc8004_agent_id,
            session_id=session_id,
            audit_log=self.audit_log,
        )

    def get_agent_profile(self, erc8004_agent_id: int) -> dict | None:
        """Get comprehensive ERC-8004 profile for an agent."""
        if not self._bridge:
            return None
        return self._bridge.get_agent_profile(erc8004_agent_id)

    # ═════════════════════════════════════════════
    # 2. Transaction Proposal
    # ═════════════════════════════════════════════

    def propose_transaction(
        self,
        session_id: str,
        tx: Transaction,
    ) -> GateResult:
        """
        Agent proposes a transaction. The policy engine evaluates it.

        Returns a GateResult:
          - ALLOW → transaction can proceed to signing
          - ALLOW_WITH_LOG → proceeds but is logged for audit
          - REQUIRE_CONFIRMATION → human must approve via separate channel
          - DENY → transaction is blocked

        The agent checks result.decision to know what happened.
        If REQUIRE_CONFIRMATION, the agent gets a confirmation_id
        to poll for status — but NEVER the confirmation code.
        """
        # Validate session
        session = self.sessions.get_session(session_id)
        if not session:
            return GateResult(
                decision=GateDecision.DENY,
                risk_level=RiskLevel.CRITICAL,
                transaction=tx,
                explanation="Session not found or expired.",
            )

        # Check for key export attempts in memo/task
        if detect_key_export_attempt(tx.memo) or detect_key_export_attempt(tx.agent_task):
            return GateResult(
                decision=GateDecision.DENY,
                risk_level=RiskLevel.CRITICAL,
                transaction=tx,
                explanation=(
                    "BLOCKED: Detected attempt to access private key material. "
                    "Private keys never leave the secure enclave."
                ),
            )

        # Set agent context on transaction
        tx.agent_id = session.agent_id
        tx.session_id = session.session_id
        if not tx.agent_task:
            tx.agent_task = session.task_description

        # Run policy engine
        result = self.engine.evaluate(tx, session)

        # If confirmation needed, create pending confirmation
        if result.needs_human:
            pending = self.confirmations.request_confirmation(result)
            result.confirmation_code = pending.confirmation_id  # ID, not the code!
            self._confirmed_txs[pending.confirmation_id] = result

        # If allowed, record the spend against the session budget
        if result.decision in (GateDecision.ALLOW, GateDecision.ALLOW_WITH_LOG):
            session.record_spend(tx.value_usd)

        # Track blocks
        if result.is_blocked:
            self._blocked_txs.append({
                "timestamp": time.time(),
                "agent_id": session.agent_id,
                "tx_type": tx.tx_type.value,
                "value_usd": tx.value_usd,
                "reason": result.explanation,
                "violations": [v.rule_id for v in result.violations],
            })

        return result

    # ═════════════════════════════════════════════
    # 3. Human Confirmation
    # ═════════════════════════════════════════════

    def get_pending_confirmations(self) -> list[PendingConfirmation]:
        """
        Get all pending confirmations for the human's dashboard.
        Called by the HUMAN-FACING interface, not the agent.
        """
        return self.confirmations.get_all_pending()

    def get_confirmation_display(self, confirmation_id: str) -> str | None:
        """
        Get the human-readable display for a pending confirmation.
        This is what shows on the human's phone/companion app.
        """
        pending = self.confirmations.get_pending(confirmation_id)
        if pending:
            return self.confirmations.format_for_human(pending)
        return None

    def confirm(self, confirmation_id: str, code: str) -> ConfirmationStatus:
        """
        Human submits a confirmation code.
        Called by the HUMAN-FACING interface (companion app, web dashboard).
        The agent NEVER calls this — it only polls check_confirmation_status().
        """
        status = self.confirmations.verify_code(confirmation_id, code)

        # If confirmed, record spend
        if status == ConfirmationStatus.CONFIRMED:
            result = self._confirmed_txs.get(confirmation_id)
            if result:
                session = self.sessions.get_session(result.transaction.session_id)
                if session:
                    session.record_spend(result.transaction.value_usd)

        return status

    def deny_confirmation(self, confirmation_id: str) -> ConfirmationStatus:
        """Human explicitly denies a transaction."""
        return self.confirmations.deny(confirmation_id)

    def check_confirmation_status(self, confirmation_id: str) -> ConfirmationStatus:
        """
        Agent polls this to check if their transaction was confirmed.
        Returns PENDING, CONFIRMED, DENIED, or EXPIRED.
        The agent NEVER sees the confirmation code through this method.
        """
        return self.confirmations.get_status(confirmation_id)

    # ═════════════════════════════════════════════
    # 4. Execution
    # ═════════════════════════════════════════════

    def execute(self, request_id: str, confirmation_id: str | None = None) -> ExecutionResult:
        """
        Execute a transaction that has been approved.

        In a real implementation, this would:
          1. Verify the transaction is approved (by policy or by confirmation)
          2. Build the raw transaction
          3. Send to the signing enclave
          4. Broadcast the signed transaction
          5. Return the tx hash

        The signing enclave is a separate process/hardware that holds
        the private key. It only signs transactions that:
          a) Were evaluated by the policy engine, AND
          b) Were confirmed by the human (if required)

        For this prototype, we simulate the signing step.
        """
        # Check if this was a confirmed transaction
        if confirmation_id:
            status = self.confirmations.get_status(confirmation_id)
            if status != ConfirmationStatus.CONFIRMED:
                return ExecutionResult(
                    success=False,
                    request_id=request_id,
                    error=f"Transaction not confirmed (status: {status.value})",
                    confirmation_id=confirmation_id,
                )

        # In production: sign and broadcast
        # Here: simulate success
        import hashlib
        fake_tx_hash = "0x" + hashlib.sha256(
            f"{request_id}:{time.time()}".encode()
        ).hexdigest()

        result = ExecutionResult(
            success=True,
            request_id=request_id,
            tx_hash=fake_tx_hash,
            confirmation_id=confirmation_id,
        )
        self._executed_txs[request_id] = result
        return result

    # ═════════════════════════════════════════════
    # Session Management
    # ═════════════════════════════════════════════

    def revoke_agent(self, agent_id: str) -> int:
        """Immediately revoke all sessions for an agent."""
        return self.sessions.revoke_all_for_agent(agent_id)

    def list_sessions(self) -> list[dict]:
        """List all active agent sessions."""
        return [
            self.sessions.get_session_summary(s.session_id)
            for s in self.sessions.list_active_sessions()
        ]

    # ═════════════════════════════════════════════
    # Audit
    # ═════════════════════════════════════════════

    @property
    def audit_log(self) -> list[dict]:
        """Full audit trail of all decisions."""
        return self.engine.audit_log

    @property
    def blocked_transactions(self) -> list[dict]:
        """All blocked transaction attempts."""
        return list(self._blocked_txs)

    def get_stats(self) -> dict:
        """Dashboard stats."""
        log = self.engine.audit_log
        return {
            "total_proposals": len(log),
            "allowed": sum(1 for e in log if e["decision"] == "ALLOW"),
            "allowed_with_log": sum(1 for e in log if e["decision"] == "ALLOW_WITH_LOG"),
            "confirmations_required": sum(1 for e in log if e["decision"] == "REQUIRE_CONFIRMATION"),
            "denied": sum(1 for e in log if e["decision"] == "DENY"),
            "total_value_processed_usd": sum(e.get("value_usd", 0) for e in log),
            "active_sessions": len(self.sessions.list_active_sessions()),
            "blocked_attempts": len(self._blocked_txs),
        }
