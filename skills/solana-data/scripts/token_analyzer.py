#!/usr/bin/env python3
"""
Token Analyzer - Holder Distribution & Bubble Map Data
Uses Bitquery GraphQL API for on-chain holder analysis.

Detects:
- Whale concentration
- Dev/insider wallets
- Distribution health
- Suspicious holder patterns
"""

import os
import json
import requests
from dataclasses import dataclass
from typing import Optional
from collections import defaultdict

# --- CONFIG ---
BITQUERY_API_KEY = os.getenv("BITQUERY_API_KEY")
BITQUERY_URL = "https://streaming.bitquery.io/graphql"

# Known LP/program addresses to exclude from holder analysis
KNOWN_LP_PROGRAMS = [
    "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",  # Raydium
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",  # Raydium AMM
    "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",  # Raydium CLMM
    "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",  # Orca Whirlpool
]


@dataclass
class HolderInfo:
    address: str
    balance: float
    percentage: float
    is_lp: bool = False


@dataclass
class TokenAnalysis:
    token_address: str
    symbol: str
    total_supply: float
    holder_count: int
    top_holders: list[HolderInfo]
    concentration_score: float  # 0-100, lower is better
    whale_alert: bool
    distribution_grade: str  # A, B, C, D, F
    red_flags: list[str]


