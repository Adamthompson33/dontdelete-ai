#!/usr/bin/env python3
"""
Dragon Tracker - Smart Money Copy Trading
Shadow the most profitable wallets and mirror their trades.

Flow:
1. Dune: Find top 10 wallets with highest win rate (last 30 days)
2. Bitquery V2: Stream transactions from dragon wallets
3. Alchemy: Detect buy transactions
4. Mirror Score: If 3+ dragons buy same token in 5min = AUTO COPY

APIs: Dune, Bitquery V2, Alchemy, Helius
"""

import os
import sys
import json
import time
import asyncio
import requests
import websockets
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Set
from datetime import datetime, timedelta
from collections import defaultdict
import threading

# --- CONFIG ---
DUNE_API_KEY = os.getenv("DUNE_API_KEY")
BITQUERY_API_KEY = os.getenv("BITQUERY_API_KEY")
ALCHEMY_API_KEY = os.getenv("ALCHEMY_API_KEY")
HELIUS_API_KEY = os.getenv("HELIUS_API_KEY")

DUNE_BASE_URL = "https://api.dune.com/api/v1"
BITQUERY_URL = "https://streaming.bitquery.io/graphql"
BITQUERY_WS_URL = "wss://streaming.bitquery.io/graphql"

# Mirror score threshold
MIRROR_THRESHOLD = 3  # Need 3+ dragons to buy same token
MIRROR_WINDOW_SECONDS = 300  # 5 minute window

# Dragon wallets cache
DRAGONS_FILE = "dragons_cache.json"


@dataclass
class DragonWallet:
    """A top-performing wallet we're tracking."""
    address: str
    win_rate: float  # 0-1
    total_trades: int
    profit_usd: float
    avg_hold_time_hours: float
    last_updated: str


@dataclass
class DragonBuy:
    """A buy transaction from a dragon wallet."""
    dragon_address: str
    token_mint: str
    token_symbol: str
    amount_usd: float
    timestamp: datetime
    tx_signature: str


@dataclass
class MirrorSignal:
    """Signal when multiple dragons converge on a token."""
    token_mint: str
    token_symbol: str
    dragon_count: int
    dragons: List[str]
    total_usd: float
    first_buy: datetime
    mirror_score: float  # 0-1 confidence


