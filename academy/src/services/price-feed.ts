/**
 * PriceFeedService — fetches real prediction market data from Manifold Markets
 * 
 * Why Manifold instead of Polymarket:
 * - Polymarket APIs are geo-blocked in Australia (ACMA)
 * - Manifold has open API, no auth, no geo-restrictions
 * - Real prediction markets with real probabilities
 * - When Si moves to SE Asia, swap to Polymarket with minimal code change
 */

// Disable SSL rejection for corporate proxy environments
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export interface MarketData {
  id: string;
  question: string;
  description: string;
  url: string;
  probability: number | null;       // 0-1 for binary, null for multi
  volume: number;
  liquidity: number;
  closeTime: string | null;
  isResolved: boolean;
  resolution: string | null;        // 'YES' | 'NO' | 'MKT' | null
  creatorName: string;
  category: string;                 // tagged by us: 'sports' | 'crypto' | 'politics' | 'tech' | 'other'
  source: 'manifold';               // future: 'polymarket' | 'kalshi'
}

export interface MarketSearchOptions {
  term?: string;
  filter?: 'open' | 'closed' | 'resolved' | 'all';
  sort?: 'newest' | 'score' | 'liquidity';
  limit?: number;
}

const MANIFOLD_API = 'https://api.manifold.markets/v0';

// Category detection from question text
function categorize(question: string): string {
  const q = question.toLowerCase();
  if (/ufc|mma|boxing|fight|belt|knockout|submission|wrestling|nba|nfl|premier league|world cup|super bowl|sport/i.test(q)) return 'sports';
  if (/bitcoin|btc|ethereum|eth|crypto|solana|sol|defi|memecoin|token|blockchain|binance|coinbase/i.test(q)) return 'crypto';
  if (/trump|biden|election|congress|senate|democrat|republican|governor|president|impeach|political|vote/i.test(q)) return 'politics';
  if (/ai|gpt|openai|anthropic|google|apple|microsoft|meta|model|agi|llm|tech/i.test(q)) return 'tech';
  return 'other';
}

function parseManifoldMarket(m: any): MarketData {
  return {
    id: m.id,
    question: m.question || '',
    description: (m.textDescription || '').slice(0, 500),
    url: m.url || `https://manifold.markets/${m.creatorUsername}/${m.slug}`,
    probability: m.probability ?? null,
    volume: m.volume || 0,
    liquidity: m.totalLiquidity || 0,
    closeTime: m.closeTime ? new Date(m.closeTime).toISOString() : null,
    isResolved: m.isResolved || false,
    resolution: m.resolution || null,
    creatorName: m.creatorName || 'unknown',
    category: categorize(m.question || ''),
    source: 'manifold',
  };
}

export class PriceFeedService {
  private cache: Map<string, { data: MarketData; fetchedAt: number }> = new Map();
  private cacheTTL = 5 * 60 * 1000; // 5 min cache

