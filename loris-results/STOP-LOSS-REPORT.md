# Stop-Loss Crossover Backtest Report

**Generated:** 2026-02-23 09:02 UTC

**Coins:** SOL, DOGE, PEPE, WIF, INJ, OP, ARB

**Entry:** Funding annualizes > 100% APR → go opposite direction

**Exit:** Funding drops below 10% APR or flips sign, or stop-loss hit

**Benchmark:** Zhivkov paper — 95% of positions forced out by spread reversals


## ALL

| Stop | Trades | Survival% | Win% | Avg Net (bps) | Avg Funding (bps) | Avg Price (bps) | Avg Hours | Total Net (bps) |
|------|--------|-----------|------|---------------|--------------------|-----------------|-----------|-----------------|

| no_stop | 15 | 100.0 | 46.7 | 405.6 | 52.6 | 353.1 | 29.3 | 6084 |
| 1% | 48 | 12.5 | 14.6 | 10.4 | 15.6 | -5.2 | 6.3 | 498 |
| 2% | 36 | 19.4 | 19.4 | 65.7 | 21.6 | 44.1 | 11.6 | 2364 |
| 3% | 27 | 33.3 | 29.6 | 122.2 | 28.9 | 93.3 | 15.7 | 3300 |
| 4% | 24 | 45.8 | 33.3 | 141.6 | 32.5 | 109.2 | 17.8 | 3399 |
| 5% | 21 | 61.9 | 38.1 | 171.4 | 37.5 | 133.8 | 20.9 | 3599 |


## TRENDING_UP

| Stop | Trades | Survival% | Win% | Avg Net (bps) | Avg Funding (bps) | Avg Price (bps) | Avg Hours | Total Net (bps) |
|------|--------|-----------|------|---------------|--------------------|-----------------|-----------|-----------------|

| no_stop | 0 | - | - | - | - | - | - | - |
| 1% | 0 | - | - | - | - | - | - | - |
| 2% | 0 | - | - | - | - | - | - | - |
| 3% | 0 | - | - | - | - | - | - | - |
| 4% | 0 | - | - | - | - | - | - | - |
| 5% | 0 | - | - | - | - | - | - | - |


## TRENDING_DOWN

| Stop | Trades | Survival% | Win% | Avg Net (bps) | Avg Funding (bps) | Avg Price (bps) | Avg Hours | Total Net (bps) |
|------|--------|-----------|------|---------------|--------------------|-----------------|-----------|-----------------|

| no_stop | 5 | 100.0 | 60.0 | 408.5 | 19.2 | 389.2 | 12.6 | 2042 |
| 1% | 14 | 14.3 | 14.3 | 37.1 | 6.7 | 30.4 | 4.3 | 520 |
| 2% | 12 | 16.7 | 16.7 | -23.4 | 7.9 | -31.2 | 5.0 | -280 |
| 3% | 9 | 33.3 | 33.3 | 57.2 | 10.5 | 46.7 | 6.8 | 514 |
| 4% | 8 | 37.5 | 37.5 | 39.4 | 11.9 | 27.5 | 7.8 | 315 |
| 5% | 8 | 37.5 | 37.5 | -22.9 | 12.0 | -35.0 | 7.9 | -183 |


## CHOP

| Stop | Trades | Survival% | Win% | Avg Net (bps) | Avg Funding (bps) | Avg Price (bps) | Avg Hours | Total Net (bps) |
|------|--------|-----------|------|---------------|--------------------|-----------------|-----------|-----------------|

| no_stop | 8 | 100.0 | 37.5 | 407.4 | 80.7 | 326.7 | 34.5 | 3259 |
| 1% | 31 | 9.7 | 12.9 | -27.5 | 19.8 | -47.2 | 4.8 | -852 |
| 2% | 21 | 19.0 | 19.0 | 95.9 | 30.5 | 65.4 | 12.5 | 2014 |
| 3% | 15 | 33.3 | 26.7 | 157.0 | 42.9 | 114.1 | 17.9 | 2355 |
| 4% | 13 | 46.2 | 30.8 | 207.0 | 49.4 | 157.6 | 20.8 | 2691 |
| 5% | 11 | 72.7 | 36.4 | 272.7 | 58.7 | 214.0 | 25.1 | 3000 |


## VOLATILE

| Stop | Trades | Survival% | Win% | Avg Net (bps) | Avg Funding (bps) | Avg Price (bps) | Avg Hours | Total Net (bps) |
|------|--------|-----------|------|---------------|--------------------|-----------------|-----------|-----------------|

| no_stop | 2 | 100.0 | 50.0 | 391.3 | 23.2 | 368.0 | 50.0 | 783 |
| 1% | 3 | 33.3 | 33.3 | 276.8 | 14.1 | 262.7 | 31.7 | 830 |
| 2% | 3 | 33.3 | 33.3 | 210.1 | 14.1 | 196.0 | 32.0 | 630 |
| 3% | 3 | 33.3 | 33.3 | 143.5 | 14.1 | 129.3 | 32.0 | 430 |
| 4% | 3 | 66.7 | 33.3 | 131.1 | 14.1 | 117.0 | 32.0 | 393 |
| 5% | 2 | 100.0 | 50.0 | 391.3 | 23.2 | 368.0 | 50.0 | 783 |


## 🎯 Crossover Points

The stop-loss level where net P&L flips from negative to positive:

- **ALL:** None found
- **TRENDING_UP:** None found
- **TRENDING_DOWN:** 3%
- **CHOP:** 2%
- **VOLATILE:** None found


## Per-Coin Breakdown (Best Stop Level)

- **SOL** @ no_stop: 4 trades, survival 100%, win 75%, avg net 382.6 bps
- **WIF** @ no_stop: 2 trades, survival 100%, win 50%, avg net 780.8 bps
- **INJ** @ no_stop: 2 trades, survival 100%, win 50%, avg net 501.5 bps
- **ARB** @ no_stop: 1 trades, survival 100%, win 100%, avg net 3599.5 bps
- **SOL** @ 1%: 11 trades, survival 27%, win 27%, avg net 175.5 bps
- **INJ** @ 1%: 13 trades, survival 8%, win 15%, avg net 6.5 bps
- **SOL** @ 2%: 9 trades, survival 33%, win 33%, avg net 170.1 bps
- **ARB** @ 2%: 1 trades, survival 100%, win 100%, avg net 3599.5 bps
- **SOL** @ 3%: 8 trades, survival 38%, win 38%, avg net 124.3 bps
- **WIF** @ 3%: 3 trades, survival 33%, win 33%, avg net 84.0 bps
- **ARB** @ 3%: 1 trades, survival 100%, win 100%, avg net 3599.5 bps
- **SOL** @ 4%: 7 trades, survival 57%, win 43%, avg net 151.2 bps
- **WIF** @ 4%: 3 trades, survival 33%, win 33%, avg net 17.3 bps
- **INJ** @ 4%: 3 trades, survival 33%, win 33%, avg net 194.0 bps
- **ARB** @ 4%: 1 trades, survival 100%, win 100%, avg net 3599.5 bps
- **SOL** @ 5%: 6 trades, survival 67%, win 50%, avg net 208.1 bps
- **WIF** @ 5%: 3 trades, survival 67%, win 33%, avg net 62.4 bps
- **INJ** @ 5%: 3 trades, survival 33%, win 33%, avg net 61.6 bps
- **ARB** @ 5%: 1 trades, survival 100%, win 100%, avg net 3599.5 bps