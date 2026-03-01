#!/usr/bin/env npx tsx
/**
 * Stale Signal Cleanup — Bot Challenge Tool
 *
 * Cleans up the paper ledger by:
 * 1. Expiring non-evaluatable signals (arb, sports, correlation, monitor alerts)
 * 2. Locking stale evaluatable signals that slipped through migration (>72h, unlocked)
 * 3. Purging ancient signals older than 30 days
 * 4. Deleting report files older than 14 days
 */

import * as fs from 'fs';
import * as path from 'path';

const LEDGER_FILE = path.join(__dirname, '..', 'results', 'paper-ledger.json');
const REPORT_DIR = path.join(__dirname, '..', 'reports');

const NOW = Date.now();
const CUTOFF_72H = NOW - 72 * 3600 * 1000;
const CUTOFF_30D = NOW - 30 * 24 * 3600 * 1000;
const CUTOFF_14D = NOW - 14 * 24 * 3600 * 1000;

// Tools that never produce HL-price-trackable outcomes
const NON_EVALUATABLE = new Set([
  'sakura-arb-scanner',
  'prophet-lead-lag',
  'jinx-correlation-monitor',
  'medic-position-monitor',
]);

// Tools that can have real price outcomes
const EVALUATABLE = new Set([
  'sentry-sentiment-scanner',
  'pixel-momentum',
  'rei-funding-carry',
  'jackbot-temporal-edge',
]);

interface Signal {
  tool: string;
  timestamp: string;
  unixMs: number;
  coin: string;
  direction: string;
  confidence: string | number;
  entryPrice?: number;
  annualizedRate?: number;
  expectedEdge?: number;
  outcome?: {
    checkedAt: string;
    currentPrice?: number;
    currentRate?: number;
    priceChange?: number;
    pnlPercent?: number;
    status: string;
    locked?: boolean;
    lockedAt?: string;
    lockReason?: string;
  };
  [key: string]: unknown;
}

function run(): void {
  // --- Load ledger ---
  const raw = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8'));
  const signals: Signal[] = Array.isArray(raw) ? raw : (raw.signals ?? []);

  const nowIso = new Date(NOW).toISOString();

  let expiredCount = 0;
  let lockedStaleCount = 0;
  let purgedCount = 0;
  const kept: Signal[] = [];

  for (const signal of signals) {
    // Step 3: Purge ancient signals (>30 days) entirely
    if (signal.unixMs < CUTOFF_30D) {
      purgedCount++;
      continue;
    }

    // Step 1: Expire non-evaluatable signals (if not already locked)
    if (NON_EVALUATABLE.has(signal.tool)) {
      if (!signal.outcome?.locked) {
        signal.outcome = {
          checkedAt: signal.outcome?.checkedAt ?? nowIso,
          ...(signal.outcome ?? {}),
          status: 'EXPIRED',
          locked: true,
          lockedAt: nowIso,
          lockReason: 'non-evaluatable',
        };
        expiredCount++;
      }
      kept.push(signal);
      continue;
    }

    // Step 2: Lock stale evaluatable signals (>72h, still unlocked)
    if (EVALUATABLE.has(signal.tool) && signal.unixMs < CUTOFF_72H && !signal.outcome?.locked) {
      const pnl = signal.outcome?.pnlPercent ?? 0;
      signal.outcome = {
        checkedAt: signal.outcome?.checkedAt ?? nowIso,
        ...(signal.outcome ?? {}),
        pnlPercent: pnl,
        status: signal.outcome?.status ?? 'UNKNOWN',
        locked: true,
        lockedAt: nowIso,
        lockReason: 'stale-cleanup',
      };
      lockedStaleCount++;
    }

    kept.push(signal);
  }

  // --- Save updated ledger ---
  const output = Array.isArray(raw) ? kept : { ...raw, signals: kept };
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(output, null, 2));

  // --- Step 4: Clean up old report files ---
  let reportsDeleted = 0;
  if (fs.existsSync(REPORT_DIR)) {
    const files = fs.readdirSync(REPORT_DIR);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const filePath = path.join(REPORT_DIR, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < CUTOFF_14D) {
        fs.unlinkSync(filePath);
        reportsDeleted++;
      }
    }
  }

  // --- Report ---
  const remaining = kept.filter(s => !s.outcome?.locked).length;
  console.log(`\nStale-signal cleanup complete`);
  console.log(`  Expired (non-evaluatable):   ${expiredCount}`);
  console.log(`  Locked  (stale evaluatable): ${lockedStaleCount}`);
  console.log(`  Purged  (>30 days old):      ${purgedCount}`);
  console.log(`  Remaining live signals:      ${remaining}`);
  console.log(`  Total signals after cleanup: ${kept.length}`);
  console.log(`  Reports deleted (>14 days):  ${reportsDeleted}`);
  console.log();
}

run();
