#!/usr/bin/env npx tsx
/**
 * Phantom Whale Tracker — Bot Challenge Tool 12
 * 
 * Monitors top Polymarket whale wallets for position changes.
 * When a whale enters or significantly changes a position, logs it as a signal.
 * 
 * Usage: npx tsx tools/phantom-whale-tracker.ts
 * 
 * Data source: Polymarket Gamma API (read-only)
 * NOTE: Geo-blocked from AU — returns HTML block page. Needs US proxy/VPN
 *       or to run on a US-based server. The tool works correctly otherwise.
 * Cron slot: :03
 */

import * as fs from 'fs';
import * as path from 'path';

// ═══ Config ═══

const POLYMARKET_CLOB = 'https://clob.polymarket.com';
const GAMMA_API = 'https://gamma-api.polymarket.com';

// Top whale wallets to track
const WHALE_WALLETS: { id: string; alias: string; notes: string }[] = [
  { id: '432614799197', alias: 'PhD Student', notes: '+$2.67M, sports arb' },
  { id: 'gabagool22', alias: 'Gabagool', notes: '+$1.57M, micro-arb' },
  { id: 'SwissMiss', alias: 'SwissMiss', notes: '+$2.8M, multi-market' },
  { id: 'fengdubiying', alias: 'FengDuBiYing', notes: '+$2.9M, politics/crypto' },
];

const POSITION_CHANGE_THRESHOLD = 0.20; // 20% size change = signal
const STATE_FILE = path.join(__dirname, '..', 'results', 'phantom-state.json');
const LEDGER_FILE = path.join(__dirname, '..', 'results', 'paper-ledger.json');

// ═══ Types ═══

interface WhalePosition {
  market: string;
  conditionId: string;
  outcome: string;
  size: number;
  avgPrice: number;
  currentPrice: number;
}

interface WhaleState {
  [walletId: string]: {
    positions: WhalePosition[];
    lastScanAt: string;
  };
}

interface WhaleSignal {
  tool: 'phantom-whale-tracker';
  timestamp: string;
  unixMs: number;
  whale: string;
  whaleAlias: string;
  market: string;
  direction: 'LONG' | 'SHORT' | 'CLOSED';
  changeType: 'NEW_POSITION' | 'SIZE_INCREASE' | 'SIZE_DECREASE' | 'POSITION_CLOSED';
  positionSize: number;
  previousSize: number;
  changePercent: number;
  confidence: number;
  reasoning: string;
}

// ═══ API Helpers ═══

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  // Note: Polymarket's Gamma API uses a self-signed cert when geo-blocked (AU).
  // We set NODE_TLS_REJECT_UNAUTHORIZED=0 as a workaround for read-only data.
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  return res;
}

async function fetchWhalePositions(walletId: string): Promise<WhalePosition[]> {
  try {
    // Try the Polymarket profile/positions endpoint
    const res = await fetchWithTimeout(`${GAMMA_API}/positions?user=${walletId}&limit=50&sortBy=value&sortOrder=desc`);
    
    if (res.status === 403 || res.status === 451) {
      console.log(`  ⚠️ Geo-blocked or forbidden for ${walletId}`);
      return [];
    }
    
    if (!res.ok) {
      // Fallback: try CLOB API orders endpoint
      console.log(`  ⚠️ Gamma API ${res.status} for ${walletId}, trying CLOB...`);
      return await fetchWhalePositionsCLOB(walletId);
    }
    
    const data = await res.json() as any[];
    if (!Array.isArray(data)) return [];
    
    return data
      .filter((p: any) => p.size > 0)
      .map((p: any) => ({
        market: p.title || p.question || p.market || 'Unknown',
        conditionId: p.conditionId || p.condition_id || '',
        outcome: p.outcome || p.side || 'YES',
        size: Number(p.size) || 0,
        avgPrice: Number(p.avgPrice) || Number(p.average_price) || 0,
        currentPrice: Number(p.currentPrice) || Number(p.price) || 0,
      }));
  } catch (err: any) {
    console.log(`  ❌ Error fetching positions for ${walletId}: ${err.message}`);
    return [];
  }
}

async function fetchWhalePositionsCLOB(walletId: string): Promise<WhalePosition[]> {
  try {
    const res = await fetchWithTimeout(`${POLYMARKET_CLOB}/orders?maker=${walletId}&limit=50`);
    if (!res.ok) return [];
    
    const data = await res.json() as any[];
    if (!Array.isArray(data)) return [];
    
    // Aggregate orders into positions
    const posMap = new Map<string, WhalePosition>();
    for (const order of data) {
      const key = `${order.asset_id || order.token_id}`;
      if (!posMap.has(key)) {
        posMap.set(key, {
          market: order.market || key,
          conditionId: order.condition_id || '',
          outcome: order.side === 'BUY' ? 'YES' : 'NO',
          size: 0,
          avgPrice: Number(order.price) || 0,
          currentPrice: Number(order.price) || 0,
        });
      }
      const pos = posMap.get(key)!;
      pos.size += Number(order.original_size) || Number(order.size) || 0;
    }
    
    return Array.from(posMap.values()).filter(p => p.size > 0);
  } catch {
    return [];
  }
}

// ═══ State Management ═══

function loadState(): WhaleState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

