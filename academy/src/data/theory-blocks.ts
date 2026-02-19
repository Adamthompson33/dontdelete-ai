/**
 * THEORY-INFORMED PROMPTING — Agent Knowledge Blocks
 * Oracle Design Doc v1.0
 *
 * Domain-specific frameworks injected per agent to improve reasoning quality.
 * These are NOT instructions — they're intellectual scaffolding.
 * Injected AFTER Signal Board, BEFORE per-agent data briefing.
 */

export const THEORY_BLOCKS: Record<string, string> = {

JACKBOT: `
DOMAIN KNOWLEDGE (use this to sharpen your analysis):

TEMPORAL PATTERNS IN MARKETS:
- Mean reversion: prices that deviate >2 standard deviations from their moving average revert ~68% of the time within 5 periods. The further the deviation, the stronger the reversion signal — but also the higher the chance of regime change.
- Momentum vs mean reversion coexist on different timeframes. A market can be trending on the daily while mean-reverting on the 4-hour. Always specify which timeframe you're analysing.
- Volume confirms direction. Price moves on declining volume are structurally weaker than moves on expanding volume.

REGIME DETECTION:
- Markets operate in three regimes: trending, ranging, and volatile. The rules change between regimes.
- ADX > 25 = trending. ADX < 20 = ranging. ADX rising from low = regime transition (the most profitable and most dangerous moment).
- The edge isn't in the strategy. It's in knowing when each strategy applies.

PREDICTION MARKET APPLICATIONS:
- Short-horizon markets (resolves in days) are more analysable than long-horizon markets (resolves in months). You have more information density and less uncertainty.
- A market priced at 5% is not "almost certainly NO." It's saying 1-in-20. Over 20 such markets, one of them will resolve YES. Don't confuse low probability with zero probability.
- Your edge on prediction markets is temporal pattern recognition: when has the market's probability moved vs when should it have moved based on new information? Stale prices are your signal.
`,

SAKURA: `
DOMAIN KNOWLEDGE (use this to sharpen your analysis):

ARBITRAGE FUNDAMENTALS:
- Arbitrage exploits structural inconsistencies, not directional bets. Your edge exists independent of whether prices go up or down.
- Bounded probability constraint: P(X > 500K) can NEVER exceed P(X > 200K). If it does, one market is mispriced. The size of the violation is the minimum edge, minus execution costs.
- Cross-platform arbs (Manifold vs Polymarket) require accounting for liquidity, fees, and settlement timing. A 10-point spread with 2% fees on each side and 30-day settlement is only 6 points of real edge.

MARKET MICROSTRUCTURE:
- Liquidity is information. Thin markets are more likely to be mispriced but also harder to exploit (slippage eats the edge).
- Academy/Market divergence is only meaningful if the Academy has information the market doesn't. If the divergence exists because Academy agents are correlated, the market is more likely correct.
- Price staleness: if a market's probability hasn't moved despite material new information, that's either an opportunity or a signal. Check volume.

POSITION SIZING FOR ARBITRAGE:
- Arb positions should be sized to the SMALLER side's liquidity.
- Never risk more than 5% of bankroll on a single arb, even with high confidence.
- Track your arb hit rate separately from directional bets. Arbs should win >80% of the time.
`,

PROPHET: `
DOMAIN KNOWLEDGE (use this to sharpen your analysis):

CONTRARIAN INVESTING PRINCIPLES:
- A contrarian position is only valuable if you can articulate WHY the consensus is wrong, not just that it IS wrong. "Everyone thinks X so I'll bet not-X" is not a thesis. It's a reflex.
- The best contrarian bets have asymmetric payoff: limited downside, outsized upside. A 5% market that should be 15% has 3:1 upside. A 76% market that should be 70% has minimal edge relative to capital locked.
- Consensus is wrong most often at extremes (>90% or <10%). In the 30-70% range, the crowd is usually well-calibrated.

PORTFOLIO CONSTRUCTION:
- Position correlation kills portfolios. If 4 of your 6 positions all lose when BTC drops, you don't have 6 positions — you have 1 position sized 6x.
- Capital utilisation above 70% is ruin-adjacent for any agent with a negative win rate. At 0W/6L, your next priority is capital preservation, not conviction expression.
- The Kelly criterion says your optimal bet size is: f* = (edge / odds). With uncertain edge, use quarter-Kelly or less. Overbetting is the #1 cause of ruin.

TIME HORIZON MATCHING:
- Match your thesis to the market's resolution timeline. A macro thesis about AI valuations is not actionable on a market that resolves in February.
- Short-horizon markets (days) reward information density. Long-horizon markets (months) reward structural analysis.
- Every position should have a pre-defined exit condition that isn't "I feel uncomfortable." Write it down when you enter.
`,

WREN: `
DOMAIN KNOWLEDGE (use this to sharpen your analysis):

KELLY CRITERION — PROPER APPLICATION:
- Full Kelly maximises geometric growth rate but produces EXTREME volatility. A full Kelly bettor experiences a 50% drawdown as a routine event.
- Quarter-Kelly is standard practice for uncertain edges. It sacrifices 25% of theoretical growth for 75% reduction in variance. Use this as your default.
- Kelly with 0% historical win rate: the formula outputs ZERO (don't bet). This is mathematically correct but practically useless for small samples. With <20 bets, your win rate is statistically meaningless. Use a Bayesian prior: assume 40-50% base rate and adjust as data accumulates.
- CRITICAL: Kelly assumes you know your true edge. You never do. When in doubt, size DOWN.

RISK MANAGEMENT FRAMEWORKS:
- Portfolio heat = total locked capital / total available capital. Heat > 50% = illiquid. Heat > 70% = one bad cascade puts you in quarantine.
- Correlation is the silent killer. Five uncorrelated 10-karma bets are safer than one 50-karma bet, but five correlated 10-karma bets ARE one 50-karma bet wearing a disguise.
- Stop-loss discipline: exit when your thesis is invalidated, not when the P&L hits a number.
- The goal of risk management is SURVIVAL, not profit. Protect the floor before chasing the ceiling.

DIAGNOSING A LOSING STREAK:
- 0% win rate over 11 bets could be: bad market selection, bad sizing, bad timing, or bad luck. With 11 bets, you cannot statistically distinguish between these.
- The worst response to a losing streak is to stop betting entirely. The second worst is to bet bigger. The correct response is to bet SMALLER on UNCORRELATED markets until the streak breaks.
`,

REI: `
DOMAIN KNOWLEDGE (use this to sharpen your analysis):

FUNDING RATE MECHANICS:
- Perpetual futures use funding rates to tether perp price to spot. When funding is positive, longs pay shorts. When negative, shorts pay longs. This is a CARRY trade, not a directional bet.
- Funding rates mean-revert. Extreme rates (-300% APR) don't persist because arbitrageurs enter the trade and compress the spread. Your edge window is BEFORE arbs fully compress it.
- HyperLiquid settles funding every hour (not 8h like CEXs). Rates compound faster, risk windows are shorter, extreme rates correct faster.

BASIS TRADE EXECUTION:
- The risk in basis trades is NOT the funding direction — it's the price movement between entry and funding collection. A 10% adverse price move can wipe out weeks of funding income.
- "Distressed" tokens (funding < -500% APR) are high carry but also high liquidation risk. The funding is extreme BECAUSE the token is dying. Filter for tokens with >$10M OI and >$5M daily volume.

CONNECTING DEFI SIGNALS TO PREDICTION MARKETS:
- Funding rates measure POSITIONING (who's leveraged which way). Prediction markets measure BELIEFS (what people think will happen). When positioning and belief diverge, that's information.
- Example: if BTC funding is deeply negative but prediction markets price BTC $100K at only 2%, both are bearish — no divergence. But if funding turns positive while predictions stay at 2%, positioning is moving before beliefs. That's a leading indicator.
- Your paper P&L on funding trades is REAL signal about your mechanical edge. Your prediction market losses are signal about your conviction edge. These are different skills. It's fine to specialise.
`,

JINX: `
DOMAIN KNOWLEDGE (use this to sharpen your analysis):

MONTE CARLO SIMULATION — PROPER INTERPRETATION:
- Monte Carlo with <10 historical trades is statistically unreliable. The confidence interval on profit probability with 4 trades is so wide that the result is essentially meaningless. You need minimum 30 trades for a Monte Carlo verdict to carry weight.
- Current verdict of "0% profit probability" on 4-6 trades is NOT the same as "this strategy has no edge." It means "insufficient data to determine if edge exists." Report it that way. The distinction matters.
- Sharpe ratio with <20 data points has a standard error of approximately 1/sqrt(n). With 4 trades, the SE is 0.5. Always report the confidence interval, not just the point estimate.

CORRELATION ANALYSIS:
- Portfolio correlation of 50-65% is concerning but not catastrophic. TRUE diversification is <30% correlation.
- Correlation is NOT causation of losses. High correlation means positions WIN or LOSE together. If the shared thesis is correct, correlation amplifies gains.
- The agents may be "correlated" because they're all RIGHT about the same thing. Don't assume correlation = error. Check whether correlated positions have positive or negative expected value independently.

STRATEGY AUDITING:
- A strategy audit should answer: (1) Is the edge real? (need >30 trades) (2) Is the edge sized correctly? (3) Is the edge independent?
- "Edge" in prediction markets = calibration. Current data is insufficient to measure calibration. You need short-horizon markets to resolve first.
- The most valuable thing you can do: identify WHICH TYPES of markets generate the fastest data for proper evaluation. Recommend short-horizon, binary, high-liquidity markets.

ADVERSARIAL AUDITING:
- Your role is to challenge, not to block. "0/6 strategies healthy" with no path forward is demoralising, not useful. Every audit should end with: "here's what data I need to change my verdict."
- The desk's 0% win rate is not proof the game is rigged. It's proof that no markets have RESOLVED yet. Unrealised losses ≠ actual losses. Wait for resolutions before declaring strategies dead.
`,

};
