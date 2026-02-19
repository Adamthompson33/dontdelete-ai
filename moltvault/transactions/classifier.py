"""
MoltVault Transaction Classifier
==================================
EVM calldata parser and transaction type detection.

NOTE: This is a stub. Full implementation (214 lines) exists in the main project.
"""
from __future__ import annotations

import re

from ..types import Transaction, TransactionType


# Common ERC-20 function selectors
ERC20_TRANSFER = "0xa9059cbb"
ERC20_APPROVE = "0x095ea7b3"
ERC20_TRANSFER_FROM = "0x23b872dd"

# Swap router selectors (Uniswap V2/V3 style)
SWAP_EXACT_TOKENS = "0x38ed1739"
SWAP_EXACT_ETH = "0x7ff36ab5"

# Patterns that might indicate key export attempts
KEY_EXPORT_PATTERNS = [
    r"private\s*key",
    r"seed\s*phrase",
    r"mnemonic",
    r"secret\s*key",
    r"export.*key",
    r"reveal.*key",
    r"show.*private",
    r"dump.*wallet",
]


def classify_transaction(tx: Transaction) -> TransactionType:
    """Classify a transaction based on its calldata and parameters."""
    calldata = tx.calldata.lower() if tx.calldata else ""
    
    # No calldata = native transfer
    if not calldata or calldata == "0x":
        return TransactionType.NATIVE_TRANSFER
    
    # Check function selector (first 4 bytes)
    if len(calldata) >= 10:
        selector = calldata[:10]
        
        if selector == ERC20_TRANSFER:
            return TransactionType.ERC20_TRANSFER
        elif selector == ERC20_APPROVE:
            return TransactionType.ERC20_APPROVE
        elif selector in (SWAP_EXACT_TOKENS, SWAP_EXACT_ETH):
            return TransactionType.SWAP
    
    return TransactionType.CONTRACT_CALL


def detect_key_export_attempt(text: str) -> bool:
    """
    Detect if text contains patterns suggesting an attempt to 
    extract private key material. This is a critical security check.
    """
    if not text:
        return False
    
    text_lower = text.lower()
    
    for pattern in KEY_EXPORT_PATTERNS:
        if re.search(pattern, text_lower):
            return True
    
    return False
