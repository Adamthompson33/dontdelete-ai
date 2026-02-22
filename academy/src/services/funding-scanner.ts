/**
 * FundingScanner — Rei's Tool
 * 
 * Scans HyperLiquid perpetual futures funding rates.
 * Flags coins where basis trade (long spot + short perp or vice versa) generates yield.
 * Logs paper trades. Tracks cumulative P&L.
 * 
 * HyperLiquid settles funding every hour (not 8h like CEXs).
 * Cap is 4%/hour — extreme yield during momentum.
 * 
 * No wallet. No auth. No geo-block. Read-only API calls.
 * No opinions. No numerology. Just math.
 */

import * as fs from 'fs';
import * as path from 'path';

const HL_API = 'https://api.hyperliquid.xyz/info';

// ═══ Interfaces ═══

export interface FundingOpportunity {
  coin: string;
  currentRate: number;        // hourly rate from API
  annualizedRate: number;     // rate × 24 × 365
  direction: 'LONG_BASIS' | 'SHORT_BASIS';
  markPrice: number;
  oraclePrice: number;
  basis: number;              // (markPx - oraclePx) / oraclePx — The Surgeon's edge
  premium: number;
  openInterest: number;       // in coin units
  openInterestUsd: number;
  dailyVolume: number;
  priceChange24h: number;     // % change from prevDayPx
  volatile: boolean;          // true if |priceChange24h| > 20% — basis trade unsafe
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

export interface PaperTrade {
  id: string;
  coin: string;
  direction: 'LONG_BASIS' | 'SHORT_BASIS';
  entryTime: number;
  entryRate: number;
  notionalSize: number;       // USD
  cumulativeFunding: number;  // total funding collected
  lastCollectedAt: number;    // timestamp of last funding collection
  isOpen: boolean;
  exitTime?: number;
  exitReason?: string;
  fees: number;               // cumulative fees (entry + exit)
}

export interface PaperTradeState {
  trades: PaperTrade[];
  cumulativePnl: number;
  lastScanAt: number;
}

export interface ScanResult {
  scannedAt: string;
  coinsScanned: number;
  opportunitiesFound: number;
  opportunities: FundingOpportunity[];
  paperPnl: number;
  openTradeCount: number;
}

// ═══ Constants ═══

const THRESHOLD_APR = 0.20;         // 20% annualized minimum to flag
const MIN_VOLUME_USD = 100_000;     // $100K daily volume
const MIN_OI_USD = 50_000;          // $50K open interest
const PAPER_SIZE_USD = 1_000;       // $1K per paper trade
const MAX_OPEN_TRADES = 5;
const ENTRY_MIN_APR = 0.20;         // 20% APR to enter paper trade (catches XMR-tier)
const ENTRY_MIN_HOURS = 6;          // must be elevated for 6+ hours (no spike chasing)
const EXIT_APR = 0.10;              // exit when rate drops below 10% APR
const MAX_TRADE_HOURS = 72;         // max 72 hours per trade
const TAKER_FEE = 0.00025;          // 0.025% per side

const REPORTS_DIR = path.join(__dirname, '..', '..', 'funding-reports');
const STATE_FILE = path.join(REPORTS_DIR, 'paper-trades.json');

// ═══ Scanner ═══

export class FundingScanner {
  private state: PaperTradeState;

  constructor() {
    this.state = this.loadState();
  }

  // ── Core scan ──

  async scan(): Promise<FundingOpportunity[]> {
    const response = await fetch(HL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    });

    if (!response.ok) {
      throw new Error(`HyperLiquid API error: ${response.status}`);
    }

    const data = await response.json();
    const universe: { name: string; szDecimals: number; maxLeverage: number }[] = data[0].universe;
    const contexts: any[] = data[1];

    const opportunities: FundingOpportunity[] = [];

