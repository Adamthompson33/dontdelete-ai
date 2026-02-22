#!/usr/bin/env npx tsx
/**
 * Prophet Lead-Lag Scanner — Bot Challenge Tool 13
 * 
 * Monitors odds movements on traditional bookmakers via The Odds API.
 * When a line moves significantly on Pinnacle/Asian books but Polymarket
 * hasn't adjusted, that's a lead-lag signal.
 * 
 * Usage: npx tsx tools/prophet-lead-lag.ts
 * 
 * Data source: The Odds API (free tier, 500 req/month)
 * Cron slot: :03:30 or bundled with Phantom at :03
 */

import * as fs from 'fs';
import * as path from 'path';

// ═══ Config ═══

const ODDS_API_KEY = '1195709200fbcdf08b49ee10120040f7';
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

// Sports to monitor (most liquid Polymarket sports markets)
const SPORTS = [
  { key: 'americanfootball_nfl', name: 'NFL' },
  { key: 'soccer_epl', name: 'Premier League' },
];

// Bookmakers to watch for sharp line moves (Asian/sharp books lead)
const SHARP_BOOKS = ['pinnacle', 'betfair_ex_eu', 'matchbook', 'betfair'];
const SOFT_BOOKS = ['draftkings', 'fanduel', 'betmgm', 'bovada'];

const SPREAD_CHANGE_THRESHOLD = 1.5;  // Points of spread movement
const ODDS_CHANGE_THRESHOLD = 0.05;   // 5% implied probability change
const STATE_FILE = path.join(__dirname, '..', 'results', 'prophet-state.json');
const LEDGER_FILE = path.join(__dirname, '..', 'results', 'paper-ledger.json');

// ═══ Types ═══

interface OddsOutcome {
  name: string;
  price: number;
  point?: number;
}

interface OddsBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: {
    key: string;
    outcomes: OddsOutcome[];
  }[];
}

interface OddsEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsBookmaker[];
}

interface LineSnapshot {
  eventId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  sharpLines: {
    bookmaker: string;
    market: string;
    outcomes: OddsOutcome[];
    impliedProbs: { [team: string]: number };
    lastUpdate: string;
  }[];
  scannedAt: string;
}

interface ProphetState {
  snapshots: { [eventId: string]: LineSnapshot };
  lastScanAt: string;
  requestsUsed: number;
}

interface LeadLagSignal {
  tool: 'prophet-lead-lag';
  timestamp: string;
  unixMs: number;
  sport: string;
  event: string;
  commenceTime: string;
  bookmaker: string;
  market: string;
  lineOld: string;
  lineNew: string;
  impliedProbOld: number;
  impliedProbNew: number;
  probShift: number;
  direction: 'LONG' | 'SHORT';
  confidence: number;
  reasoning: string;
}

// ═══ Odds Math ═══

function americanToImplied(american: number): number {
  if (american > 0) return 100 / (american + 100);
  return Math.abs(american) / (Math.abs(american) + 100);
}

function decimalToImplied(decimal: number): number {
  if (decimal <= 1) return 1;
  return 1 / decimal;
}

function priceToImplied(price: number): number {
  // The Odds API returns decimal odds by default
  if (price > 50) return americanToImplied(price); // American odds
  return decimalToImplied(price); // Decimal odds
}

// ═══ API ═══

async function fetchOdds(sportKey: string): Promise<OddsEvent[]> {
  const url = `${ODDS_API_BASE}/sports/${sportKey}/odds?apiKey=${ODDS_API_KEY}&regions=us,eu,uk&markets=h2h,spreads&oddsFormat=decimal`;
  
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    
    if (!res.ok) {
      console.log(`  ⚠️ Odds API ${res.status}: ${await res.text().catch(() => '')}`);
      return [];
    }
    
    // Track remaining requests
    const remaining = res.headers.get('x-requests-remaining');
    if (remaining) console.log(`  📊 API requests remaining: ${remaining}`);
    
    return await res.json() as OddsEvent[];
  } catch (err: any) {
    console.log(`  ❌ Error fetching odds for ${sportKey}: ${err.message}`);
    return [];
  }
}

// ═══ Analysis ═══

function extractSharpLines(event: OddsEvent): LineSnapshot['sharpLines'] {
  const lines: LineSnapshot['sharpLines'] = [];
  
  for (const bm of event.bookmakers) {
    if (!SHARP_BOOKS.includes(bm.key)) continue;
    
    for (const market of bm.markets) {
      const impliedProbs: { [team: string]: number } = {};
      for (const outcome of market.outcomes) {
        impliedProbs[outcome.name] = priceToImplied(outcome.price);
      }
      
      lines.push({
        bookmaker: bm.key,
        market: market.key,
        outcomes: market.outcomes,
        impliedProbs,
        lastUpdate: bm.last_update,
      });
    }
  }
  
  return lines;
}

