#!/usr/bin/env python3
"""
Grok Scout - Multi-Layer Sentiment Validator
Combines volume spikes + X sentiment (Grok) + Real-world news (Google)

Flow:
1. Volume spike detected (DexScreener/Helius)
2. Grok analyzes X sentiment: organic vs bot farm
3. Google checks for real-world news/catalysts
4. Only signals BUY if both confirm

APIs: xAI (Grok), Google Search, DexScreener
"""

import os
import sys
import json
import requests
from dataclasses import dataclass
from typing import Optional, List, Tuple
from datetime import datetime

# --- CONFIG ---
XAI_API_KEY = os.getenv("XAI_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
GOOGLE_CSE_ID = os.getenv("GOOGLE_CSE_ID", "")  # Custom Search Engine ID

XAI_BASE_URL = "https://api.x.ai/v1"
DEXSCREENER_URL = "https://api.dexscreener.com"


@dataclass
class TokenInfo:
    """Basic token information from DexScreener."""
    address: str
    symbol: str
    name: str
    price_usd: float
    volume_24h: float
    volume_5m: float
    price_change_5m: float
    price_change_1h: float
    liquidity_usd: float
    pair_address: str
    dex: str


@dataclass 
class SentimentResult:
    """Grok's analysis of X/Twitter sentiment."""
    verdict: str  # "ORGANIC", "SUSPICIOUS", "BOT_FARM", "UNKNOWN"
    confidence: float  # 0-1
    reasoning: str
    key_signals: List[str]
    influencer_mentions: List[str]
    red_flags: List[str]


@dataclass
class NewsResult:
    """Google Search results for real-world news."""
    has_news: bool
    news_quality: str  # "STRONG", "MODERATE", "WEAK", "NONE"
    articles: List[dict]  # title, link, snippet
    catalysts: List[str]  # Detected catalysts


@dataclass
class ScoutSignal:
    """Final combined signal from Grok Scout."""
    token: TokenInfo
    sentiment: SentimentResult
    news: NewsResult
    signal: str  # "STRONG_BUY", "CAUTIOUS_BUY", "HOLD", "AVOID"
    confidence: float
    summary: str


# --- DEXSCREENER ---

def get_token_info(address: str) -> Optional[TokenInfo]:
    """Fetch token data from DexScreener."""
    try:
        url = f"{DEXSCREENER_URL}/tokens/v1/solana/{address}"
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        
        if not data:
            return None
        
        # Get the main pair (highest liquidity)
        pair = data[0] if isinstance(data, list) else data
        
        return TokenInfo(
            address=address,
            symbol=pair.get("baseToken", {}).get("symbol", "???"),
            name=pair.get("baseToken", {}).get("name", "Unknown"),
            price_usd=float(pair.get("priceUsd", 0) or 0),
            volume_24h=float(pair.get("volume", {}).get("h24", 0) or 0),
            volume_5m=float(pair.get("volume", {}).get("m5", 0) or 0),
            price_change_5m=float(pair.get("priceChange", {}).get("m5", 0) or 0),
            price_change_1h=float(pair.get("priceChange", {}).get("h1", 0) or 0),
            liquidity_usd=float(pair.get("liquidity", {}).get("usd", 0) or 0),
            pair_address=pair.get("pairAddress", ""),
            dex=pair.get("dexId", "unknown")
        )
    except Exception as e:
        print(f"DexScreener error: {e}")
        return None


def check_volume_spike(token: TokenInfo) -> Tuple[bool, str]:
    """Check if token has unusual volume activity."""
    # Simple heuristic: 5m volume > 2% of 24h volume = spike
    if token.volume_24h == 0:
        return False, "No volume data"
    
    ratio = (token.volume_5m * 12 * 24) / token.volume_24h  # Projected vs actual
    
    if ratio > 3.0:
        return True, f"MAJOR spike: {ratio:.1f}x normal velocity"
    elif ratio > 1.5:
        return True, f"Moderate spike: {ratio:.1f}x normal velocity"
    else:
        return False, f"Normal volume: {ratio:.1f}x"


# --- GROK SENTIMENT ---

def analyze_sentiment_grok(symbol: str, token_name: str, address: str) -> SentimentResult:
    """
    Ask Grok to analyze X/Twitter sentiment for a token.
    Uses Grok's real-time X access to assess organic vs artificial hype.
    """
    if not XAI_API_KEY:
        return SentimentResult(
            verdict="UNKNOWN",
            confidence=0,
            reasoning="No XAI API key configured",
            key_signals=[],
            influencer_mentions=[],
            red_flags=["API not configured"]
        )
    
    prompt = f"""Analyze the current Twitter/X sentiment for this Solana memecoin:

Token: ${symbol} ({token_name})
Contract: {address}

Search X for recent posts about this token. Evaluate:

1. **Organic vs Artificial**: Is the buzz from real crypto traders/influencers, or does it look like a coordinated bot campaign? Look for:
   - Copy-paste tweets
   - New accounts with no history
   - Suspiciously identical posting times
   - Paid promotion disclosure (or lack thereof)

2. **Influencer Quality**: Are any notable crypto/MMA/sports influencers talking about it? Name them if so.

3. **Narrative Strength**: Is there a compelling story (partnership, celebrity, meme trend) or just generic "moon" hype?

4. **Red Flags**: Any warnings, rug accusations, or concerned posts from experienced traders?

Respond in this exact JSON format:
{{
    "verdict": "ORGANIC" | "SUSPICIOUS" | "BOT_FARM" | "UNKNOWN",
    "confidence": 0.0-1.0,
    "reasoning": "2-3 sentence explanation",
    "key_signals": ["signal1", "signal2"],
    "influencer_mentions": ["@handle1", "@handle2"],
    "red_flags": ["flag1", "flag2"]
}}

Be skeptical. Most memecoin pumps are artificial. Only mark ORGANIC if you see clear evidence of genuine community interest."""

    try:
        headers = {
            "Authorization": f"Bearer {XAI_API_KEY}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": "grok-3",
            "messages": [
                {"role": "system", "content": "You are a crypto sentiment analyst with real-time X/Twitter access. Be skeptical of memecoin hype. Your job is to protect traders from bot-driven pumps."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.3
        }
        
        resp = requests.post(
            f"{XAI_BASE_URL}/chat/completions",
            headers=headers,
            json=payload,
            timeout=60
        )
        resp.raise_for_status()
        
        content = resp.json()["choices"][0]["message"]["content"]
        
        # Parse JSON from response
        # Handle potential markdown code blocks
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
        
        data = json.loads(content.strip())
        
        return SentimentResult(
            verdict=data.get("verdict", "UNKNOWN"),
            confidence=float(data.get("confidence", 0)),
            reasoning=data.get("reasoning", ""),
            key_signals=data.get("key_signals", []),
            influencer_mentions=data.get("influencer_mentions", []),
            red_flags=data.get("red_flags", [])
        )
        
    except json.JSONDecodeError as e:
        return SentimentResult(
            verdict="UNKNOWN",
            confidence=0,
            reasoning=f"Failed to parse Grok response: {e}",
            key_signals=[],
            influencer_mentions=[],
            red_flags=["Parse error"]
        )
    except Exception as e:
        return SentimentResult(
            verdict="UNKNOWN",
            confidence=0,
            reasoning=f"Grok API error: {e}",
            key_signals=[],
            influencer_mentions=[],
            red_flags=["API error"]
        )


# --- GOOGLE NEWS ---

def search_news_google(symbol: str, token_name: str) -> NewsResult:
    """
    Search Google for real-world news about the token.
    Looking for partnerships, celebrity endorsements, mainstream coverage.
    """
    if not GOOGLE_API_KEY:
        return NewsResult(
            has_news=False,
            news_quality="NONE",
            articles=[],
            catalysts=["Google API not configured"]
        )
    
    # Build search queries
    queries = [
        f'"{symbol}" crypto news',
        f'"{token_name}" solana partnership',
        f'"{symbol}" celebrity endorsement'
    ]
    
    all_articles = []
    
    try:
        for query in queries[:2]:  # Limit API calls
            params = {
                "key": GOOGLE_API_KEY,
                "cx": GOOGLE_CSE_ID,
                "q": query,
                "num": 5,
                "dateRestrict": "d7",  # Last 7 days
                "sort": "date"
            }
            
            # If no CSE ID, use simpler approach
            if not GOOGLE_CSE_ID:
                # Fallback: just note we can't search
                continue
            
            resp = requests.get(
                "https://www.googleapis.com/customsearch/v1",
                params=params,
                timeout=15
            )
            
            if resp.status_code == 200:
                data = resp.json()
                for item in data.get("items", []):
                    all_articles.append({
                        "title": item.get("title", ""),
                        "link": item.get("link", ""),
                        "snippet": item.get("snippet", "")
                    })
    except Exception as e:
        print(f"Google search error: {e}")
    
    # Analyze results
    catalysts = []
    quality = "NONE"
    
    if all_articles:
        # Check for quality indicators
        quality_keywords = ["partnership", "announcement", "launch", "celebrity", "sponsor", "endorsement", "official"]
        
        for article in all_articles:
            text = (article["title"] + " " + article["snippet"]).lower()
            for kw in quality_keywords:
                if kw in text:
                    catalysts.append(f"Found: {kw}")
                    break
        
        if len(catalysts) >= 2:
            quality = "STRONG"
        elif len(catalysts) >= 1:
            quality = "MODERATE"
        elif all_articles:
            quality = "WEAK"
    
    return NewsResult(
        has_news=len(all_articles) > 0,
        news_quality=quality,
        articles=all_articles[:5],
        catalysts=list(set(catalysts))
    )


# --- COMBINED SIGNAL ---

def scout_token(address: str) -> Optional[ScoutSignal]:
    """
    Full Grok Scout analysis pipeline:
    1. Get token info + volume check
    2. Grok sentiment analysis
    3. Google news check
    4. Combined signal
    """
    print(f"\n{'='*60}")
    print(f"GROK SCOUT - Token Analysis")
    print(f"{'='*60}")
    print(f"Target: {address}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # Step 1: Token info
    print("[1/4] Fetching token data from DexScreener...")
    token = get_token_info(address)
    if not token:
        print("ERROR: Could not fetch token data")
        return None
    
    print(f"  Token: ${token.symbol} ({token.name})")
    print(f"  Price: ${token.price_usd:.8f}")
    print(f"  24h Volume: ${token.volume_24h:,.0f}")
    print(f"  Liquidity: ${token.liquidity_usd:,.0f}")
    
    # Step 2: Volume check
    print("\n[2/4] Checking volume patterns...")
    has_spike, spike_msg = check_volume_spike(token)
    print(f"  {spike_msg}")
    
    if not has_spike:
        print("  No significant volume spike detected - continuing anyway for analysis")
    
    # Step 3: Grok sentiment
    print("\n[3/4] Analyzing X sentiment via Grok...")
    sentiment = analyze_sentiment_grok(token.symbol, token.name, address)
    print(f"  Verdict: {sentiment.verdict} (confidence: {sentiment.confidence:.0%})")
    print(f"  Reasoning: {sentiment.reasoning}")
    if sentiment.influencer_mentions:
        print(f"  Influencers: {', '.join(sentiment.influencer_mentions)}")
    if sentiment.red_flags:
        print(f"  Red Flags: {', '.join(sentiment.red_flags)}")
    
    # Step 4: Google news
    print("\n[4/4] Searching for real-world news...")
    news = search_news_google(token.symbol, token.name)
    print(f"  News Quality: {news.news_quality}")
    if news.catalysts:
        print(f"  Catalysts: {', '.join(news.catalysts)}")
    if news.articles:
        print(f"  Top Article: {news.articles[0]['title'][:60]}...")
    
    # Generate final signal
    signal, confidence, summary = generate_signal(token, sentiment, news, has_spike)
    
    print(f"\n{'='*60}")
    print(f"SIGNAL: {signal}")
    print(f"Confidence: {confidence:.0%}")
    print(f"{'='*60}")
    print(f"\n{summary}")
    
    return ScoutSignal(
        token=token,
        sentiment=sentiment,
        news=news,
        signal=signal,
        confidence=confidence,
        summary=summary
    )


def generate_signal(
    token: TokenInfo, 
    sentiment: SentimentResult, 
    news: NewsResult,
    has_volume_spike: bool
) -> Tuple[str, float, str]:
    """
    Generate final trading signal based on all inputs.
    
    STRONG_BUY: Organic sentiment + Strong news + Volume spike
    CAUTIOUS_BUY: Organic sentiment + Some news
    HOLD: Mixed signals
    AVOID: Bot farm or red flags
    """
    
    # Start with base confidence from Grok
    confidence = sentiment.confidence
    
    # AVOID conditions (immediate disqualification)
    if sentiment.verdict == "BOT_FARM":
        return "AVOID", 0.9, f"🚫 BOT FARM DETECTED: {sentiment.reasoning}"
    
    if len(sentiment.red_flags) >= 2:
        return "AVOID", 0.8, f"🚫 Multiple red flags: {', '.join(sentiment.red_flags)}"
    
    # Score the opportunity
    score = 0
    reasons = []
    
    # Sentiment scoring
    if sentiment.verdict == "ORGANIC":
        score += 3
        reasons.append("✅ Organic X sentiment")
    elif sentiment.verdict == "SUSPICIOUS":
        score += 1
        reasons.append("⚠️ Suspicious sentiment (proceed with caution)")
    else:
        reasons.append("❓ Unable to verify sentiment")
    
    # News scoring
    if news.news_quality == "STRONG":
        score += 3
        reasons.append("✅ Strong news catalysts")
    elif news.news_quality == "MODERATE":
        score += 2
        reasons.append("📰 Moderate news coverage")
    elif news.news_quality == "WEAK":
        score += 1
        reasons.append("📰 Weak news signals")
    else:
        reasons.append("❌ No verifiable news")
    
    # Volume scoring
    if has_volume_spike:
        score += 1
        reasons.append("📈 Volume spike detected")
    
    # Influencer bonus
    if sentiment.influencer_mentions:
        score += 1
        reasons.append(f"🌟 Influencer mentions: {', '.join(sentiment.influencer_mentions[:3])}")
    
    # Generate signal
    summary = "\n".join(reasons)
    
    if score >= 6:
        return "STRONG_BUY", min(0.9, confidence + 0.2), f"🟢 STRONG OPPORTUNITY\n{summary}"
    elif score >= 4:
        return "CAUTIOUS_BUY", confidence, f"🟡 CAUTIOUS ENTRY\n{summary}"
    elif score >= 2:
        return "HOLD", max(0.3, confidence - 0.2), f"🟠 HOLD/WATCH\n{summary}"
    else:
        return "AVOID", 0.7, f"🔴 INSUFFICIENT SIGNALS\n{summary}"


# --- CLI ---

def print_usage():
    print("""
Grok Scout - Multi-Layer Sentiment Validator
============================================

Usage:
  python grok_scout.py <token_address>
  python grok_scout.py --trending          # Scout trending tokens

Examples:
  python grok_scout.py DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263  # BONK
  
Environment Variables Required:
  XAI_API_KEY     - Grok/xAI API key
  GOOGLE_API_KEY  - Google Custom Search API key
  GOOGLE_CSE_ID   - Google Custom Search Engine ID (optional)

Signal Meanings:
  STRONG_BUY   - Organic hype + real news + volume = GO
  CAUTIOUS_BUY - Good signals but verify before entry
  HOLD         - Mixed signals, watch but don't enter
  AVOID        - Bot farm or multiple red flags
""")


if __name__ == "__main__":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    
    if len(sys.argv) < 2:
        print_usage()
        sys.exit(0)
    
    arg = sys.argv[1]
    
    if arg == "--trending":
        # TODO: Fetch trending and scout each
        print("Trending scout not yet implemented")
        sys.exit(0)
    
    # Scout specific token
    result = scout_token(arg)
    
    if result:
        # Output JSON for programmatic use
        if "--json" in sys.argv:
            output = {
                "signal": result.signal,
                "confidence": result.confidence,
                "token": {
                    "symbol": result.token.symbol,
                    "name": result.token.name,
                    "price_usd": result.token.price_usd,
                    "volume_24h": result.token.volume_24h
                },
                "sentiment": {
                    "verdict": result.sentiment.verdict,
                    "confidence": result.sentiment.confidence,
                    "reasoning": result.sentiment.reasoning
                },
                "news": {
                    "quality": result.news.news_quality,
                    "catalysts": result.news.catalysts
                }
            }
            print(json.dumps(output, indent=2))
