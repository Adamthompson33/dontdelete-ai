"""
ERC-8004 Contract ABIs
========================
Exact Solidity interfaces from the EIP-8004 specification,
translated to Python-consumable ABI fragments for web3.py.

Source: https://eips.ethereum.org/EIPS/eip-8004
Authors: De Rossi (MetaMask), Crapis (EF), Ellis (Google), Reppel (Coinbase)
Created: 2025-08-13 | Mainnet: 2026-01-29

Three registries:
  1. Identity Registry  — ERC-721 + URIStorage + metadata
  2. Reputation Registry — Feedback signals (value + tags)
  3. Validation Registry — Independent verification hooks
"""
from __future__ import annotations


# ═══════════════════════════════════════════════════
# Identity Registry ABI (ERC-721 + extensions)
# ═══════════════════════════════════════════════════

IDENTITY_REGISTRY_ABI = [
    # ── Registration ──
    {
        "name": "register",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "agentURI", "type": "string"},
        ],
        "outputs": [
            {"name": "agentId", "type": "uint256"},
        ],
    },
    {
        "name": "register",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "agentURI", "type": "string"},
            {
                "name": "metadata",
                "type": "tuple[]",
                "components": [
                    {"name": "metadataKey", "type": "string"},
                    {"name": "metadataValue", "type": "bytes"},
                ],
            },
        ],
        "outputs": [
            {"name": "agentId", "type": "uint256"},
        ],
    },
    # ── URI management ──
    {
        "name": "setAgentURI",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "agentId", "type": "uint256"},
            {"name": "newURI", "type": "string"},
        ],
        "outputs": [],
    },
    {
        "name": "tokenURI",
        "type": "function",
        "stateMutability": "view",
        "inputs": [
            {"name": "tokenId", "type": "uint256"},
        ],
        "outputs": [
            {"name": "", "type": "string"},
        ],
    },
    # ── Metadata ──
    {
        "name": "getMetadata",
        "type": "function",
        "stateMutability": "view",
        "inputs": [
            {"name": "agentId", "type": "uint256"},
            {"name": "metadataKey", "type": "string"},
        ],
        "outputs": [
            {"name": "", "type": "bytes"},
        ],
    },
    {
        "name": "setMetadata",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "agentId", "type": "uint256"},
            {"name": "metadataKey", "type": "string"},
            {"name": "metadataValue", "type": "bytes"},
        ],
        "outputs": [],
    },
    # ── Agent wallet ──
    {
        "name": "getAgentWallet",
        "type": "function",
        "stateMutability": "view",
        "inputs": [
            {"name": "agentId", "type": "uint256"},
        ],
        "outputs": [
            {"name": "", "type": "address"},
        ],
    },
    {
        "name": "setAgentWallet",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "agentId", "type": "uint256"},
            {"name": "newWallet", "type": "address"},
            {"name": "deadline", "type": "uint256"},
            {"name": "signature", "type": "bytes"},
        ],
        "outputs": [],
    },
    # ── ERC-721 standard ──
    {
        "name": "ownerOf",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{"name": "tokenId", "type": "uint256"}],
        "outputs": [{"name": "", "type": "address"}],
    },
    # ── Events ──
    {
        "name": "Registered",
        "type": "event",
        "inputs": [
            {"name": "agentId", "type": "uint256", "indexed": True},
            {"name": "agentURI", "type": "string", "indexed": False},
            {"name": "owner", "type": "address", "indexed": True},
        ],
    },
    {
        "name": "URIUpdated",
        "type": "event",
        "inputs": [
            {"name": "agentId", "type": "uint256", "indexed": True},
            {"name": "newURI", "type": "string", "indexed": False},
            {"name": "updatedBy", "type": "address", "indexed": True},
        ],
    },
    {
        "name": "MetadataSet",
        "type": "event",
        "inputs": [
            {"name": "agentId", "type": "uint256", "indexed": True},
            {"name": "indexedMetadataKey", "type": "string", "indexed": True},
            {"name": "metadataKey", "type": "string", "indexed": False},
            {"name": "metadataValue", "type": "bytes", "indexed": False},
        ],
    },
]


# ═══════════════════════════════════════════════════
# Reputation Registry ABI
# ═══════════════════════════════════════════════════

