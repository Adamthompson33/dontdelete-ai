"""
ERC-8004 Registry Client
==========================
Unified client for interacting with the three ERC-8004 registries:
  Identity  → Who is this agent?
  Reputation → What's its track record?
  Validation → Has its work been verified?

Architecture:
  RegistryClient uses a Provider abstraction:
    - MockProvider  → In-memory, for testing and offline use
    - Web3Provider  → Real on-chain calls via web3.py (production)

  MoltVault consumes RegistryClient to:
    1. Verify agent identity before creating sessions
    2. Pull reputation scores to augment MoltShield's static trust
    3. Post transaction outcomes as feedback/validation
"""
from __future__ import annotations

import hashlib
import json
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Protocol


# ═══════════════════════════════════════════════════
# Data types matching the ERC-8004 spec
# ═══════════════════════════════════════════════════

@dataclass
class AgentRegistration:
    """On-chain agent identity from the Identity Registry."""
    agent_id: int                       # ERC-721 tokenId
    agent_registry: str                 # "eip155:1:0x742..."
    owner_address: str                  # ERC-721 owner
    agent_uri: str                      # Resolves to registration file
    agent_wallet: str = ""              # Verified payment address
    registration_file: dict = field(default_factory=dict)  # Parsed JSON

    @property
    def name(self) -> str:
        return self.registration_file.get("name", f"agent-{self.agent_id}")

    @property
    def description(self) -> str:
        return self.registration_file.get("description", "")

    @property
    def services(self) -> list[dict]:
        return self.registration_file.get("services", [])

    @property
    def supported_trust(self) -> list[str]:
        return self.registration_file.get("supportedTrust", [])

    @property
    def is_active(self) -> bool:
        return self.registration_file.get("active", True)

    @property
    def x402_support(self) -> bool:
        return self.registration_file.get("x402Support", False)

    def get_endpoint(self, service_name: str) -> str | None:
        """Get the endpoint for a specific service (A2A, MCP, web, etc.)."""
        for svc in self.services:
            if svc.get("name") == service_name:
                return svc.get("endpoint")
        return None


@dataclass
class FeedbackEntry:
    """A single feedback signal from the Reputation Registry."""
    agent_id: int
    client_address: str
    feedback_index: int
    value: int                          # int128 — the score
    value_decimals: int                 # uint8 (0-18)
    tag1: str = ""
    tag2: str = ""
    is_revoked: bool = False
    timestamp: float = 0.0

    @property
    def normalized_value(self) -> float:
        """Convert fixed-point value to float."""
        if self.value_decimals == 0:
            return float(self.value)
        return self.value / (10 ** self.value_decimals)


@dataclass
class ReputationSummary:
    """Aggregated reputation from the Reputation Registry."""
    agent_id: int
    feedback_count: int
    summary_value: int
    summary_value_decimals: int
    tag1_filter: str = ""
    tag2_filter: str = ""
    client_filter: list[str] = field(default_factory=list)

    @property
    def normalized_value(self) -> float:
        if self.summary_value_decimals == 0:
            return float(self.summary_value)
        return self.summary_value / (10 ** self.summary_value_decimals)

    @property
    def average_score(self) -> float:
        """Average score across all feedback entries."""
        if self.feedback_count == 0:
            return 0.0
        return self.normalized_value / self.feedback_count


@dataclass
class ValidationStatus:
    """Status of a validation request from the Validation Registry."""
    request_hash: str
    validator_address: str
    agent_id: int
    response: int                       # 0-100 (0=fail, 100=pass)
    response_hash: str = ""
    tag: str = ""
    last_update: int = 0


@dataclass
class ValidationSummary:
    """Aggregated validation stats for an agent."""
    agent_id: int
    validation_count: int
    average_response: int               # 0-100


# ═══════════════════════════════════════════════════
# Provider abstraction
# ═══════════════════════════════════════════════════