function detectLeadLag(
  eventId: string,
  current: LineSnapshot,
  previous: LineSnapshot
): LeadLagSignal[] {
  const signals: LeadLagSignal[] = [];
  const now = new Date();
  
  for (const currLine of current.sharpLines) {
    // Find matching previous line
    const prevLine = previous.sharpLines.find(
      p => p.bookmaker === currLine.bookmaker && p.market === currLine.market
    );
    if (!prevLine) continue;
    
    // Compare implied probabilities for each team
    for (const [team, currProb] of Object.entries(currLine.impliedProbs)) {
      const prevProb = prevLine.impliedProbs[team];
      if (prevProb === undefined) continue;
      
      const shift = currProb - prevProb;
      const absShift = Math.abs(shift);
      
      if (absShift >= ODDS_CHANGE_THRESHOLD) {
        // Also check for spread movement
        const currOutcome = currLine.outcomes.find(o => o.name === team);
        const prevOutcome = prevLine.outcomes.find(o => o.name === team);
        const spreadChange = (currOutcome?.point !== undefined && prevOutcome?.point !== undefined)
          ? Math.abs(currOutcome.point - prevOutcome.point)
          : 0;
        
        const oldLine = prevOutcome
          ? `${prevOutcome.price}${prevOutcome.point !== undefined ? ` (${prevOutcome.point > 0 ? '+' : ''}${prevOutcome.point})` : ''}`
          : `implied ${(prevProb * 100).toFixed(1)}%`;
        const newLine = currOutcome
          ? `${currOutcome.price}${currOutcome.point !== undefined ? ` (${currOutcome.point > 0 ? '+' : ''}${currOutcome.point})` : ''}`
          : `implied ${(currProb * 100).toFixed(1)}%`;
        
        const confidence = Math.min(0.85, 0.4 + absShift * 3 + (spreadChange >= SPREAD_CHANGE_THRESHOLD ? 0.15 : 0));
        
        signals.push({
          tool: 'prophet-lead-lag',
          timestamp: now.toISOString(),
          unixMs: now.getTime(),
          sport: current.sport,
          event: `${current.homeTeam} vs ${current.awayTeam}`,
          commenceTime: current.commenceTime,
          bookmaker: currLine.bookmaker,
          market: currLine.market,
          lineOld: oldLine,
          lineNew: newLine,
          impliedProbOld: Math.round(prevProb * 1000) / 10,
          impliedProbNew: Math.round(currProb * 1000) / 10,
          probShift: Math.round(shift * 1000) / 10,
          direction: shift > 0 ? 'LONG' : 'SHORT',
          confidence,
          reasoning: `${currLine.bookmaker} moved ${team} line: ${oldLine} → ${newLine} (${shift > 0 ? '+' : ''}${(shift * 100).toFixed(1)}% implied). Polymarket may lag 2-3h.`,
        });
      }
    }
  }
  
  return signals;
}

// ═══ State Management ═══

function loadState(): ProphetState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch {}
  return { snapshots: {}, lastScanAt: '', requestsUsed: 0 };
}

function saveState(state: ProphetState): void {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ═══ Ledger ═══

function appendToLedger(signals: LeadLagSignal[]): void {
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
  console.log('🔮 Prophet Lead-Lag Scanner — Bot Challenge Tool 13');
  console.log('====================================================\n');
  
  const state = loadState();
  const allSignals: LeadLagSignal[] = [];
  
  for (const sport of SPORTS) {
    console.log(`⚽ Scanning ${sport.name} (${sport.key})...`);
    
    const events = await fetchOdds(sport.key);
    console.log(`   Found ${events.length} events with odds`);
    state.requestsUsed++;
    
    for (const event of events) {
      const sharpLines = extractSharpLines(event);
      if (sharpLines.length === 0) continue;
      
      const snapshot: LineSnapshot = {
        eventId: event.id,
        sport: sport.name,
        homeTeam: event.home_team,
        awayTeam: event.away_team,
        commenceTime: event.commence_time,
        sharpLines,
        scannedAt: new Date().toISOString(),
      };
      
      const previous = state.snapshots[event.id];
      const isFirstScan = !previous;
      
      if (isFirstScan) {
        // Baseline — no signals on first scan
      } else {
        const signals = detectLeadLag(event.id, snapshot, previous);
        if (signals.length > 0) {
          console.log(`   🔔 ${event.home_team} vs ${event.away_team}: ${signals.length} lead-lag signal(s)`);
          for (const s of signals) {
            console.log(`      ${s.bookmaker} ${s.market}: ${s.lineOld} → ${s.lineNew} (${s.probShift > 0 ? '+' : ''}${s.probShift}%)`);
          }
          allSignals.push(...signals);
        }
      }
      
      state.snapshots[event.id] = snapshot;
    }
    
    // Prune old events (past commence time + 6h)
    const cutoff = Date.now() - 6 * 3600 * 1000;
    for (const [id, snap] of Object.entries(state.snapshots)) {
      if (new Date(snap.commenceTime).getTime() < cutoff) {
        delete state.snapshots[id];
      }
    }
    
    // Rate limit between sports
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Save state
  state.lastScanAt = new Date().toISOString();
  saveState(state);
  
  // Append signals to ledger
  if (allSignals.length > 0) {
    appendToLedger(allSignals);
    console.log(`\n📝 ${allSignals.length} signal(s) written to paper-ledger.json`);
  } else {
    console.log('\n✅ No lead-lag signals this scan');
  }
  
  // Usage estimate
  console.log(`\n📊 Estimated requests used this month: ${state.requestsUsed}/500`);
  console.log(`🔮 Prophet scan complete at ${new Date().toISOString()}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
