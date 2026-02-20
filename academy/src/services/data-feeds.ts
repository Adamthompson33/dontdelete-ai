/**
 * DataFeedService — Unified market data layer for The Academy
 * 
 * Replaces PriceFeedService (Manifold Markets) with real market data:
 * - CoinGecko: BTC, ETH, SOL spot prices + 24h change
 * - HyperLiquid: funding rates, open interest, mark/oracle prices
 * - Polymarket: prediction market prices & spreads (when accessible)
 * 
 * All APIs are free, no auth, no geo-block (CoinGecko + HL).
 * Polymarket may be geo-blocked in AU — graceful fallback.
 * 
 * Usage:
 *   const feeds = new DataFeedService();
 *   const snapshot = await feeds.getMarketSnapshot();
 *   // snapshot has spot prices, funding rates, and prediction data
 */

export interface SpotPrice {
  symbol: string;
  price: number;
  change24h: number;       // percentage
  volume24h: number;
  marketCap: number;
  fetchedAt: string;
}

export interface FundingRate {
  coin: string;
  hourlyRate: number;
  annualizedRate: number;
  markPrice: number;
  oraclePrice: number;
  premium: number;          // (mark - oracle) / oracle as percentage
  openInterestUsd: number;
  volume24h: number;
  priceChange24h: number;
  fetchedAt: string;
}

export interface PolymarketEvent {
  id: string;
  question: string;
  outcomes: { name: string; price: number }[];
  volume: number;
  liquidity: number;
  endDate: string | null;
  category: string;
  fetchedAt: string;
}

export interface MarketSnapshot {
  spot: SpotPrice[];
  funding: FundingRate[];
  predictions: PolymarketEvent[];
  fetchedAt: string;
  errors: string[];
}

const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const HL_API = 'https://api.hyperliquid.xyz/info';
const POLYMARKET_API = 'https://clob.polymarket.com';

// Tracked coins for spot prices
const TRACKED_COINS = ['bitcoin', 'ethereum', 'solana'];
const COIN_SYMBOLS: Record<string, string> = {
  bitcoin: 'BTC',
  ethereum: 'ETH',
  solana: 'SOL',
};

// Top coins to check funding on HL
const HL_COINS = ['BTC', 'ETH', 'SOL', 'DOGE', 'ARB', 'OP', 'AVAX', 'MATIC', 'LINK', 'WIF'];

export class DataFeedService {
  private cache: Map<string, { data: any; fetchedAt: number }> = new Map();
  private cacheTTL = 3 * 60 * 1000; // 3 min cache

  /**
   * Get full market snapshot — spot + funding + predictions
   */
  async getMarketSnapshot(): Promise<MarketSnapshot> {
    const errors: string[] = [];
    const now = new Date().toISOString();

    const [spot, funding, predictions] = await Promise.allSettled([
      this.getSpotPrices(),
      this.getFundingRates(),
      this.getPolymarketEvents(),
    ]);

    return {
      spot: spot.status === 'fulfilled' ? spot.value : (errors.push(`Spot: ${(spot as PromiseRejectedResult).reason}`), []),
      funding: funding.status === 'fulfilled' ? funding.value : (errors.push(`Funding: ${(funding as PromiseRejectedResult).reason}`), []),
      predictions: predictions.status === 'fulfilled' ? predictions.value : (errors.push(`Polymarket: ${(predictions as PromiseRejectedResult).reason}`), []),
      fetchedAt: now,
      errors,
    };
  }