    for (let i = 0; i < universe.length; i++) {
      const coin = universe[i].name;
      const ctx = contexts[i];

      const rate = parseFloat(ctx.funding);
      const annualized = rate * 24 * 365;
      const markPx = parseFloat(ctx.markPx);
      const oraclePx = parseFloat(ctx.oraclePx);
      const prevDayPx = parseFloat(ctx.prevDayPx);
      const premium = parseFloat(ctx.premium);
      const oi = parseFloat(ctx.openInterest);
      const vol = parseFloat(ctx.dayNtlVlm);
      const oiUsd = oi * markPx;

      // Mark/index basis — The Surgeon's key variable
      const basis = oraclePx > 0 ? (markPx - oraclePx) / oraclePx : 0;

      // Price change from previous day
      const priceChange24h = prevDayPx > 0 ? (markPx - prevDayPx) / prevDayPx : 0;
      const volatile = Math.abs(priceChange24h) > 0.20; // >20% move = death spiral or pump

      // Filter: rate must be significant
      if (Math.abs(annualized) < THRESHOLD_APR) continue;

      // Filter: must have real liquidity
      if (vol < MIN_VOLUME_USD) continue;

      // Filter: meaningful open interest
      if (oiUsd < MIN_OI_USD) continue;

      // Direction
      const direction: 'LONG_BASIS' | 'SHORT_BASIS' = rate > 0 ? 'LONG_BASIS' : 'SHORT_BASIS';

      // Confidence — volatile tokens and extreme rates get downgraded
      const distressed = Math.abs(annualized) > 5.0; // >500% APR = distressed, not an opportunity
      let confidence: 'high' | 'medium' | 'low' = 'low';
      if (volatile || distressed) {
        confidence = 'low'; // Crash/pump/distressed filter — basis trade unsafe
      } else if (Math.abs(annualized) > 0.50 && vol > 1_000_000) {
        confidence = 'high';
      } else if (Math.abs(annualized) > 0.30 && vol > 500_000) {
        confidence = 'medium';
      }

      // Surgeon dual-condition: negative basis + extreme negative funding = high conviction short entry
      const surgeonSignal = basis < -0.001 && rate < 0 && Math.abs(annualized) >= 0.50;

      opportunities.push({
        coin,
        currentRate: rate,
        annualizedRate: annualized,
        direction,
        markPrice: markPx,
        oraclePrice: oraclePx,
        basis,
        premium,
        openInterest: oi,
        openInterestUsd: oiUsd,
        dailyVolume: vol,
        priceChange24h,
        volatile,
        confidence,
        reasoning: `${coin} funding at ${(annualized * 100).toFixed(1)}% APR. ` +
          `${direction === 'LONG_BASIS' ? 'Longs paying shorts' : 'Shorts paying longs'}. ` +
          `Basis: ${(basis * 100).toFixed(3)}% (mark ${basis < 0 ? 'below' : 'above'} index). ` +
          `${surgeonSignal ? '🔪 SURGEON SIGNAL: negative basis + extreme negative funding. ' : ''}` +
          `${volatile ? `⚠️ VOLATILE (${(priceChange24h * 100).toFixed(1)}% 24h move) — basis trade unsafe. ` : ''}` +
          `${distressed ? `⚠️ DISTRESSED (${(annualized * 100).toFixed(0)}% APR) — likely death spiral, not real edge. ` : ''}` +
          `Premium: ${(premium * 100).toFixed(3)}%. ` +
          `OI: $${(oiUsd / 1e6).toFixed(1)}M. Vol: $${(vol / 1e6).toFixed(1)}M.`,
      });
    }

    opportunities.sort((a, b) => Math.abs(b.annualizedRate) - Math.abs(a.annualizedRate));
    return opportunities;
  }

  // ── Historical rates ──

