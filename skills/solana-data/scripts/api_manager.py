#!/usr/bin/env python3
"""
API Key Manager for Solana Data APIs
Rotates through multiple API keys to maximize free tier rate limits.
"""

import os
import itertools
import requests
from typing import Optional

class APIKeyManager:
    """Manages rotating pools of API keys for Alchemy and Helius."""
    
    def __init__(self, alchemy_keys: list = None, helius_keys: list = None):
        # Load from env if not provided
        if alchemy_keys is None:
            alchemy_keys = self._load_keys_from_env("ALCHEMY_API_KEY")
        if helius_keys is None:
            helius_keys = self._load_keys_from_env("HELIUS_API_KEY")
        
        # itertools.cycle allows infinite rotation through keys
        self.alchemy_pool = itertools.cycle(alchemy_keys) if alchemy_keys else None
        self.helius_pool = itertools.cycle(helius_keys) if helius_keys else None
        
        self.alchemy_count = len(alchemy_keys) if alchemy_keys else 0
        self.helius_count = len(helius_keys) if helius_keys else 0
    
    def _load_keys_from_env(self, base_name: str) -> list:
        """Load keys from environment. Supports KEY, KEY_1, KEY_2, etc."""
        keys = []
        
        # Check base key
        if os.getenv(base_name):
            keys.append(os.getenv(base_name))
        
        # Check numbered keys (KEY_1, KEY_2, ...)
        for i in range(1, 20):
            key = os.getenv(f"{base_name}_{i}")
            if key:
                keys.append(key)
        
        return keys
    
    def get_alchemy_url(self, network: str = "solana-mainnet") -> Optional[str]:
        """Returns the full URL for the next Alchemy key."""
        if not self.alchemy_pool:
            return None
        key = next(self.alchemy_pool)
        return f"https://{network}.g.alchemy.com/v2/{key}"
    
    def get_helius_url(self) -> Optional[str]:
        """Returns the full URL for the next Helius key."""
        if not self.helius_pool:
            return None
        key = next(self.helius_pool)
        return f"https://mainnet.helius-rpc.com/?api-key={key}"
    
    def get_helius_api_url(self, endpoint: str) -> Optional[str]:
        """Returns Helius REST API URL with key as query param."""
        if not self.helius_pool:
            return None
        key = next(self.helius_pool)
        return f"https://api.helius.xyz/v0/{endpoint}?api-key={key}"


# Global instance - keys loaded from environment
manager = APIKeyManager()


# --- HELPER FUNCTIONS ---

def solana_rpc(method: str, params: list = None, use_helius: bool = True):
    """Make a Solana RPC call via Helius or Alchemy."""
    if use_helius:
        url = manager.get_helius_url()
    else:
        url = manager.get_alchemy_url("solana-mainnet")
    
    if not url:
        raise ValueError("No API keys configured")
    
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params or []
    }
    
    response = requests.post(url, json=payload, timeout=30)
    response.raise_for_status()
    return response.json()


def get_sol_balance(wallet_address: str) -> float:
    """Get SOL balance for a wallet."""
    result = solana_rpc("getBalance", [wallet_address])
    if "result" in result and "value" in result["result"]:
        lamports = result["result"]["value"]
        return lamports / 1_000_000_000  # Convert lamports to SOL
    return 0.0


def get_token_accounts(wallet_address: str) -> list:
    """Get all token accounts for a wallet."""
    result = solana_rpc("getTokenAccountsByOwner", [
        wallet_address,
        {"programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"},
        {"encoding": "jsonParsed"}
    ])
    if "result" in result and "value" in result["result"]:
        return result["result"]["value"]
    return []


def get_transaction(signature: str) -> dict:
    """Get parsed transaction details."""
    result = solana_rpc("getTransaction", [
        signature,
        {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}
    ])
    return result.get("result", {})


# --- CLI USAGE ---

if __name__ == "__main__":
    import sys
    
    print(f"Alchemy keys loaded: {manager.alchemy_count}")
    print(f"Helius keys loaded: {manager.helius_count}")
    
    if len(sys.argv) > 1:
        wallet = sys.argv[1]
        print(f"\nChecking wallet: {wallet}")
        
        balance = get_sol_balance(wallet)
        print(f"SOL Balance: {balance:.4f} SOL")
        
        tokens = get_token_accounts(wallet)
        print(f"Token accounts: {len(tokens)}")
