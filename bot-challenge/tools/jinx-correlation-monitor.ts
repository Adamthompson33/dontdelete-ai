#!/usr/bin/env npx tsx
/**
 * Jinx Correlation Monitor — Bot Challenge Tool
 * 
 * Meta-tool that reads ALL signals from the paper ledger and flags
 * dangerous portfolio correlation. Jinx doesn't find edges — she
 * audits everyone else's edges for hidden risk.
 * 
 * Usage: npx tsx tools/jinx-correlation-monitor.ts
 * 
 * Detects:
 * - Pairwise correlation > 60% between open signals
 * - Directional crowding (too many longs or shorts)
 * - Sector concentration (same-category tokens)
 * - Stale signals past invalidation window
 * 
 * Output: correlation report + risk alerts to paper-ledger.json
 */

import * as fs from 'fs';
import * as path from 'path';

// ═══ Types ═══

interface LedgerSignal {
  tool: string;
  timestamp: string;
  unixMs: number;
  coin: string;
  direction: 'LONG' | 'SHORT' | 'FLAT';
  confidence: number | string;
  entryPrice: number;
  reasoning: string;
  invalidation: string;
  [key: string]: any;
}

interface PaperLedgerEntry {
  signals: LedgerSignal[];
  lastScanAt: string;
  totalScans: number;
}

interface CorrelationPair {
  coinA: string;
  coinB: string;
  correlation: number;
  sameDirection: boolean;
  risk: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface RiskAlert {
  type: 'correlation' | 'crowding' | 'concentration' | 'stale';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
  coins: string[];
}

interface CorrelationReport {
  tool: string;
  timestamp: string;
  unixMs: number;
  signalsAnalyzed: number;
  uniqueCoins: number;
  uniqueTools: number;
  directionalBalance: { longs: number; shorts: number; flat: number; ratio: number };
  correlationPairs: CorrelationPair[];
  alerts: RiskAlert[];
  portfolioRiskScore: number; // 0-100
  recommendation: string;
}

// ═══ Config ═══

const LEDGER_FILE = path.join(__dirname, '..', 'results', 'paper-ledger.json');
const REPORT_DIR = path.join(__dirname, '..', 'reports');
const CORRELATION_THRESHOLD = 0.6;
const CROWDING_THRESHOLD = 0.75; // >75% same direction = crowded
const STALE_HOURS = 24; // signals older than 24h are stale
const HYPERLIQUID_API = 'https://api.hyperliquid.xyz/info';

// ═══ Known Token Categories ═══
// Tokens that move together get grouped for concentration risk

const TOKEN_CATEGORIES: Record<string, string> = {
  // L1s
  ETH: 'L1', SOL: 'L1', AVAX: 'L1', NEAR: 'L1', APT: 'L1', SUI: 'L1', SEI: 'L1',
  // L2s
  ARB: 'L2', OP: 'L2', MATIC: 'L2', BASE: 'L2', STRK: 'L2', ZK: 'L2',
  // DeFi
  UNI: 'DEFI', AAVE: 'DEFI', MKR: 'DEFI', CRV: 'DEFI', DYDX: 'DEFI', SNX: 'DEFI',
  // Memecoins
  DOGE: 'MEME', SHIB: 'MEME', PEPE: 'MEME', WIF: 'MEME', BONK: 'MEME', FLOKI: 'MEME',
  // AI
  FET: 'AI', RNDR: 'AI', TAO: 'AI', ARKM: 'AI', WLD: 'AI',
  // Gaming
  IMX: 'GAMING', GALA: 'GAMING', AXS: 'GAMING', SAND: 'GAMING',
  // BTC ecosystem
  BTC: 'BTC', ORDI: 'BTC', STX: 'BTC', SATS: 'BTC',
};

// ═══ HyperLiquid Price Data ═══

interface PriceCandle {
  t: number; // timestamp
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
}

async function fetchCandleData(coin: string, hours: number = 72): Promise<PriceCandle[]> {
  const now = Date.now();
  const start = now - hours * 60 * 60 * 1000;
  
  try {
    const res = await fetch(HYPERLIQUID_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'candleSnapshot',
        req: {
          coin,
          interval: '1h',
          startTime: start,
          endTime: now,
        },
      }),
    });
    
    if (!res.ok) return [];
    
    const data = await res.json() as any[];
    return data.map((c: any) => ({
      t: c.t,
      o: parseFloat(c.o),
      h: parseFloat(c.h),
      l: parseFloat(c.l),
      c: parseFloat(c.c),
    }));
  } catch {
    return [];
  }
}