REPUTATION_REGISTRY_ABI = [
    # ── Initialization ──
    {
        "name": "getIdentityRegistry",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "identityRegistry", "type": "address"}],
    },
    # ── Give feedback ──
    {
        "name": "giveFeedback",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "agentId", "type": "uint256"},
            {"name": "value", "type": "int128"},
            {"name": "valueDecimals", "type": "uint8"},
            {"name": "tag1", "type": "string"},
            {"name": "tag2", "type": "string"},
            {"name": "endpoint", "type": "string"},
            {"name": "feedbackURI", "type": "string"},
            {"name": "feedbackHash", "type": "bytes32"},
        ],
        "outputs": [],
    },
    # ── Revoke feedback ──
    {
        "name": "revokeFeedback",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "agentId", "type": "uint256"},
            {"name": "feedbackIndex", "type": "uint64"},
        ],
        "outputs": [],
    },
    # ── Append response ──
    {
        "name": "appendResponse",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "agentId", "type": "uint256"},
            {"name": "clientAddress", "type": "address"},
            {"name": "feedbackIndex", "type": "uint64"},
            {"name": "responseURI", "type": "string"},
            {"name": "responseHash", "type": "bytes32"},
        ],
        "outputs": [],
    },
    # ── Read functions ──
    {
        "name": "getSummary",
        "type": "function",
        "stateMutability": "view",
        "inputs": [
            {"name": "agentId", "type": "uint256"},
            {"name": "clientAddresses", "type": "address[]"},
            {"name": "tag1", "type": "string"},
            {"name": "tag2", "type": "string"},
        ],
        "outputs": [
            {"name": "count", "type": "uint64"},
            {"name": "summaryValue", "type": "int128"},
            {"name": "summaryValueDecimals", "type": "uint8"},
        ],
    },
    {
        "name": "readFeedback",
        "type": "function",
        "stateMutability": "view",
        "inputs": [
            {"name": "agentId", "type": "uint256"},
            {"name": "clientAddress", "type": "address"},
            {"name": "feedbackIndex", "type": "uint64"},
        ],
        "outputs": [
            {"name": "value", "type": "int128"},
            {"name": "valueDecimals", "type": "uint8"},
            {"name": "tag1", "type": "string"},
            {"name": "tag2", "type": "string"},
            {"name": "isRevoked", "type": "bool"},
        ],
    },
    {
        "name": "readAllFeedback",
        "type": "function",
        "stateMutability": "view",
        "inputs": [
            {"name": "agentId", "type": "uint256"},
            {"name": "clientAddresses", "type": "address[]"},
            {"name": "tag1", "type": "string"},
            {"name": "tag2", "type": "string"},
            {"name": "includeRevoked", "type": "bool"},
        ],
        "outputs": [
            {"name": "clients", "type": "address[]"},
            {"name": "feedbackIndexes", "type": "uint64[]"},
            {"name": "values", "type": "int128[]"},
            {"name": "valueDecimals", "type": "uint8[]"},
            {"name": "tag1s", "type": "string[]"},
            {"name": "tag2s", "type": "string[]"},
            {"name": "revokedStatuses", "type": "bool[]"},
        ],
    },
    {
        "name": "getClients",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{"name": "agentId", "type": "uint256"}],
        "outputs": [{"name": "", "type": "address[]"}],
    },
    {
        "name": "getLastIndex",
        "type": "function",
        "stateMutability": "view",
        "inputs": [
            {"name": "agentId", "type": "uint256"},
            {"name": "clientAddress", "type": "address"},
        ],
        "outputs": [{"name": "", "type": "uint64"}],
    },
    # ── Events ──
    {
        "name": "NewFeedback",
        "type": "event",
        "inputs": [
            {"name": "agentId", "type": "uint256", "indexed": True},
            {"name": "clientAddress", "type": "address", "indexed": True},
            {"name": "feedbackIndex", "type": "uint64", "indexed": False},
            {"name": "value", "type": "int128", "indexed": False},
            {"name": "valueDecimals", "type": "uint8", "indexed": False},
            {"name": "indexedTag1", "type": "string", "indexed": True},
            {"name": "tag1", "type": "string", "indexed": False},
            {"name": "tag2", "type": "string", "indexed": False},
            {"name": "endpoint", "type": "string", "indexed": False},
            {"name": "feedbackURI", "type": "string", "indexed": False},
            {"name": "feedbackHash", "type": "bytes32", "indexed": False},
        ],
    },
    {
        "name": "FeedbackRevoked",
        "type": "event",
        "inputs": [
            {"name": "agentId", "type": "uint256", "indexed": True},
            {"name": "clientAddress", "type": "address", "indexed": True},
            {"name": "feedbackIndex", "type": "uint64", "indexed": True},
        ],
    },
]


