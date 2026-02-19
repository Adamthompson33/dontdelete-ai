#!/usr/bin/env python3
"""
Social Sentiment Scanner - X/Twitter Velocity Detector
Uses Grok API (with real-time X access) to detect social momentum.

Detects "High-Energy Runners" - tokens with rapidly accelerating social buzz.
"""

import os
import json
import requests
from dataclasses import dataclass
from typing import Optional
from datetime import datetime

# --- CONFIG ---
XAI_API_KEY = os.getenv("XAI_API_KEY")
XAI_BASE_URL = "https://api.x.ai/v1"

# Power keywords to monitor
DEFAULT_KEYWORDS = [
    # Solana ecosystem
    "$SOL", "#Solana", "#SolanaSummer",
    # Memecoins
    "moonshot", "100x", "gem", "alpha call",
    # Trading signals
    "just bought", "loading up", "aping", "LFG",
    # Pump indicators  
    "breaking out", "huge volume", "whale alert",
]


@dataclass
class SentimentSignal:
    query: str
    buzz_level: str           # "EXPLOSIVE", "HIGH", "MODERATE", "LOW"
    estimated_velocity: str   # Qualitative assessment
    key_themes: list[str]
    notable_accounts: list[str]
    sentiment: str            # "BULLISH", "BEARISH", "MIXED"
    summary: str
    timestamp: str


def grok_query(prompt: str, system_prompt: str = None) -> Optional[str]:
    """Query Grok API with real-time X access."""
    if not XAI_API_KEY:
        print("Error: XAI_API_KEY not set")
        return None
    
    headers = {
        "Authorization": f"Bearer {XAI_API_KEY}",
        "Content-Type": "application/json"
    }
    
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})
    
    payload = {
        "model": "grok-3-latest",
        "messages": messages,
        "temperature": 0.3,  # Lower for more factual
    }
    
    try:
        resp = requests.post(
            f"{XAI_BASE_URL}/chat/completions",
            headers=headers,
            json=payload,
            timeout=60
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"Grok API error: {e}")
        return None


def scan_token_sentiment(token_symbol: str, token_address: str = None) -> Optional[SentimentSignal]:
    """Scan X for sentiment around a specific token."""
    
    system_prompt = """You are a crypto social sentiment analyst with real-time X/Twitter access.
Your job is to analyze current social buzz around tokens and detect momentum.
Be specific about what you're seeing RIGHT NOW on X.
Focus on: tweet velocity, key influencers posting, sentiment direction, viral potential."""

    query = f"""Analyze the current X/Twitter sentiment for the Solana token {token_symbol}.
{f'Contract: {token_address}' if token_address else ''}

Check X RIGHT NOW and tell me:
1. BUZZ LEVEL: Rate the current activity (EXPLOSIVE/HIGH/MODERATE/LOW)
2. VELOCITY: Is mention rate increasing, stable, or declining vs the last few hours?
3. KEY THEMES: What are people saying? (3-5 bullet points)
4. NOTABLE ACCOUNTS: Any influencers or large accounts posting about it?
5. SENTIMENT: Overall mood (BULLISH/BEARISH/MIXED)
6. SUMMARY: One paragraph assessment of social momentum

Format your response as JSON:
{{
    "buzz_level": "HIGH",
    "velocity": "Rapidly increasing - went from ~10 tweets/hour to ~50 in the last 2 hours",
    "key_themes": ["theme1", "theme2"],
    "notable_accounts": ["@account1", "@account2"],
    "sentiment": "BULLISH",
    "summary": "..."
}}"""

    response = grok_query(query, system_prompt)
    if not response:
        return None
    
    try:
        # Extract JSON from response
        json_start = response.find('{')
        json_end = response.rfind('}') + 1
        if json_start >= 0 and json_end > json_start:
            data = json.loads(response[json_start:json_end])
            
            return SentimentSignal(
                query=token_symbol,
                buzz_level=data.get("buzz_level", "UNKNOWN"),
                estimated_velocity=data.get("velocity", "Unknown"),
                key_themes=data.get("key_themes", []),
                notable_accounts=data.get("notable_accounts", []),
                sentiment=data.get("sentiment", "MIXED"),
                summary=data.get("summary", response),
                timestamp=datetime.now().isoformat()
            )
    except json.JSONDecodeError:
        # Return raw response as summary
        return SentimentSignal(
            query=token_symbol,
            buzz_level="UNKNOWN",
            estimated_velocity="See summary",
            key_themes=[],
            notable_accounts=[],
            sentiment="MIXED",
            summary=response,
            timestamp=datetime.now().isoformat()
        )
    
    return None


