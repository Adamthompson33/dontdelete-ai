/**
 * DAILY EPISODE RUNNER — The Content Factory
 * 
 * One command. Full pipeline:
 * 1. Resolution check — settle any markets that closed on Manifold
 * 2. Price sync — update all open market probabilities
 * 3. Helena picks fresh markets or re-announces open ones
 * 4. Two rounds — all 6 agents analyze, bet, argue
 * 5. Content dump — best quotes + positions → ready to paste into Twitter
 * 
 * Usage: npx tsx src/scripts/daily.ts
 * 
 * Wake up. Run this. Read output. Pick the best moments. Post the thread.
 * You're the editor now, not the writer. The agents write the show.
 */

import { PrismaClient } from '@prisma/client';
import { PriceFeedService } from '../services/price-feed';
import { MarketService } from '../services/market';
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
  const priceFeed = new PriceFeedService();
  const marketService = new MarketService(prisma, priceFeed);
  const eventBus = new InProcessEventBus();
  const llm = new AnthropicProvider('claude-haiku-4-5-20251001');
  const runtime = new RuntimeService(prisma, llm, eventBus);
  runtime.setMarketService(marketService);

  const contentLines: string[] = [];
  const log = (s: string) => { console.log(s); contentLines.push(s); };

  log(`═══════════════════════════════════════════════════`);
  log(`  THE ACADEMY — DAILY EPISODE (${DATE})`);
  log(`  Time: ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}`);
  log(`═══════════════════════════════════════════════════\n`);

  // ═══ PHASE 1: RESOLVE ═══
  log('─── PHASE 1: Resolution Check ───\n');
  
  const openMarkets = await prisma.market.findMany({
    where: { status: 'open' },
    include: { positions: { include: { agent: { select: { name: true } } } } },
  });

  let settledCount = 0;
  const settlementStories: string[] = [];

  for (const market of openMarkets) {
    try {
      const latest = await priceFeed.getMarket(market.externalId);
      
      if (latest.isResolved && latest.resolution) {
        if (latest.resolution === 'YES' || latest.resolution === 'NO') {
          const outcome = latest.resolution as 'YES' | 'NO';
          const result = await marketService.settleMarket(market.id, outcome);
          settledCount++;

          log(`🏁 RESOLVED: "${market.question.slice(0, 55)}..." → ${outcome}`);
          
          const winnerNames = result.winners.map(w => `${w.agentName} (+${w.pnl.toFixed(1)})`).join(', ');
          const loserNames = result.losers.map(l => `${l.agentName} (${l.pnl.toFixed(1)})`).join(', ');
          if (winnerNames) log(`   🏆 Winners: ${winnerNames}`);
          if (loserNames) log(`   💀 Losers: ${loserNames}`);
          
          // Generate content-ready settlement story
          if (result.winners.length > 0 || result.losers.length > 0) {
            const story = `Market resolved: "${market.question.slice(0, 50)}..." → ${outcome}. ` +
              (result.winners.length > 0 ? `Winners: ${result.winners.map(w => w.agentName).join(', ')}. ` : '') +
              (result.losers.length > 0 ? `Losers: ${result.losers.map(l => l.agentName).join(', ')}.` : '');
            settlementStories.push(story);
          }
          log('');
        } else {
          log(`⚠️  "${market.question.slice(0, 50)}..." → ${latest.resolution} (skipped)\n`);
          await prisma.market.update({
            where: { id: market.id },
            data: { status: 'resolved', outcome: latest.resolution, resolvedAt: new Date() },
          });
        }
      } else {
        // Update price
        await prisma.market.update({
          where: { id: market.id },
          data: { currentProb: latest.probability, volume: latest.volume, liquidity: latest.liquidity },
        });
        const prob = latest.probability ? `${(latest.probability * 100).toFixed(0)}%` : '?';
        const posCount = market.positions.length;
        log(`📊 OPEN: "${market.question.slice(0, 55)}..." ${prob} (${posCount} pos)`);
      }
      await new Promise(r => setTimeout(r, 200));
    } catch (e: any) {
      log(`❌ ${market.question.slice(0, 40)}...: ${e.message}`);
    }
  }

  log(`\nSettled: ${settledCount} | Still open: ${openMarkets.length - settledCount}\n`);

  // ═══ PHASE 1.5: KARMA DECAY — "Positions are mandatory" enforcement ═══
  // Progressive: 0 positions = -2 karma, 1 position = -1 karma, 2+ = no decay.
  // Forces agents to hold at least 2 positions. Can't coast on cash.
  {
    const activeAgents = await prisma.agent.findMany({
      where: { status: 'active', name: { not: 'HELENA' } },
      include: { trustScore: true },
    });
    
    for (const agent of activeAgents) {
      const openPositions = await prisma.position.count({
        where: { agentId: agent.id, settled: false },
      });
      
      // Progressive decay: 0 positions = -2, 1 position = -1, 2+ = no decay
      const decay = openPositions === 0 ? 2.0 : openPositions === 1 ? 1.0 : 0;
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
            details: `No open positions — karma decay of ${decay}. "Positions are mandatory."`,
          },
        });
        const reason = openPositions === 0 ? 'no open positions' : 'only 1 open position';
        log(`⚠️ ${agent.name}: -${decay} karma (inactivity decay — ${reason})`);
      }
    }
  }

  // ═══ PHASE 2: HELENA SETS THE STAGE ═══
  log('─── PHASE 2: Helena Sets the Stage ───\n');

  // Clear posts for clean episode
  await prisma.post.deleteMany({});

  const helenaAgent = await prisma.agent.findFirst({ where: { name: 'HELENA' } });
  const board = await marketService.getLeaderboard();
  const currentOpenMarkets = await marketService.getOpenMarkets();

  // Inject settlement results into Helena's opening if any resolved
  if (helenaAgent) {
    if (settlementStories.length > 0) {
      await prisma.post.create({
        data: {
          agentId: helenaAgent.id,
          content: `Markets have settled. ${settlementStories.join(' ')} The leaderboard has shifted. Karma is King. Results are permanent.`,
        },
      });
    }

    // Try to add 1-2 fresh markets
    const existingIds = currentOpenMarkets.map(m => m.externalId);
    const agentMarkets = await priceFeed.getMarketsForAgents();
    const candidates = [
      ...agentMarkets.sports,
      ...agentMarkets.crypto,
      ...agentMarkets.politics,
      ...agentMarkets.tech,
    ].filter(m => m.probability !== null && !existingIds.includes(m.id) && m.liquidity >= 50);

    const newPicks = candidates.slice(0, 2);
    for (const pick of newPicks) {
      try {
        await marketService.openMarket(pick.id);
        log(`  ✅ New market: "${pick.question.slice(0, 60)}"`);
      } catch (e: any) {
        log(`  ⚠️ ${e.message}`);
      }
    }

    // Helena's daily briefing
    const topAgent = board[0];
    const bottomAgent = board[board.length - 1];
    const totalMarkets = currentOpenMarkets.length + newPicks.length;

    await prisma.post.create({
      data: {
        agentId: helenaAgent.id,
        content: `Daily assessment. ${totalMarkets} markets active. ${topAgent.name} leads at ${topAgent.karma.toFixed(0)} karma. ${bottomAgent.name} trails at ${bottomAgent.karma.toFixed(0)}. The Consortium is watching. Positions are mandatory. Karma is King.`,
      },
    });
    log(`\n  Helena: ${totalMarkets} markets, ${topAgent.name} leads, ${bottomAgent.name} trails\n`);
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

        // Check for new positions from this turn
        const latestPos = await prisma.position.findFirst({
          where: { agentId: agent.id, settled: false },
          orderBy: { createdAt: 'desc' },
          include: { market: true },
        });
        if (latestPos && latestPos.createdAt && 
            (Date.now() - latestPos.createdAt.getTime()) < 60000) {
          newPositions.push({
            name: agent.name,
            market: latestPos.market.question.slice(0, 50),
            side: latestPos.side,
            size: latestPos.size,
          });
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

  // Market overview
  const finalMarkets = await marketService.getOpenMarkets();
  for (const m of finalMarkets) {
    const yesK = m.positions.filter(p => p.side === 'YES').reduce((s, p) => s + p.size, 0);
    const noK = m.positions.filter(p => p.side === 'NO').reduce((s, p) => s + p.size, 0);
    if (m.positions.length > 0) {
      log(`📊 ${m.question.slice(0, 55)}`);
      log(`   ${((m.currentProb ?? 0.5) * 100).toFixed(0)}% | YES: ${yesK} / NO: ${noK} karma`);
      for (const p of m.positions) {
        log(`   ${p.side === 'YES' ? '🟢' : '🔴'} ${p.agent.name}: ${p.side} ${p.size}`);
      }
      log('');
    }
  }

  // Leaderboard
  log('═══ KARMA LEADERBOARD ═══\n');
  const finalBoard = await marketService.getLeaderboard();
  for (let i = 0; i < finalBoard.length; i++) {
    const a = finalBoard[i];
    const emoji = a.karma >= 70 ? '🟢' : a.karma >= 50 ? '🟡' : '🔴';
    log(`${i + 1}. ${emoji} ${a.name.padEnd(10)} ${a.karma.toFixed(1)} karma | ${a.tier}`);
  }

  // Best quotes (for thread writing)
  log('\n═══ BEST QUOTES (pick for thread) ═══\n');
  for (const q of agentQuotes) {
    log(`[${q.name}] "${q.quote}"`);
  }

  // New positions this episode
  if (newPositions.length > 0) {
    log('\n═══ NEW POSITIONS THIS EPISODE ═══\n');
    for (const p of newPositions) {
      log(`🎰 ${p.name}: ${p.side} ${p.size} karma on "${p.market}"`);
    }
  }

  // Settlements
  if (settlementStories.length > 0) {
    log('\n═══ SETTLEMENTS (big content) ═══\n');
    for (const s of settlementStories) {
      log(`🏁 ${s}`);
    }
  }

  // Cost
  const recentTurns = await prisma.turnLog.findMany({
    where: { status: 'completed' },
    orderBy: { completedAt: 'desc' },
    take: agents.length * ROUNDS,
  });
  const cost = recentTurns.reduce((s, t) => s + (t.costUsd ?? 0), 0);
  const agentsBetting = new Set(finalMarkets.flatMap(m => m.positions.map(p => p.agentId))).size;

  log(`\n${'═'.repeat(60)}`);
  log(`💰 Cost: $${cost.toFixed(4)} | 🎲 Positions: ${finalMarkets.reduce((s, m) => s + m.positions.length, 0)} | 👥 ${agentsBetting}/6 betting`);
  log(`${'═'.repeat(60)}`);

  // ═══ PHASE 6: AGENT STATE FILES ═══
  log('\n═══ AGENT STATE UPDATE ═══\n');
  try {
    const stateService = new AgentStateService(prisma, marketService);
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
  const camLines = finalBoard.map(a => {
    const locked = finalMarkets.reduce((sum, m) => {
      const pos = m.positions.filter(p => p.agentId === (agents.find(ag => ag.name === a.name)?.id));
      return sum + pos.reduce((s, p) => {
        const cost = p.side === 'YES' ? p.size * p.entryProb : p.size * (1 - p.entryProb);
        return s + cost;
      }, 0);
    }, 0);
    const tag = a.karma === Math.max(...finalBoard.map(b => b.karma)) ? ' // LEADER' :
                a.karma === Math.min(...finalBoard.map(b => b.karma)) ? ' // TRAILING' : '';
    return `${a.name}: ${a.karma.toFixed(1)} (${locked.toFixed(1)} locked)${tag}`;
  });
  log('[DAILY LEADERBOARD]');
  camLines.forEach(l => log(l));
  log(`// ${DATE} //`);

  await prisma.$disconnect();
}

main().catch(console.error);
