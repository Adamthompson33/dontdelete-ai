"""
ERC-8004 Integration
======================
On-chain agent identity and reputation for MoltVault.

Components:
  - abi.py    — Contract ABIs from EIP-8004 spec
  - client.py — RegistryClient + MockProvider
  - trust.py  — CombinedTrustEngine (static + reputation)
  - bridge.py — Identity verification → session → feedback loop
"""
from .client import RegistryClient, MockProvider, AgentRegistration
from .trust import CombinedTrustEngine, CombinedTrustResult, TrustWeights
from .bridge import ERC8004Bridge, VerifiedAgent, FeedbackReport

__all__ = [
    "RegistryClient",
    "MockProvider", 
    "AgentRegistration",
    "CombinedTrustEngine",
    "CombinedTrustResult",
    "TrustWeights",
    "ERC8004Bridge",
    "VerifiedAgent",
    "FeedbackReport",
]