  /**
   * Spot prices from CoinGecko (free, no key)
   */
  async getSpotPrices(): Promise<SpotPrice[]> {
    const cached = this.getCached<SpotPrice[]>('spot');
    if (cached) return cached;

    const ids = TRACKED_COINS.join(',');
    const url = `${COINGECKO_API}/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`CoinGecko ${res.status}: ${res.statusText}`);
    const data = await res.json() as any[];

    const prices: SpotPrice[] = data.map(coin => ({
      symbol: COIN_SYMBOLS[coin.id] || coin.symbol.toUpperCase(),
      price: coin.current_price,
      change24h: coin.price_change_percentage_24h ?? 0,
      volume24h: coin.total_volume ?? 0,
      marketCap: coin.market_cap ?? 0,
      fetchedAt: new Date().toISOString(),
    }));

    this.setCache('spot', prices);
    return prices;
  }

  /**
   * Funding rates from HyperLiquid (free, no auth, no geo-block)
   */
  async getFundingRates(): Promise<FundingRate[]> {
    const cached = this.getCached<FundingRate[]>('funding');
    if (cached) return cached;

    // Get metadata (funding rates + OI)
    const metaRes = await fetch(HL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    });
    if (!metaRes.ok) throw new Error(`HyperLiquid meta ${metaRes.status}`);
    const [meta, assetCtxs] = await metaRes.json() as [any, any[]];

    const now = new Date().toISOString();
    const rates: FundingRate[] = [];

    for (let i = 0; i < meta.universe.length; i++) {
      const coin = meta.universe[i].name;
      if (!HL_COINS.includes(coin)) continue;

      const ctx = assetCtxs[i];
      if (!ctx) continue;

      const markPrice = parseFloat(ctx.markPx || '0');
      const oraclePrice = parseFloat(ctx.oraclePx || '0');
      const hourlyRate = parseFloat(ctx.funding || '0');
      const premium = oraclePrice > 0 ? ((markPrice - oraclePrice) / oraclePrice) * 100 : 0;
      const oi = parseFloat(ctx.openInterest || '0');
      const vol = parseFloat(ctx.dayNtlVlm || '0');
      const prevDayPx = parseFloat(ctx.prevDayPx || '0');
      const priceChange = prevDayPx > 0 ? ((markPrice - prevDayPx) / prevDayPx) * 100 : 0;

      rates.push({
        coin,
        hourlyRate,
        annualizedRate: hourlyRate * 24 * 365 * 100, // as percentage
        markPrice,
        oraclePrice,
        premium,
        openInterestUsd: oi * markPrice,
        volume24h: vol,
        priceChange24h: priceChange,
        fetchedAt: now,
      });
    }

    // Sort by absolute funding rate (most interesting first)
    rates.sort((a, b) => Math.abs(b.annualizedRate) - Math.abs(a.annualizedRate));

    this.setCache('funding', rates);
    return rates;
  }

  /**
   * Polymarket events (may be geo-blocked in AU — fails gracefully)
   */
  async getPolymarketEvents(): Promise<PolymarketEvent[]> {
    const cached = this.getCached<PolymarketEvent[]>('polymarket');
    if (cached) return cached;

    try {
      // Polymarket CLOB API — get active markets
      const res = await fetch(`${POLYMARKET_API}/markets?next_cursor=MA==&limit=20`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`Polymarket ${res.status}`);
      const data = await res.json() as any;
      const markets = data.data || data || [];

      const events: PolymarketEvent[] = (Array.isArray(markets) ? markets : []).slice(0, 15).map((m: any) => ({
        id: m.condition_id || m.id || '',
        question: m.question || m.description || '',
        outcomes: (m.tokens || []).map((t: any) => ({
          name: t.outcome || 'Unknown',
          price: parseFloat(t.price || '0'),
        })),
        volume: parseFloat(m.volume || '0'),
        liquidity: parseFloat(m.liquidity || '0'),
        endDate: m.end_date_iso || null,
        category: categorizeQuestion(m.question || ''),
        fetchedAt: new Date().toISOString(),
      }));

      this.setCache('polymarket', events);
      return events;
    } catch (err: any) {
      // Expected in AU — geo-blocked
      console.warn(`Polymarket unavailable: ${err.message}`);
      return [];
    }
  }

  /**
   * Format snapshot for injection into agent prompts
   */
  formatForPrompt(snapshot: MarketSnapshot): string {
    let output = '═══ LIVE MARKET DATA ═══\n\n';

    // Spot prices
    if (snapshot.spot.length > 0) {
      output += '[SPOT PRICES]\n';
      for (const s of snapshot.spot) {
        const arrow = s.change24h >= 0 ? '▲' : '▼';
        output += `  ${s.symbol}: $${s.price.toLocaleString()} ${arrow}${Math.abs(s.change24h).toFixed(1)}% 24h | Vol: $${(s.volume24h / 1e9).toFixed(1)}B\n`;
      }
      output += '\n';
    }

    // Funding rates (only interesting ones)
    const interestingFunding = snapshot.funding.filter(f => Math.abs(f.annualizedRate) > 5);
    if (interestingFunding.length > 0) {
      output += '[HYPERLIQUID FUNDING RATES]\n';
      for (const f of interestingFunding) {
        const dir = f.hourlyRate > 0 ? 'longs pay' : 'shorts pay';
        output += `  ${f.coin}: ${f.annualizedRate > 0 ? '+' : ''}${f.annualizedRate.toFixed(1)}% ann. (${dir}) | OI: $${(f.openInterestUsd / 1e6).toFixed(0)}M\n`;
      }
      output += '  ⚠️ Funding > 20% annualized = basis trade opportunity\n\n';
    }

    // Prediction markets
    if (snapshot.predictions.length > 0) {
      output += '[PREDICTION MARKETS — Polymarket]\n';
      for (const p of snapshot.predictions.slice(0, 8)) {
        const outcomes = p.outcomes.map(o => `${o.name}: ${(o.price * 100).toFixed(0)}%`).join(' / ');
        output += `  "${p.question.slice(0, 60)}" → ${outcomes}\n`;
      }
      output += '\n';
    }

    if (snapshot.errors.length > 0) {
      output += `[FEED ERRORS: ${snapshot.errors.join('; ')}]\n`;
    }

    output += `⚠️ Use these prices for ALL analysis. Do NOT estimate or assume prices.\n`;
    output += `Fetched: ${snapshot.fetchedAt}\n`;

    return output;
  }

  // ═══ Cache helpers ═══

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.fetchedAt < this.cacheTTL) {
      return entry.data as T;
    }
    return null;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, { data, fetchedAt: Date.now() });
  }
}

// Category detection for prediction markets
function categorizeQuestion(question: string): string {
  const q = question.toLowerCase();
  if (/ufc|mma|boxing|fight|nba|nfl|sport|championship|game|match/i.test(q)) return 'sports';
  if (/bitcoin|btc|ethereum|eth|crypto|solana|defi|token|blockchain/i.test(q)) return 'crypto';
  if (/trump|biden|election|congress|democrat|republican|president|political/i.test(q)) return 'politics';
  if (/ai|gpt|openai|anthropic|google|apple|microsoft|agi|llm/i.test(q)) return 'tech';
  return 'other';
}

// ═══ Quick test ═══
if (require.main === module) {
  (async () => {
    const feeds = new DataFeedService();
    console.log('═══ DataFeedService Test ═══\n');

    const snapshot = await feeds.getMarketSnapshot();

    console.log('SPOT:');
    for (const s of snapshot.spot) {
      console.log(`  ${s.symbol}: $${s.price.toLocaleString()} (${s.change24h > 0 ? '+' : ''}${s.change24h.toFixed(1)}%)`);
    }

    console.log('\nFUNDING (top 5):');
    for (const f of snapshot.funding.slice(0, 5)) {
      console.log(`  ${f.coin}: ${f.annualizedRate > 0 ? '+' : ''}${f.annualizedRate.toFixed(1)}% ann. | Mark: $${f.markPrice.toFixed(2)}`);
    }

    console.log(`\nPREDICTIONS: ${snapshot.predictions.length} markets loaded`);
    for (const p of snapshot.predictions.slice(0, 3)) {
      console.log(`  "${p.question.slice(0, 60)}"`);
    }

    if (snapshot.errors.length > 0) {
      console.log(`\nERRORS: ${snapshot.errors.join(', ')}`);
    }

    console.log('\n═══ Prompt Format ═══\n');
    console.log(feeds.formatForPrompt(snapshot));
  })().catch(console.error);
}
