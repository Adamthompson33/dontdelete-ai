/**
 * Market Resolution Checker
 * 
 * Polls Manifold Markets API for all open Academy markets.
 * If a market has resolved on Manifold → runs settlement:
 *   - Winners get karma back (cost + profit = full size)
 *   - Losers eat the cost (already deducted at bet time)
 *   - Leaderboard + trust tiers update
 *   - Trust events logged
 * 
 * Run daily via cron or manually: npx tsx src/scripts/resolve-markets.ts
 */

import { PrismaClient } from '@prisma/client';
import { PriceFeedService } from '../services/price-feed';
import { MarketService } from '../services/market';

async function main() {
  const prisma = new PrismaClient();
  const priceFeed = new PriceFeedService();
  const marketService = new MarketService(prisma, priceFeed);

  console.log('═══ MARKET RESOLUTION CHECKER ═══');
  console.log(`Time: ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}\n`);

  // Get all open markets with positions
  const openMarkets = await prisma.market.findMany({
    where: { status: 'open' },
    include: {
      positions: {
        include: { agent: { select: { name: true } } },
      },
    },
  });

  if (openMarkets.length === 0) {
    console.log('No open markets to check.');
    await prisma.$disconnect();
    return;
  }

  console.log(`Checking ${openMarkets.length} open markets...\n`);

  let resolved = 0;
  let priceUpdates = 0;

  for (const market of openMarkets) {
    try {
      // Fetch latest from Manifold
      const latest = await priceFeed.getMarket(market.externalId);
      const posCount = market.positions.length;
      const oldProb = market.currentProb ?? 0;
      const newProb = latest.probability ?? 0;
      const probDelta = ((newProb - oldProb) * 100).toFixed(1);
      const deltaStr = Number(probDelta) >= 0 ? `+${probDelta}` : probDelta;

      if (latest.isResolved && latest.resolution) {
        // ═══ MARKET RESOLVED ═══
        const outcome = latest.resolution as 'YES' | 'NO';
        
        // Handle MKT (market/cancelled) resolution
        if (latest.resolution !== 'YES' && latest.resolution !== 'NO') {
          console.log(`⚠️  "${market.question.slice(0, 50)}..."`);
          console.log(`   Resolved as ${latest.resolution} (not YES/NO) — skipping settlement\n`);
          // Mark as resolved but don't settle positions
          await prisma.market.update({
            where: { id: market.id },
            data: { status: 'resolved', outcome: latest.resolution, resolvedAt: new Date() },
          });
          continue;
        }

        console.log(`🏁 RESOLVED: "${market.question.slice(0, 55)}..."`);
        console.log(`   Outcome: ${outcome} | Positions: ${posCount}`);

        if (posCount === 0) {
          // No positions, just mark resolved
          await prisma.market.update({
            where: { id: market.id },
            data: { status: 'resolved', outcome, resolvedAt: new Date() },
          });
          console.log(`   No positions to settle.\n`);
        } else {
          // Run settlement
          const result = await marketService.settleMarket(market.id, outcome);

          if (result.winners.length > 0) {
            console.log(`   🏆 Winners:`);
            for (const w of result.winners) {
              console.log(`      ${w.agentName}: +${w.pnl.toFixed(1)} karma (bet returned: ${market.positions.find(p => p.agentId === w.agentId)?.size ?? '?'})`);
            }
          }
          if (result.losers.length > 0) {
            console.log(`   💀 Losers:`);
            for (const l of result.losers) {
              console.log(`      ${l.agentName}: ${l.pnl.toFixed(1)} karma (cost already deducted)`);
            }
          }
          console.log();
        }
        resolved++;
      } else {
        // ═══ STILL OPEN — update price ═══
        await prisma.market.update({
          where: { id: market.id },
          data: {
            currentProb: latest.probability,
            volume: latest.volume,
            liquidity: latest.liquidity,
          },
        });
        
        const status = posCount > 0 ? `${posCount} positions` : 'no positions';
        console.log(`📊 OPEN: "${market.question.slice(0, 55)}..."`);
        console.log(`   ${(newProb * 100).toFixed(0)}% YES (${deltaStr}pp) | ${status}\n`);
        priceUpdates++;
      }

      // Rate limit: don't hammer Manifold
      await new Promise(r => setTimeout(r, 200));
    } catch (e: any) {
      console.error(`❌ Error checking "${market.question.slice(0, 40)}...": ${e.message}\n`);
    }
  }

  // ═══ SUMMARY ═══
  console.log('═══ SUMMARY ═══');
  console.log(`Markets checked: ${openMarkets.length}`);
  console.log(`Resolved: ${resolved}`);
  console.log(`Prices updated: ${priceUpdates}`);

  if (resolved > 0) {
    // Show updated leaderboard
    console.log('\n═══ KARMA LEADERBOARD (post-settlement) ═══\n');
    const board = await marketService.getLeaderboard();
    for (let i = 0; i < board.length; i++) {
      const a = board[i];
      const emoji = a.karma >= 70 ? '🟢' : a.karma >= 50 ? '🟡' : '🔴';
      console.log(`${i + 1}. ${emoji} ${a.name.padEnd(10)} ${a.karma.toFixed(1)} karma | ${a.totalBets} bets | ${a.tier}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
