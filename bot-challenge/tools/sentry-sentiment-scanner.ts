#!/usr/bin/env npx tsx
/**
 * Sentry Sentiment Scanner v2 — Real News Edition
 *
 * Previously: CoinGecko trending + price-change heuristic (= broken)
 * Now: Real news headlines from Cointelegraph + Decrypt RSS + Fear & Greed index
 *      Classified by Claude Haiku via Anthropic API (real sentiment, not momentum labels)
 *
 * Data sources (all free, no auth):
 *   - Cointelegraph RSS (per-coin tags + general feed)
 *   - Decrypt.co RSS feed
 *   - alternative.me Fear & Greed Index
 *   - CoinGecko trending (coin discovery + price only)
 *
 * Rebuilt: 2026-03-01 — Helena flagged 15.6% WR. Root cause: fake sentiment.
 */

import * as fs from 'fs';
import * as path from 'path';
import { isBlocked } from './lib/blocklist';

// ═══ Types ═══

interface NewsItem {
  title: string;
  source: string;
  publishedAt: string;
}

interface CoinData {
  symbol: string;
  name: string;
  price: number;
  priceChange24h: number;
  trendingRank?: number;
}

interface SentimentResult {
  direction: 'LONG' | 'SHORT' | 'FLAT';
  confidence: number;
  reasoning: string;
  headlines: string[];
}

interface PaperLedgerEntry {
  signals: any[];
  lastScanAt: string;
  totalScans: number;
}

// ═══ Config ═══

const LEDGER_FILE   = path.join(__dirname, '..', 'results', 'paper-ledger.json');
const REPORT_DIR    = path.join(__dirname, '..', 'reports');
// Try env first, then openclaw config
function getAnthropicKey(): string {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(process.env.HOME || '', '.openclaw', 'openclaw.json'), 'utf-8'));
    return cfg?.env?.ANTHROPIC_API_KEY || '';
  } catch { return ''; }
}
const ANTHROPIC_KEY = getAnthropicKey();

const COINGECKO_TRENDING = 'https://api.coingecko.com/api/v3/search/trending';
const FEAR_GREED_API     = 'https://api.alternative.me/fng/?limit=1';
const CT_RSS_BASE        = 'https://cointelegraph.com/rss';
const DECRYPT_RSS        = 'https://decrypt.co/feed';

// Cointelegraph per-coin tag slugs (where they exist)
const CT_COIN_TAGS: Record<string, string> = {
  BTC:  'bitcoin',
  ETH:  'ethereum',
  SOL:  'solana',
  XRP:  'ripple',
  DOGE: 'dogecoin',
  ADA:  'cardano',
  AVAX: 'avalanche',
  MATIC:'polygon',
  DOT:  'polkadot',
  LINK: 'chainlink',
  UNI:  'uniswap',
  NEAR: 'near-protocol',
  APT:  'aptos',
  SUI:  'sui',
  ARB:  'arbitrum',
  OP:   'optimism',
  INJ:  'injective',
};

// HyperLiquid-tradeable coins we care about
const HYPERLIQUID_TRADEABLE = new Set([
  'BTC','ETH','SOL','AVAX','NEAR','APT','SUI','SEI',
  'ARB','OP','MATIC','STRK','ZK',
  'UNI','AAVE','MKR','CRV','DYDX','SNX',
  'DOGE','SHIB','PEPE','WIF','BONK','FLOKI',
  'FET','RNDR','TAO','ARKM','WLD',
  'IMX','GALA','AXS','SAND',
  'ORDI','STX',
  'INJ','TIA','JUP','PYTH','W','ENA',
  'LINK','DOT','ATOM','ADA','XRP',
  'PENGU','VIRTUAL','MORPHO',
]);

// ═══ RSS Fetching ═══

async function fetchRSS(url: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AcademyBot/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();

    // Parse <item> blocks
    const items: NewsItem[] = [];
    const itemBlocks = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

    for (const block of itemBlocks.slice(0, 20)) {
      // Title — handle CDATA and plain text
      const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s);
      const pubMatch   = block.match(/<pubDate>(.*?)<\/pubDate>/);
      if (!titleMatch) continue;

      const title = titleMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
      const publishedAt = pubMatch ? pubMatch[1].trim() : new Date().toISOString();

      if (title && title.length > 5) {
        items.push({ title, source: new URL(url).hostname, publishedAt });
      }
    }

    return items;
  } catch {
    return [];
  }
}

