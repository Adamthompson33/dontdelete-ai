# The Surgeon — Future Upgrades

Logged from Jackbot's spec (2026-02-22). Don't build yet — validate dual-condition first.

## Future Items

1. **Convergence-based exits** — Exit when mark = index instead of fixed time intervals. Needs real-time position monitoring.

2. **Position stacking** — If signal persists at next scan, add to position. Wren's Kelly sizer handles initial entry; stacking logic comes later.

3. **60-minute mechanical time-stop with re-entry** — Fits Jackbot's temporal edge architecture.

## Validation Plan

Track signals over 2 weeks:
- Signals where BOTH conditions are extreme (funding + negative basis) vs funding-only signals
- If dual-condition outperforms, we've independently validated The Surgeon's thesis with our own data
