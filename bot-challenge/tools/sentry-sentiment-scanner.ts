#!/usr/bin/env npx tsx
/**
 * Sentry Sentiment Scanner — Bot Challenge Tool
 * 
 * Pulls trending crypto data from CoinGecko (free, no auth) and
 * classifies sentiment using OpenRouter free models.
 * 
 * Usage: npx tsx tools/sentry-sentiment-scanner.ts
 * 
 * Data sources:
 * - CoinGecko trending endpoint (free)
 * - CoinGecko price change data (free)
 * - OpenRouter free model for sentiment classification
 * 
 * Output: sentiment signals to paper-ledger.json
 */

import * as fs from 'fs';
import * as path from 'path';

// ═══ Types ═══

interface BotChallengeSignal {
  tool: string;
  timestamp: string;
  unixMs: number;
  coin: string;
  direction: 'LONG' | 'SHORT' | 'FLAT';
  confidence: number;
  entryPrice: number;
  reasoning: string;
  invalidation: string;
  sentimentScore: number;
  trendingRank: number;
  priceChange24h: number;
}

interface PaperLedgerEntry {
  signals: any[];
  lastScanAt: string;
  totalScans: number;
}

interface TrendingCoin {
  id: string;
  name: string;
  symbol: string;
  rank: number;
  price: number;
  priceChange24h: number;
  marketCap: number;
  volume24h: number;
}

interface SentimentResult {
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning: string;
}

// ═══ Config ═══

const LEDGER_FILE = path.join(__dirname, '..', 'results', 'paper-ledger.json');
const REPORT_DIR = path.join(__dirname, '..', 'reports');
const COINGECKO_TRENDING = 'https://api.coingecko.com/api/v3/search/trending';
const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
// Free models on OpenRouter
const FREE_MODEL = 'google/gemma-3-12b-it:free';
const FALLBACK_MODEL = 'qwen/qwen3-4b:free';

// HyperLiquid coins we track (to cross-reference trending with tradeable)
const HYPERLIQUID_TRADEABLE = new Set([
  'BTC', 'ETH', 'SOL', 'AVAX', 'NEAR', 'APT', 'SUI', 'SEI',
  'ARB', 'OP', 'MATIC', 'STRK', 'ZK',
  'UNI', 'AAVE', 'MKR', 'CRV', 'DYDX', 'SNX',
  'DOGE', 'SHIB', 'PEPE', 'WIF', 'BONK', 'FLOKI',
  'FET', 'RNDR', 'TAO', 'ARKM', 'WLD',
  'IMX', 'GALA', 'AXS', 'SAND',
  'BTC', 'ORDI', 'STX', 'SATS',
  'INJ', 'TIA', 'JUP', 'PYTH', 'W', 'ENA',
  'LINK', 'DOT', 'ATOM', 'ADA', 'XRP',
  'PENGU', 'VIRTUAL', 'MORPHO', 'AZTEC',
]);

// ═══ Data Fetching ═══

async function fetchTrendingCoins(): Promise<TrendingCoin[]> {
  try {
    const res = await fetch(COINGECKO_TRENDING);
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    
    const data = await res.json() as any;
    const coins: TrendingCoin[] = [];
    
    for (const entry of data.coins || []) {
      const item = entry.item;
      const priceData = item.data || {};
      
      // Extract 24h price change from the nested object
      let priceChange24h = 0;
      if (priceData.price_change_percentage_24h) {
        const pcp = priceData.price_change_percentage_24h;
        if (typeof pcp === 'object' && pcp.usd !== undefined) {
          priceChange24h = pcp.usd;
        } else if (typeof pcp === 'number') {
          priceChange24h = pcp;
        }
      }
      
      coins.push({
        id: item.id,
        name: item.name,
        symbol: item.symbol?.toUpperCase() || '',
        rank: item.score + 1,
        price: typeof priceData.price === 'number' ? priceData.price : parseFloat(priceData.price || '0'),
        priceChange24h,
        marketCap: parseFloat(String(priceData.market_cap || '0').replace(/[,$]/g, '')),
        volume24h: parseFloat(String(priceData.total_volume || '0').replace(/[,$]/g, '')),
      });
    }
    
    return coins;
  } catch (err: any) {
    console.error(`❌ CoinGecko fetch failed: ${err.message}`);
    return [];
  }
}

