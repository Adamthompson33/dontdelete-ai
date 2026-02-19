"""
MoltVault — AI Agent Crypto Wallet
====================================
A policy-gated wallet that lets AI agents propose transactions
while keeping private keys secure and humans in control.

Core components:
  - types.py      — Shared vocabulary (Transaction, GateResult, etc.)
  - vault.py      — Top-level orchestrator
  - policy/       — 8-category policy firewall
  - agents/       — Trust-gated session management
  - confirm/      — Out-of-band human verification
  - transactions/ — EVM calldata parsing
  - erc8004/      — On-chain identity & reputation (EIP-8004)
"""
from .vault import MoltVault

__version__ = "0.1.0"
__all__ = ["MoltVault"]
