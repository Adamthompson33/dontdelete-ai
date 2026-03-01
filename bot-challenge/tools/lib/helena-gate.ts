/**
 * Helena Gate — checks if Helena has halted new positions.
 * Signal generators should call this before logging new signals.
 * 
 * Usage: import { isHalted } from './lib/helena-gate';
 *        if (isHalted()) { console.log('Helena HALT active'); return; }
 */

import * as fs from 'fs';
import * as path from 'path';

const HALT_FILE = path.join(__dirname, '..', '..', 'results', 'helena-halt.json');

interface HaltState {
  active: boolean;
  reason: string;
  since: string;
}

/**
 * Check if Helena has halted new positions.
 * Returns { halted: false } or { halted: true, reason: string }
 */
export function isHalted(): { halted: boolean; reason?: string } {
  try {
    const data: HaltState = JSON.parse(fs.readFileSync(HALT_FILE, 'utf-8'));
    if (data.active) {
      return { halted: true, reason: data.reason };
    }
  } catch {
    // No halt file = not halted
  }
  return { halted: false };
}
