/**
 * DAILY EPISODE RUNNER — The Signal Factory
 * 
 * One command. Full pipeline:
 * 1. Market snapshot — pull live spot prices, funding rates, prediction markets
 * 2. Helena briefing — current state, open signals from last episode, outcomes to evaluate
 * 3. Signal harvest — all agent tools dump signals to the board
 * 4. Two rounds — all 6 agents analyze, produce SIGNAL outputs, argue
 * 5. Content dump — best quotes + signals → ready to paste into Twitter
 * 
 * Usage: npx tsx src/scripts/daily.ts
 * 
 * Refactored: Manifold prediction markets → live market data + Signal Board schema
 */

import { PrismaClient } from '@prisma/client';
// import { PriceFeedService } from '../services/price-feed';  // OLD: Manifold markets
// import { MarketService } from '../services/market';          // OLD: Manifold bet mechanics
import { DataFeedService } from '../services/data-feeds';
import { RuntimeService } from '../services/runtime';
import { AnthropicProvider } from '../providers/anthropic';
import { InProcessEventBus } from '../events/bus';
import { AgentStateService } from '../services/agent-state';
import { ConvergenceLinter } from '../services/convergence-linter';
import { harvestSignals } from '../services/signal-harvest';
import { formatSignalBoard } from '../interfaces/signal-board';
import { trackCitations, calculateCitationKarma } from '../services/citation-tracker';
import { calculateTier } from '../interfaces/trust';
import * as fs from 'fs';
import * as path from 'path';

const ROUNDS = 2;
const DATE = new Date().toISOString().slice(0, 10);