// ═══ Coin-specific News ═══

async function getNewsForCoin(symbol: string, allNews: NewsItem[]): Promise<NewsItem[]> {
  const coinSpecific: NewsItem[] = [];

  // 1. Try CT per-coin tag feed first
  const ctTag = CT_COIN_TAGS[symbol];
  if (ctTag) {
    const tagNews = await fetchRSS(`${CT_RSS_BASE}/tag/${ctTag}`);
    coinSpecific.push(...tagNews.slice(0, 5));
  }

  // 2. Scan general feeds for coin mentions
  const keywords = [symbol.toLowerCase(), symbol.toUpperCase()];
  // Add common full names
  const nameMap: Record<string, string[]> = {
    BTC: ['bitcoin', 'btc'], ETH: ['ethereum', 'ether', 'eth'],
    SOL: ['solana', 'sol'], XRP: ['ripple', 'xrp'], DOGE: ['dogecoin', 'doge'],
    PENGU: ['pengu', 'pudgy'], SUI: ['sui network'], NEAR: ['near protocol'],
  };
  if (nameMap[symbol]) keywords.push(...nameMap[symbol]);

  for (const item of allNews) {
    const titleLower = item.title.toLowerCase();
    if (keywords.some(k => titleLower.includes(k))) {
      // Avoid duplicates
      if (!coinSpecific.find(e => e.title === item.title)) {
        coinSpecific.push(item);
      }
    }
  }

  return coinSpecific.slice(0, 8);
}

// ═══ Fear & Greed ═══