function saveState(state: WhaleState): void {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ═══ Signal Detection ═══

function detectChanges(
  walletId: string,
  alias: string,
  current: WhalePosition[],
  previous: WhalePosition[]
): WhaleSignal[] {
  const signals: WhaleSignal[] = [];
  const now = new Date();
  const prevMap = new Map(previous.map(p => [`${p.conditionId}:${p.outcome}`, p]));
  const currMap = new Map(current.map(p => [`${p.conditionId}:${p.outcome}`, p]));

  // Check for new and changed positions
  for (const [key, pos] of currMap) {
    const prev = prevMap.get(key);
    
    if (!prev) {
      // New position
      signals.push({
        tool: 'phantom-whale-tracker',
        timestamp: now.toISOString(),
        unixMs: now.getTime(),
        whale: walletId,
        whaleAlias: alias,
        market: pos.market,
        direction: pos.outcome === 'YES' ? 'LONG' : 'SHORT',
        changeType: 'NEW_POSITION',
        positionSize: pos.size,
        previousSize: 0,
        changePercent: 100,
        confidence: 0.7,
        reasoning: `${alias} opened new ${pos.outcome} position in "${pos.market}" — size: ${pos.size.toFixed(2)}`,
      });
    } else if (pos.size > prev.size * (1 + POSITION_CHANGE_THRESHOLD)) {
      // Size increased >20%
      const change = ((pos.size - prev.size) / prev.size) * 100;
      signals.push({
        tool: 'phantom-whale-tracker',
        timestamp: now.toISOString(),
        unixMs: now.getTime(),
        whale: walletId,
        whaleAlias: alias,
        market: pos.market,
        direction: pos.outcome === 'YES' ? 'LONG' : 'SHORT',
        changeType: 'SIZE_INCREASE',
        positionSize: pos.size,
        previousSize: prev.size,
        changePercent: Math.round(change),
        confidence: Math.min(0.9, 0.5 + (change / 200)),
        reasoning: `${alias} increased ${pos.outcome} position in "${pos.market}" by ${change.toFixed(0)}% (${prev.size.toFixed(2)} → ${pos.size.toFixed(2)})`,
      });
    } else if (pos.size < prev.size * (1 - POSITION_CHANGE_THRESHOLD)) {
      // Size decreased >20%
      const change = ((prev.size - pos.size) / prev.size) * 100;
      signals.push({
        tool: 'phantom-whale-tracker',
        timestamp: now.toISOString(),
        unixMs: now.getTime(),
        whale: walletId,
        whaleAlias: alias,
        market: pos.market,
        direction: 'CLOSED',
        changeType: 'SIZE_DECREASE',
        positionSize: pos.size,
        previousSize: prev.size,
        changePercent: Math.round(-change),
        confidence: 0.5,
        reasoning: `${alias} reduced ${pos.outcome} position in "${pos.market}" by ${change.toFixed(0)}% (${prev.size.toFixed(2)} → ${pos.size.toFixed(2)})`,
      });
    }
  }

  // Check for closed positions
  for (const [key, prev] of prevMap) {
    if (!currMap.has(key)) {
      signals.push({
        tool: 'phantom-whale-tracker',
        timestamp: now.toISOString(),
        unixMs: now.getTime(),
        whale: walletId,
        whaleAlias: alias,
        market: prev.market,
        direction: 'CLOSED',
        changeType: 'POSITION_CLOSED',
        positionSize: 0,
        previousSize: prev.size,
        changePercent: -100,
        confidence: 0.6,
        reasoning: `${alias} closed ${prev.outcome} position in "${prev.market}" (was ${prev.size.toFixed(2)})`,
      });
    }
  }

  return signals;
}

// ═══ Ledger ═══

function appendToLedger(signals: WhaleSignal[]): void {
  let ledger: any = { signals: [], lastScanAt: '' };
  try {
    if (fs.existsSync(LEDGER_FILE)) {
      ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf-8'));
    }
  } catch {}
  
  if (!Array.isArray(ledger.signals)) ledger.signals = [];
  ledger.signals.push(...signals);
  ledger.lastScanAt = new Date().toISOString();
  
  const dir = path.dirname(LEDGER_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2));
}

// ═══ Main ═══

async function main() {
  console.log('👻 Phantom Whale Tracker — Bot Challenge Tool 12');
  console.log('=================================================\n');
  
  const state = loadState();
  const allSignals: WhaleSignal[] = [];
  
  for (const whale of WHALE_WALLETS) {
    console.log(`🐋 Tracking ${whale.alias} (${whale.id})...`);
    
    const positions = await fetchWhalePositions(whale.id);
    console.log(`   Found ${positions.length} active positions`);
    
    const previous = state[whale.id]?.positions || [];
    const isFirstScan = !state[whale.id];
    
    if (isFirstScan) {
      console.log(`   📋 First scan — establishing baseline (${positions.length} positions)`);
    } else {
      const signals = detectChanges(whale.id, whale.alias, positions, previous);
      if (signals.length > 0) {
        console.log(`   🔔 ${signals.length} signal(s) detected:`);
        for (const s of signals) {
          console.log(`      ${s.changeType}: ${s.reasoning}`);
        }
        allSignals.push(...signals);
      } else {
        console.log(`   ✅ No significant changes`);
      }
    }
    
    // Update state
    state[whale.id] = {
      positions,
      lastScanAt: new Date().toISOString(),
    };
    
    // Rate limit between wallets
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Save state
  saveState(state);
  
  // Append signals to ledger
  if (allSignals.length > 0) {
    appendToLedger(allSignals);
    console.log(`\n📝 ${allSignals.length} signal(s) written to paper-ledger.json`);
  } else {
    console.log('\n✅ No new signals this scan');
  }
  
  console.log(`\n👻 Phantom scan complete at ${new Date().toISOString()}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
