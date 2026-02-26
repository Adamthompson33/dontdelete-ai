#!/usr/bin/env npx tsx
/**
 * Pull 30-day 1h klines from Binance public API for all 34 coins.
 * Free, no auth. Endpoint: GET /api/v3/klines
 * Saves to data/binance-klines/
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const OUT_DIR = join(__dirname, '..', 'data', 'binance-klines');
const BASE_URL = 'https://api.binance.com/api/v3/klines';

// Map HL coin names to Binance symbols
// Most are just COINUSDT, but some need special handling
const COIN_MAP: Record<string, string> = {
  'ACE': 'ACEUSDT', 'ALT': 'ALTUSDT', 'ARB': 'ARBUSDT', 'AXS': 'AXSUSDT',
  'BERA': 'BERAUSDT', 'BSV': 'BSVUSDT', 'BTC': 'BTCUSDT', 'CELO': 'CELOUSDT',
  'DASH': 'DASHUSDT', 'ETH': 'ETHUSDT', 'GAS': 'GASUSDT', 'JTO': 'JTOUSDT',
  'KAITO': 'KAITOUSDT', 'LAYER': 'LAYERUSDT', 'ME': 'MEUSDT', 'OP': 'OPUSDT',
  'RUNE': 'RUNEUSDT', 'SAND': 'SANDUSDT', 'SOL': 'SOLUSDT', 'UMA': 'UMAUSDT',
  'W': 'WUSDT', 'YGG': 'YGGUSDT',
  // These may not exist on Binance — will gracefully skip
  'AVNT': 'AVNTUSDT', 'AZTEC': 'AZTECUSDT', 'FOGO': 'FOGOUSDT',
  'GOAT': 'GOATUSDT', 'GRIFFAIN': 'GRIFFAINUSDT', 'MON': 'MONUSDT',
  'PURR': 'PURRUSDT', 'SKR': 'SKRUSDT', 'SOPH': 'SOPHUSDT',
  'TNSR': 'TNSRUSDT', 'VVV': 'VVVUSDT', 'ZORA': 'ZORAUSDT',
};

// 30 days back from now
const END_MS = Date.now();
const START_MS = END_MS - 30 * 24 * 3600 * 1000;

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function pullKlines(coin: string, symbol: string): Promise<boolean> {
  const allCandles: any[] = [];
  let startTime = START_MS;
  
  while (startTime < END_MS) {
    const url = `${BASE_URL}?symbol=${symbol}&interval=1h&startTime=${startTime}&endTime=${END_MS}&limit=1000`;
    try {
      const res = await fetch(url);
      if (res.status === 400 || res.status === 404) {
        console.log(`  ${coin} (${symbol}): not found on Binance — skipping`);
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
      
      for (const k of data) {
        allCandles.push({
          t: k[0],           // open time
          T: k[6],           // close time
          s: coin,
          i: '1h',
          o: k[1],           // open
          c: k[4],           // close
          h: k[2],           // high
          l: k[3],           // low
          v: k[5],           // volume
          n: k[8],           // number of trades
        });
      }
      
      // Next batch starts after last candle
      startTime = data[data.length - 1][6] + 1;
      
      if (data.length < 1000) break; // got everything
    } catch (e: any) {
      console.log(`  ${coin}: fetch error — ${e.message}`);
      return false;
    }
    
    await sleep(200); // respect rate limits
  }
  
  if (allCandles.length > 0) {
    writeFileSync(join(OUT_DIR, `${coin}.json`), JSON.stringify(allCandles, null, 2));
    console.log(`  ${coin}: ${allCandles.length} candles saved`);
    return true;
  }
  return false;
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  
  // Get coin list from HL candles directory
  const hlCoins = readdirSync(join(__dirname, '..', 'data', 'hl-candles'))
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
  
  console.log(`Pulling 30-day 1h klines from Binance for ${hlCoins.length} coins...`);
  console.log(`Period: ${new Date(START_MS).toISOString()} to ${new Date(END_MS).toISOString()}\n`);
  
  let success = 0, failed = 0;
  
  for (const coin of hlCoins) {
    const symbol = COIN_MAP[coin] || `${coin}USDT`;
    const ok = await pullKlines(coin, symbol);
    if (ok) success++; else failed++;
    await sleep(300); // gap between coins
  }
  
  console.log(`\nDone! ${success} coins pulled, ${failed} skipped/failed.`);
}

main().catch(console.error);
