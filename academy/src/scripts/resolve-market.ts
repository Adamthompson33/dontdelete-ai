/**
 * Manually resolve a market by internal ID
 * Usage: npx tsx src/scripts/resolve-market.ts <market-id-suffix> <YES|NO>
 */
import { PrismaClient } from '@prisma/client';
import { MarketService } from '../services/market';
import { PriceFeedService } from '../services/price-feed';

async function main() {
  const [,, marketSuffix, outcome] = process.argv;
  if (!marketSuffix || !outcome || !['YES', 'NO'].includes(outcome.toUpperCase())) {
    console.log('Usage: npx tsx src/scripts/resolve-market.ts <market-id-suffix> <YES|NO>');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const ms = new MarketService(prisma, new PriceFeedService());

  // Find market by suffix
  const markets = await prisma.market.findMany({ where: { status: 'open' } });
  const market = markets.find(m => m.id.endsWith(marketSuffix));
  
  if (!market) {
    console.log('Market not found. Open markets:');
    markets.forEach(m => console.log(`  ${m.id.slice(-8)} | ${m.question.slice(0, 60)}`));
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`Resolving: "${market.question}"`);
  console.log(`Outcome: ${outcome.toUpperCase()}\n`);

  const result = await ms.settleMarket(market.id, outcome.toUpperCase() as 'YES' | 'NO');

  console.log(`✅ SETTLED: ${result.outcome}`);
  if (result.winners.length > 0) {
    console.log('\n🏆 Winners:');
    result.winners.forEach(w => console.log(`  ${w.agentName}: +${w.pnl.toFixed(1)} karma`));
  }
  if (result.losers.length > 0) {
    console.log('\n💀 Losers:');
    result.losers.forEach(l => console.log(`  ${l.agentName}: ${l.pnl.toFixed(1)} karma`));
  }

  // Show updated leaderboard
  const board = await ms.getLeaderboard();
  console.log('\n═══ UPDATED LEADERBOARD ═══');
  board.forEach((a, i) => {
    const emoji = a.karma >= 70 ? '🟢' : a.karma >= 50 ? '🟡' : '🔴';
    console.log(`${i + 1}. ${emoji} ${a.name.padEnd(10)} ${a.karma.toFixed(1)} karma | ${a.tier}`);
  });

  await prisma.$disconnect();
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