  async getHistoricalRates(coin: string, hours: number = 24): Promise<{ rate: number; time: number }[]> {
    const startTime = Date.now() - (hours * 60 * 60 * 1000);
    const rates: { rate: number; time: number }[] = [];
    let cursor = startTime;

    // Paginate — max 500 per request
    while (cursor < Date.now()) {
      const response = await fetch(HL_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'fundingHistory', coin, startTime: cursor }),
      });

      if (!response.ok) break;

      const data: { fundingRate: string; time: number }[] = await response.json();
      if (data.length === 0) break;

      for (const d of data) {
        rates.push({ rate: parseFloat(d.fundingRate), time: d.time });
      }

      cursor = data[data.length - 1].time + 1;
      await new Promise(r => setTimeout(r, 200)); // rate limit
    }

    return rates;
  }

  // ── Paper trading ──

  async openPaperTrade(opp: FundingOpportunity): Promise<PaperTrade | null> {
    const openCount = this.state.trades.filter(t => t.isOpen).length;
    if (openCount >= MAX_OPEN_TRADES) return null;

    // Don't double up on same coin
    if (this.state.trades.some(t => t.isOpen && t.coin === opp.coin)) return null;

    const entryFee = PAPER_SIZE_USD * TAKER_FEE;
    const trade: PaperTrade = {
      id: `${opp.coin}-${Date.now()}`,
      coin: opp.coin,
      direction: opp.direction,
      entryTime: Date.now(),
      entryRate: opp.currentRate,
      notionalSize: PAPER_SIZE_USD,
      cumulativeFunding: 0,
      lastCollectedAt: Date.now(),
      isOpen: true,
      fees: entryFee,
    };

    this.state.trades.push(trade);
    this.saveState();
    return trade;
  }

  async updatePaperTrades(): Promise<void> {
    const openTrades = this.state.trades.filter(t => t.isOpen);
    if (openTrades.length === 0) return;

    // Get current rates for all open trade coins
    const opportunities = await this.scan();
    const rateMap = new Map(opportunities.map(o => [o.coin, o]));

    for (const trade of openTrades) {
      const current = rateMap.get(trade.coin);
      const hoursSinceCollection = (Date.now() - trade.lastCollectedAt) / (1000 * 60 * 60);
      const hoursSinceEntry = (Date.now() - trade.entryTime) / (1000 * 60 * 60);

      if (!current) {
        // Coin disappeared from scan (rate dropped below threshold) — close
        this.closePaperTrade(trade, 'coin_dropped_from_scan');
        continue;
      }

      // Collect funding for elapsed hours
      if (hoursSinceCollection >= 1) {
        const hoursToCollect = Math.floor(hoursSinceCollection);
        // Use current rate as approximation (real system would track each hour)
        const funding = trade.notionalSize * Math.abs(current.currentRate) * hoursToCollect;
        trade.cumulativeFunding += funding;
        trade.lastCollectedAt = Date.now();
      }

      // Exit checks
      const currentApr = Math.abs(current.annualizedRate);

      if (currentApr < EXIT_APR) {
        this.closePaperTrade(trade, `rate_below_threshold (${(currentApr * 100).toFixed(1)}% APR)`);
      } else if (
        (trade.direction === 'LONG_BASIS' && current.currentRate < 0) ||
        (trade.direction === 'SHORT_BASIS' && current.currentRate > 0)
      ) {
        this.closePaperTrade(trade, 'rate_flipped_sign');
      } else if (hoursSinceEntry > MAX_TRADE_HOURS) {
        this.closePaperTrade(trade, 'max_duration_72h');
      }
    }

    this.recalcPnl();
    this.saveState();
  }

  private closePaperTrade(trade: PaperTrade, reason: string): void {
    trade.isOpen = false;
    trade.exitTime = Date.now();
    trade.exitReason = reason;
    trade.fees += trade.notionalSize * TAKER_FEE; // exit fee
  }

  private recalcPnl(): void {
    this.state.cumulativePnl = this.state.trades.reduce((sum, t) => {
      return sum + t.cumulativeFunding - t.fees;
    }, 0);
  }

  // ── Auto paper trade logic ──

  async evaluateAndTrade(opportunities: FundingOpportunity[]): Promise<string[]> {
    const actions: string[] = [];

    for (const opp of opportunities) {
      if (opp.confidence === 'low') continue;
      if (opp.volatile) continue; // Never paper-trade death spirals or pumps
      if (Math.abs(opp.annualizedRate) < ENTRY_MIN_APR) continue;

      // Check persistence — need 3+ consecutive hours above threshold
      try {
        const history = await this.getHistoricalRates(opp.coin, 6);
        const recentAboveThreshold = history.filter(h => 
          Math.abs(h.rate * 24 * 365) > ENTRY_MIN_APR
        ).length;

        if (recentAboveThreshold >= ENTRY_MIN_HOURS) {
          const trade = await this.openPaperTrade(opp);
          if (trade) {
            actions.push(
              `📝 PAPER ENTRY: ${opp.coin} ${opp.direction} $${PAPER_SIZE_USD} ` +
              `(${(opp.annualizedRate * 100).toFixed(1)}% APR, ${recentAboveThreshold}h persistent)`
            );
          }
        }
        await new Promise(r => setTimeout(r, 200));
      } catch (e: any) {
        // Skip if historical check fails — don't enter without persistence data
      }
    }

    return actions;
  }

  // ── State persistence ──

  private loadState(): PaperTradeState {
    try {
      if (fs.existsSync(STATE_FILE)) {
        return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      }
    } catch { }
    return { trades: [], cumulativePnl: 0, lastScanAt: 0 };
  }

  private saveState(): void {
    if (!fs.existsSync(REPORTS_DIR)) {
      fs.mkdirSync(REPORTS_DIR, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2), 'utf-8');
  }

  // ── Daily report ──

  saveDailyReport(opportunities: FundingOpportunity[], actions: string[]): void {
    const date = new Date().toISOString().slice(0, 10);
    const report = {
      date,
      scannedAt: new Date().toISOString(),
      opportunities: opportunities.slice(0, 20),
      actions,
      paperPnl: this.state.cumulativePnl,
      openTrades: this.state.trades.filter(t => t.isOpen).map(t => ({
        coin: t.coin,
        direction: t.direction,
        entryRate: t.entryRate,
        cumulativeFunding: t.cumulativeFunding,
        hoursOpen: ((Date.now() - t.entryTime) / (1000 * 60 * 60)).toFixed(1),
      })),
      closedToday: this.state.trades.filter(t => 
        !t.isOpen && t.exitTime && 
        new Date(t.exitTime).toISOString().slice(0, 10) === date
      ).map(t => ({
        coin: t.coin,
        direction: t.direction,
        pnl: t.cumulativeFunding - t.fees,
        exitReason: t.exitReason,
      })),
    };

    if (!fs.existsSync(REPORTS_DIR)) {
      fs.mkdirSync(REPORTS_DIR, { recursive: true });
    }
    fs.writeFileSync(
      path.join(REPORTS_DIR, `${date}.json`),
      JSON.stringify(report, null, 2),
      'utf-8'
    );
  }

  // ── Getters ──

  getCumulativePnl(): number {
    return this.state.cumulativePnl;
  }

  getOpenTradeCount(): number {
    return this.state.trades.filter(t => t.isOpen).length;
  }

  getOpenTrades(): PaperTrade[] {
    return this.state.trades.filter(t => t.isOpen);
  }

  // ── Format for Rei's briefing ──

  formatForBriefing(opps: FundingOpportunity[], actions: string[]): string {
    let output = '\n\n═══ REI\'S FUNDING RATE SCANNER ═══\n';
    output += `Paper P&L (cumulative): $${this.state.cumulativePnl.toFixed(2)}\n`;
    output += `Open trades: ${this.getOpenTradeCount()}/${MAX_OPEN_TRADES}\n\n`;

    // Open positions
    const openTrades = this.getOpenTrades();
    if (openTrades.length > 0) {
      output += 'OPEN POSITIONS:\n';
      for (const t of openTrades) {
        const hours = ((Date.now() - t.entryTime) / (1000 * 60 * 60)).toFixed(1);
        const netPnl = t.cumulativeFunding - t.fees;
        output += `  ${t.coin} ${t.direction} $${t.notionalSize} | ${hours}h | P&L: $${netPnl.toFixed(2)}\n`;
      }
      output += '\n';
    }

    // Actions taken this scan
    if (actions.length > 0) {
      output += 'ACTIONS:\n';
      for (const a of actions) {
        output += `  ${a}\n`;
      }
      output += '\n';
    }

    if (opps.length === 0) {
      output += 'No significant funding opportunities. Markets are balanced.\n';
      return output;
    }

    output += 'CURRENT OPPORTUNITIES:\n';
    for (const opp of opps.slice(0, 5)) {
      const icon = opp.confidence === 'high' ? '🔴' :
                   opp.confidence === 'medium' ? '🟡' : '⚪';
      output += `${icon} ${opp.coin}: ${(opp.annualizedRate * 100).toFixed(1)}% APR `;
      output += `(${opp.direction}) — ${opp.reasoning}\n`;
    }

    output += `\nFocus on FUNDING RATE OPPORTUNITIES. Which trades should you paper-enter? `;
    output += `Which open paper trades should you exit? Show the math on carry yield.\n`;

    return output;
  }
}
