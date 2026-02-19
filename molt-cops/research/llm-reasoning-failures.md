# LLM Reasoning Failures — Applied to MoltCops

Source: "Large Language Model Reasoning Failures" — Song, Han, Goodman (Caltech, Stanford)
Paper: https://github.com/Peiyang-Song/Awesome-LLM-Reasoning-Failures

## Why This Paper Matters for MoltCops

Section 3.3 describes exactly the failure mode MoltCops prevents:
> "MAS face robustness and adaptability issues, lacking resilience to disruptive or malicious disturbances."
> Recommends: "dedicated inspector or challenger agents that monitor and contest questionable outputs."

**MoltCops IS the inspector agent.** Academic validation for the architecture.

## Key Insight: Deterministic > Reasoning

LLM failures are often trivially detectable by a deterministic system.
The agent's reasoning model is too complex to catch its own simple mistakes.
A regex-based scanner has no reasoning to fail.

## Debug Mode Rules (v1.2.0) — Derived from Paper

| Rule | Name | Paper Section | Pattern |
|------|------|---------------|---------|
| DC-001 | Variable name mismatch | 4.1 Reversal Curse | Assigned as X, referenced as Y |
| DC-002 | Unused return value | 4.1 Compositional | Function returns but caller ignores |
| DC-003 | Mixed API patterns | 3.1 Proactive Interference | axios + fetch, fs + promises |
| DC-004 | Silent exception swallowing | — | except: pass / catch {} |
| DC-005 | Off-by-one index | 4.3 Counting Failures | arr[len(arr)], range(n-1) |
| DC-006 | Unreachable code | — | Code after return/break |
| DC-007 | Re-assignment before use | — | Variable set twice, never read between |
| DC-008 | Import mismatch | 4.1 Reversal Curse | Import without usage / usage without import |
| DC-009 | Infinite loop | — | while True with no break path |
| DC-010 | Type mismatch | — | String concat with int |

These are deliberately dumb. That's the point.

## Paper Sections → MoltCops Mapping

- **Reversal Curse (4.1)**: Agent defines getUser() then calls getUserById(). Regex-detectable.
- **Compositional Failures (4.1)**: Dead variables, unused returns. Static analysis.
- **Proactive Interference (3.1)**: Mixed imports (axios AND fetch). Flag conflicts.
- **Anchoring Bias (3.1)**: Same try/except with only exception type changed = stuck in loop.
- **Counting Failures (4.3)**: Off-by-one, wrong range, arr[len(arr)].
- **Multi-Agent Failures (3.3)**: Inspector agents prevent cascading errors = MoltCops thesis.

## Litepaper v2 Citation Strategy

Citing peer-reviewed research on why deterministic scanning catches what LLM reasoning misses
gives MoltCops academic credibility that no other agent security tool has.

Key citations:
1. "Dedicated inspector or challenger agents that monitor and contest questionable outputs" (Sec 3.3)
2. "Fundamental failures intrinsic to LLM architectures that broadly affect downstream tasks" (Sec 2)
3. "Robustness issues characterized by inconsistent performance across minor variations" (Sec 2)
4. "Auto-regressive nature of LLMs... lacking mechanisms to detect and correct earlier mistakes" (Sec 5.3)

## MoltGuard Connection

Paper's Section 3.1 on cognitive biases maps to prompt injection:
- Framing effects: "logically equivalent but differently phrased prompts can lead to different results"
- This IS prompt injection — presenting malicious instructions in frames the agent trusts
- MoltGuard catches this at the content layer, MoltCops catches it at the code layer
