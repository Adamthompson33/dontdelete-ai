/**
 * Closed Position Gate — prevents zombie positions from reappearing
 * 
 * Oracle directive 2026-02-26: tools must check this before writing
 * position signals to paper-ledger.json or medic-state.json.
 */

import * as fs from 'fs';
import * as path from 'path';

const CLOSED_FILE = path.join(__dirname, '..', '..', 'results', 'closed-positions.json');

interface ClosedPosition {
  coin: string;
  direction: string;
  closedAt: string;
  reason: string;
}

interface ClosedPositionsFile {
  closedPositions: ClosedPosition[];
}

export function isClosedPosition(coin: string, direction: string): boolean {
  try {
    const data: ClosedPositionsFile = JSON.parse(fs.readFileSync(CLOSED_FILE, 'utf-8'));
    return data.closedPositions.some(
      p => p.coin === coin && p.direction === direction
    );
  } catch {
    return false; // if file doesn't exist, nothing is closed
  }
}

export function addClosedPosition(coin: string, direction: string, reason: string): void {
  let data: ClosedPositionsFile;
  try {
    data = JSON.parse(fs.readFileSync(CLOSED_FILE, 'utf-8'));
  } catch {
    data = { closedPositions: [] };
  }
  
  // Don't duplicate
  if (!data.closedPositions.some(p => p.coin === coin && p.direction === direction)) {
    data.closedPositions.push({
      coin,
      direction,
      closedAt: new Date().toISOString(),
      reason,
    });
    fs.writeFileSync(CLOSED_FILE, JSON.stringify(data, null, 2), 'utf-8');
  }
}