async function fetchFearGreed(): Promise<{ value: number; label: string }> {
  try {
    const res = await fetch(FEAR_GREED_API, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { value: 50, label: 'Neutral' };
    const d = await res.json() as any;
    return {
      value: parseInt(d.data[0].value),
      label: d.data[0].value_classification,
    };
  } catch {
    return { value: 50, label: 'Neutral' };
  }
}

// ═══ CoinGecko (price + discovery only) ═══

async function fetchCoinGeckoTrending(): Promise<CoinData[]> {
  try {
    const res = await fetch(COINGECKO_TRENDING, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json() as any;
    const coins: CoinData[] = [];

    for (const entry of data.coins || []) {
      const item = entry.item;
      const priceData = item.data || {};
      let priceChange24h = 0;
      const pcp = priceData.price_change_percentage_24h;
      if (pcp && typeof pcp === 'object') priceChange24h = pcp.usd ?? 0;
      else if (typeof pcp === 'number') priceChange24h = pcp;

      coins.push({
        symbol: item.symbol?.toUpperCase() || '',
        name: item.name,
        price: typeof priceData.price === 'number' ? priceData.price : parseFloat(priceData.price || '0'),
        priceChange24h,
        trendingRank: item.score + 1,
      });
    }
    return coins;
  } catch {
    return [];
  }
}

// ═══ Claude Haiku Sentiment ═══

async function classifyWithClaude(
  coin: CoinData,
  headlines: NewsItem[],
  fearGreed: { value: number; label: string }
): Promise<SentimentResult> {
  if (!ANTHROPIC_KEY || headlines.length === 0) {
    return fallbackSentiment(coin, fearGreed);
  }

  const headlineText = headlines
    .slice(0, 6)
    .map((h, i) => `${i + 1}. [${h.source}] ${h.title}`)
    .join('\n');

  const prompt = `You are a crypto market analyst. Classify the 4-hour sentiment for ${coin.symbol} based on real news.

MARKET CONTEXT:
- Fear & Greed Index: ${fearGreed.value}/100 (${fearGreed.label})
- ${coin.symbol} price: $${coin.price.toFixed(4)} | 24h change: ${coin.priceChange24h > 0 ? '+' : ''}${coin.priceChange24h.toFixed(2)}%
${coin.trendingRank ? `- Trending rank: #${coin.trendingRank} on CoinGecko` : ''}

RECENT HEADLINES:
${headlineText}

Classify the SHORT-TERM (4h) trading sentiment. Reply in this exact JSON format only:
{"direction":"LONG|SHORT|FLAT","confidence":0-100,"reasoning":"one concise sentence referencing the specific news"}

Rules:
- LONG: genuinely bullish catalyst from news, not just price momentum
- SHORT: negative news catalyst, regulatory risk, exploit, whale sell
- FLAT: no clear directional catalyst in news; noise/uncertainty
- confidence > 60 requires at least one strong headline directly about this coin
- Be conservative — FLAT if uncertain`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return fallbackSentiment(coin, fearGreed);
    const data = await res.json() as any;
    const text = data.content?.[0]?.text || '';
    const match = text.match(/\{[^}]+\}/s);
    if (!match) return fallbackSentiment(coin, fearGreed);

    const parsed = JSON.parse(match[0]);
    const direction: 'LONG' | 'SHORT' | 'FLAT' =
      ['LONG', 'SHORT', 'FLAT'].includes(parsed.direction) ? parsed.direction : 'FLAT';

    return {
      direction,
      confidence: Math.max(0, Math.min(100, parseInt(parsed.confidence) || 35)),
      reasoning: parsed.reasoning || 'No clear catalyst identified.',
      headlines: headlines.slice(0, 3).map(h => h.title),
    };
  } catch {
    return fallbackSentiment(coin, fearGreed);
  }
}

function fallbackSentiment(
  coin: CoinData,
  fearGreed: { value: number; label: string }
): SentimentResult {
  // Minimal fallback — extreme F&G only
  if (fearGreed.value <= 15) {
    return { direction: 'FLAT', confidence: 30, reasoning: `Extreme Fear (${fearGreed.value}) — high uncertainty, no news context available.`, headlines: [] };
  }
  if (fearGreed.value >= 85) {
    return { direction: 'FLAT', confidence: 30, reasoning: `Extreme Greed (${fearGreed.value}) — elevated risk, no news context available.`, headlines: [] };
  }
  return { direction: 'FLAT', confidence: 20, reasoning: 'No news data available for analysis.', headlines: [] };
}

// ═══ Main ═══

async function main() {
  console.log('📡 Sentry Sentiment Scanner v2 — Real News Edition\n');

  if (!ANTHROPIC_KEY) {
    console.warn('⚠️  No ANTHROPIC_API_KEY — will use fallback mode (limited accuracy)');
  }

  // Parallel fetch: all data sources at once
  console.log('Fetching data sources...');
  const [trending, fearGreed, ctGeneral, decryptNews] = await Promise.all([
    fetchCoinGeckoTrending(),
    fetchFearGreed(),
    fetchRSS(CT_RSS_BASE),
    fetchRSS(DECRYPT_RSS),
  ]);

  const allGeneralNews = [...ctGeneral, ...decryptNews];
  console.log(`✓ Fear & Greed: ${fearGreed.value} (${fearGreed.label})`);
  console.log(`✓ General news: ${allGeneralNews.length} headlines`);
  console.log(`✓ CoinGecko trending: ${trending.length} coins\n`);

  // Determine which coins to scan:
  // Priority: trending coins that are HL-tradeable + core coins always scanned
  const coreCoins = ['BTC', 'ETH', 'SOL', 'XRP', 'LINK', 'DOGE'];
  const trendingTradeable = trending.filter(c => HYPERLIQUID_TRADEABLE.has(c.symbol));

  // Merge: core + trending, deduplicated
  const coinMap = new Map<string, CoinData>();
  for (const c of trendingTradeable) coinMap.set(c.symbol, c);
  for (const sym of coreCoins) {
    if (!coinMap.has(sym)) {
      // Add core coin with price from trending if available, else minimal data
      const trendData = trending.find(t => t.symbol === sym);
      coinMap.set(sym, trendData || { symbol: sym, name: sym, price: 0, priceChange24h: 0 });
    }
  }

  const coinsToScan = Array.from(coinMap.values());
  console.log(`Scanning ${coinsToScan.length} coins: ${coinsToScan.map(c => c.symbol).join(', ')}\n`);

  // Process each coin
  const signals: any[] = [];
  const nonTradeableInfo: string[] = [];

  // Non-tradeable trending (info only, no signals)
  for (const c of trending.filter(t => !HYPERLIQUID_TRADEABLE.has(t.symbol))) {
    nonTradeableInfo.push(`${c.symbol} (#${c.trendingRank}): ${c.priceChange24h > 0 ? '+' : ''}${c.priceChange24h.toFixed(1)}%`);
  }

  for (const coin of coinsToScan) {
    // Blocklist check
    const blockCheck = isBlocked(coin.symbol);
    if (blockCheck.blocked) {
      console.log(`🚫 ${coin.symbol} — ${blockCheck.reason}`);
      continue;
    }

    // Get coin-specific headlines
    const headlines = await getNewsForCoin(coin.symbol, allGeneralNews);
    const result = await classifyWithClaude(coin, headlines, fearGreed);

    const icon = result.direction === 'LONG' ? '🟢' : result.direction === 'SHORT' ? '🔴' : '⚪';
    console.log(`${icon} ${coin.symbol}${coin.trendingRank ? ` (#${coin.trendingRank} trending)` : ''}`);
    console.log(`   Price: $${coin.price > 0 ? coin.price.toFixed(4) : 'n/a'} | 24h: ${coin.priceChange24h > 0 ? '+' : ''}${coin.priceChange24h.toFixed(1)}%`);
    console.log(`   Signal: ${result.direction} (${result.confidence}% conf)`);
    console.log(`   ${result.reasoning}`);
    if (result.headlines.length > 0) {
      console.log(`   Headlines: "${result.headlines[0].slice(0, 70)}..."`);
    }
    console.log('');

    // Only log signals with meaningful confidence
    if (result.confidence >= 30) {
      signals.push({
        tool: 'sentry-sentiment-scanner',
        timestamp: new Date().toISOString(),
        unixMs: Date.now(),
        coin: coin.symbol,
        direction: result.direction,
        confidence: result.confidence / 100,
        entryPrice: coin.price,
        reasoning: result.reasoning,
        invalidation: 'News catalyst reverses or sentiment shifts within 8h.',
        sentimentScore: result.confidence,
        trendingRank: coin.trendingRank ?? null,
        priceChange24h: coin.priceChange24h,
        headlines: result.headlines,
        fearGreedValue: fearGreed.value,
        fearGreedLabel: fearGreed.label,
        dataSource: 'news+rss',  // distinguishes v2 from v1 heuristic signals
      });
    }
  }

  if (nonTradeableInfo.length > 0) {
    console.log(`📋 Non-tradeable trending: ${nonTradeableInfo.join(' | ')}\n`);
  }

  // Write to ledger
  let ledger: PaperLedgerEntry;
  try {
    ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf-8'));
  } catch {
    ledger = { signals: [], lastScanAt: '', totalScans: 0 };
  }

  ledger.signals.push(...signals);
  ledger.lastScanAt = new Date().toISOString();
  ledger.totalScans++;

  fs.mkdirSync(path.dirname(LEDGER_FILE), { recursive: true });
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2));

  // Daily report
  const date = new Date().toISOString().slice(0, 10);
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(REPORT_DIR, `sentry-sentiment-${date}.json`),
    JSON.stringify({
      date,
      scannedAt: new Date().toISOString(),
      version: 2,
      dataSource: 'cointelegraph-rss+decrypt-rss+fear-greed',
      fearGreed,
      generalHeadlineCount: allGeneralNews.length,
      coinsScanned: coinsToScan.length,
      signalsLogged: signals.length,
      signals,
      nonTradeableTrending: nonTradeableInfo,
    }, null, 2)
  );

  console.log(`✅ ${signals.length} signals logged (total: ${ledger.signals.length} across ${ledger.totalScans} scans)`);
  console.log(`📊 Report: reports/sentry-sentiment-${date}.json`);
}

main().catch(err => {
  console.error('❌ Sentry v2 failed:', err.message);
  process.exit(1);
});
