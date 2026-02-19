/**
 * Standalone funding rate scanner.
 * Run: npx tsx src/scripts/scan-funding.ts
 * 
 * Scans HyperLiquid funding rates, evaluates paper trades, saves report.
 * Can run independently or as part of daily.ts pipeline.
 */

import { FundingScanner } from '../services/funding-scanner';

async function main() {
  const scanner = new FundingScanner();

  console.log('═══════════════════════════════════════════════════');
  console.log('  REI\'S FUNDING RATE SCANNER');
  console.log(`  Time: ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}`);
  console.log('═══════════════════════════════════════════════════\n');

  // Scan current rates
  console.log('── Scanning HyperLiquid funding rates... ──\n');
  const opportunities = await scanner.scan();

  console.log(`Found ${opportunities.length} opportunities above 20% APR threshold:\n`);

  for (const opp of opportunities.slice(0, 15)) {
    const icon = opp.confidence === 'high' ? '🔴' :
                 opp.confidence === 'medium' ? '🟡' : '⚪';
    const volTag = opp.volatile ? ' ⚠️VOLATILE' : '';
    console.log(`${icon} ${opp.coin.padEnd(8)} ${(opp.annualizedRate * 100).toFixed(1).padStart(7)}% APR  ${opp.direction.padEnd(12)}  Vol: $${(opp.dailyVolume / 1e6).toFixed(1)}M  OI: $${(opp.openInterestUsd / 1e6).toFixed(1)}M  24h: ${(opp.priceChange24h * 100).toFixed(1)}%${volTag}`);
  }

  // Update existing paper trades
  console.log('\n── Updating paper trades... ──\n');
  await scanner.updatePaperTrades();

  const openTrades = scanner.getOpenTrades();
  if (openTrades.length > 0) {
    console.log(`Open trades (${openTrades.length}):`);
    for (const t of openTrades) {
      const hours = ((Date.now() - t.entryTime) / (1000 * 60 * 60)).toFixed(1);
      const netPnl = t.cumulativeFunding - t.fees;
      console.log(`  ${t.coin} ${t.direction} $${t.notionalSize} | ${hours}h open | Funding: $${t.cumulativeFunding.toFixed(2)} | Net P&L: $${netPnl.toFixed(2)}`);
    }
  } else {
    console.log('No open paper trades.');
  }

  // Evaluate new entries
  console.log('\n── Evaluating new paper trade entries... ──\n');
  const actions = await scanner.evaluateAndTrade(opportunities);

  if (actions.length > 0) {
    for (const a of actions) {
      console.log(`  ${a}`);
    }
  } else {
    console.log('  No new paper trades opened (either at max capacity, no persistent opportunities, or already positioned).');
  }

  // Save report
  scanner.saveDailyReport(opportunities, actions);

  // Summary
  console.log('\n═══════════════════════════════════════════════════');
  console.log(`💰 Cumulative Paper P&L: $${scanner.getCumulativePnl().toFixed(2)}`);
  console.log(`📊 Open trades: ${scanner.getOpenTradeCount()}/5`);
  console.log(`🔍 Opportunities found: ${opportunities.length}`);
  console.log(`   High confidence: ${opportunities.filter(o => o.confidence === 'high').length}`);
  console.log(`   Medium confidence: ${opportunities.filter(o => o.confidence === 'medium').length}`);
  console.log('═══════════════════════════════════════════════════');
}

main().catch(e => {
  console.error('❌ Funding scan failed:', e.message);
  process.exit(1);
});
