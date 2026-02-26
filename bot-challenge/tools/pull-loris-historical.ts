#!/usr/bin/env npx tsx
/**
 * Pull historical funding rates from Loris Tools API for all coins.
 * Endpoint: GET https://api.loris.tools/funding/historical?symbol={SYMBOL}&range=30d
 * Returns hourly funding per exchange (including hyperliquid).
 * 
 * URGENT: Loris Max plan expires Feb 28 2026. Pull everything now.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const OUT_DIR = join(__dirname, '..', 'data', 'loris-historical');
const CANDLE_DIR = join(__dirname, '..', 'data', 'hl-candles');

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function pullSymbol(symbol: string): Promise<boolean> {
  const url = `https://api.loris.tools/funding/historical?symbol=${symbol}&range=30d`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Academy-Bot-Challenge/1.0' },
    });
    if (!res.ok) {
      console.log(`  ${symbol}: HTTP ${res.status} — skipping`);
      return false;
    }
    const data = await res.json();
    
    // Validate structure
    if (!data || typeof data !== 'object') {
      console.log(`  ${symbol}: invalid response — skipping`);
      return false;
    }
    
    // Check for HL data specifically
    const hlKey = Object.keys(data.series || data).find(k => 
      k.toLowerCase().includes('hyperliquid') || k.toLowerCase() === 'hl'
    );
    const hlPoints = data.series?.[hlKey || 'hyperliquid'] || data[hlKey || 'hyperliquid'] || [];
    
    writeFileSync(join(OUT_DIR, `${symbol}.json`), JSON.stringify(data, null, 2), 'utf-8');
    console.log(`  ✅ ${symbol}: saved (${hlPoints.length || '?'} HL points, ${Object.keys(data.series || data).length} exchanges)`);
    return true;
  } catch (err: any) {
    console.log(`  ❌ ${symbol}: ${err.message}`);
    return false;
  }
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  // Get coin list from HL candles (our universe)
  const coins = readdirSync(CANDLE_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''))
    .sort();

  // Also add any coins from existing loris data that aren't in candles
  if (existsSync(OUT_DIR)) {
    const existing = readdirSync(OUT_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
    for (const c of existing) {
      if (!coins.includes(c)) coins.push(c);
    }
  }

  console.log(`🔄 Pulling Loris historical funding for ${coins.length} coins...\n`);
  
  let success = 0, fail = 0;
  
  for (const coin of coins) {
    const pulled = await pullSymbol(coin);
    if (pulled) success++; else fail++;
    // Rate limit: 500ms between requests
    await sleep(500);
  }

  console.log(`\n✅ Done: ${success} success, ${fail} failed out of ${coins.length} coins`);
  
  // Quick summary of HL data coverage
  console.log('\n📊 HL data coverage:');
  const files = readdirSync(OUT_DIR).filter(f => f.endsWith('.json'));
  for (const f of files.slice(0, 10)) {
    try {
      const d = JSON.parse(readFileSync(join(OUT_DIR, f), 'utf-8'));
      const hl = d.series?.hyperliquid || [];
      if (hl.length > 0) {
        const first = new Date(hl[0].t).toISOString().slice(0, 10);
        const last = new Date(hl[hl.length - 1].t).toISOString().slice(0, 10);
        console.log(`  ${f.replace('.json','')}: ${hl.length} points (${first} → ${last})`);
      }
    } catch {}
  }
  if (files.length > 10) console.log(`  ... and ${files.length - 10} more`);
}

main().catch(err => {
  console.error('❌ Pull failed:', err.message);
  process.exit(1);
});