class DragonTracker:
    """
    Main tracker class that coordinates Dune, Bitquery, and Alchemy.
    """
    
    def __init__(self):
        self.dragons: Dict[str, DragonWallet] = {}
        self.recent_buys: Dict[str, List[DragonBuy]] = defaultdict(list)  # token -> buys
        self.signals: List[MirrorSignal] = []
        self.running = False
        
    # --- DUNE: Find Dragon Wallets ---
    
    def find_dragons_dune(self, query_id: int = None) -> List[DragonWallet]:
        """
        Query Dune for top performing wallets.
        Uses a pre-built query or custom query ID.
        """
        if not DUNE_API_KEY:
            print("ERROR: DUNE_API_KEY not set")
            return []
        
        headers = {"X-Dune-Api-Key": DUNE_API_KEY}
        
        # If no query_id provided, we need to create/use a saved query
        # For now, let's use a parameterized approach
        if query_id is None:
            print("No Dune query ID provided. Using fallback method...")
            return self._find_dragons_fallback()
        
        try:
            # Execute the query
            print(f"Executing Dune query {query_id}...")
            exec_url = f"{DUNE_BASE_URL}/query/{query_id}/execute"
            exec_resp = requests.post(exec_url, headers=headers, timeout=30)
            exec_data = exec_resp.json()
            
            if "execution_id" not in exec_data:
                print(f"Dune execute error: {exec_data}")
                return []
            
            execution_id = exec_data["execution_id"]
            print(f"Execution ID: {execution_id}")
            
            # Poll for results
            result_url = f"{DUNE_BASE_URL}/execution/{execution_id}/results"
            for attempt in range(30):  # Max 60 seconds
                time.sleep(2)
                result_resp = requests.get(result_url, headers=headers, timeout=30)
                result_data = result_resp.json()
                
                state = result_data.get("state", "")
                if state == "QUERY_STATE_COMPLETED":
                    rows = result_data.get("result", {}).get("rows", [])
                    return self._parse_dune_dragons(rows)
                elif state == "QUERY_STATE_FAILED":
                    print(f"Dune query failed: {result_data}")
                    return []
                
                print(f"  Waiting for Dune... ({state})")
            
            print("Dune query timeout")
            return []
            
        except Exception as e:
            print(f"Dune error: {e}")
            return []
    
    def _parse_dune_dragons(self, rows: List[dict]) -> List[DragonWallet]:
        """Parse Dune query results into DragonWallet objects."""
        dragons = []
        for row in rows[:10]:  # Top 10 only
            try:
                dragons.append(DragonWallet(
                    address=row.get("wallet_address", row.get("address", "")),
                    win_rate=float(row.get("win_rate", 0)),
                    total_trades=int(row.get("total_trades", row.get("trades", 0))),
                    profit_usd=float(row.get("profit_usd", row.get("pnl", 0))),
                    avg_hold_time_hours=float(row.get("avg_hold_hours", 0)),
                    last_updated=datetime.now().isoformat()
                ))
            except Exception as e:
                print(f"Parse error: {e}")
                continue
        return dragons
    
    def _find_dragons_fallback(self) -> List[DragonWallet]:
        """
        Fallback method using Helius to find active profitable wallets.
        This is less accurate than a proper Dune query but works without setup.
        """
        print("Using Helius fallback to find active wallets...")
        # This would need a list of known profitable wallets or
        # analysis of recent successful trades
        # For now, return empty - user should set up Dune query
        return []
    
    # --- BITQUERY: Stream Wallet Activity ---
    
    def get_bitquery_subscription(self, wallet_addresses: List[str]) -> str:
        """Generate GraphQL subscription for watching wallets."""
        addresses_str = '", "'.join(wallet_addresses)
        return f'''
        subscription {{
            Solana {{
                Transfers(
                    where: {{
                        Transaction: {{
                            Signer: {{
                                is_in: ["{addresses_str}"]
                            }}
                        }}
                    }}
                ) {{
                    Transaction {{
                        Signer
                        Signature
                    }}
                    Transfer {{
                        Currency {{
                            MintAddress
                            Symbol
                            Name
                        }}
                        Amount
                        AmountInUSD
                        Sender {{
                            Address
                        }}
                        Receiver {{
                            Address
                        }}
                    }}
                    Block {{
                        Time
                    }}
                }}
            }}
        }}
        '''
    
    async def stream_bitquery(self, wallet_addresses: List[str], callback):
        """
        Stream transactions from Bitquery V2 WebSocket.
        Calls callback(dragon_buy) when a buy is detected.
        """
        if not BITQUERY_API_KEY:
            print("ERROR: BITQUERY_API_KEY not set")
            return
        
        subscription = self.get_bitquery_subscription(wallet_addresses)
        
        headers = {
            "Authorization": f"Bearer {BITQUERY_API_KEY}",
            "Content-Type": "application/json"
        }
        
        print(f"Connecting to Bitquery WebSocket...")
        print(f"Watching {len(wallet_addresses)} dragon wallets")
        
        try:
            async with websockets.connect(
                BITQUERY_WS_URL,
                extra_headers=headers
            ) as ws:
                # Send subscription
                await ws.send(json.dumps({
                    "type": "start",
                    "id": "dragon_tracker",
                    "payload": {
                        "query": subscription
                    }
                }))
                
                print("Bitquery stream connected!")
                
                # Listen for transactions
                async for message in ws:
                    try:
                        data = json.loads(message)
                        if data.get("type") == "data":
                            transfers = data.get("payload", {}).get("data", {}).get("Solana", {}).get("Transfers", [])
                            for transfer in transfers:
                                buy = self._parse_bitquery_transfer(transfer, wallet_addresses)
                                if buy:
                                    await callback(buy)
                    except Exception as e:
                        print(f"Parse error: {e}")
                        continue
                        
        except Exception as e:
            print(f"Bitquery WebSocket error: {e}")
    
    def _parse_bitquery_transfer(self, transfer: dict, dragon_addresses: List[str]) -> Optional[DragonBuy]:
        """Parse a Bitquery transfer into a DragonBuy if it's a buy."""
        try:
            tx = transfer.get("Transaction", {})
            xfer = transfer.get("Transfer", {})
            block = transfer.get("Block", {})
            
            signer = tx.get("Signer", "")
            receiver = xfer.get("Receiver", {}).get("Address", "")
            
            # Check if this is a buy (dragon receiving tokens)
            if signer in dragon_addresses and receiver == signer:
                currency = xfer.get("Currency", {})
                return DragonBuy(
                    dragon_address=signer,
                    token_mint=currency.get("MintAddress", ""),
                    token_symbol=currency.get("Symbol", "???"),
                    amount_usd=float(xfer.get("AmountInUSD", 0) or 0),
                    timestamp=datetime.fromisoformat(block.get("Time", "").replace("Z", "+00:00")),
                    tx_signature=tx.get("Signature", "")
                )
        except Exception as e:
            pass
        return None
    
    # --- ALCHEMY: Confirm Transactions ---
    
    def confirm_transaction_alchemy(self, signature: str) -> bool:
        """Confirm a transaction exists and succeeded via Alchemy."""
        if not ALCHEMY_API_KEY:
            return True  # Skip confirmation if no key
        
        url = f"https://solana-mainnet.g.alchemy.com/v2/{ALCHEMY_API_KEY}"
        
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getTransaction",
            "params": [signature, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}]
        }
        
        try:
            resp = requests.post(url, json=payload, timeout=15)
            data = resp.json()
            result = data.get("result")
            if result:
                meta = result.get("meta", {})
                return meta.get("err") is None
        except Exception as e:
            print(f"Alchemy error: {e}")
        
        return False
    
    # --- MIRROR SCORE ---
    
    def record_buy(self, buy: DragonBuy) -> Optional[MirrorSignal]:
        """
        Record a dragon buy and check for mirror signals.
        Returns MirrorSignal if threshold reached.
        """
        # Add to recent buys
        self.recent_buys[buy.token_mint].append(buy)
        
        # Clean old buys (outside window)
        cutoff = datetime.now() - timedelta(seconds=MIRROR_WINDOW_SECONDS)
        self.recent_buys[buy.token_mint] = [
            b for b in self.recent_buys[buy.token_mint]
            if b.timestamp > cutoff or b.timestamp.tzinfo is None  # Keep if no timezone or recent
        ]
        
        # Check mirror score
        buys = self.recent_buys[buy.token_mint]
        unique_dragons = list(set(b.dragon_address for b in buys))
        
        if len(unique_dragons) >= MIRROR_THRESHOLD:
            total_usd = sum(b.amount_usd for b in buys)
            first_buy = min(b.timestamp for b in buys)
            
            # Calculate mirror score (0-1)
            # Higher score = more dragons + more USD + faster convergence
            dragon_score = min(len(unique_dragons) / 10, 1.0)  # Max at 10 dragons
            usd_score = min(total_usd / 10000, 1.0)  # Max at $10k
            
            signal = MirrorSignal(
                token_mint=buy.token_mint,
                token_symbol=buy.token_symbol,
                dragon_count=len(unique_dragons),
                dragons=unique_dragons,
                total_usd=total_usd,
                first_buy=first_buy,
                mirror_score=(dragon_score * 0.7 + usd_score * 0.3)
            )
            
            self.signals.append(signal)
            return signal
        
        return None
    
    # --- PERSISTENCE ---
    
    def save_dragons(self, filepath: str = DRAGONS_FILE):
        """Save dragon wallets to file."""
        data = {
            "updated": datetime.now().isoformat(),
            "dragons": [
                {
                    "address": d.address,
                    "win_rate": d.win_rate,
                    "total_trades": d.total_trades,
                    "profit_usd": d.profit_usd,
                    "avg_hold_time_hours": d.avg_hold_time_hours,
                    "last_updated": d.last_updated
                }
                for d in self.dragons.values()
            ]
        }
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
        print(f"Saved {len(self.dragons)} dragons to {filepath}")
    
    def load_dragons(self, filepath: str = DRAGONS_FILE) -> bool:
        """Load dragon wallets from file."""
        try:
            with open(filepath, 'r') as f:
                data = json.load(f)
            
            for d in data.get("dragons", []):
                wallet = DragonWallet(
                    address=d["address"],
                    win_rate=d["win_rate"],
                    total_trades=d["total_trades"],
                    profit_usd=d["profit_usd"],
                    avg_hold_time_hours=d.get("avg_hold_time_hours", 0),
                    last_updated=d["last_updated"]
                )
                self.dragons[wallet.address] = wallet
            
            print(f"Loaded {len(self.dragons)} dragons from {filepath}")
            return True
        except FileNotFoundError:
            return False
        except Exception as e:
            print(f"Load error: {e}")
            return False
    
    # --- MANUAL DRAGON MANAGEMENT ---
    
    def add_dragon(self, address: str, win_rate: float = 0.7, profit_usd: float = 10000):
        """Manually add a dragon wallet to track."""
        self.dragons[address] = DragonWallet(
            address=address,
            win_rate=win_rate,
            total_trades=0,
            profit_usd=profit_usd,
            avg_hold_time_hours=0,
            last_updated=datetime.now().isoformat()
        )
        print(f"Added dragon: {address[:20]}...")
    
    def list_dragons(self):
        """List all tracked dragon wallets."""
        print(f"\n{'='*60}")
        print(f"DRAGON WALLETS ({len(self.dragons)} tracked)")
        print(f"{'='*60}")
        for addr, d in self.dragons.items():
            print(f"  {addr[:20]}... | WR: {d.win_rate:.0%} | PnL: ${d.profit_usd:,.0f}")
        print()


