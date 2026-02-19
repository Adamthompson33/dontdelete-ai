/**
 * ArbitrageScanner — Sakura's Tool
 * 
 * Finds mispricings across Manifold Markets:
 * 1. Related market spreads (e.g. BTC $55K vs $60K — must be consistent)
 * 2. Stale prices (high volume shift without probability update)
 * 3. Category clustering (find groups of related markets, detect inconsistencies)
 * 
 * Future: Cross-platform (Manifold vs Polymarket via US VPS)
 * 
 * No opinions. No personality. Just math.
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const MANIFOLD_API = 'https://api.manifold.markets/v0';

export interface ArbitrageOpportunity {
  type: 'spread' | 'stale' | 'cluster' | 'bounded';
  description: string;
  markets: { id: string; question: string; prob: number; volume: number; liquidity: number; url: string }[];
  expectedEdge: number;       // estimated edge in percentage points
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

export interface ScanResult {
  scannedAt: string;
  marketsScanned: number;
  opportunitiesFound: number;
  opportunities: ArbitrageOpportunity[];
}

interface ManifoldMarket {
  id: string;
  question: string;
  probability?: number;
  volume: number;
  totalLiquidity: number;
  isResolved: boolean;
  resolution?: string;
  closeTime?: number;
  url: string;
  slug: string;
  creatorUsername: string;
  lastBetTime?: number;
  lastUpdatedTime?: number;
}

async function fetchMarkets(term: string, limit = 20): Promise<ManifoldMarket[]> {
  const params = new URLSearchParams({
    term,
    filter: 'open',
    sort: 'liquidity',
    limit: String(limit),
  });
  const res = await fetch(`${MANIFOLD_API}/search-markets?${params}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<ManifoldMarket[]>;
}

async function fetchMarketById(id: string): Promise<ManifoldMarket> {
  const res = await fetch(`${MANIFOLD_API}/market/${id}`);
  if (!res.ok) throw new Error(`Market ${id} not found`);
  return res.json() as Promise<ManifoldMarket>;
}

export class ArbitrageScanner {

  /**
   * Full scan: search multiple categories, find all opportunities
   */
  async scan(): Promise<ScanResult> {
    console.log('🔍 Sakura\'s Arbitrage Scanner initializing...\n');

    const categories = [
      { term: 'Bitcoin BTC price', label: 'BTC Price Levels' },
      { term: 'Bitcoin above below 2026', label: 'BTC 2026 Targets' },
      { term: 'BTC $50K $60K $80K $100K', label: 'BTC Round Numbers' },
      { term: 'Ethereum ETH price', label: 'ETH Price Levels' },
      { term: 'Trump president 2026', label: 'Trump Politics' },
      { term: 'AI bubble artificial intelligence', label: 'AI/Tech' },
      { term: 'Super Bowl NFL', label: 'NFL' },
      { term: 'UFC MMA fight', label: 'UFC/MMA' },
    ];

    const allMarkets: ManifoldMarket[] = [];
    
    for (const cat of categories) {
      try {
        const markets = await fetchMarkets(cat.term, 15);
        const open = markets.filter(m => !m.isResolved && m.probability != null);
        console.log(`  📂 ${cat.label}: ${open.length} open markets`);
        allMarkets.push(...open);
        await new Promise(r => setTimeout(r, 300)); // rate limit
      } catch (e: any) {
        console.log(`  ⚠️ ${cat.label}: ${e.message}`);
      }
    }

    // Deduplicate by ID
    const seen = new Set<string>();
    const unique = allMarkets.filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    console.log(`\n  Total unique markets: ${unique.length}\n`);

    const opportunities: ArbitrageOpportunity[] = [];

    // Strategy 1a: Bounded price levels (BTC at $55K vs $60K etc.)
    const bounded = this.findBoundedSpreads(unique);
    opportunities.push(...bounded);

    // Strategy 1b: Price curve analysis (monotonic check)
    const curve = this.findPriceCurveViolations(unique);
    opportunities.push(...curve);

    // Strategy 2: Stale price detection
    const stale = this.findStalePrices(unique);
    opportunities.push(...stale);

    // Strategy 3: Correlated market clusters
    const clusters = this.findClusterMispricings(unique);
    opportunities.push(...clusters);

    return {
      scannedAt: new Date().toISOString(),
      marketsScanned: unique.length,
      opportunitiesFound: opportunities.length,
      opportunities: opportunities.sort((a, b) => b.expectedEdge - a.expectedEdge),
    };
  }

  /**
   * Strategy 1: Bounded spreads
   * If "BTC below $55K" is at X% and "BTC below $60K" is at Y%,
   * then Y >= X (mathematically required). If not, arbitrage exists.
   * Also: the SPREAD between them should be reasonable.
   */
  findBoundedSpreads(markets: ManifoldMarket[]): ArbitrageOpportunity[] {
    const opps: ArbitrageOpportunity[] = [];
    const q = markets.map(m => ({ ...m, qLower: m.question.toLowerCase() }));

    // Find price-level pairs
    const pricePatterns = [
      { asset: 'Bitcoin', regex: /bitcoin.*?\$?([\d,]+)k?\b/i, normalize: (s: string) => {
        const n = parseFloat(s.replace(/,/g, ''));
        return n < 1000 ? n * 1000 : n; // handle "55K" vs "55000"
      }},
      { asset: 'Ethereum', regex: /ethereum.*?\$?([\d,]+)\b/i, normalize: (s: string) => parseFloat(s.replace(/,/g, '')) },
    ];

    for (const pattern of pricePatterns) {
      const priceMarkets: { market: ManifoldMarket; price: number; direction: 'above' | 'below' }[] = [];
      
      const conditionalFilter = /first.*then|if.*then|if.*will|and then|before.*after|before.*and|given that|conditional|go below.*and|drop.*recover|path/i;

      for (const m of q) {
        if (conditionalFilter.test(m.question)) continue; // skip path-dependent markets
        const match = m.question.match(pattern.regex);
        if (!match) continue;
        const price = pattern.normalize(match[1]);
        if (isNaN(price) || price < 5000) continue; // skip years/tiny numbers
        
        const isAbove = /above|over|higher|exceed|reach/i.test(m.question);
        const isBelow = /below|under|lower|drop|fall|crash/i.test(m.question);
        if (!isAbove && !isBelow) continue;

        priceMarkets.push({
          market: m,
          price,
          direction: isAbove ? 'above' : 'below',
        });
      }

      // Sort by price and check consistency
      const belowMarkets = priceMarkets.filter(m => m.direction === 'below').sort((a, b) => a.price - b.price);
      const aboveMarkets = priceMarkets.filter(m => m.direction === 'above').sort((a, b) => a.price - b.price);

      // For "below" markets: P(below $55K) should be <= P(below $60K) <= P(below $65K)
      for (let i = 0; i < belowMarkets.length - 1; i++) {
        const lower = belowMarkets[i];
        const higher = belowMarkets[i + 1];
        
        if (lower.market.probability == null || higher.market.probability == null) continue;
        
        // P(below lower price) should be <= P(below higher price)
        if (lower.market.probability > higher.market.probability + 0.02) {
          const edge = (lower.market.probability - higher.market.probability) * 100;
          opps.push({
            type: 'bounded',
            description: `${pattern.asset} bounded violation: P(below $${lower.price}) > P(below $${higher.price})`,
            markets: [
              this.formatMarket(lower.market),
              this.formatMarket(higher.market),
            ],
            expectedEdge: edge,
            confidence: edge > 5 ? 'high' : 'medium',
            reasoning: `P(below $${lower.price.toLocaleString()}) = ${(lower.market.probability * 100).toFixed(1)}% should be ≤ P(below $${higher.price.toLocaleString()}) = ${(higher.market.probability * 100).toFixed(1)}%. Spread: ${edge.toFixed(1)}pp. Buy NO on lower, YES on higher.`,
          });
        }

        // Also check if the spread is too wide or too narrow
        const spread = higher.market.probability - lower.market.probability;
        const priceGap = (higher.price - lower.price) / higher.price;
        
        if (spread > 0 && spread < priceGap * 0.1 && higher.market.probability > 0.3) {
          opps.push({
            type: 'spread',
            description: `${pattern.asset} compressed spread: $${lower.price.toLocaleString()} vs $${higher.price.toLocaleString()}`,
            markets: [
              this.formatMarket(lower.market),
              this.formatMarket(higher.market),
            ],
            expectedEdge: priceGap * 100 - spread * 100,
            confidence: 'low',
            reasoning: `Price gap is ${(priceGap * 100).toFixed(1)}% but probability spread is only ${(spread * 100).toFixed(1)}pp. One of these is mispriced.`,
          });
        }
      }

      // For "above" markets: P(above $55K) should be >= P(above $60K)
      for (let i = 0; i < aboveMarkets.length - 1; i++) {
        const lower = aboveMarkets[i];
        const higher = aboveMarkets[i + 1];
        
        if (lower.market.probability == null || higher.market.probability == null) continue;
        
        if (higher.market.probability > lower.market.probability + 0.02) {
          const edge = (higher.market.probability - lower.market.probability) * 100;
          opps.push({
            type: 'bounded',
            description: `${pattern.asset} bounded violation: P(above $${higher.price}) > P(above $${lower.price})`,
            markets: [
              this.formatMarket(lower.market),
              this.formatMarket(higher.market),
            ],
            expectedEdge: edge,
            confidence: edge > 5 ? 'high' : 'medium',
            reasoning: `P(above $${higher.price.toLocaleString()}) = ${(higher.market.probability * 100).toFixed(1)}% should be ≤ P(above $${lower.price.toLocaleString()}) = ${(lower.market.probability * 100).toFixed(1)}%. Spread: ${edge.toFixed(1)}pp.`,
          });
        }
      }
    }

    return opps;
  }

  /**
   * Strategy 1b: Price curve analysis
   * For a single asset (e.g. BTC), collect all price-level markets and check
   * that probabilities form a monotonically decreasing/increasing curve.
   * Any deviation = mispricing.
   */
  findPriceCurveViolations(markets: ManifoldMarket[]): ArbitrageOpportunity[] {
    const opps: ArbitrageOpportunity[] = [];

    // Filter to simple "will X be above/below $Y" markets — exclude conditionals
    const conditionalPatterns = /first.*then|if.*then|if.*will|and then|before.*after|before.*and|given that|conditional|go below.*and|drop.*recover|path/i;

    const btcAbove: { market: ManifoldMarket; price: number }[] = [];
    const btcBelow: { market: ManifoldMarket; price: number }[] = [];

    for (const m of markets) {
      if (m.probability == null) continue;
      if (conditionalPatterns.test(m.question)) continue; // skip conditionals

      const q = m.question.toLowerCase();
      if (!/bitcoin|btc/i.test(q)) continue;

      // Extract dollar amount
      const priceMatch = m.question.match(/\$\s*([\d,]+\.?\d*)\s*(k|K)?/);
      if (!priceMatch) continue;
      let price = parseFloat(priceMatch[1].replace(/,/g, ''));
      if (priceMatch[2]) price *= 1000;
      if (price < 1000) price *= 1000; // handle "55" meaning "$55K"

      const isAbove = /above|over|higher|exceed|reach|hit/i.test(q) && !/below|under|drop|fall|crash/i.test(q);
      const isBelow = /below|under|drop|fall|crash/i.test(q) && !/above|over|higher/i.test(q);

      if (isAbove) btcAbove.push({ market: m, price });
      else if (isBelow) btcBelow.push({ market: m, price });
    }

    // BTC "above" markets: higher price → lower probability (monotonically decreasing)
    if (btcAbove.length >= 2) {
      btcAbove.sort((a, b) => a.price - b.price);
      console.log('\n  📈 BTC "above" price curve:');
      for (const m of btcAbove) {
        console.log(`     $${m.price.toLocaleString()}: ${((m.market.probability ?? 0) * 100).toFixed(1)}% YES | $${m.market.totalLiquidity.toFixed(0)} liq`);
      }

      for (let i = 0; i < btcAbove.length - 1; i++) {
        const lower = btcAbove[i];
        const higher = btcAbove[i + 1];
        if (lower.market.probability == null || higher.market.probability == null) continue;

        // P(above lower price) should be >= P(above higher price)
        if (higher.market.probability > lower.market.probability + 0.02) {
          const edge = (higher.market.probability - lower.market.probability) * 100;
          opps.push({
            type: 'bounded',
            description: `BTC curve violation: P(above $${higher.price.toLocaleString()}) > P(above $${lower.price.toLocaleString()})`,
            markets: [this.formatMarket(lower.market), this.formatMarket(higher.market)],
            expectedEdge: edge,
            confidence: edge > 5 ? 'high' : 'medium',
            reasoning: `P(above $${higher.price.toLocaleString()}) = ${(higher.market.probability * 100).toFixed(1)}% but P(above $${lower.price.toLocaleString()}) = ${(lower.market.probability * 100).toFixed(1)}%. Higher target can't have higher probability. Trade: YES on lower, NO on higher.`,
          });
        }

        // Check for suspiciously large gaps in the curve
        const priceDiffPct = (higher.price - lower.price) / lower.price;
        const probDiff = (lower.market.probability ?? 0) - (higher.market.probability ?? 0);
        
        if (priceDiffPct > 0.1 && probDiff < 0.02 && lower.market.probability! > 0.1 && higher.market.probability! > 0.1) {
          opps.push({
            type: 'spread',
            description: `BTC flat curve: $${lower.price.toLocaleString()} → $${higher.price.toLocaleString()} with almost no probability drop`,
            markets: [this.formatMarket(lower.market), this.formatMarket(higher.market)],
            expectedEdge: priceDiffPct * 20, // rough
            confidence: 'medium',
            reasoning: `${(priceDiffPct * 100).toFixed(0)}% price increase but only ${(probDiff * 100).toFixed(1)}pp probability drop. Curve should be steeper. One market is mispriced.`,
          });
        }
      }
    }

    // BTC "below" markets: higher price → higher probability (monotonically increasing)
    if (btcBelow.length >= 2) {
      btcBelow.sort((a, b) => a.price - b.price);
      console.log('\n  📉 BTC "below" price curve:');
      for (const m of btcBelow) {
        console.log(`     $${m.price.toLocaleString()}: ${((m.market.probability ?? 0) * 100).toFixed(1)}% YES | $${m.market.totalLiquidity.toFixed(0)} liq`);
      }

      for (let i = 0; i < btcBelow.length - 1; i++) {
        const lower = btcBelow[i];
        const higher = btcBelow[i + 1];
        if (lower.market.probability == null || higher.market.probability == null) continue;

        // P(below lower price) should be <= P(below higher price)
        if (lower.market.probability > higher.market.probability + 0.02) {
          const edge = (lower.market.probability - higher.market.probability) * 100;
          opps.push({
            type: 'bounded',
            description: `BTC curve violation: P(below $${lower.price.toLocaleString()}) > P(below $${higher.price.toLocaleString()})`,
            markets: [this.formatMarket(lower.market), this.formatMarket(higher.market)],
            expectedEdge: edge,
            confidence: edge > 5 ? 'high' : 'medium',
            reasoning: `P(below $${lower.price.toLocaleString()}) = ${(lower.market.probability * 100).toFixed(1)}% but P(below $${higher.price.toLocaleString()}) = ${(higher.market.probability * 100).toFixed(1)}%. Lower target can't have higher probability. Trade: NO on lower, YES on higher.`,
          });
        }
      }
    }

    return opps;
  }

  /**
   * Strategy 2: Stale prices
   * Markets with high liquidity but no recent bets — price may not reflect new info
   */
  findStalePrices(markets: ManifoldMarket[]): ArbitrageOpportunity[] {
    const opps: ArbitrageOpportunity[] = [];
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    for (const m of markets) {
      if (!m.lastBetTime || m.probability == null) continue;
      
      const staleness = now - m.lastBetTime;
      const isStale = staleness > 3 * ONE_DAY; // no bets in 3+ days
      const hasLiquidity = m.totalLiquidity >= 200;
      const hasVolume = m.volume >= 500;
      
      // High liquidity + high volume + no recent activity = potential stale price
      if (isStale && hasLiquidity && hasVolume) {
        const daysStale = Math.floor(staleness / ONE_DAY);
        opps.push({
          type: 'stale',
          description: `Stale price: "${m.question.slice(0, 60)}..." (${daysStale} days, $${m.totalLiquidity.toFixed(0)} liq)`,
          markets: [this.formatMarket(m)],
          expectedEdge: Math.min(daysStale * 0.5, 10), // rough estimate
          confidence: 'low',
          reasoning: `No bets in ${daysStale} days despite $${m.totalLiquidity.toFixed(0)} liquidity and $${m.volume.toFixed(0)} volume. Price at ${(m.probability * 100).toFixed(0)}% may not reflect current information. Research needed.`,
        });
      }
    }

    return opps;
  }

  /**
   * Strategy 3: Cluster mispricings
   * Find groups of related markets where probabilities are logically inconsistent
   */
  findClusterMispricings(markets: ManifoldMarket[]): ArbitrageOpportunity[] {
    const opps: ArbitrageOpportunity[] = [];

    // Find "will X happen by [date]" clusters — shorter timeframe should have lower prob
    const timeframeGroups: Map<string, { market: ManifoldMarket; closeTime: number }[]> = new Map();
    
    for (const m of markets) {
      if (!m.closeTime || m.probability == null) continue;
      
      // Extract the core question (strip timeframe)
      const core = m.question
        .replace(/\b(in |by |before |during |this )?(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi, '')
        .replace(/\b20\d\d\b/g, '')
        .replace(/\b(q[1-4]|h[12])\b/gi, '')
        .trim()
        .toLowerCase()
        .slice(0, 40);
      
      if (!timeframeGroups.has(core)) timeframeGroups.set(core, []);
      timeframeGroups.get(core)!.push({ market: m, closeTime: m.closeTime });
    }

    // Check each group for temporal consistency
    for (const [core, group] of timeframeGroups) {
      if (group.length < 2) continue;
      group.sort((a, b) => a.closeTime - b.closeTime);

      for (let i = 0; i < group.length - 1; i++) {
        const earlier = group[i];
        const later = group[i + 1];
        
        if (earlier.market.probability == null || later.market.probability == null) continue;
        
        // Market that closes earlier should generally have lower or equal probability
        // (less time for event to happen)
        if (earlier.market.probability > later.market.probability + 0.05) {
          const edge = (earlier.market.probability - later.market.probability) * 100;
          opps.push({
            type: 'cluster',
            description: `Temporal inconsistency: earlier close has higher probability`,
            markets: [
              this.formatMarket(earlier.market),
              this.formatMarket(later.market),
            ],
            expectedEdge: edge,
            confidence: 'medium',
            reasoning: `"${earlier.market.question.slice(0, 40)}..." closes sooner at ${(earlier.market.probability * 100).toFixed(0)}% vs "${later.market.question.slice(0, 40)}..." at ${(later.market.probability * 100).toFixed(0)}%. Shorter timeframe should have lower probability. Spread: ${edge.toFixed(1)}pp.`,
          });
        }
      }
    }

    return opps;
  }

  private formatMarket(m: ManifoldMarket) {
    return {
      id: m.id,
      question: m.question,
      prob: m.probability ?? 0,
      volume: m.volume,
      liquidity: m.totalLiquidity,
      url: m.url || `https://manifold.markets/${m.creatorUsername}/${m.slug}`,
    };
  }
}

