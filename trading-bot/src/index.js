#!/usr/bin/env node
// Solana Memecoin Trading Bot - Main Entry Point
import config from './config.js';
import scanner from './scanner.js';
import analyzer from './analyzer.js';
import executor from './executor.js';
import risk from './risk.js';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';

// Parse command line args
const isPaperTrading = process.argv.includes('--paper') || config.paperTrading;
config.paperTrading = isPaperTrading;

console.log('='.repeat(60));
console.log('  SOLANA MEMECOIN TRADING BOT');
console.log(`  Mode: ${isPaperTrading ? '📝 PAPER TRADING' : '💰 LIVE TRADING'}`);
console.log(`  Wallet: ${config.walletAddress}`);
console.log('='.repeat(60));

// Ensure log directory exists
if (!existsSync(config.logPath)) {
  mkdirSync(config.logPath, { recursive: true });
}

// Track last scan time and signals
let lastScanTime = 0;
let pendingSignals = [];

/**
 * Log to file
 */
function logToFile(type, data) {
  const logFile = `${config.logPath}/${new Date().toISOString().split('T')[0]}.json`;
  const entry = {
    timestamp: new Date().toISOString(),
    type,
    data,
  };
  
  try {
    let logs = [];
    if (existsSync(logFile)) {
      logs = JSON.parse(readFileSync(logFile, 'utf-8'));
    }
    logs.push(entry);
    writeFileSync(logFile, JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error('[Bot] Log write error:', err.message);
  }
}

/**
 * Main trading cycle
 */
async function tradingCycle() {
  console.log(`\n[${new Date().toLocaleTimeString()}] Running trading cycle...`);
  
  try {
    // 1. Scan for new signals
    const signals = await scanner.scan();
    console.log(`[Bot] Found ${signals.length} potential signals`);
    logToFile('SCAN', { signalCount: signals.length, signals });
    
    // 2. Analyze promising signals
    for (const signal of signals) {
      if (signal.signalStrength < 0.5) continue;
      
      const analysis = await analyzer.analyzeToken(signal);
      logToFile('ANALYSIS', analysis);
      
      // 3. Check if we should trade
      if (analysis.recommendation.action === 'BUY') {
        const positionSol = analysis.recommendation.positionSol;
        
        // Check risk limits
        const canOpen = risk.canOpenPosition(positionSol);
        if (!canOpen.allowed) {
          console.log(`[Bot] Cannot open position: ${canOpen.reason}`);
          continue;
        }
        
        // Execute buy
        console.log(`[Bot] Executing BUY: ${signal.name} for ${positionSol} SOL`);
        const result = await executor.buyToken(signal.token, positionSol);
        
        if (result.success) {
          // Record position
          risk.recordPosition({
            token: signal.token,
            name: signal.name,
            price: signal.price,
            solAmount: positionSol,
            tokenAmount: result.quote?.outAmount || 0,
          });
          
          logToFile('TRADE', {
            action: 'BUY',
            token: signal.token,
            name: signal.name,
            solAmount: positionSol,
            paper: result.paper,
            signature: result.signature,
          });
          
          console.log(`[Bot] ✅ ${isPaperTrading ? 'PAPER ' : ''}BUY executed: ${signal.name}`);
        } else {
          console.log(`[Bot] ❌ BUY failed: ${result.error}`);
          logToFile('ERROR', { action: 'BUY', error: result.error, signal });
        }
      }
    }
    
    // 4. Check existing positions for TP/SL
    // TODO: Implement position monitoring with live prices
    
    // 5. Log daily summary
    const summary = risk.getDailySummary();
    console.log(`[Bot] Daily Summary: ${summary.tradesCompleted} trades, P&L: ${summary.dailyPnL} SOL`);
    
  } catch (err) {
    console.error('[Bot] Trading cycle error:', err.message);
    logToFile('ERROR', { cycle: 'trading', error: err.message });
  }
}

/**
 * Position monitoring cycle (checks TP/SL)
 */
async function monitorPositions() {
  const positions = risk.getPositions();
  if (positions.length === 0) return;
  
  console.log(`[Bot] Monitoring ${positions.length} open positions...`);
  
  // TODO: Fetch current prices and check TP/SL
  // For now, this is a placeholder for the monitoring logic
}

/**
 * Main loop
 */
async function main() {
  // Initialize wallet
  executor.initWallet();
  
  // Get initial balance
  const balance = await executor.getBalance();
  console.log(`[Bot] Wallet balance: ${balance.toFixed(4)} SOL`);
  
  if (balance < 0.01 && !isPaperTrading) {
    console.error('[Bot] ⚠️  Low balance! Please fund wallet for live trading.');
  }
  
  console.log(`[Bot] Starting main loop (interval: ${config.scanner.intervalMs / 1000}s)...\n`);
  
  // Run immediately
  await tradingCycle();
  
  // Then run on interval
  setInterval(async () => {
    await tradingCycle();
    await monitorPositions();
  }, config.scanner.intervalMs);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Bot] Shutting down...');
  risk.saveTradeHistory();
  console.log('[Bot] Trade history saved. Goodbye!');
  process.exit(0);
});

// Start the bot
main().catch(err => {
  console.error('[Bot] Fatal error:', err);
  process.exit(1);
});