def scan_keywords(keywords: list[str] = None) -> Optional[str]:
    """Scan X for activity around power keywords."""
    
    keywords = keywords or DEFAULT_KEYWORDS
    
    system_prompt = """You are a crypto social sentiment analyst with real-time X/Twitter access.
Scan for emerging trends and high-momentum tokens."""

    query = f"""Scan X/Twitter RIGHT NOW for crypto activity around these keywords:
{', '.join(keywords)}

Focus on SOLANA tokens and memecoins.

Tell me:
1. Which tokens are getting unusual buzz in the last 1-2 hours?
2. Any tokens showing "velocity spike" (sudden increase in mentions)?
3. Notable alpha calls or influencer posts?
4. Any emerging narratives or trends?

List the TOP 3-5 tokens showing the most social momentum right now with:
- Token name/ticker
- Estimated buzz level
- Why it's trending
- Key posts/accounts driving it"""

    return grok_query(query, system_prompt)


def detect_runners() -> Optional[str]:
    """Detect high-energy runners - tokens with exploding social presence."""
    
    system_prompt = """You are a memecoin hunter scanning X/Twitter for the next runner.
You have real-time access. Find tokens showing explosive social growth."""

    query = """Find me SOLANA MEMECOINS that are showing "High-Energy Runner" signals on X RIGHT NOW.

A High-Energy Runner has:
- Sudden spike in tweet volume (5 tweets/hour → 50+ tweets/hour)
- Multiple accounts posting about it independently
- Growing engagement (likes, RTs increasing)
- Fresh narrative or catalyst

Scan X and list any tokens matching this pattern.
For each, provide:
- Token name and ticker (and CA if mentioned)
- Current buzz assessment
- What triggered the spike
- Risk level (established vs brand new)
- Key tweets driving momentum

If nothing matches the criteria right now, say so - don't invent signals."""

    return grok_query(query, system_prompt)


def format_signal(signal: SentimentSignal) -> str:
    """Format sentiment signal for display."""
    themes = '\n'.join(f"  • {t}" for t in signal.key_themes) if signal.key_themes else "  None detected"
    accounts = ', '.join(signal.notable_accounts) if signal.notable_accounts else "None notable"
    
    return f"""
{'='*50}
📡 SOCIAL SENTIMENT: {signal.query}
{'='*50}
Buzz Level: {signal.buzz_level}
Sentiment: {signal.sentiment}
Velocity: {signal.estimated_velocity}

Key Themes:
{themes}

Notable Accounts: {accounts}

Summary:
{signal.summary}

Scanned: {signal.timestamp}
{'='*50}
"""


# --- CLI ---
if __name__ == "__main__":
    import sys
    import io
    
    # Fix Windows encoding for emoji support
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    
    if not XAI_API_KEY:
        print("Error: XAI_API_KEY environment variable not set")
        sys.exit(1)
    
    if len(sys.argv) > 1:
        if sys.argv[1] == "--runners":
            # Detect high-energy runners
            print("[SCAN] Scanning X for High-Energy Runners...\n")
            result = detect_runners()
            if result:
                print(result)
            else:
                print("Failed to scan")
        
        elif sys.argv[1] == "--keywords":
            # Scan power keywords
            custom_keywords = sys.argv[2:] if len(sys.argv) > 2 else None
            print("[SCAN] Scanning power keywords...\n")
            result = scan_keywords(custom_keywords)
            if result:
                print(result)
            else:
                print("Failed to scan")
        
        else:
            # Scan specific token
            token = sys.argv[1]
            address = sys.argv[2] if len(sys.argv) > 2 else None
            print(f"[SCAN] Scanning X sentiment for {token}...\n")
            signal = scan_token_sentiment(token, address)
            if signal:
                print(format_signal(signal))
            else:
                print(f"Failed to scan sentiment for {token}")
    
    else:
        print("""
Social Sentiment Scanner - Usage:
  python social_scanner.py $TOKEN           # Scan specific token
  python social_scanner.py $TOKEN ADDRESS   # Scan with contract address  
  python social_scanner.py --runners        # Detect high-energy runners
  python social_scanner.py --keywords       # Scan default power keywords
  python social_scanner.py --keywords $SOL $BONK  # Scan custom keywords
""")
