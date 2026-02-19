"""
MoltVault Confirmation Protocol
=================================
Out-of-band human verification for high-risk transactions.

NOTE: This is a stub. Full implementation (428 lines) exists in the main project.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
import time
import uuid
import secrets

from ..types import GateResult


class ConfirmationMethod(Enum):
    """How does the human confirm?"""
    CHALLENGE = "challenge"      # Random code displayed, human types it
    TOTP = "totp"               # Time-based OTP (Google Authenticator style)
    PUSH = "push"               # Push notification with approve/deny


class ConfirmationStatus(Enum):
    """Status of a pending confirmation."""
    PENDING = "pending"
    CONFIRMED = "confirmed"
    DENIED = "denied"
    EXPIRED = "expired"


@dataclass
class PendingConfirmation:
    """A transaction awaiting human confirmation."""
    confirmation_id: str
    gate_result: GateResult
    secret_code: str            # The code the human must enter (NEVER shown to agent)
    status: ConfirmationStatus = ConfirmationStatus.PENDING
    created_at: float = field(default_factory=time.time)
    expires_at: float = 0.0
    attempts: int = 0
    max_attempts: int = 3


class ConfirmationService:
    """Manages pending confirmations and verification."""
    
    def __init__(
        self,
        method: ConfirmationMethod = ConfirmationMethod.CHALLENGE,
        totp_secret: bytes | None = None,
        timeout_seconds: int = 300,
    ):
        self.method = method
        self.totp_secret = totp_secret
        self.timeout = timeout_seconds
        self._pending: dict[str, PendingConfirmation] = {}
    
    def request_confirmation(self, gate_result: GateResult) -> PendingConfirmation:
        """Create a new pending confirmation."""
        conf_id = str(uuid.uuid4())[:8].upper()
        
        # Generate secret code (6 digits for challenge)
        if self.method == ConfirmationMethod.CHALLENGE:
            secret = f"{secrets.randbelow(1000000):06d}"
        else:
            secret = ""
        
        pending = PendingConfirmation(
            confirmation_id=conf_id,
            gate_result=gate_result,
            secret_code=secret,
            expires_at=time.time() + self.timeout,
        )
        
        self._pending[conf_id] = pending
        return pending
    
    def get_pending(self, confirmation_id: str) -> PendingConfirmation | None:
        """Get a pending confirmation by ID."""
        pending = self._pending.get(confirmation_id)
        if pending and pending.expires_at < time.time():
            pending.status = ConfirmationStatus.EXPIRED
        return pending
    
    def get_all_pending(self) -> list[PendingConfirmation]:
        """Get all pending confirmations."""
        now = time.time()
        for p in self._pending.values():
            if p.expires_at < now and p.status == ConfirmationStatus.PENDING:
                p.status = ConfirmationStatus.EXPIRED
        return [p for p in self._pending.values() if p.status == ConfirmationStatus.PENDING]
    
    def format_for_human(self, pending: PendingConfirmation) -> str:
        """Format confirmation for human display."""
        tx = pending.gate_result.transaction
        return (
            f"🔐 CONFIRMATION REQUIRED\n"
            f"Agent: {tx.agent_id}\n"
            f"Action: {tx.tx_type.value}\n"
            f"Amount: ${tx.value_usd:.2f}\n"
            f"To: {tx.to_address[:10]}...{tx.to_address[-6:]}\n"
            f"Code: {pending.secret_code}\n"
            f"Expires: {int(pending.expires_at - time.time())}s"
        )
    
    def verify_code(self, confirmation_id: str, code: str) -> ConfirmationStatus:
        """Verify a confirmation code from the human."""
        pending = self.get_pending(confirmation_id)
        if not pending:
            return ConfirmationStatus.EXPIRED
        
        if pending.status != ConfirmationStatus.PENDING:
            return pending.status
        
        pending.attempts += 1
        
        if code == pending.secret_code:
            pending.status = ConfirmationStatus.CONFIRMED
            return ConfirmationStatus.CONFIRMED
        
        if pending.attempts >= pending.max_attempts:
            pending.status = ConfirmationStatus.DENIED
            return ConfirmationStatus.DENIED
        
        return ConfirmationStatus.PENDING
    
    def deny(self, confirmation_id: str) -> ConfirmationStatus:
        """Human explicitly denies a transaction."""
        pending = self.get_pending(confirmation_id)
        if pending and pending.status == ConfirmationStatus.PENDING:
            pending.status = ConfirmationStatus.DENIED
        return pending.status if pending else ConfirmationStatus.EXPIRED
    
    def get_status(self, confirmation_id: str) -> ConfirmationStatus:
        """Get the status of a confirmation (what agents poll)."""
        pending = self.get_pending(confirmation_id)
        return pending.status if pending else ConfirmationStatus.EXPIRED
