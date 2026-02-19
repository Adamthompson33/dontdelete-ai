"""
MoltVault Combined Trust Engine
=================================
Merges two independent trust signals into one score:

  1. STATIC TRUST (MoltShield) — "What does the code look like?"
     Code analysis, rule matching, AST dataflow, manifest checks.
     Available before the agent ever runs. Catches known bad patterns.

  2. EARNED TRUST (ERC-8004) — "How has this agent actually behaved?"
     On-chain reputation from feedback and validation.
     Builds over time. Catches agents that passed static checks but
     behave badly in practice.

  Combined Score = weighted blend, with safety floors and ceilings.

Why two signals?
  - Static alone misses clever attacks that look clean in code
  - Reputation alone can be gamed (Sybil, early good behavior)
  - Together they create defense in depth

The combined score feeds directly into AgentSession capabilities:
  0-39  DANGER   → Read-only (static) or Untrusted (no history)
  40-69 WARNING  → Can propose (with confirmation)
  70-89 CAUTION  → Can propose most operations
  90-100 TRUSTED → Full agent capabilities
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .client import RegistryClient, ReputationSummary, ValidationSummary


@dataclass
class TrustSignal:
    """A single trust signal with its source and confidence."""
    source: str                 # "moltshield", "erc8004:reputation", "erc8004:validation"
    score: float                # 0-100
    confidence: float           # 0-1 (how much we trust this signal)
    details: dict = field(default_factory=dict)


@dataclass
class CombinedTrustResult:
    """The final trust assessment combining all signals."""
    combined_score: int             # 0-100 (the number that matters)
    tier: str                       # DANGER, WARNING, CAUTION, TRUSTED
    signals: list[TrustSignal]
    static_score: int = 0           # MoltShield score (0-100)
    reputation_score: int = 0       # ERC-8004 reputation (0-100)
    validation_score: int = 0       # ERC-8004 validation (0-100)
    feedback_count: int = 0         # How many on-chain feedbacks exist
    validation_count: int = 0       # How many validations exist
    warnings: list[str] = field(default_factory=list)

    @property
    def has_onchain_history(self) -> bool:
        return self.feedback_count > 0

    @property
    def is_new_agent(self) -> bool:
        """Agent has no on-chain track record — extra caution warranted."""
        return self.feedback_count == 0 and self.validation_count == 0


def score_to_tier(score: int) -> str:
    if score >= 90:
        return "TRUSTED"
    elif score >= 70:
        return "CAUTION"
    elif score >= 40:
        return "WARNING"
    else:
        return "DANGER"


# ═══════════════════════════════════════════════════
# Trust weights (tunable per deployment)
# ═══════════════════════════════════════════════════

@dataclass
class TrustWeights:
    """
    How much each signal contributes to the final score.
    These are the knobs a deployment can tune.
    """
    # Base weights (must sum to 1.0 when all signals available)
    static_weight: float = 0.50         # MoltShield code analysis
    reputation_weight: float = 0.35     # ERC-8004 reputation
    validation_weight: float = 0.15     # ERC-8004 validation

    # Confidence thresholds
    min_feedback_for_confidence: int = 5    # Need ≥5 feedbacks for reputation to count
    min_validations_for_confidence: int = 3  # Need ≥3 validations for validation to count
    high_confidence_feedbacks: int = 50      # Full confidence at 50+ feedbacks

    # Safety rules
    static_floor: int = 0              # Minimum combined score = max(static * factor, floor)
    new_agent_penalty: int = 15        # Subtract this from agents with no on-chain history
    critical_static_ceiling: int = 40  # If static < 30, combined can't exceed this
    sybil_discount: float = 0.5        # Discount unfiltered reputation by this factor


DEFAULT_WEIGHTS = TrustWeights()


# ═══════════════════════════════════════════════════
# Combined Trust Calculator
# ═══════════════════════════════════════════════════

class CombinedTrustEngine:
    """
    Merges MoltShield static analysis with ERC-8004 on-chain reputation
    into a single trust score.

    Usage:
        engine = CombinedTrustEngine(registry_client)

        result = engine.evaluate(
            agent_id=42,
            moltshield_score=85,
            trusted_clients=["0xKnownGoodClient1", "0xKnownGoodClient2"],
        )

        print(result.combined_score)  # 0-100
        print(result.tier)            # "CAUTION"
    """

    def __init__(
        self,
        registry_client: RegistryClient | None = None,
        weights: TrustWeights | None = None,
    ):
        self.registry = registry_client
        self.weights = weights or DEFAULT_WEIGHTS

    def evaluate(
        self,
        agent_id: int | None = None,
        moltshield_score: int = 0,
        trusted_clients: list[str] | None = None,
        moltshield_details: dict | None = None,
    ) -> CombinedTrustResult:
        """
        Compute combined trust score from all available signals.

        Args:
            agent_id: ERC-8004 agent ID (None if agent isn't registered)
            moltshield_score: 0-100 from MoltShield static analysis
            trusted_clients: Addresses to filter reputation by (anti-Sybil)
            moltshield_details: Extra details from MoltShield scan
        """
        signals: list[TrustSignal] = []
        warnings: list[str] = []

        # ── Signal 1: MoltShield static analysis ──
        static_signal = TrustSignal(
            source="moltshield",
            score=float(moltshield_score),
            confidence=1.0,  # We always trust our own scanner
            details=moltshield_details or {},
        )
        signals.append(static_signal)

        # ── Signal 2: ERC-8004 reputation ──
        rep_signal = TrustSignal(
            source="erc8004:reputation",
            score=0.0,
            confidence=0.0,
        )
        rep_summary = None

        if self.registry and agent_id is not None:
            try:
                rep_summary = self.registry.get_reputation(
                    agent_id,
                    trusted_clients=trusted_clients,
                    tag1="starred",  # Standard quality rating
                )

                if rep_summary.feedback_count > 0:
                    # Normalize: ERC-8004 "starred" tag uses 0-100
                    raw_avg = rep_summary.average_score
                    rep_signal.score = max(0, min(100, raw_avg))

                    # Confidence scales with feedback count
                    if rep_summary.feedback_count >= self.weights.high_confidence_feedbacks:
                        rep_signal.confidence = 1.0
                    elif rep_summary.feedback_count >= self.weights.min_feedback_for_confidence:
                        rep_signal.confidence = (
                            rep_summary.feedback_count / self.weights.high_confidence_feedbacks
                        )
                    else:
                        rep_signal.confidence = 0.2  # Low confidence, few feedbacks
                        warnings.append(
                            f"Only {rep_summary.feedback_count} feedback(s) — "
                            f"need {self.weights.min_feedback_for_confidence}+ for reliable reputation"
                        )

                    rep_signal.details = {
                        "feedback_count": rep_summary.feedback_count,
                        "average_score": round(raw_avg, 2),
                        "filtered_by_clients": len(trusted_clients or []),
                    }

                    # Sybil discount if no client filtering
                    if not trusted_clients:
                        rep_signal.confidence *= self.weights.sybil_discount
                        warnings.append(
                            "Reputation not filtered by trusted clients — "
                            "vulnerable to Sybil attacks"
                        )
                else:
                    warnings.append("No on-chain feedback for this agent")
            except Exception as e:
                warnings.append(f"Failed to fetch reputation: {e}")

        signals.append(rep_signal)

        # ── Signal 3: ERC-8004 validation ──
        val_signal = TrustSignal(
            source="erc8004:validation",
            score=0.0,
            confidence=0.0,
        )
        val_summary = None

        if self.registry and agent_id is not None:
            try:
                val_summary = self.registry.get_validation(agent_id)

                if val_summary.validation_count > 0:
                    val_signal.score = float(val_summary.average_response)

                    if val_summary.validation_count >= self.weights.min_validations_for_confidence:
                        val_signal.confidence = min(
                            1.0,
                            val_summary.validation_count / (self.weights.min_validations_for_confidence * 3),
                        )
                    else:
                        val_signal.confidence = 0.2

                    val_signal.details = {
                        "validation_count": val_summary.validation_count,
                        "average_response": val_summary.average_response,
                    }
            except Exception as e:
                warnings.append(f"Failed to fetch validations: {e}")

        signals.append(val_signal)

        # ── Combine signals ──
        combined = self._combine(
            static_signal, rep_signal, val_signal,
            rep_summary, val_summary, warnings,
        )

        return CombinedTrustResult(
            combined_score=combined,
            tier=score_to_tier(combined),
            signals=signals,
            static_score=moltshield_score,
            reputation_score=int(rep_signal.score),
            validation_score=int(val_signal.score),
            feedback_count=rep_summary.feedback_count if rep_summary else 0,
            validation_count=val_summary.validation_count if val_summary else 0,
            warnings=warnings,
        )

    def _combine(
        self,
        static: TrustSignal,
        reputation: TrustSignal,
        validation: TrustSignal,
        rep_summary: ReputationSummary | None,
        val_summary: ValidationSummary | None,
        warnings: list[str],
    ) -> int:
        """
        Weighted combination with safety floors and ceilings.
        """
        w = self.weights

        # Calculate effective weights based on confidence
        static_w = w.static_weight  # Always full weight
        rep_w = w.reputation_weight * reputation.confidence
        val_w = w.validation_weight * validation.confidence

        # Redistribute unearned weight to static
        total_earned = rep_w + val_w
        total_possible = w.reputation_weight + w.validation_weight
        unearned = total_possible - total_earned
        static_w += unearned  # Static absorbs what reputation/validation can't fill

        # Normalize
        total_w = static_w + rep_w + val_w
        if total_w == 0:
            total_w = 1.0

        # Weighted average
        combined = (
            (static.score * static_w)
            + (reputation.score * rep_w)
            + (validation.score * val_w)
        ) / total_w

        # ── Safety rules ──

        # Rule 1: New agent penalty
        is_new = (not rep_summary or rep_summary.feedback_count == 0) and (
            not val_summary or val_summary.validation_count == 0
        )
        if is_new and w.new_agent_penalty > 0:
            combined -= w.new_agent_penalty
            warnings.append(
                f"New agent penalty: -{w.new_agent_penalty} "
                f"(no on-chain history)"
            )

        # Rule 2: Bad static score caps the combined score
        if static.score < 30 and combined > w.critical_static_ceiling:
            combined = w.critical_static_ceiling
            warnings.append(
                f"Static score {int(static.score)} < 30 — "
                f"combined capped at {w.critical_static_ceiling} "
                f"regardless of reputation"
            )

        # Rule 3: Perfect reputation can't save terrible code
        if static.score < 10:
            combined = min(combined, 20)
            warnings.append("Critical static findings — combined capped at 20")

        # Rule 4: Very high reputation boosts good static score
        if (reputation.confidence >= 0.8
                and reputation.score >= 90
                and static.score >= 70):
            bonus = min(5, (reputation.score - 90))
            combined += bonus

        # Clamp
        return max(0, min(100, int(combined)))
