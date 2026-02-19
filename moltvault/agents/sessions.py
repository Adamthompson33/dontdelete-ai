"""
MoltVault Agent Sessions
==========================
Trust-gated capability tokens for AI agents.

NOTE: This is a stub. Full implementation (258 lines) exists in the main project.
"""
from __future__ import annotations

from dataclasses import dataclass, field
import time
import uuid

from ..types import AgentSession, AgentCapability


def trust_score_to_tier(score: int) -> str:
    """Map a trust score (0-100) to a tier name."""
    if score >= 90:
        return "TRUSTED"
    elif score >= 70:
        return "CAUTION"
    elif score >= 40:
        return "WARNING"
    else:
        return "DANGER"


# Capabilities by trust tier
TRUST_TIER_CAPABILITIES: dict[str, list[AgentCapability]] = {
    "TRUSTED": [
        AgentCapability.VIEW_BALANCE,
        AgentCapability.VIEW_HISTORY,
        AgentCapability.PROPOSE_TRANSFER,
        AgentCapability.PROPOSE_SWAP,
        AgentCapability.PROPOSE_CONTRACT,
        AgentCapability.PROPOSE_APPROVAL,
        AgentCapability.EXECUTE_CONFIRMED,
    ],
    "CAUTION": [
        AgentCapability.VIEW_BALANCE,
        AgentCapability.VIEW_HISTORY,
        AgentCapability.PROPOSE_TRANSFER,
        AgentCapability.PROPOSE_SWAP,
    ],
    "WARNING": [
        AgentCapability.VIEW_BALANCE,
        AgentCapability.VIEW_HISTORY,
        AgentCapability.PROPOSE_TRANSFER,
    ],
    "DANGER": [
        AgentCapability.VIEW_BALANCE,
    ],
}


class AgentSessionManager:
    """Manages agent sessions with trust-based capabilities."""
    
    def __init__(self, max_session_hours: int = 24):
        self.max_session_hours = max_session_hours
        self._sessions: dict[str, AgentSession] = {}
    
    def create_session(
        self,
        agent_id: str,
        agent_name: str,
        trust_score: int,
        task_description: str = "",
        capabilities: list[AgentCapability] | None = None,
        daily_budget_usd: float | None = None,
    ) -> AgentSession:
        """Create a new agent session with trust-gated capabilities."""
        session_id = str(uuid.uuid4())
        tier = trust_score_to_tier(trust_score)
        
        if capabilities is None:
            capabilities = list(TRUST_TIER_CAPABILITIES.get(tier, []))
        
        # Budget scales with trust
        if daily_budget_usd is None:
            budget_by_tier = {
                "TRUSTED": 1000.0,
                "CAUTION": 500.0,
                "WARNING": 100.0,
                "DANGER": 0.0,
            }
            daily_budget_usd = budget_by_tier.get(tier, 100.0)
        
        session = AgentSession(
            session_id=session_id,
            agent_id=agent_id,
            agent_name=agent_name,
            trust_score=trust_score,
            capabilities=capabilities,
            task_description=task_description,
            daily_budget_usd=daily_budget_usd,
            expires_at=time.time() + (self.max_session_hours * 3600),
        )
        
        self._sessions[session_id] = session
        return session
    
    def get_session(self, session_id: str) -> AgentSession | None:
        """Get a session by ID, checking expiry."""
        session = self._sessions.get(session_id)
        if session and session.expires_at < time.time():
            session.is_active = False
        if session and not session.is_active:
            return None
        return session
    
    def get_session_summary(self, session_id: str) -> dict:
        """Get a summary dict for a session."""
        session = self._sessions.get(session_id)
        if not session:
            return {}
        return {
            "session_id": session.session_id,
            "agent_id": session.agent_id,
            "agent_name": session.agent_name,
            "trust_score": session.trust_score,
            "is_active": session.is_active,
            "spent_today_usd": session.spent_today_usd,
            "remaining_budget": session.remaining_budget,
        }
    
    def list_active_sessions(self) -> list[AgentSession]:
        """List all active sessions."""
        now = time.time()
        return [
            s for s in self._sessions.values()
            if s.is_active and s.expires_at > now
        ]
    
    def revoke_all_for_agent(self, agent_id: str) -> int:
        """Revoke all sessions for an agent. Returns count revoked."""
        count = 0
        for session in self._sessions.values():
            if session.agent_id == agent_id and session.is_active:
                session.is_active = False
                count += 1
        return count
