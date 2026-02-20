import { ToolSignal, SignalBoard } from '../interfaces/signal-board';
import { ArbitrageScanner } from './arbitrage';
import { FundingScanner } from './funding-scanner';
import { KellyEngine } from './kelly-engine';
import { FactorModel } from './factor-model';
import { TemporalEdgeScanner } from './temporal-edge';
import { PrismaClient } from '@prisma/client';

export interface HarvestConfig {
  episode: number;
  date: string;
  prisma: PrismaClient;
}

export async function harvestSignals(config: HarvestConfig): Promise<SignalBoard> {
  const signals: ToolSignal[] = [];
  const now = new Date().toISOString();

  // Sakura: Arb Scanner
  try {
    const scanner = new ArbitrageScanner();
    const result = await scanner.scan();
    const real = result.opportunities.filter(o => o.confidence !== 'low');
    if (real.length > 0) {
      const best = real[0];
      signals.push({
        source: 'sakura',
        tool: 'arb-scanner',
        timestamp: now,
        headline: `${best.description} (${best.expectedEdge.toFixed(1)}pp edge, ${best.confidence} confidence)`,
        data: { opportunities: real.slice(0, 3), marketsScanned: result.marketsScanned },
        confidence: best.confidence === 'high' ? 0.85 : 0.6,
        direction: 'arb',
        relevantMarkets: best.markets.map(m => m.id),
      });
    } else {
      signals.push({
        source: 'sakura',
        tool: 'arb-scanner',
        timestamp: now,
        headline: `Scanned ${result.marketsScanned} markets. No actionable arbitrage (markets efficient).`,
        data: { marketsScanned: result.marketsScanned, opportunitiesFound: 0 },
        confidence: 0.5,
        direction: 'neutral',
      });
    }
  } catch (err: any) {
    signals.push(failedSignal('sakura', 'arb-scanner', err, now));
  }

  // Rei: Funding Scanner
  try {
    const scanner = new FundingScanner();
    const opps = await scanner.scan();
    await scanner.updatePaperTrades();
    const high = opps.filter(o => o.confidence === 'high');
    const medium = opps.filter(o => o.confidence === 'medium');
    const pnl = scanner.getCumulativePnl();
    const openCount = scanner.getOpenTradeCount();

    if (high.length > 0 || medium.length > 0) {
      const top = [...high, ...medium][0];
      signals.push({
        source: 'rei',
        tool: 'funding-scanner',
        timestamp: now,
        headline: `${top.coin}: ${(top.annualizedRate * 100).toFixed(1)}% APR (${top.direction}). Paper P&L: $${pnl.toFixed(2)} across ${openCount} open trades.`,
        data: { topOpps: [...high, ...medium].slice(0, 5).map(o => ({ coin: o.coin, apr: o.annualizedRate, direction: o.direction, confidence: o.confidence })), paperPnl: pnl, openTrades: openCount },
        confidence: top.confidence === 'high' ? 0.85 : 0.65,
        direction: top.direction === 'LONG_BASIS' ? 'bullish' : 'bearish',
      });
    } else {
      signals.push({
        source: 'rei',
        tool: 'funding-scanner',
        timestamp: now,
        headline: `No high-confidence funding opportunities. Paper P&L: $${pnl.toFixed(2)}.`,
        data: { paperPnl: pnl, openTrades: openCount },
        confidence: 0.4,
        direction: 'neutral',
      });
    }
    // Save the daily report as side effect
    const actions = await scanner.evaluateAndTrade(opps);
    scanner.saveDailyReport(opps, actions);
  } catch (err: any) {
    signals.push(failedSignal('rei', 'funding-scanner', err, now));
  }

  // Wren: Kelly Engine (portfolio-level, not per-agent for the signal board)
  try {
    const kelly = new KellyEngine(config.prisma);
    // Get all active agent IDs
    const agents = await config.prisma.agent.findMany({
      where: { status: 'active', name: { not: 'HELENA' } },
      select: { id: true, name: true },
    });
    
    let totalHeat = 0;
    let maxCorrelation = 0;
    let hotAgents: string[] = [];
    
    for (const agent of agents) {
      const portfolio = await kelly.analyzePortfolio(agent.id);
      totalHeat += portfolio.portfolioHeat;
      if (portfolio.portfolioHeat > 0.5) hotAgents.push(agent.name);
      if (portfolio.correlatedPositions.length > 0) {
        for (const cp of portfolio.correlatedPositions) {
          maxCorrelation = Math.max(maxCorrelation, cp.count);
        }
      }
    }
    const avgHeat = agents.length > 0 ? totalHeat / agents.length : 0;
    
    signals.push({
      source: 'wren',
      tool: 'kelly-engine',
      timestamp: now,
      headline: `Desk avg heat: ${(avgHeat * 100).toFixed(0)}%. ${hotAgents.length > 0 ? `Hot agents: ${hotAgents.join(', ')}.` : 'No overexposed agents.'} Max position cluster: ${maxCorrelation}.`,
      data: { avgHeat, hotAgents, maxCorrelation, agentCount: agents.length },
      confidence: 0.8,
      direction: 'neutral',
    });
    
    await kelly.saveDailyReport();
  } catch (err: any) {
    signals.push(failedSignal('wren', 'kelly-engine', err, now));
  }

  // Jinx: Factor Model
  try {
    const fm = new FactorModel(config.prisma);
    const audits = await fm.auditAllTools();
    const correlations = await fm.scanCorrelations();
    
    const concerns = audits.filter(a => a.verdict === 'reduce_size' || a.verdict === 'kill');
    const healthy = audits.filter(a => a.verdict === 'continue');
    
    let headline = '';
    if (concerns.length > 0) {
      headline = `AUDIT ALERT: ${concerns.map(c => `${c.strategyName} (${c.verdict.toUpperCase()})`).join(', ')}. `;
    }
    headline += `${healthy.length}/${audits.length} strategies healthy. Correlation: ${correlations.assessment}.`;
    
    signals.push({
      source: 'jinx',
      tool: 'factor-model',
      timestamp: now,
      headline,
      data: { audits: audits.map(a => ({ strategy: a.strategyName, verdict: a.verdict, explanation: a.explanation })), correlation: correlations.assessment },
      confidence: 0.7,
      direction: 'neutral',
    });
    
    await fm.saveDailyReport();
  } catch (err: any) {
    signals.push(failedSignal('jinx', 'factor-model', err, now));
  }

  // Jackbot: Temporal Edge Scanner
  try {
    const temporal = new TemporalEdgeScanner();
    const result = await temporal.scan();
    const btcRegime = result.regimes['BTC'];

    if (result.signals.length > 0) {
      const best = result.signals[0]; // highest conviction signal
      signals.push({
        source: 'jackbot',
        tool: 'temporal-edge',
        timestamp: now,
        headline: `${best.direction.toUpperCase()} ${best.coin} (${best.pattern}): ${best.reasoning.slice(0, 100)}`,
        data: {
          signals: result.signals.map(s => ({
            coin: s.coin, direction: s.direction, pattern: s.pattern,
            confidence: s.confidence, kelly: s.kelly_size,
          })),
          regime: btcRegime?.regime,
          session: result.session,
          nextResetMinutes: result.nextResetMinutes,
        },
        confidence: best.confidence,
        direction: best.direction === 'long' ? 'bullish' : best.direction === 'short' ? 'bearish' : 'neutral',
      });
    } else {
      signals.push({
        source: 'jackbot',
        tool: 'temporal-edge',
        timestamp: now,
        headline: `No temporal edge detected. Session: ${result.session}. BTC regime: ${btcRegime?.regime || 'unknown'} (ADX: ${btcRegime?.adx.toFixed(0) || '?'}). Next reset: ${result.nextResetMinutes}min.`,
        data: {
          regime: btcRegime?.regime,
          adx: btcRegime?.adx,
          session: result.session,
          nextResetMinutes: result.nextResetMinutes,
          signalCount: 0,
        },
        confidence: 0.3,
        direction: 'neutral',
      });
    }
  } catch (err: any) {
    signals.push(failedSignal('jackbot', 'temporal-edge', err, now));
  }

  // Prophet: Ultra Think UFC — PLACEHOLDER (not built yet)
  signals.push({
    source: 'prophet',
    tool: 'ultra-think-ufc',
    timestamp: now,
    headline: '[NOT YET BUILT] Ultra Think UFC pending development.',
    data: { status: 'pending' },
    confidence: 0,
    direction: 'neutral',
  });

  // Fetch live crypto prices to prevent hallucination
  let marketData: { btcPrice?: number; ethPrice?: number; fetchedAt?: string } | undefined;
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd', {
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json() as { bitcoin?: { usd: number }; ethereum?: { usd: number } };
      marketData = {
        btcPrice: data.bitcoin?.usd,
        ethPrice: data.ethereum?.usd,
        fetchedAt: new Date().toISOString().slice(0, 16) + ' UTC',
      };
      console.log(`  💰 BTC: $${marketData.btcPrice?.toLocaleString()} | ETH: $${marketData.ethPrice?.toLocaleString()}`);
    }
  } catch (err) {
    console.log(`  ⚠️ Price fetch failed: ${String(err).slice(0, 80)}`);
  }

  return {
    episode: config.episode,
    date: config.date,
    signals,
    marketData,
  };
}

function failedSignal(source: string, tool: string, err: unknown, timestamp: string): ToolSignal {
  return {
    source,
    tool,
    timestamp,
    headline: `[TOOL OFFLINE] ${tool} failed: ${String(err).slice(0, 100)}`,
    data: { error: true },
    confidence: 0,
    direction: 'neutral',
  };
}
