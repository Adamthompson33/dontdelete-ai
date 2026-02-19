// Trading Bot Configuration
export const config = {
  // Mode
  paperTrading: true, // Start in paper trading mode
  
  // Wallet
  walletPath: 'C:/Users/adamt/clawd/.secrets/solana-wallet.json',
  walletAddress: '3NPUvSGK2L2oGBQGSyCMXjrEZJ6JPiLqZyQMZRH2xAfT',
  
  // RPC & APIs
  heliusApiKey: process.env.HELIUS_API_KEY || '2a32eac3-6d39-41f4-9864-de401f98a80a',
  jupiterApiKey: process.env.JUPITER_API_KEY || '36470e72-ddbe-4b36-a742-f4f4cb7d985f',
  xaiApiKey: process.env.XAI_API_KEY,
  
  // Risk Management
  risk: {
    maxPositionSol: 0.05,      // Max SOL per trade
    maxDailyLossSol: 0.2,      // Max daily loss
    takeProfitPercent: 50,     // Take profit at +50%
    stopLossPercent: 30,       // Stop loss at -30%
    maxOpenPositions: 3,       // Max concurrent positions
  },
  
  // Scanner Settings
  scanner: {
    intervalMs: 30000,         // Check every 30 seconds
    minLiquidityUsd: 20000,    // 🔒 TIGHTENED: Min $20k liquidity (was $5k)
    maxAgeMinutes: 30,         // 🔒 TIGHTENED: Max 30 min old (was 60)
    minVolumeUsd: 50000,       // 🔒 TIGHTENED: Min $50k volume (was $10k)
    volumeSpikeMultiplier: 3,  // Volume spike detection threshold
  },
  
  // Token Filters
  filters: {
    maxTopHolderPercent: 15,   // 🔒 TIGHTENED: Max 15% (was 20%)
    maxTop5HolderPercent: 40,  // 🆕 Top 5 holders can't own >40%
    minHolderCount: 100,       // 🔒 TIGHTENED: Min 100 holders (was 50)
    requireLockedLiquidity: false, // Require LP lock (relaxed for memes)
    maxMintAuthority: false,   // Reject if mint authority enabled
    minTokenAgeMinutes: 10,    // 🆕 Token must be >10 min old (avoid honeypots)
  },
  
  // Sentiment Thresholds (REQUIRED)
  sentiment: {
    required: true,            // 🆕 Must have sentiment data to trade
    minScoreForTrade: 6,       // 🔒 TIGHTENED: Min score 6 (was 5)
    autoExecuteThreshold: 8,   // Auto-execute if sentiment >= 8
    rejectBotActivity: true,   // Reject high bot activity
    requireOrganic: true,      // 🆕 Must be organic movement
  },
  
  // Blacklist - Auto-reject these patterns
  blacklist: {
    enabled: true,
    patterns: [
      /hitler/i, /nazi/i, /scam/i, /rug/i, /honeypot/i,
      /elon/i, /musk/i, /trump/i,  // Often pump & dumps
      /safe/i, /moon/i, /100x/i,   // Red flag marketing
    ],
  },
  
  // Notification
  notify: {
    onSignal: true,
    onTrade: true,
    onProfitLoss: true,
    dailySummary: true,
  },
  
  // Logging
  logPath: 'C:/Users/adamt/clawd/trading-bot/logs',
  tradeLogPath: 'C:/Users/adamt/clawd/trading-bot/trades.json',
};

export default config;