class RegistryProvider(ABC):
    """
    Abstract interface for ERC-8004 registry access.
    Swap MockProvider for Web3Provider in production.
    """

    # ── Identity ──
    @abstractmethod
    def get_agent(self, agent_id: int) -> AgentRegistration | None: ...

    @abstractmethod
    def get_agent_by_owner(self, owner: str) -> list[AgentRegistration]: ...

    @abstractmethod
    def verify_agent_ownership(self, agent_id: int, address: str) -> bool: ...

    # ── Reputation ──
    @abstractmethod
    def get_reputation_summary(
        self, agent_id: int, client_addresses: list[str],
        tag1: str, tag2: str,
    ) -> ReputationSummary: ...

    @abstractmethod
    def get_feedback(
        self, agent_id: int, client_address: str, feedback_index: int,
    ) -> FeedbackEntry | None: ...

    @abstractmethod
    def get_all_feedback(
        self, agent_id: int, tag1: str, tag2: str,
    ) -> list[FeedbackEntry]: ...

    @abstractmethod
    def submit_feedback(
        self, agent_id: int, value: int, value_decimals: int,
        tag1: str, tag2: str, endpoint: str,
        feedback_uri: str, feedback_hash: str,
    ) -> int: ...

    # ── Validation ──
    @abstractmethod
    def get_validation_summary(
        self, agent_id: int, validator_addresses: list[str], tag: str,
    ) -> ValidationSummary: ...

    @abstractmethod
    def get_validation_status(self, request_hash: str) -> ValidationStatus | None: ...

    @abstractmethod
    def submit_validation_request(
        self, validator_address: str, agent_id: int,
        request_uri: str, request_hash: str,
    ) -> str: ...

    @abstractmethod
    def submit_validation_response(
        self, request_hash: str, response: int,
        response_uri: str, response_hash: str, tag: str,
    ) -> None: ...


# ═══════════════════════════════════════════════════
# Mock Provider (testing & offline mode)
# ═══════════════════════════════════════════════════