# ═══════════════════════════════════════════════════
# Validation Registry ABI
# ═══════════════════════════════════════════════════

VALIDATION_REGISTRY_ABI = [
    # ── Initialization ──
    {
        "name": "getIdentityRegistry",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "identityRegistry", "type": "address"}],
    },
    # ── Validation request ──
    {
        "name": "validationRequest",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "validatorAddress", "type": "address"},
            {"name": "agentId", "type": "uint256"},
            {"name": "requestURI", "type": "string"},
            {"name": "requestHash", "type": "bytes32"},
        ],
        "outputs": [],
    },
    # ── Validation response ──
    {
        "name": "validationResponse",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "requestHash", "type": "bytes32"},
            {"name": "response", "type": "uint8"},
            {"name": "responseURI", "type": "string"},
            {"name": "responseHash", "type": "bytes32"},
            {"name": "tag", "type": "string"},
        ],
        "outputs": [],
    },
    # ── Read functions ──
    {
        "name": "getValidationStatus",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{"name": "requestHash", "type": "bytes32"}],
        "outputs": [
            {"name": "validatorAddress", "type": "address"},
            {"name": "agentId", "type": "uint256"},
            {"name": "response", "type": "uint8"},
            {"name": "responseHash", "type": "bytes32"},
            {"name": "tag", "type": "string"},
            {"name": "lastUpdate", "type": "uint256"},
        ],
    },
    {
        "name": "getSummary",
        "type": "function",
        "stateMutability": "view",
        "inputs": [
            {"name": "agentId", "type": "uint256"},
            {"name": "validatorAddresses", "type": "address[]"},
            {"name": "tag", "type": "string"},
        ],
        "outputs": [
            {"name": "count", "type": "uint64"},
            {"name": "averageResponse", "type": "uint8"},
        ],
    },
    {
        "name": "getAgentValidations",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{"name": "agentId", "type": "uint256"}],
        "outputs": [{"name": "requestHashes", "type": "bytes32[]"}],
    },
    {
        "name": "getValidatorRequests",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{"name": "validatorAddress", "type": "address"}],
        "outputs": [{"name": "requestHashes", "type": "bytes32[]"}],
    },
    # ── Events ──
    {
        "name": "ValidationRequest",
        "type": "event",
        "inputs": [
            {"name": "validatorAddress", "type": "address", "indexed": True},
            {"name": "agentId", "type": "uint256", "indexed": True},
            {"name": "requestURI", "type": "string", "indexed": False},
            {"name": "requestHash", "type": "bytes32", "indexed": True},
        ],
    },
    {
        "name": "ValidationResponse",
        "type": "event",
        "inputs": [
            {"name": "validatorAddress", "type": "address", "indexed": True},
            {"name": "agentId", "type": "uint256", "indexed": True},
            {"name": "requestHash", "type": "bytes32", "indexed": True},
            {"name": "response", "type": "uint8", "indexed": False},
            {"name": "responseURI", "type": "string", "indexed": False},
            {"name": "responseHash", "type": "bytes32", "indexed": False},
            {"name": "tag", "type": "string", "indexed": False},
        ],
    },
]


# ═══════════════════════════════════════════════════
# Known deployments
# ═══════════════════════════════════════════════════

# Registry addresses per chain (mainnet + L2s)
# These will need updating as the ERC-8004 ecosystem deploys
KNOWN_DEPLOYMENTS: dict[str, dict[str, str]] = {
    "ethereum": {
        "chain_id": "1",
        "namespace": "eip155",
        "identity_registry": "",     # Fill when deployed
        "reputation_registry": "",
        "validation_registry": "",
    },
    "base": {
        "chain_id": "8453",
        "namespace": "eip155",
        "identity_registry": "",
        "reputation_registry": "",
        "validation_registry": "",
    },
    "linea": {
        "chain_id": "59144",
        "namespace": "eip155",
        "identity_registry": "",
        "reputation_registry": "",
        "validation_registry": "",
    },
}


def format_agent_registry(chain: str, identity_address: str) -> str:
    """
    Format an agentRegistry identifier per spec:
      {namespace}:{chainId}:{identityRegistry}
    e.g., eip155:1:0x742...
    """
    deployment = KNOWN_DEPLOYMENTS.get(chain, {})
    namespace = deployment.get("namespace", "eip155")
    chain_id = deployment.get("chain_id", "1")
    return f"{namespace}:{chain_id}:{identity_address}"
