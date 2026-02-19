/**
 * SIGNAL BOARD — Shared intelligence layer for The Academy
 * 
 * All agent tools dump their signals here BEFORE desk rounds.
 * Every agent sees the full board during their turn.
 */

export interface ToolSignal {
  /** Which agent's tool produced this */
  source: string;
  /** Tool name for attribution */
  tool: string;
  /** When the signal was generated */
  timestamp: string;
  /** One-line summary agents can quickly parse */
  headline: string;
  /** Structured signal data (tool-specific) */
  data: Record<string, any>;
  /** Tool's own confidence: 0-1 */
  confidence: number;
  /** Which market IDs this is relevant to */
  relevantMarkets?: string[];
  /** Directional lean if applicable */
  direction?: 'bullish' | 'bearish' | 'neutral' | 'long' | 'short' | 'arb';
}

export interface SignalBoard {
  /** Episode number */
  episode: number;
  /** Date string YYYY-MM-DD */
  date: string;
  /** All signals from the harvest phase */
  signals: ToolSignal[];
  /** Live market data injected before signals */
  marketData?: {
    btcPrice?: number;
    ethPrice?: number;
    fetchedAt?: string;
  };
}

/** Format the signal board as text for injection into agent prompts */
export function formatSignalBoard(board: SignalBoard): string {
  if (board.signals.length === 0) {
    return '\n═══ SIGNAL BOARD ═══\nNo tool signals available this episode.\n';
  }

  let output = `\n${'═'.repeat(55)}\n  SIGNAL BOARD -- Episode ${board.episode} -- ${board.date}\n${'═'.repeat(55)}\n\n`;

  // Live market data header — prevents price hallucination
  if (board.marketData) {
    output += `[LIVE MARKET DATA — ${board.marketData.fetchedAt || 'unknown'}]\n`;
    if (board.marketData.btcPrice) output += `  BTC: $${board.marketData.btcPrice.toLocaleString()}\n`;
    if (board.marketData.ethPrice) output += `  ETH: $${board.marketData.ethPrice.toLocaleString()}\n`;
    output += `  ⚠️ Use these prices for ALL crypto analysis. Do NOT estimate or assume prices.\n\n`;
  }


  for (const signal of board.signals) {
    if (signal.data?.error) {
      output += `[${signal.source.toUpperCase()} -- ${signal.tool} -- OFFLINE]\n`;
      output += `  ${signal.headline}\n\n`;
    } else {
      output += `[${signal.source.toUpperCase()} -- ${signal.tool} -- Confidence: ${(signal.confidence * 100).toFixed(0)}%]\n`;
      output += `  "${signal.headline}"\n`;
      if (signal.direction && signal.direction !== 'neutral') {
        output += `  Direction: ${signal.direction.toUpperCase()}\n`;
      }
      if (signal.relevantMarkets && signal.relevantMarkets.length > 0) {
        output += `  Relevant markets: ${signal.relevantMarkets.map(m => m.slice(-8)).join(', ')}\n`;
      }
      output += '\n';
    }
  }

  output += `${'═'.repeat(55)}\n`;
  return output;
}