# --- POLLING MODE (Alternative to WebSocket) ---

def poll_dragon_activity(tracker: DragonTracker, interval_seconds: int = 30):
    """
    Poll mode: Check dragon wallet activity periodically.
    Use this if WebSocket streaming isn't available.
    """
    if not HELIUS_API_KEY:
        print("ERROR: HELIUS_API_KEY required for polling mode")
        return
    
    print(f"Starting poll mode (every {interval_seconds}s)...")
    
    dragon_addresses = list(tracker.dragons.keys())
    last_signatures: Dict[str, str] = {}  # Track last seen tx per wallet
    
    while tracker.running:
        for address in dragon_addresses:
            try:
                # Get recent transactions
                url = f"https://api.helius.xyz/v0/addresses/{address}/transactions?api-key={HELIUS_API_KEY}&limit=5"
                resp = requests.get(url, timeout=15)
                txs = resp.json()
                
                for tx in txs:
                    sig = tx.get("signature", "")
                    
                    # Skip if we've seen this tx
                    if last_signatures.get(address) == sig:
                        continue
                    
                    # Check if it's a token buy
                    token_transfers = tx.get("tokenTransfers", [])
                    for transfer in token_transfers:
                        if transfer.get("toUserAccount") == address:
                            # This is a buy!
                            buy = DragonBuy(
                                dragon_address=address,
                                token_mint=transfer.get("mint", ""),
                                token_symbol="???",  # Would need to lookup
                                amount_usd=0,  # Would need price lookup
                                timestamp=datetime.now(),
                                tx_signature=sig
                            )
                            
                            signal = tracker.record_buy(buy)
                            if signal:
                                print(f"\n🐉 MIRROR SIGNAL: {signal.dragon_count} dragons bought ${signal.token_symbol}!")
                                print(f"   Token: {signal.token_mint}")
                                print(f"   Mirror Score: {signal.mirror_score:.0%}")
                    
                    last_signatures[address] = sig
                    
            except Exception as e:
                print(f"Poll error for {address[:12]}...: {e}")
        
        time.sleep(interval_seconds)


