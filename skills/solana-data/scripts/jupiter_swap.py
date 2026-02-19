#!/usr/bin/env python3
"""
Jupiter Swap - DEX Aggregator for Solana
Execute swaps through Jupiter's routing engine.

Flow: Get Quote → Build Transaction → Sign → Send
"""

import os
import json
import requests
from dataclasses import dataclass
from typing import Optional
from decimal import Decimal

# --- CONFIG ---
JUPITER_API_KEY = os.getenv("JUPITER_API_KEY")
JUPITER_BASE_URL = "https://api.jup.ag/swap/v1"

# Common token mints
TOKENS = {
    "SOL": "So11111111111111111111111111111111111111112",
    "USDC": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "USDT": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    "BONK": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
}

# Decimals for common tokens
DECIMALS = {
    "SOL": 9,
    "USDC": 6,
    "USDT": 6,
    "BONK": 5,
}


@dataclass
class SwapQuote:
    input_mint: str
    output_mint: str
    in_amount: int
    out_amount: int
    price_impact_pct: float
    slippage_bps: int
    route_plan: list
    raw_response: dict


def get_headers() -> dict:
    """Get request headers with API key if available."""
    headers = {"Content-Type": "application/json"}
    if JUPITER_API_KEY:
        headers["x-api-key"] = JUPITER_API_KEY
    return headers


def resolve_token(token: str) -> str:
    """Resolve token symbol to mint address."""
    return TOKENS.get(token.upper(), token)


def to_raw_amount(amount: float, decimals: int) -> int:
    """Convert human-readable amount to raw (lamports/atomic units)."""
    return int(Decimal(str(amount)) * Decimal(10 ** decimals))


def from_raw_amount(raw: int, decimals: int) -> float:
    """Convert raw amount to human-readable."""
    return float(Decimal(raw) / Decimal(10 ** decimals))


def get_quote(
    input_token: str,
    output_token: str,
    amount: float,
    slippage_bps: int = 100,
    input_decimals: int = None
) -> Optional[SwapQuote]:
    """
    Get a swap quote from Jupiter.
    
    Args:
        input_token: Token symbol (SOL, USDC) or mint address
        output_token: Token symbol or mint address
        amount: Amount to swap (human-readable)
        slippage_bps: Slippage in basis points (100 = 1%)
        input_decimals: Decimals for input token (auto-detected for known tokens)
    """
    input_mint = resolve_token(input_token)
    output_mint = resolve_token(output_token)
    
    # Determine decimals
    if input_decimals is None:
        input_decimals = DECIMALS.get(input_token.upper(), 9)  # Default to 9 (SOL)
    
    raw_amount = to_raw_amount(amount, input_decimals)
    
    params = {
        "inputMint": input_mint,
        "outputMint": output_mint,
        "amount": str(raw_amount),
        "slippageBps": str(slippage_bps),
        "restrictIntermediateTokens": "true",
    }
    
    try:
        url = f"{JUPITER_BASE_URL}/quote"
        resp = requests.get(url, params=params, headers=get_headers(), timeout=30)
        resp.raise_for_status()
        data = resp.json()
        
        return SwapQuote(
            input_mint=data["inputMint"],
            output_mint=data["outputMint"],
            in_amount=int(data["inAmount"]),
            out_amount=int(data["outAmount"]),
            price_impact_pct=float(data.get("priceImpactPct", 0)),
            slippage_bps=int(data["slippageBps"]),
            route_plan=data.get("routePlan", []),
            raw_response=data
        )
    except requests.exceptions.RequestException as e:
        print(f"Quote error: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response: {e.response.text}")
        return None


def get_swap_transaction(
    quote: SwapQuote,
    user_public_key: str,
    priority_fee: str = "auto"
) -> Optional[dict]:
    """
    Get a swap transaction to sign and submit.
    
    Args:
        quote: SwapQuote from get_quote()
        user_public_key: Wallet public key
        priority_fee: "auto" or amount in lamports
    """
    payload = {
        "quoteResponse": quote.raw_response,
        "userPublicKey": user_public_key,
        "wrapAndUnwrapSol": True,
        "dynamicComputeUnitLimit": True,
        "prioritizationFeeLamports": priority_fee,
    }
    
    try:
        url = f"{JUPITER_BASE_URL}/swap"
        resp = requests.post(url, json=payload, headers=get_headers(), timeout=30)
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.RequestException as e:
        print(f"Swap transaction error: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response: {e.response.text}")
        return None


def get_price(input_token: str, output_token: str, amount: float = 1.0) -> Optional[float]:
    """Get current price (output per input)."""
    quote = get_quote(input_token, output_token, amount)
    if quote:
        input_decimals = DECIMALS.get(input_token.upper(), 9)
        output_decimals = DECIMALS.get(output_token.upper(), 6)
        
        in_human = from_raw_amount(quote.in_amount, input_decimals)
        out_human = from_raw_amount(quote.out_amount, output_decimals)
        
        return out_human / in_human if in_human > 0 else None
    return None


def format_quote(quote: SwapQuote, input_symbol: str, output_symbol: str) -> str:
    """Format quote for display."""
    input_decimals = DECIMALS.get(input_symbol.upper(), 9)
    output_decimals = DECIMALS.get(output_symbol.upper(), 6)
    
    in_human = from_raw_amount(quote.in_amount, input_decimals)
    out_human = from_raw_amount(quote.out_amount, output_decimals)
    rate = out_human / in_human if in_human > 0 else 0
    
    routes = " -> ".join(
        r.get("swapInfo", {}).get("label", "Unknown") 
        for r in quote.route_plan
    ) if quote.route_plan else "Direct"
    
    return f"""
{'='*50}
JUPITER SWAP QUOTE
{'='*50}
Input:  {in_human:.6f} {input_symbol}
Output: {out_human:.6f} {output_symbol}
Rate:   1 {input_symbol} = {rate:.6f} {output_symbol}

Price Impact: {quote.price_impact_pct:.4f}%
Slippage:     {quote.slippage_bps / 100:.2f}%
Route:        {routes}
{'='*50}
"""


# --- CLI ---
if __name__ == "__main__":
    import sys
    import io
    
    # Fix Windows encoding
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    
    if len(sys.argv) < 4:
        print("""
Jupiter Swap - Usage:
  python jupiter_swap.py <input> <output> <amount> [slippage_bps]
  
Examples:
  python jupiter_swap.py SOL USDC 1.0           # Quote 1 SOL -> USDC
  python jupiter_swap.py USDC SOL 100 50        # Quote 100 USDC -> SOL, 0.5% slippage
  python jupiter_swap.py <mint> USDC 1000000    # Quote by mint address

Common tokens: SOL, USDC, USDT, BONK
Default slippage: 100 bps (1%)
""")
        sys.exit(0)
    
    input_token = sys.argv[1]
    output_token = sys.argv[2]
    amount = float(sys.argv[3])
    slippage = int(sys.argv[4]) if len(sys.argv) > 4 else 100
    
    print(f"Getting quote: {amount} {input_token} -> {output_token} (slippage: {slippage}bps)")
    
    quote = get_quote(input_token, output_token, amount, slippage)
    
    if quote:
        print(format_quote(quote, input_token, output_token))
        
        if quote.price_impact_pct > 5:
            print("WARNING: High price impact! Consider smaller trade or more liquid pair.")
    else:
        print("Failed to get quote")
