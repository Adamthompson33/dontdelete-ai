"""
MoltVault Policy Engine
=========================
8-category policy firewall for transaction evaluation.

NOTE: This is a stub. Full implementation (883 lines) exists in the main project.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
import time

from ..types import (
    Transaction, GateResult, GateDecision, RiskLevel,
    AgentSession, PolicyViolation,
)


@dataclass
class WalletPolicy:
    """Wallet-level policy configuration."""
    # Value limits
    max_single_tx_usd: float = 1000.0
    max_daily_usd: float = 5000.0
    confirm_above_usd: float = 100.0
    
    # Recipient rules
    confirm_new_recipients: bool = True
    blocked_addresses: list[str] = field(default_factory=list)
    
    # Contract rules
    allow_arbitrary_contracts: bool = False
    approved_contracts: list[str] = field(default_factory=list)
    
    # Session rules
    agent_session_max_hours: int = 24
    require_task_description: bool = True


class PolicyEngine:
    """
    Evaluates transactions against policy rules.
    
    8 categories:
      1. Value limits
      2. Recipient validation
      3. Contract allowlists
      4. Token approvals
      5. Rate limiting
      6. Time/context rules
      7. Agent capability checks
      8. Intent alignment
    """
    
    def __init__(self, policy: WalletPolicy):
        self.policy = policy
        self.audit_log: list[dict] = []
        self._known_recipients: set[str] = set()
    
    def evaluate(self, tx: Transaction, session: AgentSession) -> GateResult:
        """Evaluate a transaction against all policy rules."""
        violations: list[PolicyViolation] = []
        decision = GateDecision.ALLOW
        risk = RiskLevel.LOW
        
        # Check value limits
        if tx.value_usd > self.policy.max_single_tx_usd:
            violations.append(PolicyViolation(
                rule_id="PL-010",
                category="value_limits",
                severity="high",
                message=f"Transaction ${tx.value_usd:.2f} exceeds max ${self.policy.max_single_tx_usd:.2f}",
            ))
            decision = GateDecision.DENY
            risk = RiskLevel.HIGH
        
        # Check if confirmation needed
        elif tx.value_usd > self.policy.confirm_above_usd:
            decision = GateDecision.REQUIRE_CONFIRMATION
            risk = RiskLevel.MEDIUM
        
        # Check new recipient
        if (self.policy.confirm_new_recipients 
                and tx.to_address not in self._known_recipients
                and decision == GateDecision.ALLOW):
            decision = GateDecision.REQUIRE_CONFIRMATION
            risk = RiskLevel.MEDIUM
        
        # Check blocked addresses
        if tx.to_address.lower() in [a.lower() for a in self.policy.blocked_addresses]:
            violations.append(PolicyViolation(
                rule_id="PL-020",
                category="recipient",
                severity="critical",
                message="Recipient is on blocked list",
            ))
            decision = GateDecision.DENY
            risk = RiskLevel.CRITICAL
        
        result = GateResult(
            decision=decision,
            risk_level=risk,
            transaction=tx,
            explanation=violations[0].message if violations else "Transaction allowed",
            violations=violations,
        )
        
        # Log
        self.audit_log.append({
            "timestamp": time.time(),
            "agent_id": tx.agent_id,
            "decision": decision.value.upper(),
            "value_usd": tx.value_usd,
            "violations": len(violations),
            "violation_ids": [v.rule_id for v in violations],
        })
        
        # Track recipient
        if decision in (GateDecision.ALLOW, GateDecision.ALLOW_WITH_LOG):
            self._known_recipients.add(tx.to_address)
        
        return result