async function main() {
  const prisma = new PrismaClient();
  const dataFeeds = new DataFeedService();
  // const priceFeed = new PriceFeedService();              // OLD: Manifold
  // const marketService = new MarketService(prisma, priceFeed); // OLD: Manifold bet mechanics
  const eventBus = new InProcessEventBus();
  const llm = new AnthropicProvider('claude-haiku-4-5-20251001');
  const runtime = new RuntimeService(prisma, llm, eventBus);
  // runtime.setMarketService(marketService);               // OLD: no longer needed

  const contentLines: string[] = [];
  const log = (s: string) => { console.log(s); contentLines.push(s); };

  log(`═══════════════════════════════════════════════════`);
  log(`  THE ACADEMY — DAILY EPISODE (${DATE})`);
  log(`  Time: ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}`);
  log(`═══════════════════════════════════════════════════\n`);

  // ═══ PHASE 1: MARKET SNAPSHOT ═══
  log('─── PHASE 1: Market Snapshot ───\n');
  
  const snapshot = await dataFeeds.getMarketSnapshot();
  
  // Log spot prices
  for (const s of snapshot.spot) {
    const arrow = s.change24h >= 0 ? '▲' : '▼';
    log(`  ${s.symbol}: $${s.price.toLocaleString()} ${arrow}${Math.abs(s.change24h).toFixed(1)}% 24h`);
  }
  
  // Log interesting funding rates
  const hotFunding = snapshot.funding.filter(f => Math.abs(f.annualizedRate) > 10);
  if (hotFunding.length > 0) {
    log('');
    for (const f of hotFunding.slice(0, 5)) {
      const dir = f.hourlyRate > 0 ? 'longs pay' : 'shorts pay';
      log(`  ${f.coin} funding: ${f.annualizedRate > 0 ? '+' : ''}${f.annualizedRate.toFixed(1)}% ann. (${dir})`);
    }
  }
  
  if (snapshot.predictions.length > 0) {
    log(`\n  Polymarket: ${snapshot.predictions.length} events loaded`);
  }
  
  if (snapshot.errors.length > 0) {
    for (const err of snapshot.errors) {
      log(`  ⚠️ Feed error: ${err}`);
    }
  }
  log('');

  // ═══ PHASE 1.5: EVALUATE PREVIOUS SIGNALS ═══
  // Pull signals from last episode and check them against current prices
  log('─── Phase 1.5: Previous Signal Evaluation ───\n');
  
  const previousSignals = await prisma.memory.findMany({
    where: {
      type: 'knowledge',
      content: { contains: '"type":"signal"' },
      weight: { gte: 5.0 },
    },
    include: { agent: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 20, // last episode's worth
  });

  const signalEvaluations: string[] = [];
  const priceMap = new Map(snapshot.spot.map(s => [s.symbol, s]));

  for (const mem of previousSignals) {
    try {
      const sig = JSON.parse(mem.content);
      if (sig.type !== 'signal') continue;
      const currentPrice = priceMap.get(sig.asset);
      if (currentPrice) {
        // Simple evaluation: did the direction match the 24h move?
        const moved = currentPrice.change24h;
        const correct = (sig.direction === 'long' && moved > 0) || 
                       (sig.direction === 'short' && moved < 0) ||
                       (sig.direction === 'flat' && Math.abs(moved) < 2);
        const emoji = correct ? '✅' : '❌';
        const eval_line = `${emoji} ${mem.agent.name}: ${sig.direction.toUpperCase()} ${sig.asset} @ ${(sig.confidence * 100).toFixed(0)}% conf → ${moved > 0 ? '+' : ''}${moved.toFixed(1)}%`;
        signalEvaluations.push(eval_line);
        log(`  ${eval_line}`);
      }
    } catch { /* not a signal memory */ }
  }
  
  if (signalEvaluations.length === 0) {
    log('  No previous signals to evaluate (first run with new schema)');
  }
  log('');

  // ═══ PHASE 1.5b: SIGNAL DECAY — "Signals are mandatory" enforcement ═══
  // Agents who didn't produce signals last episode get fitness penalty.
  // Replaces old karma decay from Manifold bet mechanics.
  {
    const activeAgents = await prisma.agent.findMany({
      where: { status: 'active', name: { not: 'HELENA' } },
      include: { trustScore: true },
    });
    
    for (const agent of activeAgents) {
      // Count signal memories from last 24h
      const recentSignals = await prisma.memory.count({
        where: {
          agentId: agent.id,
          type: 'knowledge',
          content: { contains: '"type":"signal"' },
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });
      
      const decay = recentSignals === 0 ? 2.0 : 0;
      if (decay > 0 && agent.trustScore) {
        const oldScore = agent.trustScore.score;
        const newScore = Math.max(0, oldScore - decay);
        await prisma.trustScore.update({
          where: { agentId: agent.id },
          data: { score: newScore, tier: calculateTier(newScore) },
        });
        await prisma.trustEvent.create({
          data: {
            agentId: agent.id,
            type: 'inactivity_decay',
            oldScore,
            newScore,
            details: `No signals produced in last 24h — fitness decay of ${decay}. "Signals are mandatory."`,
          },
        });
        log(`⚠️ ${agent.name}: -${decay} fitness (no signals in last 24h)`);
      }
    }
  }

  // ═══ PHASE 2: HELENA SETS THE STAGE ═══
  log('─── PHASE 2: Helena Sets the Stage ───\n');

  // Clear posts for clean episode
  await prisma.post.deleteMany({});

  const helenaAgent = await prisma.agent.findFirst({ where: { name: 'HELENA' } });

  if (helenaAgent) {
    // Helena's briefing: live market state + previous signal evaluations
    const spotSummary = snapshot.spot
      .map(s => `${s.symbol} $${s.price.toLocaleString()} (${s.change24h >= 0 ? '+' : ''}${s.change24h.toFixed(1)}%)`)
      .join(', ');
    
    const hotRates = snapshot.funding
      .filter(f => Math.abs(f.annualizedRate) > 15)
      .map(f => `${f.coin} ${f.annualizedRate > 0 ? '+' : ''}${f.annualizedRate.toFixed(0)}%`)
      .join(', ');

    // Count signal evaluations
    const correctCount = signalEvaluations.filter(e => e.startsWith('✅')).length;
    const totalEvals = signalEvaluations.length;
    const evalSummary = totalEvals > 0
      ? `Last episode signals: ${correctCount}/${totalEvals} correct.`
      : 'No previous signals to evaluate.';

    // Get trust leaderboard for Helena's assessment
    const trustScores = await prisma.trustScore.findMany({
      include: { agent: { select: { name: true, status: true } } },
      orderBy: { score: 'desc' },
    });
    const activeScores = trustScores.filter(t => t.agent.status === 'active' && t.agent.name !== 'HELENA');
    const topAgent = activeScores[0];
    const bottomAgent = activeScores[activeScores.length - 1];

    const briefingContent = [
      `Daily assessment.`,
      `Markets: ${spotSummary}.`,
      hotRates ? `Notable funding: ${hotRates}.` : null,
      evalSummary,
      topAgent && bottomAgent ? `${topAgent.agent.name} leads at ${topAgent.score.toFixed(0)} fitness. ${bottomAgent.agent.name} trails at ${bottomAgent.score.toFixed(0)}.` : null,
      `Signals are mandatory. The Consortium is watching.`,
    ].filter(Boolean).join(' ');

    await prisma.post.create({
      data: {
        agentId: helenaAgent.id,
        content: briefingContent,
      },
    });
    log(`  Helena: ${briefingContent.slice(0, 120)}...\n`);
  }

  // ═══ PHASE 3: SIGNAL HARVEST ═══
  log('\n--- PHASE 3: Signal Harvest ---\n');
  
  // Determine run number for state
  const episodesDir = path.join(__dirname, '..', '..', 'episodes');
  const runNumber = fs.existsSync(episodesDir)
    ? fs.readdirSync(episodesDir).filter(f => f.endsWith('.txt')).length + 1
    : 1;

  const signalBoard = await harvestSignals({
    episode: runNumber,
    date: DATE,
    prisma,
  });

  // Inject live market data from Phase 1 snapshot into signal board
  signalBoard.marketData = {
    btcPrice: snapshot.spot.find(s => s.symbol === 'BTC')?.price,
    ethPrice: snapshot.spot.find(s => s.symbol === 'ETH')?.price,
    fetchedAt: snapshot.fetchedAt,
  };

  log(`  Signals collected: ${signalBoard.signals.length}`);
  log(`  Active tools: ${signalBoard.signals.filter(s => !s.data.error && s.confidence > 0).map(s => s.source).join(', ')}`);
  
  // Log the signal board
  log(formatSignalBoard(signalBoard));

  // Inject signal board into runtime
  runtime.setSignalBoard(signalBoard);

  // ═══ PHASE 4: AGENT ROUNDS ═══
  const agents = await prisma.agent.findMany({
    where: { status: 'active', name: { not: 'HELENA' } },
    orderBy: { enrolledAt: 'asc' },
  });

  const agentQuotes: { name: string; quote: string; action?: string }[] = [];
  const newPositions: { name: string; market: string; side: string; size: number }[] = [];

  for (let round = 1; round <= ROUNDS; round++) {
    log(`\n─── PHASE 4.${round}: Round ${round} of ${ROUNDS} ───\n`);

    for (const agent of agents) {
      try {
        await runtime.executeTurn(agent.id);

        // Extract latest post for content
        const latestPost = await prisma.post.findFirst({
          where: { agentId: agent.id },
          orderBy: { createdAt: 'desc' },
        });
        if (latestPost) {
          const clean = latestPost.content.replace(/\*\*/g, '').slice(0, 200);
          agentQuotes.push({ name: agent.name, quote: clean });
        }

        // Check for new signals from this turn
        const latestSignalMem = await prisma.memory.findFirst({
          where: {
            agentId: agent.id,
            type: 'knowledge',
            content: { contains: '"type":"signal"' },
            createdAt: { gte: new Date(Date.now() - 60000) },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (latestSignalMem) {
          try {
            const sig = JSON.parse(latestSignalMem.content);
            newPositions.push({
              name: agent.name,
              market: sig.asset,
              side: sig.direction.toUpperCase(),
              size: sig.kelly_size,
            });
          } catch { /* not parseable */ }
        }
      } catch (e: any) {
        log(`⚠️ ${agent.name}: ${e.message.slice(0, 80)}`);
      }
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // ═══ PHASE 4.5: CITATION TRACKING ═══
  log('\n--- Citation Analysis ---\n');
  
  // Collect all agent posts from this episode for citation tracking
  const episodePosts = await prisma.post.findMany({
    where: { agent: { name: { not: 'HELENA' } } },
    include: { agent: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const agentTexts = new Map<string, string>();
  for (const post of episodePosts) {
    const existing = agentTexts.get(post.agent.name) || '';
    agentTexts.set(post.agent.name, existing + ' ' + post.content);
  }

  const citationResponses = Array.from(agentTexts.entries()).map(([name, content]) => ({
    agentName: name,
    content,
  }));

  const citationReport = trackCitations(citationResponses, signalBoard, runNumber);
  
  if (citationReport.synthesizers.length > 0) {
    log(`  Synthesizers: ${citationReport.synthesizers.join(', ')}`);
  }
  if (citationReport.isolatedAgents.length > 0) {
    log(`  Isolated (no tool refs): ${citationReport.isolatedAgents.join(', ')}`);
  }
  if (citationReport.chains.length > 0) {
    log(`  Tool chains: ${citationReport.chains.map(c => `${c.agentName} (${c.description})`).join(', ')}`);
  }

  // Apply citation karma
  // Grace period for Signal Board debut — log citations but don't penalize
  // TODO: Set to false starting Run 10
  const CITATION_GRACE_PERIOD = true;
  const karmaAdj = calculateCitationKarma(citationReport, CITATION_GRACE_PERIOD);
  for (const adj of karmaAdj) {
    const agent = agents.find(a => a.name === adj.agentName);
    if (agent) {
      const ts = await prisma.trustScore.findUnique({ where: { agentId: agent.id } });
      if (ts) {
        const newScore = Math.max(0, ts.score + adj.adjustment);
        await prisma.trustScore.update({
          where: { agentId: agent.id },
          data: { score: newScore, tier: calculateTier(newScore) },
        });
        await prisma.trustEvent.create({
          data: {
            agentId: agent.id,
            type: 'citation_karma',
            oldScore: ts.score,
            newScore,
            details: `Citation: ${adj.reason}`,
          },
        });
        log(`  ${adj.adjustment > 0 ? '+' : ''}${adj.adjustment} ${adj.agentName}: ${adj.reason}`);
      }
    }
  }

  // ═══ PHASE 5: CONTENT DUMP ═══
  log(`\n${'═'.repeat(60)}`);
  log('  CONTENT DUMP — Ready to post');
  log(`${'═'.repeat(60)}\n`);

  // Signal overview — all signals produced this episode
  const episodeSignals = await prisma.memory.findMany({
    where: {
      type: 'knowledge',
      content: { contains: '"type":"signal"' },
      createdAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) }, // last 2 hours
    },
    include: { agent: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });

  if (episodeSignals.length > 0) {
    log('═══ SIGNALS THIS EPISODE ═══\n');
    for (const mem of episodeSignals) {
      try {
        const sig = JSON.parse(mem.content);
        if (sig.type === 'signal') {
          const arrow = sig.direction === 'long' ? '🟢' : sig.direction === 'short' ? '🔴' : '⚪';
          log(`${arrow} ${mem.agent.name}: ${sig.direction.toUpperCase()} ${sig.asset} | ${(sig.confidence * 100).toFixed(0)}% conf | ${(sig.kelly_size * 100).toFixed(0)}% Kelly | Invalidation: ${sig.invalidation}`);
        }
      } catch { /* skip */ }
    }
    log('');
  }

  // Fitness leaderboard (replaces karma leaderboard)
  log('═══ FITNESS LEADERBOARD ═══\n');
  const finalScores = await prisma.trustScore.findMany({
    include: { agent: { select: { name: true, status: true } } },
    orderBy: { score: 'desc' },
  });
  const activeScoresFinal = finalScores.filter(t => t.agent.status === 'active' && t.agent.name !== 'HELENA');
  for (let i = 0; i < activeScoresFinal.length; i++) {
    const a = activeScoresFinal[i];
    const emoji = a.score >= 70 ? '🟢' : a.score >= 50 ? '🟡' : '🔴';
    log(`${i + 1}. ${emoji} ${a.agent.name.padEnd(10)} ${a.score.toFixed(1)} fitness | ${a.tier}`);
  }

  // Best quotes (for thread writing)
  log('\n═══ BEST QUOTES (pick for thread) ═══\n');
  for (const q of agentQuotes) {
    log(`[${q.name}] "${q.quote}"`);
  }

  // New signals this episode  
  if (newPositions.length > 0) {
    log('\n═══ NEW SIGNALS THIS EPISODE ═══\n');
    for (const p of newPositions) {
      log(`📡 ${p.name}: ${p.side} ${p.market} | Kelly: ${(p.size * 100).toFixed(0)}%`);
    }
  }

  // Cost
  const recentTurns = await prisma.turnLog.findMany({
    where: { status: 'completed' },
    orderBy: { completedAt: 'desc' },
    take: agents.length * ROUNDS,
  });
  const cost = recentTurns.reduce((s, t) => s + (t.costUsd ?? 0), 0);
  const agentsSignaling = new Set(episodeSignals.map(s => s.agent.name)).size;

  log(`\n${'═'.repeat(60)}`);
  log(`💰 Cost: $${cost.toFixed(4)} | 📡 Signals: ${episodeSignals.length} | 👥 ${agentsSignaling}/6 signaling`);
  log(`${'═'.repeat(60)}`);

  // ═══ PHASE 6: AGENT STATE FILES ═══
  log('\n═══ AGENT STATE UPDATE ═══\n');
  try {
    // AgentStateService may still reference marketService — wrap in try/catch
    // TODO: Refactor AgentStateService to work without marketService (Step 4)
    const stateService = new AgentStateService(prisma);
    await stateService.updateAllStates(runNumber);

    // Run convergence linter
    const linter = new ConvergenceLinter(prisma, stateService);
    const flaggedPhrases = await linter.updateStates(runNumber);
    if (flaggedPhrases.length > 0) {
      log(`  🔍 Convergence linter flagged ${flaggedPhrases.length} phrases:`);
      for (const phrase of flaggedPhrases.slice(0, 5)) {
        log(`     ⚠️ "${phrase}"`);
      }
    } else {
      log('  ✅ No convergent phrases detected');
    }
  } catch (e: any) {
    log(`  ⚠️ State update failed: ${e.message}`);
  }

  // ═══ SAVE TO FILE ═══
  const outDir = path.join(__dirname, '..', '..', 'episodes');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${DATE}.txt`);
  fs.writeFileSync(outFile, contentLines.join('\n'), 'utf-8');
  console.log(`\n📁 Saved to: ${outFile}`);

  // ═══ TSUKIYOMI CAM FORMAT ═══
  log('\n═══ @tsukiyomi_cam (copy-paste) ═══\n');
  const camLines = activeScoresFinal.map(a => {
    const sigCount = episodeSignals.filter(s => s.agent.name === a.agent.name).length;
    const tag = a.score === Math.max(...activeScoresFinal.map(b => b.score)) ? ' // LEADER' :
                a.score === Math.min(...activeScoresFinal.map(b => b.score)) ? ' // TRAILING' : '';
    return `${a.agent.name}: ${a.score.toFixed(1)} (${sigCount} signals)${tag}`;
  });
  log('[DAILY LEADERBOARD]');
  camLines.forEach(l => log(l));
  log(`// ${DATE} //`);

  await prisma.$disconnect();
}

main().catch(console.error);
