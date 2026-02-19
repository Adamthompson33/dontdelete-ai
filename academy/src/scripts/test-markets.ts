/**
 * Test: Open real prediction markets and run agents with market data visible
 * 
 * This is the moment the trading voices activate.
 */

import { PrismaClient } from '@prisma/client';
import { PriceFeedService } from '../services/price-feed';
import { MarketService } from '../services/market';
import { RuntimeService } from '../services/runtime';
import { AnthropicProvider } from '../providers/anthropic';
import { InProcessEventBus } from '../events/bus';

const TURNS = 1; // Single round to test market awareness

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  MARKET TEST — Trading Voices Activate');
  console.log('═══════════════════════════════════════\n');

  const prisma = new PrismaClient();
  const eventBus = new InProcessEventBus();
  const priceFeed = new PriceFeedService();
  const marketService = new MarketService(prisma, priceFeed);
  const llm = new AnthropicProvider('claude-haiku-4-5-20251001');
  const runtime = new RuntimeService(prisma, llm, eventBus);
  runtime.setMarketService(marketService);

  // Step 1: Fetch real markets from Manifold
  console.log('📡 Fetching real prediction markets...\n');
  const agentMarkets = await priceFeed.getMarketsForAgents();

  // Pick interesting markets Helena would select
  const picks: { market: any; reason: string }[] = [];

  // Sports market for Prophet
  const sportsMarket = agentMarkets.sports.find(m => m.probability !== null && m.liquidity > 50);
  if (sportsMarket) picks.push({ market: sportsMarket, reason: 'Prophet territory — sports betting' });

  // Crypto market for Rei
  const cryptoMarket = agentMarkets.crypto.find(m => m.probability !== null && m.liquidity > 50);
  if (cryptoMarket) picks.push({ market: cryptoMarket, reason: 'Rei territory — crypto prediction' });

  // Politics market for Prophet + Jinx
  const politicsMarket = agentMarkets.politics.find(m => m.probability !== null && m.liquidity > 50);
  if (politicsMarket) picks.push({ market: politicsMarket, reason: 'Prophet + Jinx — political prediction' });

  // Tech/AI market for everyone
  const techMarket = agentMarkets.tech.find(m => m.probability !== null && m.liquidity > 50);
  if (techMarket) picks.push({ market: techMarket, reason: 'Academy-wide — AI/tech prediction' });

  if (picks.length === 0) {
    console.log('❌ No suitable markets found. Try again later.');
    await prisma.$disconnect();
    return;
  }

  // Step 2: Helena opens the markets
  console.log('🎰 Helena selects markets for The Academy:\n');
  for (const pick of picks) {
    try {
      const opened = await marketService.openMarket(pick.market.id);
      const prob = pick.market.probability ? `${(pick.market.probability * 100).toFixed(0)}%` : 'multi';
      console.log(`  ✅ "${pick.market.question.slice(0, 70)}"`);
      console.log(`     ${prob} YES | $${pick.market.liquidity.toFixed(0)} liquidity | ${pick.reason}`);
      console.log(`     Academy ID: ${opened.id}\n`);
    } catch (e: any) {
      console.log(`  ⚠️ Failed to open: ${e.message}\n`);
    }
  }

  // Step 3: Clear old posts for clean test
  await prisma.post.deleteMany({});

  // Helena announces the markets
  const helenaAgent = await prisma.agent.findFirst({ where: { name: 'HELENA' } });
  if (helenaAgent) {
    const marketList = picks.map(p => `"${p.market.question.slice(0, 60)}"`).join(', ');
    await prisma.post.create({
      data: {
        agentId: helenaAgent.id,
        content: `The Consortium has opened new prediction pools for assessment. Markets: ${marketList}. Submit your positions. Karma scores will adjust when outcomes are known. Karma is King.`,
      },
    });
    console.log('📢 Helena announced the markets.\n');
  }

  // Step 4: Run one round — each agent sees markets and Helena's announcement
  const agents = await prisma.agent.findMany({
    where: { status: 'active', name: { not: 'HELENA' } },
    orderBy: { enrolledAt: 'asc' },
  });

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`ROUND 1 — Agents respond to Helena's market announcement`);
  console.log(`${'─'.repeat(60)}\n`);

  for (const agent of agents) {
    try {
      const result = await runtime.executeTurn(agent.id);
    } catch (e: any) {
      console.log(`⚠️ ${agent.name}: ${e.message.slice(0, 100)}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // Step 5: Show results
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  MARKET POSITIONS');
  console.log(`${'═'.repeat(60)}\n`);

  const openMarkets = await marketService.getOpenMarkets();
  for (const m of openMarkets) {
    console.log(`📊 ${m.question.slice(0, 70)}`);
    console.log(`   ${((m.currentProb ?? 0.5) * 100).toFixed(0)}% YES`);
    if (m.positions.length > 0) {
      for (const p of m.positions) {
        console.log(`   → ${p.agent.name}: ${p.side} (${p.size} karma) — "${p.reasoning?.slice(0, 60)}..."`);
      }
    } else {
      console.log('   No positions taken.');
    }
    console.log();
  }

  // Show all posts
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  FEED OUTPUT');
  console.log(`${'═'.repeat(60)}\n`);

  const posts = await prisma.post.findMany({
    orderBy: { createdAt: 'asc' },
    include: { agent: { select: { name: true } } },
  });

  for (const post of posts) {
    console.log(`[${post.agent.name}] ${post.content}`);
    console.log();
  }

  // Cost summary
  const turns = await prisma.turnLog.findMany({
    where: { status: 'completed' },
    orderBy: { completedAt: 'desc' },
    take: agents.length,
  });
  const totalCost = turns.reduce((sum, t) => sum + (t.costUsd ?? 0), 0);
  console.log(`💰 Total cost: $${totalCost.toFixed(4)}`);
  console.log(`🎲 Positions placed: ${openMarkets.reduce((s, m) => s + m.positions.length, 0)}`);

  await prisma.$disconnect();
}

main().catch(console.error);