class MockProvider(RegistryProvider):
    """
    In-memory mock of all three ERC-8004 registries.
    Use for testing, development, and offline operation.
    """

    def __init__(self):
        self._agents: dict[int, AgentRegistration] = {}
        self._feedback: dict[int, list[FeedbackEntry]] = {}     # agent_id → feedbacks
        self._validations: dict[str, ValidationStatus] = {}     # request_hash → status
        self._next_agent_id = 1
        self._next_feedback_index: dict[tuple[int, str], int] = {}

    # ── Seeding (for tests) ──

    def register_agent(
        self,
        owner: str,
        name: str,
        description: str = "",
        agent_uri: str = "",
        services: list[dict] | None = None,
        supported_trust: list[str] | None = None,
        agent_wallet: str = "",
        active: bool = True,
    ) -> AgentRegistration:
        """Register a new agent in the mock Identity Registry."""
        agent_id = self._next_agent_id
        self._next_agent_id += 1

        reg = AgentRegistration(
            agent_id=agent_id,
            agent_registry=f"eip155:1:0xMOCK_IDENTITY",
            owner_address=owner,
            agent_uri=agent_uri or f"https://mock.agent/{agent_id}",
            agent_wallet=agent_wallet or owner,
            registration_file={
                "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
                "name": name,
                "description": description,
                "services": services or [],
                "supportedTrust": supported_trust or ["reputation"],
                "active": active,
                "x402Support": False,
                "registrations": [
                    {"agentId": agent_id, "agentRegistry": f"eip155:1:0xMOCK_IDENTITY"}
                ],
            },
        )
        self._agents[agent_id] = reg
        self._feedback[agent_id] = []
        return reg

    def seed_feedback(
        self, agent_id: int, client: str,
        value: int, value_decimals: int = 0,
        tag1: str = "starred", tag2: str = "",
    ) -> FeedbackEntry:
        """Add a feedback entry to the mock Reputation Registry."""
        key = (agent_id, client)
        idx = self._next_feedback_index.get(key, 0) + 1
        self._next_feedback_index[key] = idx

        entry = FeedbackEntry(
            agent_id=agent_id,
            client_address=client,
            feedback_index=idx,
            value=value,
            value_decimals=value_decimals,
            tag1=tag1,
            tag2=tag2,
            timestamp=time.time(),
        )

        if agent_id not in self._feedback:
            self._feedback[agent_id] = []
        self._feedback[agent_id].append(entry)
        return entry

    # ── Identity ──

    def get_agent(self, agent_id: int) -> AgentRegistration | None:
        return self._agents.get(agent_id)

    def get_agent_by_owner(self, owner: str) -> list[AgentRegistration]:
        return [a for a in self._agents.values() if a.owner_address.lower() == owner.lower()]

    def verify_agent_ownership(self, agent_id: int, address: str) -> bool:
        agent = self._agents.get(agent_id)
        if not agent:
            return False
        return agent.owner_address.lower() == address.lower()

    # ── Reputation ──

    def get_reputation_summary(
        self, agent_id: int, client_addresses: list[str],
        tag1: str = "", tag2: str = "",
    ) -> ReputationSummary:
        entries = self._feedback.get(agent_id, [])

        # Apply filters
        if client_addresses:
            clients_lower = [c.lower() for c in client_addresses]
            entries = [e for e in entries if e.client_address.lower() in clients_lower]
        if tag1:
            entries = [e for e in entries if e.tag1 == tag1]
        if tag2:
            entries = [e for e in entries if e.tag2 == tag2]
        entries = [e for e in entries if not e.is_revoked]

        total_value = sum(e.value for e in entries)
        # Use the most common decimal precision
        decimals = entries[0].value_decimals if entries else 0

        return ReputationSummary(
            agent_id=agent_id,
            feedback_count=len(entries),
            summary_value=total_value,
            summary_value_decimals=decimals,
            tag1_filter=tag1,
            tag2_filter=tag2,
            client_filter=client_addresses,
        )

    def get_feedback(
        self, agent_id: int, client_address: str, feedback_index: int,
    ) -> FeedbackEntry | None:
        for entry in self._feedback.get(agent_id, []):
            if (entry.client_address.lower() == client_address.lower()
                    and entry.feedback_index == feedback_index):
                return entry
        return None

    def get_all_feedback(
        self, agent_id: int, tag1: str = "", tag2: str = "",
    ) -> list[FeedbackEntry]:
        entries = self._feedback.get(agent_id, [])
        if tag1:
            entries = [e for e in entries if e.tag1 == tag1]
        if tag2:
            entries = [e for e in entries if e.tag2 == tag2]
        return [e for e in entries if not e.is_revoked]

    def submit_feedback(
        self, agent_id: int, value: int, value_decimals: int,
        tag1: str = "", tag2: str = "", endpoint: str = "",
        feedback_uri: str = "", feedback_hash: str = "",
    ) -> int:
        # In production this would be a contract call from our wallet
        entry = self.seed_feedback(
            agent_id, "0xMOLTVAULT_WALLET",
            value, value_decimals, tag1, tag2,
        )
        return entry.feedback_index

    # ── Validation ──

    def get_validation_summary(
        self, agent_id: int, validator_addresses: list[str] = None, tag: str = "",
    ) -> ValidationSummary:
        relevant = [
            v for v in self._validations.values()
            if v.agent_id == agent_id and v.response > 0
        ]
        if validator_addresses:
            vals_lower = [a.lower() for a in validator_addresses]
            relevant = [v for v in relevant if v.validator_address.lower() in vals_lower]
        if tag:
            relevant = [v for v in relevant if v.tag == tag]

        count = len(relevant)
        avg = int(sum(v.response for v in relevant) / count) if count > 0 else 0

        return ValidationSummary(
            agent_id=agent_id,
            validation_count=count,
            average_response=avg,
        )

    def get_validation_status(self, request_hash: str) -> ValidationStatus | None:
        return self._validations.get(request_hash)

    def submit_validation_request(
        self, validator_address: str, agent_id: int,
        request_uri: str, request_hash: str,
    ) -> str:
        self._validations[request_hash] = ValidationStatus(
            request_hash=request_hash,
            validator_address=validator_address,
            agent_id=agent_id,
            response=0,  # Pending
            last_update=int(time.time()),
        )
        return request_hash

    def submit_validation_response(
        self, request_hash: str, response: int,
        response_uri: str = "", response_hash: str = "", tag: str = "",
    ) -> None:
        status = self._validations.get(request_hash)
        if status:
            status.response = response
            status.response_hash = response_hash
            status.tag = tag
            status.last_update = int(time.time())


# ═══════════════════════════════════════════════════
# Registry Client (main interface)
# ═══════════════════════════════════════════════════