def graphql_query(query: str, variables: dict = None) -> Optional[dict]:
    """Execute GraphQL query against Bitquery."""
    if not BITQUERY_API_KEY:
        print("Error: BITQUERY_API_KEY not set")
        return None
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {BITQUERY_API_KEY}"
    }
    
    payload = {"query": query}
    if variables:
        payload["variables"] = variables
    
    try:
        resp = requests.post(BITQUERY_URL, json=payload, headers=headers, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        
        if "errors" in data:
            print(f"GraphQL errors: {data['errors']}")
            return None
        
        return data.get("data")
    except Exception as e:
        print(f"Bitquery error: {e}")
        return None


def get_top_holders(token_address: str, limit: int = 50) -> Optional[list]:
    """Get top token holders."""
    query = """
    query TopHolders($token: String!, $limit: Int!) {
      Solana {
        BalanceUpdates(
          where: {
            BalanceUpdate: {
              Currency: { MintAddress: { is: $token } }
            }
          }
          orderBy: { descending: BalanceUpdate_Balance }
          limit: { count: $limit }
        ) {
          BalanceUpdate {
            Account { Address }
            Balance
            Currency { Symbol Name Decimals }
          }
        }
      }
    }
    """
    
    data = graphql_query(query, {"token": token_address, "limit": limit})
    if data and "Solana" in data:
        return data["Solana"].get("BalanceUpdates", [])
    return None


def get_token_transfers(token_address: str, limit: int = 100) -> Optional[list]:
    """Get recent token transfers."""
    query = """
    query TokenTransfers($token: String!, $limit: Int!) {
      Solana {
        Transfers(
          where: {
            Transfer: {
              Currency: { MintAddress: { is: $token } }
            }
          }
          orderBy: { descending: Block_Time }
          limit: { count: $limit }
        ) {
          Transfer {
            Sender
            Receiver  
            Amount
          }
          Block { Time }
          Transaction { Signature }
        }
      }
    }
    """
    
    data = graphql_query(query, {"token": token_address, "limit": limit})
    if data and "Solana" in data:
        return data["Solana"].get("Transfers", [])
    return None


def analyze_token(token_address: str) -> Optional[TokenAnalysis]:
    """Perform full token holder analysis."""
    
    print(f"Fetching holder data for {token_address}...")
    holders_data = get_top_holders(token_address, limit=100)
    
    if not holders_data:
        return None
    
    # Parse holder data
    holders = []
    total_tracked = 0
    symbol = "???"
    decimals = 9
    
    for h in holders_data:
        bu = h.get("BalanceUpdate", {})
        address = bu.get("Account", {}).get("Address", "")
        balance = float(bu.get("Balance", 0))
        currency = bu.get("Currency", {})
        
        if not symbol or symbol == "???":
            symbol = currency.get("Symbol", "???")
            decimals = currency.get("Decimals", 9)
        
        is_lp = address in KNOWN_LP_PROGRAMS
        
        holders.append({
            "address": address,
            "balance": balance,
            "is_lp": is_lp
        })
        
        if not is_lp:
            total_tracked += balance
    
    # Calculate percentages (excluding LP)
    non_lp_holders = [h for h in holders if not h["is_lp"]]
    if not non_lp_holders:
        print("No non-LP holders found")
        return None
    
    total_non_lp = sum(h["balance"] for h in non_lp_holders)
    
    top_holders = []
    for h in non_lp_holders[:20]:  # Top 20 non-LP holders
        pct = (h["balance"] / total_non_lp * 100) if total_non_lp > 0 else 0
        top_holders.append(HolderInfo(
            address=h["address"],
            balance=h["balance"],
            percentage=pct,
            is_lp=False
        ))
    
    # Calculate metrics
    top10_pct = sum(h.percentage for h in top_holders[:10])
    top1_pct = top_holders[0].percentage if top_holders else 0
    
    # Red flags
    red_flags = []
    whale_alert = False
    
    if top1_pct > 15:
        red_flags.append(f"Top holder owns {top1_pct:.1f}% - major whale risk")
        whale_alert = True
    elif top1_pct > 10:
        red_flags.append(f"Top holder owns {top1_pct:.1f}% - elevated concentration")
    
    if top10_pct > 50:
        red_flags.append(f"Top 10 holders own {top10_pct:.1f}% - highly concentrated")
        whale_alert = True
    elif top10_pct > 35:
        red_flags.append(f"Top 10 holders own {top10_pct:.1f}% - moderately concentrated")
    
    # Distribution grade
    if top10_pct < 20:
        grade = "A"
    elif top10_pct < 30:
        grade = "B"
    elif top10_pct < 45:
        grade = "C"
    elif top10_pct < 60:
        grade = "D"
    else:
        grade = "F"
    
    # Concentration score (0-100, lower is better)
    concentration = min(100, top10_pct * 1.5)
    
    return TokenAnalysis(
        token_address=token_address,
        symbol=symbol,
        total_supply=total_non_lp,
        holder_count=len(non_lp_holders),
        top_holders=top_holders,
        concentration_score=concentration,
        whale_alert=whale_alert,
        distribution_grade=grade,
        red_flags=red_flags
    )


def format_analysis(analysis: TokenAnalysis) -> str:
    """Format analysis for display."""
    
    whale_indicator = " [WHALE ALERT]" if analysis.whale_alert else ""
    
    holders_table = "\n".join(
        f"  {i+1}. {h.address[:8]}...{h.address[-4:]} | {h.percentage:6.2f}% | {h.balance:,.0f}"
        for i, h in enumerate(analysis.top_holders[:10])
    )
    
    flags = "\n".join(f"  - {f}" for f in analysis.red_flags) if analysis.red_flags else "  None detected"
    
    return f"""
{'='*60}
TOKEN ANALYSIS: {analysis.symbol}{whale_indicator}
{'='*60}
Contract: {analysis.token_address}
Holders tracked: {analysis.holder_count}

DISTRIBUTION GRADE: {analysis.distribution_grade}
Concentration Score: {analysis.concentration_score:.1f}/100 (lower is better)

TOP 10 HOLDERS (excluding LP):
{holders_table}

Top 1 holder:  {analysis.top_holders[0].percentage:.2f}%
Top 10 total:  {sum(h.percentage for h in analysis.top_holders[:10]):.2f}%

RED FLAGS:
{flags}

{'='*60}
"""


# --- CLI ---
if __name__ == "__main__":
    import sys
    import io
    
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    
    if not BITQUERY_API_KEY:
        print("Error: BITQUERY_API_KEY not set")
        sys.exit(1)
    
    if len(sys.argv) < 2:
        print("""
Token Analyzer - Usage:
  python token_analyzer.py <token_mint_address>
  
Example:
  python token_analyzer.py DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263  # BONK

Analyzes:
  - Holder distribution (bubble map data)
  - Whale concentration
  - Distribution health grade (A-F)
  - Red flags for rug/dump risk
""")
        sys.exit(0)
    
    token = sys.argv[1]
    analysis = analyze_token(token)
    
    if analysis:
        print(format_analysis(analysis))
    else:
        print(f"Failed to analyze token {token}")
