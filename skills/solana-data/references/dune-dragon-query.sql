-- DUNE QUERY: Find Top Performing Solana Wallets
-- Save this query on Dune and use the query ID with dragon_tracker.py
-- 
-- What it finds:
-- - Wallets with highest win rate on memecoin trades
-- - Filters for consistent traders (10+ trades in 30 days)
-- - Calculates PnL, win rate, avg hold time

WITH token_trades AS (
    -- Get all DEX swaps on Solana (Raydium, Jupiter, etc)
    SELECT
        tx_signer as wallet_address,
        block_time,
        token_bought_mint_address as token_mint,
        token_bought_symbol as token_symbol,
        amount_usd,
        'buy' as trade_type
    FROM dex_solana.trades
    WHERE block_time > NOW() - INTERVAL '30' DAY
    AND amount_usd > 10  -- Filter dust
    
    UNION ALL
    
    SELECT
        tx_signer as wallet_address,
        block_time,
        token_sold_mint_address as token_mint,
        token_sold_symbol as token_symbol,
        amount_usd,
        'sell' as trade_type
    FROM dex_solana.trades
    WHERE block_time > NOW() - INTERVAL '30' DAY
    AND amount_usd > 10
),

-- Calculate PnL per wallet per token
wallet_token_pnl AS (
    SELECT
        wallet_address,
        token_mint,
        token_symbol,
        SUM(CASE WHEN trade_type = 'buy' THEN -amount_usd ELSE amount_usd END) as pnl,
        COUNT(*) as trades,
        MIN(block_time) as first_trade,
        MAX(block_time) as last_trade
    FROM token_trades
    GROUP BY wallet_address, token_mint, token_symbol
    HAVING COUNT(*) >= 2  -- Need at least buy + sell
),

-- Aggregate to wallet level
wallet_stats AS (
    SELECT
        wallet_address,
        COUNT(DISTINCT token_mint) as tokens_traded,
        SUM(trades) as total_trades,
        SUM(pnl) as total_pnl,
        SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
        AVG(EXTRACT(EPOCH FROM (last_trade - first_trade)) / 3600) as avg_hold_hours
    FROM wallet_token_pnl
    GROUP BY wallet_address
)

SELECT
    wallet_address,
    total_trades,
    tokens_traded,
    total_pnl as profit_usd,
    ROUND(winning_trades::decimal / NULLIF(tokens_traded, 0), 3) as win_rate,
    ROUND(avg_hold_hours, 1) as avg_hold_hours
FROM wallet_stats
WHERE total_trades >= 10  -- Active traders only
AND tokens_traded >= 5    -- Diversified
AND total_pnl > 1000      -- Profitable
ORDER BY win_rate DESC, total_pnl DESC
LIMIT 10;

-- NOTES:
-- 1. Save this query on dune.com
-- 2. Get the query ID from the URL (e.g., dune.com/queries/123456)
-- 3. Run: python dragon_tracker.py --find-dragons 123456
--
-- For MMA-themed tokens specifically, add a filter:
-- WHERE token_symbol ILIKE '%UFC%' 
--    OR token_symbol ILIKE '%FIGHT%'
--    OR token_symbol ILIKE '%MMA%'