// ═══ Correlation Math ═══

function calculateReturns(candles: PriceCandle[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    if (candles[i - 1].c === 0) continue;
    returns.push((candles[i].c - candles[i - 1].c) / candles[i - 1].c);
  }
  return returns;
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 10) return 0; // not enough data
  
  const xSlice = x.slice(0, n);
  const ySlice = y.slice(0, n);
  
  const meanX = xSlice.reduce((a, b) => a + b, 0) / n;
  const meanY = ySlice.reduce((a, b) => a + b, 0) / n;
  
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xSlice[i] - meanX;
    const dy = ySlice[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

// ═══ Analysis Functions ═══

function getActiveSignals(ledger: PaperLedgerEntry): LedgerSignal[] {
  const now = Date.now();
  const cutoff = now - STALE_HOURS * 60 * 60 * 1000;
  
  // Get most recent signal per coin per tool (deduplicate)
  const latest = new Map<string, LedgerSignal>();
  for (const sig of ledger.signals) {
    const key = `${sig.tool}:${sig.coin}`;
    const existing = latest.get(key);
    if (!existing || sig.unixMs > existing.unixMs) {
      latest.set(key, sig);
    }
  }
  
  // Filter out stale and FLAT signals
  return Array.from(latest.values()).filter(sig => {
    return sig.unixMs >= cutoff && sig.direction !== 'FLAT';
  });
}

function analyzeDirectionalBalance(signals: LedgerSignal[]) {
  const longs = signals.filter(s => s.direction === 'LONG').length;
  const shorts = signals.filter(s => s.direction === 'SHORT').length;
  const flat = signals.filter(s => s.direction === 'FLAT').length;
  const total = longs + shorts;
  const ratio = total === 0 ? 0.5 : Math.max(longs, shorts) / total;
  
  return { longs, shorts, flat, ratio };
}

function analyzeConcentration(signals: LedgerSignal[]): RiskAlert[] {
  const alerts: RiskAlert[] = [];
  const categoryCounts = new Map<string, string[]>();
  
  for (const sig of signals) {
    const cat = TOKEN_CATEGORIES[sig.coin] || 'OTHER';
    if (!categoryCounts.has(cat)) categoryCounts.set(cat, []);
    categoryCounts.get(cat)!.push(sig.coin);
  }
  
  for (const [cat, coins] of categoryCounts) {
    if (cat === 'OTHER') continue;
    if (coins.length >= 3) {
      alerts.push({
        type: 'concentration',
        severity: coins.length >= 4 ? 'HIGH' : 'MEDIUM',
        message: `${coins.length} signals in ${cat} sector: ${coins.join(', ')}. Sector risk concentrated.`,
        coins,
      });
    }
  }
  
  return alerts;
}

function findStaleSignals(ledger: PaperLedgerEntry): RiskAlert[] {
  const now = Date.now();
  const cutoff = now - STALE_HOURS * 60 * 60 * 1000;
  const stale = ledger.signals.filter(s => s.unixMs < cutoff && s.direction !== 'FLAT');
  
  if (stale.length === 0) return [];
  
  const coins = [...new Set(stale.map(s => s.coin))];
  return [{
    type: 'stale',
    severity: 'MEDIUM',
    message: `${stale.length} signals older than ${STALE_HOURS}h. Review or close: ${coins.join(', ')}`,
    coins,
  }];
}

function calculatePortfolioRisk(
  balance: { ratio: number },
  correlationPairs: CorrelationPair[],
  alerts: RiskAlert[]
): number {
  let risk = 0;
  
  // Directional crowding (0-30 points)
  risk += Math.max(0, (balance.ratio - 0.5) * 60);
  
  // High correlation pairs (0-40 points)
  const highCorr = correlationPairs.filter(p => p.risk === 'HIGH');
  risk += Math.min(40, highCorr.length * 15);
  
  // Concentration alerts (0-20 points)
  const concAlerts = alerts.filter(a => a.type === 'concentration');
  risk += Math.min(20, concAlerts.length * 10);
  
  // Stale signals (0-10 points)
  const staleAlerts = alerts.filter(a => a.type === 'stale');
  risk += Math.min(10, staleAlerts.length * 5);
  
  return Math.min(100, Math.round(risk));
}

// ═══ Main ═══

async function main() {
  console.log('🔗 Jinx Correlation Monitor — reading paper ledger...\n');
  
  // Load paper ledger
  let ledger: PaperLedgerEntry;
  try {
    ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf-8'));
  } catch {
    console.log('⚠️  No paper ledger found. Nothing to analyze.');
    console.log('   Run other tools first to populate signals.');
    process.exit(0);
  }
  
  console.log(`Ledger: ${ledger.signals.length} total signals, ${ledger.totalScans} scans`);
  
  // Get active (non-stale, non-FLAT) signals
  const active = getActiveSignals(ledger);
  const uniqueCoins = [...new Set(active.map(s => s.coin))];
  const uniqueTools = [...new Set(active.map(s => s.tool))];
  
  console.log(`Active signals: ${active.length} across ${uniqueCoins.length} coins from ${uniqueTools.length} tools\n`);
  
  if (active.length < 2) {
    console.log('⚠️  Need at least 2 active signals to analyze correlation.');
    console.log('   Current signals:', active.map(s => `${s.coin} (${s.tool})`).join(', ') || 'none');
    process.exit(0);
  }
  
  // Fetch price data for all active coins
  console.log('📊 Fetching 72h candle data from HyperLiquid...');
  const priceData = new Map<string, PriceCandle[]>();
  
  for (const coin of uniqueCoins) {
    const candles = await fetchCandleData(coin);
    if (candles.length > 0) {
      priceData.set(coin, candles);
      console.log(`   ${coin}: ${candles.length} candles`);
    } else {
      console.log(`   ${coin}: ⚠️ no data`);
    }
  }
  
  // Calculate pairwise correlations
  console.log('\n🔗 Calculating pairwise correlations...');
  const correlationPairs: CorrelationPair[] = [];
  const coinsWithData = uniqueCoins.filter(c => priceData.has(c));
  
  for (let i = 0; i < coinsWithData.length; i++) {
    for (let j = i + 1; j < coinsWithData.length; j++) {
      const coinA = coinsWithData[i];
      const coinB = coinsWithData[j];
      
      const returnsA = calculateReturns(priceData.get(coinA)!);
      const returnsB = calculateReturns(priceData.get(coinB)!);
      
      const corr = pearsonCorrelation(returnsA, returnsB);
      
      // Check if signals are in same direction
      const sigA = active.find(s => s.coin === coinA);
      const sigB = active.find(s => s.coin === coinB);
      const sameDir = sigA?.direction === sigB?.direction;
      
      // Risk: high correlation + same direction = compounding risk
      const absCorr = Math.abs(corr);
      let risk: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
      if (absCorr >= CORRELATION_THRESHOLD && sameDir) risk = 'HIGH';
      else if (absCorr >= CORRELATION_THRESHOLD) risk = 'MEDIUM';
      else if (absCorr >= 0.4 && sameDir) risk = 'MEDIUM';
      
      correlationPairs.push({
        coinA,
        coinB,
        correlation: parseFloat(corr.toFixed(4)),
        sameDirection: sameDir,
        risk,
      });
    }
  }
  
  // Sort by absolute correlation descending
  correlationPairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  
  // Collect all alerts
  const alerts: RiskAlert[] = [];
  
  // Correlation alerts
  for (const pair of correlationPairs.filter(p => p.risk === 'HIGH')) {
    alerts.push({
      type: 'correlation',
      severity: 'HIGH',
      message: `${pair.coinA}/${pair.coinB} correlation ${(pair.correlation * 100).toFixed(0)}% — same direction (${active.find(s => s.coin === pair.coinA)?.direction}). Effective exposure doubled.`,
      coins: [pair.coinA, pair.coinB],
    });
  }
  
  // Directional crowding
  const balance = analyzeDirectionalBalance(active);
  if (balance.ratio >= CROWDING_THRESHOLD) {
    const dominant = balance.longs > balance.shorts ? 'LONG' : 'SHORT';
    const dominantCoins = active.filter(s => s.direction === dominant).map(s => s.coin);
    alerts.push({
      type: 'crowding',
      severity: 'HIGH',
      message: `Directional crowding: ${(balance.ratio * 100).toFixed(0)}% ${dominant}. Portfolio is a leveraged directional bet, not diversified.`,
      coins: dominantCoins,
    });
  }
  
  // Concentration
  alerts.push(...analyzeConcentration(active));
  
  // Stale signals
  alerts.push(...findStaleSignals(ledger));
  
  // Portfolio risk score
  const portfolioRiskScore = calculatePortfolioRisk(balance, correlationPairs, alerts);
  
  // Recommendation
  let recommendation: string;
  if (portfolioRiskScore >= 70) {
    recommendation = 'DANGER: Portfolio risk is extreme. Reduce positions or hedge. Multiple correlated bets in same direction.';
  } else if (portfolioRiskScore >= 40) {
    recommendation = 'CAUTION: Moderate portfolio risk. Consider reducing position sizes on correlated pairs or adding opposing positions.';
  } else {
    recommendation = 'ACCEPTABLE: Portfolio diversification is reasonable. Continue monitoring.';
  }
  
  // Build report
  const report: CorrelationReport = {
    tool: 'jinx-correlation-monitor',
    timestamp: new Date().toISOString(),
    unixMs: Date.now(),
    signalsAnalyzed: active.length,
    uniqueCoins: uniqueCoins.length,
    uniqueTools: uniqueTools.length,
    directionalBalance: balance,
    correlationPairs,
    alerts,
    portfolioRiskScore,
    recommendation,
  };
  
  // Print results
  console.log('\n════════════════════════════════════════');
  console.log('  JINX CORRELATION REPORT');
  console.log('════════════════════════════════════════\n');
  
  console.log(`📊 Portfolio Risk Score: ${portfolioRiskScore}/100`);
  console.log(`   ${recommendation}\n`);
  
  console.log(`📈 Directional Balance: ${balance.longs}L / ${balance.shorts}S / ${balance.flat}F (${(balance.ratio * 100).toFixed(0)}% dominant)\n`);
  
  if (correlationPairs.length > 0) {
    console.log('🔗 Top Correlation Pairs:');
    for (const pair of correlationPairs.slice(0, 10)) {
      const icon = pair.risk === 'HIGH' ? '🔴' : pair.risk === 'MEDIUM' ? '🟡' : '⚪';
      const dir = pair.sameDirection ? 'SAME' : 'OPP';
      console.log(`   ${icon} ${pair.coinA}/${pair.coinB}: ${(pair.correlation * 100).toFixed(1)}% [${dir}] — ${pair.risk}`);
    }
    console.log('');
  }
  
  if (alerts.length > 0) {
    console.log('⚠️  ALERTS:');
    for (const alert of alerts) {
      const icon = alert.severity === 'HIGH' ? '🔴' : alert.severity === 'MEDIUM' ? '🟡' : '⚪';
      console.log(`   ${icon} [${alert.type.toUpperCase()}] ${alert.message}`);
    }
    console.log('');
  } else {
    console.log('✅ No risk alerts.\n');
  }
  
  // Print active signals summary
  console.log('📋 Active Signals Under Monitor:');
  for (const sig of active) {
    console.log(`   ${sig.coin} ${sig.direction} (${sig.tool}) — $${sig.entryPrice?.toFixed(2) || '?'}`);
  }
  console.log('');
  
  // Log correlation report to paper ledger as a meta-signal
  ledger.signals.push({
    tool: 'jinx-correlation-monitor',
    timestamp: report.timestamp,
    unixMs: report.unixMs,
    coin: 'PORTFOLIO',
    direction: 'FLAT' as const,
    confidence: 1,
    entryPrice: 0,
    reasoning: `Portfolio risk: ${portfolioRiskScore}/100. ${alerts.length} alerts. ${balance.longs}L/${balance.shorts}S. ${recommendation}`,
    invalidation: 'Next scan supersedes this assessment.',
    portfolioRiskScore,
    alertCount: alerts.length,
  } as any);
  
  ledger.lastScanAt = new Date().toISOString();
  ledger.totalScans++;
  
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2), 'utf-8');
  console.log(`✅ Logged portfolio assessment to paper-ledger.json (scan #${ledger.totalScans})`);
  
  // Save daily report
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
  const date = new Date().toISOString().slice(0, 10);
  const reportFile = path.join(REPORT_DIR, `jinx-correlation-${date}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`📊 Full report saved to reports/jinx-correlation-${date}.json`);
}

main().catch(err => {
  console.error('❌ Correlation scan failed:', err.message);
  process.exit(1);
});
