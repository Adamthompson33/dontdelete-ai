"""
MoltVault Types — Shared Vocabulary
=====================================
Core data types used across the wallet.

NOTE: This is a stub. Full implementation exists in the main project.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any
import time
import uuid


class TransactionType(Enum):
    """What kind of transaction is this?"""
    NATIVE_TRANSFER = "native_transfer"
    ERC20_TRANSFER = "erc20_transfer"
    ERC20_APPROVE = "erc20_approve"
    CONTRACT_CALL = "contract_call"
    SWAP = "swap"
    BRIDGE = "bridge"
    NFT_TRANSFER = "nft_transfer"
    STAKE = "stake"
    UNSTAKE = "unstake"
    UNKNOWN = "unknown"


class RiskLevel(Enum):
    """How risky is this transaction?"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class GateDecision(Enum):
    """What did the policy engine decide?"""
    ALLOW = "allow"
    ALLOW_WITH_LOG = "allow_with_log"
    REQUIRE_CONFIRMATION = "require_confirmation"
    DENY = "deny"


class AgentCapability(Enum):
    """What can an agent do in a session?"""
    VIEW_BALANCE = "view_balance"
    VIEW_HISTORY = "view_history"
    PROPOSE_TRANSFER = "propose_transfer"
    PROPOSE_SWAP = "propose_swap"
    PROPOSE_CONTRACT = "propose_contract"
    PROPOSE_APPROVAL = "propose_approval"
    EXECUTE_CONFIRMED = "execute_confirmed"


@dataclass
class Transaction:
    """A proposed transaction from an agent."""
    tx_type: TransactionType
    chain: str
    from_address: str
    to_address: str
    value_native: float = 0.0
    value_usd: float = 0.0
    token_address: str = ""
    token_symbol: str = ""
    token_amount: float = 0.0
    calldata: str = ""
    memo: str = ""
    agent_id: str = ""
    agent_task: str = ""
    session_id: str = ""
    request_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: float = field(default_factory=time.time)


@dataclass
class PolicyViolation:
    """A policy rule that was triggered."""
    rule_id: str
    category: str
    severity: str
    message: str
    details: dict = field(default_factory=dict)


@dataclass
class GateResult:
    """The policy engine's decision on a transaction."""
    decision: GateDecision
    risk_level: RiskLevel
    transaction: Transaction
    explanation: str = ""
    violations: list[PolicyViolation] = field(default_factory=list)
    confirmation_code: str = ""
    
    @property
    def needs_human(self) -> bool:
        return self.decision == GateDecision.REQUIRE_CONFIRMATION
    
    @property
    def is_blocked(self) -> bool:
        return self.decision == GateDecision.DENY


@dataclass
class AgentSession:
    """A trust-gated session for an agent."""
    session_id: str
    agent_id: str
    agent_name: str
    trust_score: int
    capabilities: list[AgentCapability]
    task_description: str = ""
    daily_budget_usd: float = 100.0
    spent_today_usd: float = 0.0
    created_at: float = field(default_factory=time.time)
    expires_at: float = 0.0
    is_active: bool = True
    
    def record_spend(self, amount_usd: float) -> None:
        self.spent_today_usd += amount_usd
    
    @property
    def remaining_budget(self) -> float:
        return max(0, self.daily_budget_usd - self.spent_today_usd)
