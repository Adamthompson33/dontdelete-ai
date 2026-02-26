#!/usr/bin/env npx tsx
/**
 * Pull 30-day funding rate history from Binance Futures API.
 * Endpoint: GET /fapi/v1/fundingRate — public, no auth.
 * Returns 8-hourly funding rates. Saves to data/binance-funding/
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const OUT_DIR = join(__dirname, '..', 'data', 'binance-funding');
const KLINE_DIR = join(__dirname, '..', 'data', 'binance-klines');
const BASE_URL = 'https://fapi.binance.com/fapi/v1/fundingRate';

const END_MS = Date.now();
const START_MS = END_MS - 30 * 24 * 3600 * 1000;

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function pullFunding(coin: string): Promise<boolean> {
  const symbol = `${coin}USDT`;
  const allRates: any[] = [];
  let startTime = START_MS;
  
  while (startTime < END_MS) {
    const url = `${BASE_URL}?symbol=${symbol}&startTime=${startTime}&endTime=${END_MS}&limit=1000`;
    try {
      const res = await fetch(url);
      if (res.status === 400 || res.status === 404) {
        console.log(`  ${coin}: not found on Binance Futures — skipping`);
        return false;
      }
      if (res.status === 429) {
        console.log(`  Rate limited — waiting 30s...`);
        await sleep(30000);
        continue;
      }
      if (!res.ok) {
        console.log(`  ${coin}: HTTP ${res.status} — skipping`);
        return false;
      }
      
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;
      
      for (const r of data) {
        allRates.push({
          t: r.fundingTime,
          symbol: r.symbol,
          rate: parseFloat(r.fundingRate),    // raw rate (e.g., 0.0001 = 1 bps)
          rateBps: parseFloat(r.fundingRate) * 10000,  // in bps
          rateAPR: parseFloat(r.fundingRate) * 3 * 365 * 100,  // annualized %
        });
      }
      
      startTime = data[data.length - 1].fundingTime + 1;
      if (data.length < 1000) break;
    } catch (e: any) {
      console.log(`  ${coin}: fetch error — ${e.message}`);
      return false;
    }
    await sleep(200);
  }
  
  if (allRates.length > 0) {
    writeFileSync(join(OUT_DIR, `${coin}.json`), JSON.stringify(allRates, null, 2));
    console.log(`  ${coin}: ${allRates.length} funding snapshots saved`);
    return true;
  }
  return false;
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  
  // Use coins that have Binance klines
  const coins = readdirSync(KLINE_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
  
  console.log(`Pulling 30-day funding rates from Binance Futures for ${coins.length} coins...`);
  console.log(`Period: ${new Date(START_MS).toISOString()} to ${new Date(END_MS).toISOString()}\n`);
  
  let success = 0, failed = 0;
  for (const coin of coins) {
    const ok = await pullFunding(coin);
    if (ok) success++; else failed++;
    await sleep(300);
  }
  
  console.log(`\nDone! ${success} coins pulled, ${failed} skipped/failed.`);
}

main().catch(console.error);