class RegistryClient:
    """
    Unified client for all three ERC-8004 registries.
    This is what MoltVault's bridge layer calls.

    Usage:
        provider = MockProvider()  # or Web3Provider(rpc_url, addresses)
        client = RegistryClient(provider)

        # Check agent identity
        agent = client.get_agent(42)

        # Get reputation
        rep = client.get_reputation(42, tag1="starred")

        # Post feedback after MoltVault processes a transaction
        client.post_feedback(42, score=85, tag="moltvault:policy_compliance")

        # Request validation
        client.request_validation(42, "0xVALIDATOR", evidence_data)
    """

    def __init__(self, provider: RegistryProvider):
        self.provider = provider

    # ── Identity ──

    def get_agent(self, agent_id: int) -> AgentRegistration | None:
        """Fetch an agent's full registration from the Identity Registry."""
        return self.provider.get_agent(agent_id)

    def verify_identity(self, agent_id: int, claimed_address: str) -> bool:
        """
        Verify that an address is the owner of an agent ID.
        This is the cryptographic proof that an agent is who it claims to be.
        """
        return self.provider.verify_agent_ownership(agent_id, claimed_address)

    def is_agent_active(self, agent_id: int) -> bool:
        """Check if an agent is registered and active."""
        agent = self.provider.get_agent(agent_id)
        return agent is not None and agent.is_active

    # ── Reputation ──

    def get_reputation(
        self,
        agent_id: int,
        trusted_clients: list[str] | None = None,
        tag1: str = "",
        tag2: str = "",
    ) -> ReputationSummary:
        """
        Get aggregated reputation for an agent.

        IMPORTANT: Always filter by trusted_clients to mitigate Sybil attacks.
        Without filtering, anyone can inflate an agent's reputation with
        fake feedback from sock puppet addresses.
        """
        return self.provider.get_reputation_summary(
            agent_id, trusted_clients or [], tag1, tag2,
        )

    def get_feedback_history(
        self, agent_id: int, tag1: str = "", tag2: str = "",
    ) -> list[FeedbackEntry]:
        """Get full feedback history for an agent."""
        return self.provider.get_all_feedback(agent_id, tag1, tag2)

    def post_feedback(
        self,
        agent_id: int,
        score: int,
        tag1: str = "moltvault:trust",
        tag2: str = "",
        details_uri: str = "",
    ) -> int:
        """
        Post MoltVault's assessment as feedback to the Reputation Registry.
        This makes MoltVault's trust signals available to the entire ERC-8004 ecosystem.

        Tags we use:
          moltvault:trust          — Overall trust score (0-100)
          moltvault:policy         — Policy compliance (0-100)
          moltvault:intent_match   — Intent-behavior alignment (0-100)
          moltvault:tx_blocked     — Transaction was blocked (value=0)
          moltvault:tx_approved    — Transaction was approved (value=100)
        """
        details_hash = ""
        if details_uri:
            details_hash = hashlib.sha256(details_uri.encode()).hexdigest()

        return self.provider.submit_feedback(
            agent_id=agent_id,
            value=score,
            value_decimals=0,
            tag1=tag1,
            tag2=tag2,
            feedback_uri=details_uri,
            feedback_hash=details_hash,
        )

    # ── Validation ──

    def get_validation(self, agent_id: int, tag: str = "") -> ValidationSummary:
        """Get validation summary for an agent."""
        return self.provider.get_validation_summary(agent_id, tag=tag)

    def request_validation(
        self,
        agent_id: int,
        validator_address: str,
        evidence: dict,
    ) -> str:
        """
        Submit a validation request for an agent's transaction.
        The validator (stake-secured, zkML, TEE) independently verifies the work.
        """
        evidence_json = json.dumps(evidence, sort_keys=True)
        request_hash = hashlib.sha256(evidence_json.encode()).hexdigest()
        evidence_uri = f"ipfs://mock/{request_hash}"  # In prod: upload to IPFS

        return self.provider.submit_validation_request(
            validator_address=validator_address,
            agent_id=agent_id,
            request_uri=evidence_uri,
            request_hash=request_hash,
        )

    def check_validation(self, request_hash: str) -> ValidationStatus | None:
        """Check the status of a validation request."""
        return self.provider.get_validation_status(request_hash)