// ═══ Sentiment Analysis ═══

async function classifySentiment(coin: TrendingCoin): Promise<SentimentResult> {
  // If no OpenRouter key, use heuristic-based sentiment
  if (!OPENROUTER_KEY) {
    return heuristicSentiment(coin);
  }
  
  const prompt = `You are a crypto market sentiment analyzer. Analyze this trending coin and classify sentiment.

Coin: ${coin.name} (${coin.symbol})
Trending rank: #${coin.rank} on CoinGecko
Price: $${coin.price}
24h price change: ${coin.priceChange24h > 0 ? '+' : ''}${coin.priceChange24h.toFixed(2)}%
Market cap: $${(coin.marketCap / 1e6).toFixed(1)}M
24h volume: $${(coin.volume24h / 1e6).toFixed(1)}M

Respond in exactly this JSON format, nothing else:
{"sentiment":"bullish|bearish|neutral","confidence":0-100,"reasoning":"one sentence"}`;

  try {
    const res = await fetch(OPENROUTER_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
      },
      body: JSON.stringify({
        model: FREE_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        temperature: 0.3,
      }),
    });
    
    if (!res.ok) {
      // Try fallback model
      const res2 = await fetch(OPENROUTER_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_KEY}`,
        },
        body: JSON.stringify({
          model: FALLBACK_MODEL,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 150,
          temperature: 0.3,
        }),
      });
      
      if (!res2.ok) return heuristicSentiment(coin);
      
      const data2 = await res2.json() as any;
      return parseSentimentResponse(data2.choices?.[0]?.message?.content || '', coin);
    }
    
    const data = await res.json() as any;
    return parseSentimentResponse(data.choices?.[0]?.message?.content || '', coin);
  } catch {
    return heuristicSentiment(coin);
  }
}

function parseSentimentResponse(content: string, coin: TrendingCoin): SentimentResult {
  try {
    // Extract JSON from response (might have markdown wrapping)
    const jsonMatch = content.match(/\{[^}]+\}/);
    if (!jsonMatch) return heuristicSentiment(coin);
    
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      sentiment: ['bullish', 'bearish', 'neutral'].includes(parsed.sentiment) 
        ? parsed.sentiment 
        : 'neutral',
      confidence: Math.max(0, Math.min(100, parseInt(parsed.confidence) || 50)),
      reasoning: parsed.reasoning || 'No reasoning provided',
    };
  } catch {
    return heuristicSentiment(coin);
  }
}

function heuristicSentiment(coin: TrendingCoin): SentimentResult {
  // Simple heuristic when no LLM available:
  // Trending + price up = bullish momentum
  // Trending + price down = bearish (selling into hype)
  // Trending + flat = speculative interest
  
  const change = coin.priceChange24h;
  const volumeToMcap = coin.marketCap > 0 ? coin.volume24h / coin.marketCap : 0;
  
  let sentiment: 'bullish' | 'bearish' | 'neutral';
  let confidence: number;
  let reasoning: string;
  
  if (change > 10) {
    sentiment = 'bullish';
    confidence = Math.min(75, 50 + change);
    reasoning = `Trending #${coin.rank} with ${change.toFixed(1)}% gain. Strong momentum.`;
  } else if (change > 3) {
    sentiment = 'bullish';
    confidence = 45 + change;
    reasoning = `Trending #${coin.rank} with moderate ${change.toFixed(1)}% gain. Positive attention.`;
  } else if (change < -10) {
    sentiment = 'bearish';
    confidence = Math.min(70, 50 + Math.abs(change));
    reasoning = `Trending #${coin.rank} but down ${change.toFixed(1)}%. Selling into attention.`;
  } else if (change < -3) {
    sentiment = 'bearish';
    confidence = 40 + Math.abs(change);
    reasoning = `Trending #${coin.rank} with ${change.toFixed(1)}% decline. Fading momentum.`;
  } else {
    sentiment = 'neutral';
    confidence = 35;
    reasoning = `Trending #${coin.rank} with flat price action (${change.toFixed(1)}%). Speculative interest only.`;
  }
  
  // Volume/mcap ratio boost
  if (volumeToMcap > 0.5) {
    confidence = Math.min(85, confidence + 10);
    reasoning += ` High volume/mcap ratio (${(volumeToMcap * 100).toFixed(0)}%).`;
  }
  
  return { sentiment, confidence, reasoning };
}