// ═══ CLI ═══
if (require.main === module) {
  (async () => {
    const scanner = new ArbitrageScanner();
    const result = await scanner.scan();

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  SAKURA'S ARBITRAGE REPORT`);
    console.log(`  ${result.marketsScanned} markets scanned | ${result.opportunitiesFound} opportunities`);
    console.log(`${'═'.repeat(60)}\n`);

    if (result.opportunities.length === 0) {
      console.log('  No arbitrage opportunities detected. Markets are efficient (for now).\n');
    }

    for (const opp of result.opportunities) {
      const icon = opp.confidence === 'high' ? '🔴' : opp.confidence === 'medium' ? '🟡' : '⚪';
      console.log(`${icon} [${opp.type.toUpperCase()}] ${opp.description}`);
      console.log(`   Edge: ~${opp.expectedEdge.toFixed(1)}pp | Confidence: ${opp.confidence}`);
      console.log(`   ${opp.reasoning}`);
      for (const m of opp.markets) {
        console.log(`   📊 ${(m.prob * 100).toFixed(0)}% | $${m.liquidity.toFixed(0)} liq | ${m.question.slice(0, 60)}`);
        console.log(`      ${m.url}`);
      }
      console.log();
    }

    // Save report
    const fs = require('fs');
    const path = require('path');
    const outDir = path.join(__dirname, '..', '..', 'arb-reports');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const outFile = path.join(outDir, `${date}.json`);
    fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
    console.log(`📁 Report saved: ${outFile}`);
  })().catch(console.error);
}
