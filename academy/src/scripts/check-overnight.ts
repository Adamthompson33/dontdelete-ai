import { PrismaClient } from '@prisma/client';
import { PriceFeedService } from '../services/price-feed';
import { FundingScanner } from '../services/funding-scanner';

async function main() {
  const prisma = new PrismaClient();
  const pf = new PriceFeedService();

  console.log('═══ OVERNIGHT STATUS CHECK ═══\n');
  console.log('─── Market Resolutions ───\n');

  const markets = await prisma.market.findMany({ where: { status: 'open' } });
  for (const m of markets) {
    try {
      const latest = await pf.getMarket(m.externalId);
      const status = latest.isResolved
        ? `🏁 RESOLVED → ${latest.resolution}`
        : `📊 OPEN ${((latest.probability ?? 0.5) * 100).toFixed(0)}%`;
      console.log(`${status} | ${m.question.slice(0, 60)}`);
    } catch (e: any) {
      console.log(`❌ Error | ${m.question.slice(0, 60)}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('\n─── Funding Scanner ───\n');
  try {
    const fs = new FundingScanner();
    await fs.updatePaperTrades();
    console.log(`Paper P&L: $${fs.getCumulativePnl().toFixed(2)}`);
    console.log(`Open trades: ${fs.getOpenTradeCount()}/5`);
  } catch (e: any) {
    console.log(`⚠️ Funding scanner error: ${e.message}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