  /**
   * Search for markets by term
   */
  async searchMarkets(options: MarketSearchOptions = {}): Promise<MarketData[]> {
    const params = new URLSearchParams();
    if (options.term) params.set('term', options.term);
    if (options.filter) params.set('filter', options.filter || 'open');
    if (options.sort) params.set('sort', options.sort || 'newest');
    params.set('limit', String(options.limit || 10));

    const url = `${MANIFOLD_API}/search-markets?${params}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Manifold API error: ${res.status}`);
    const data = await res.json();
    return (data as any[]).map(parseManifoldMarket);
  }

  /**
   * Get a specific market by ID
   */
  async getMarket(marketId: string): Promise<MarketData> {
    const cached = this.cache.get(marketId);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) {
      return cached.data;
    }

    const res = await fetch(`${MANIFOLD_API}/market/${marketId}`);
    if (!res.ok) throw new Error(`Market ${marketId} not found: ${res.status}`);
    const raw = await res.json();
    const market = parseManifoldMarket(raw);
    this.cache.set(marketId, { data: market, fetchedAt: Date.now() });
    return market;
  }

  /**
   * Get markets curated for The Academy's agents by category
   */
  async getMarketsForAgents(): Promise<{
    sports: MarketData[];
    crypto: MarketData[];
    politics: MarketData[];
    tech: MarketData[];
  }> {
    const [sports, crypto, politics, tech] = await Promise.all([
      this.searchMarkets({ term: 'UFC OR MMA OR boxing OR NBA OR NFL', filter: 'open', limit: 5 }),
      this.searchMarkets({ term: 'bitcoin OR ethereum OR crypto OR solana', filter: 'open', limit: 5 }),
      this.searchMarkets({ term: 'Trump OR election OR congress', filter: 'open', limit: 5 }),
      this.searchMarkets({ term: 'AI OR OpenAI OR Anthropic OR AGI', filter: 'open', limit: 5 }),
    ]);
    return { sports, crypto, politics, tech };
  }

  /**
   * Check resolution status for tracked markets
   */
  async checkResolutions(marketIds: string[]): Promise<{ id: string; resolved: boolean; resolution: string | null }[]> {
    const results = [];
    for (const id of marketIds) {
      try {
        const market = await this.getMarket(id);
        results.push({ id, resolved: market.isResolved, resolution: market.resolution });
      } catch (e: any) {
        console.error(`Failed to check ${id}: ${e.message}`);
        results.push({ id, resolved: false, resolution: null });
      }
    }
    return results;
  }

  /**
   * Format markets for injection into agent prompts
   */
  formatForPrompt(markets: MarketData[], agentCategory?: string): string {
    const relevant = agentCategory
      ? markets.filter(m => m.category === agentCategory || m.category === 'other')
      : markets;

    if (relevant.length === 0) return 'No active markets available.';

    return relevant.map(m => {
      const prob = m.probability !== null ? `${(m.probability * 100).toFixed(0)}% YES` : 'multi-outcome';
      const closes = m.closeTime ? `closes ${new Date(m.closeTime).toLocaleDateString()}` : 'no close date';
      return `[${m.id.slice(0, 8)}] ${m.question}\n  ${prob} | $${m.liquidity.toFixed(0)} liquidity | ${closes}`;
    }).join('\n\n');
  }
}

// Quick test
if (require.main === module) {
  (async () => {
    const feed = new PriceFeedService();
    console.log('=== Fetching markets for Academy agents ===\n');

    const markets = await feed.getMarketsForAgents();

    console.log('🥊 SPORTS (Prophet territory):');
    markets.sports.forEach(m => {
      const prob = m.probability !== null ? `${(m.probability * 100).toFixed(0)}%` : 'multi';
      console.log(`  ${prob} | ${m.question.slice(0, 70)}`);
    });

    console.log('\n₿ CRYPTO (Rei territory):');
    markets.crypto.forEach(m => {
      const prob = m.probability !== null ? `${(m.probability * 100).toFixed(0)}%` : 'multi';
      console.log(`  ${prob} | ${m.question.slice(0, 70)}`);
    });

    console.log('\n🏛️ POLITICS (Prophet + Jinx territory):');
    markets.politics.forEach(m => {
      const prob = m.probability !== null ? `${(m.probability * 100).toFixed(0)}%` : 'multi';
      console.log(`  ${prob} | ${m.question.slice(0, 70)}`);
    });

    console.log('\n🤖 TECH (Sakura + Wren territory):');
    markets.tech.forEach(m => {
      const prob = m.probability !== null ? `${(m.probability * 100).toFixed(0)}%` : 'multi';
      console.log(`  ${prob} | ${m.question.slice(0, 70)}`);
    });

    console.log('\n=== Prompt format sample ===\n');
    const all = [...markets.sports, ...markets.crypto, ...markets.politics];
    console.log(feed.formatForPrompt(all.slice(0, 5)));
  })().catch(console.error);
}