// ═══ Main ═══

async function main() {
  console.log('📡 Sentry Sentiment Scanner — scanning CoinGecko trending...\n');
  
  // Fetch trending coins
  const trending = await fetchTrendingCoins();
  
  if (trending.length === 0) {
    console.log('⚠️  No trending data. CoinGecko may be rate-limited.');
    process.exit(0);
  }
  
  console.log(`Found ${trending.length} trending coins.`);
  console.log(`OpenRouter: ${OPENROUTER_KEY ? 'configured (LLM mode)' : 'not configured (heuristic mode)'}\n`);
  
  // Filter to HyperLiquid-tradeable coins (actionable signals only)
  const tradeable = trending.filter(c => HYPERLIQUID_TRADEABLE.has(c.symbol));
  const nonTradeable = trending.filter(c => !HYPERLIQUID_TRADEABLE.has(c.symbol));
  
  console.log(`Tradeable on HyperLiquid: ${tradeable.length}`);
  console.log(`Non-tradeable (log only): ${nonTradeable.length}\n`);
  
  // Classify sentiment for tradeable coins
  const signals: BotChallengeSignal[] = [];
  
  for (const coin of tradeable) {
    const result = await classifySentiment(coin);
    
    const direction: 'LONG' | 'SHORT' | 'FLAT' = 
      result.sentiment === 'bullish' ? 'LONG' :
      result.sentiment === 'bearish' ? 'SHORT' : 'FLAT';
    
    const signal: BotChallengeSignal = {
      tool: 'sentry-sentiment-scanner',
      timestamp: new Date().toISOString(),
      unixMs: Date.now(),
      coin: coin.symbol,
      direction,
      confidence: result.confidence / 100,
      entryPrice: coin.price,
      reasoning: result.reasoning,
      invalidation: 'Sentiment shifts or coin drops off trending within 12h.',
      sentimentScore: result.confidence,
      trendingRank: coin.rank,
      priceChange24h: coin.priceChange24h,
    };
    
    signals.push(signal);
    
    const icon = direction === 'LONG' ? '🟢' : direction === 'SHORT' ? '🔴' : '⚪';
    console.log(`${icon} ${coin.symbol} (${coin.name})`);
    console.log(`   Trending: #${coin.rank} | Price: $${coin.price.toFixed(4)} | 24h: ${coin.priceChange24h > 0 ? '+' : ''}${coin.priceChange24h.toFixed(1)}%`);
    console.log(`   Sentiment: ${result.sentiment.toUpperCase()} (${result.confidence}%)`);
    console.log(`   ${result.reasoning}\n`);
  }
  
  // Log non-tradeable as info only
  if (nonTradeable.length > 0) {
    console.log('📋 Non-tradeable trending (info only):');
    for (const coin of nonTradeable) {
      const result = await classifySentiment(coin);
      console.log(`   ${coin.symbol} (#${coin.rank}): ${result.sentiment} — ${result.reasoning}`);
    }
    console.log('');
  }
  
  // Append to paper ledger
  let ledger: PaperLedgerEntry;
  try {
    ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf-8'));
  } catch {
    ledger = { signals: [], lastScanAt: '', totalScans: 0 };
  }
  
  ledger.signals.push(...signals);
  ledger.lastScanAt = new Date().toISOString();
  ledger.totalScans++;
  
  const resultsDir = path.dirname(LEDGER_FILE);
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2), 'utf-8');
  console.log(`✅ Logged ${signals.length} sentiment signals to paper-ledger.json (total: ${ledger.signals.length} signals, ${ledger.totalScans} scans)`);
  
  // Save daily report
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
  const date = new Date().toISOString().slice(0, 10);
  const reportFile = path.join(REPORT_DIR, `sentry-sentiment-${date}.json`);
  fs.writeFileSync(reportFile, JSON.stringify({
    date,
    scannedAt: new Date().toISOString(),
    mode: OPENROUTER_KEY ? 'llm' : 'heuristic',
    trendingCount: trending.length,
    tradeableCount: tradeable.length,
    signals,
    allTrending: trending,
  }, null, 2), 'utf-8');
  
  console.log(`📊 Daily report saved to reports/sentry-sentiment-${date}.json`);
}

main().catch(err => {
  console.error('❌ Sentiment scan failed:', err.message);
  process.exit(1);
});