# --- CLI ---

def print_usage():
    print("""
Dragon Tracker - Smart Money Copy Trading
==========================================

Usage:
  python dragon_tracker.py --find-dragons [query_id]  # Find top wallets via Dune
  python dragon_tracker.py --add <wallet_address>     # Manually add a dragon
  python dragon_tracker.py --list                     # List tracked dragons
  python dragon_tracker.py --stream                   # Start WebSocket stream
  python dragon_tracker.py --poll [interval]          # Start polling mode
  python dragon_tracker.py --test                     # Test with sample data

Environment Variables:
  DUNE_API_KEY      - For finding profitable wallets
  BITQUERY_API_KEY  - For streaming transactions
  ALCHEMY_API_KEY   - For transaction confirmation
  HELIUS_API_KEY    - For polling mode

Mirror Signal:
  When 3+ dragon wallets buy the same token within 5 minutes,
  a MIRROR SIGNAL is triggered for potential copy trade.
""")


async def main():
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    
    if len(sys.argv) < 2:
        print_usage()
        return
    
    tracker = DragonTracker()
    tracker.load_dragons()  # Load cached dragons
    
    cmd = sys.argv[1]
    
    if cmd == "--find-dragons":
        query_id = int(sys.argv[2]) if len(sys.argv) > 2 else None
        dragons = tracker.find_dragons_dune(query_id)
        for d in dragons:
            tracker.dragons[d.address] = d
        tracker.save_dragons()
        tracker.list_dragons()
    
    elif cmd == "--add":
        if len(sys.argv) < 3:
            print("Usage: --add <wallet_address> [win_rate] [profit_usd]")
            return
        address = sys.argv[2]
        win_rate = float(sys.argv[3]) if len(sys.argv) > 3 else 0.7
        profit_usd = float(sys.argv[4]) if len(sys.argv) > 4 else 10000
        tracker.add_dragon(address, win_rate, profit_usd)
        tracker.save_dragons()
    
    elif cmd == "--list":
        tracker.list_dragons()
    
    elif cmd == "--stream":
        if not tracker.dragons:
            print("No dragons loaded! Use --add or --find-dragons first.")
            return
        
        tracker.running = True
        
        async def on_buy(buy: DragonBuy):
            print(f"🐉 Dragon buy: {buy.dragon_address[:12]}... bought ${buy.token_symbol}")
            signal = tracker.record_buy(buy)
            if signal:
                print(f"\n{'='*60}")
                print(f"🚨 MIRROR SIGNAL TRIGGERED!")
                print(f"{'='*60}")
                print(f"Token: ${signal.token_symbol} ({signal.token_mint[:20]}...)")
                print(f"Dragons: {signal.dragon_count}/10")
                print(f"Total USD: ${signal.total_usd:,.2f}")
                print(f"Mirror Score: {signal.mirror_score:.0%}")
                print(f"{'='*60}\n")
        
        await tracker.stream_bitquery(list(tracker.dragons.keys()), on_buy)
    
    elif cmd == "--poll":
        if not tracker.dragons:
            print("No dragons loaded! Use --add or --find-dragons first.")
            return
        
        interval = int(sys.argv[2]) if len(sys.argv) > 2 else 30
        tracker.running = True
        poll_dragon_activity(tracker, interval)
    
    elif cmd == "--test":
        # Add some test dragons
        test_dragons = [
            "7Vbmv1jt4vyuqBZcpYPpnVhrqVe5e6ZPDmJjg9b5Xj8p",
            "GThUX1Atko4tqhN2NaiTazWSeFWMuiUvfFnyJyUghFMJ",
            "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
        ]
        for addr in test_dragons:
            tracker.add_dragon(addr)
        
        # Simulate buys
        print("\nSimulating dragon buys...")
        test_token = "TestToken111111111111111111111111111111111"
        
        for i, addr in enumerate(test_dragons):
            buy = DragonBuy(
                dragon_address=addr,
                token_mint=test_token,
                token_symbol="TEST",
                amount_usd=1000 * (i + 1),
                timestamp=datetime.now(),
                tx_signature=f"test_sig_{i}"
            )
            print(f"  Dragon {i+1} buys $TEST...")
            signal = tracker.record_buy(buy)
            if signal:
                print(f"\n🚨 MIRROR SIGNAL: {signal.dragon_count} dragons!")
                print(f"   Mirror Score: {signal.mirror_score:.0%}")
    
    else:
        print(f"Unknown command: {cmd}")
        print_usage()


if __name__ == "__main__":
    asyncio.run(main())
