// Risk Manager - Position sizing, P&L tracking, and risk limits
import { readFileSync, writeFileSync, existsSync } from 'fs';
import config from './config.js';

// In-memory state
let positions = [];
let tradeHistory = [];
let dailyPnL = 0;
let dailyPnLDate = new Date().toDateString();

/**
 * Load trade history from file
 */
export function loadTradeHistory() {
  try {
    if (existsSync(config.tradeLogPath)) {
      const data = JSON.parse(readFileSync(config.tradeLogPath, 'utf-8'));
      positions = data.positions || [];
      tradeHistory = data.history || [];
      dailyPnL = data.dailyPnL || 0;
      dailyPnLDate = data.dailyPnLDate || new Date().toDateString();
      
      // Reset daily P&L if new day
      if (dailyPnLDate !== new Date().toDateString()) {
        dailyPnL = 0;
        dailyPnLDate = new Date().toDateString();
      }
      
      console.log(`[Risk] Loaded ${positions.length} positions, ${tradeHistory.length} historical trades`);
    }
  } catch (err) {
    console.error('[Risk] Failed to load trade history:', err.message);
  }
}

/**
 * Save trade history to file
 */
export function saveTradeHistory() {
  try {
    writeFileSync(config.tradeLogPath, JSON.stringify({
      positions,
      history: tradeHistory.slice(-1000), // Keep last 1000 trades
      dailyPnL,
      dailyPnLDate,
      updatedAt: new Date().toISOString(),
    }, null, 2));
  } catch (err) {
    console.error('[Risk] Failed to save trade history:', err.message);
  }
}

/**
 * Check if we can take a new position
 */
export function canOpenPosition(solAmount) {
  // Check max open positions
  if (positions.length >= config.risk.maxOpenPositions) {
    return { allowed: false, reason: `Max ${config.risk.maxOpenPositions} open positions reached` };
  }
  
  // Check daily loss limit
  if (dailyPnL <= -config.risk.maxDailyLossSol) {
    return { allowed: false, reason: `Daily loss limit reached: ${dailyPnL.toFixed(4)} SOL` };
  }
  
  // Check position size
  if (solAmount > config.risk.maxPositionSol) {
    return { allowed: false, reason: `Position size ${solAmount} exceeds max ${config.risk.maxPositionSol}` };
  }
  
  return { allowed: true };
}

/**
 * Record a new position
 */
export function recordPosition(trade) {
  const position = {
    id: Date.now().toString(36),
    token: trade.token,
    name: trade.name,
    entryPrice: trade.price,
    entrySol: trade.solAmount,
    tokenAmount: trade.tokenAmount,
    entryTime: new Date().toISOString(),
    takeProfitPrice: trade.price * (1 + config.risk.takeProfitPercent / 100),
    stopLossPrice: trade.price * (1 - config.risk.stopLossPercent / 100),
    status: 'OPEN',
  };
  
  positions.push(position);
  tradeHistory.push({ ...position, action: 'BUY' });
  saveTradeHistory();
  
  console.log(`[Risk] Position opened: ${position.name} @ $${position.entryPrice}`);
  return position;
}

/**
 * Close a position
 */
export function closePosition(positionId, exitPrice, exitSol, reason) {
  const idx = positions.findIndex(p => p.id === positionId);
  if (idx === -1) return null;
  
  const position = positions[idx];
  const pnl = exitSol - position.entrySol;
  const pnlPercent = ((exitSol / position.entrySol) - 1) * 100;
  
  position.exitPrice = exitPrice;
  position.exitSol = exitSol;
  position.exitTime = new Date().toISOString();
  position.pnl = pnl;
  position.pnlPercent = pnlPercent;
  position.exitReason = reason;
  position.status = 'CLOSED';
  
  // Update daily P&L
  dailyPnL += pnl;
  
  // Move to history
  tradeHistory.push({ ...position, action: 'SELL' });
  positions.splice(idx, 1);
  saveTradeHistory();
  
  console.log(`[Risk] Position closed: ${position.name} | P&L: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(4)} SOL (${pnlPercent.toFixed(1)}%)`);
  return position;
}

/**
 * Check positions for take-profit / stop-loss
 */
export function checkPositions(currentPrices) {
  const actions = [];
  
  for (const position of positions) {
    const currentPrice = currentPrices[position.token];
    if (!currentPrice) continue;
    
    // Take profit
    if (currentPrice >= position.takeProfitPrice) {
      actions.push({
        action: 'SELL',
        position,
        reason: 'TAKE_PROFIT',
        currentPrice,
      });
    }
    // Stop loss
    else if (currentPrice <= position.stopLossPrice) {
      actions.push({
        action: 'SELL',
        position,
        reason: 'STOP_LOSS',
        currentPrice,
      });
    }
  }
  
  return actions;
}

/**
 * Get current positions
 */
export function getPositions() {
  return [...positions];
}

/**
 * Get daily summary
 */
export function getDailySummary() {
  const todayTrades = tradeHistory.filter(t => 
    t.exitTime && new Date(t.exitTime).toDateString() === new Date().toDateString()
  );
  
  const wins = todayTrades.filter(t => t.pnl > 0).length;
  const losses = todayTrades.filter(t => t.pnl < 0).length;
  
  return {
    date: new Date().toDateString(),
    openPositions: positions.length,
    tradesCompleted: todayTrades.length,
    wins,
    losses,
    winRate: todayTrades.length > 0 ? (wins / todayTrades.length * 100).toFixed(1) : 0,
    dailyPnL: dailyPnL.toFixed(4),
    maxDailyLoss: config.risk.maxDailyLossSol,
  };
}

// Initialize on import
loadTradeHistory();

export default { 
  canOpenPosition, 
  recordPosition, 
  closePosition, 
  checkPositions, 
  getPositions, 
  getDailySummary,
  loadTradeHistory,
  saveTradeHistory,
};
