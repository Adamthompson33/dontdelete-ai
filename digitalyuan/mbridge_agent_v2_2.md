# Cross-Border mBridge Settlement Agent — v2

## Architecture Blueprint & Implementation Guide

**Version:** 2.2
**Status:** Revised — incorporates production review feedback + ENS identity layer + implementation-readiness fixes
**Change Summary:** 7 architectural corrections + ENS integration + 8 implementation-readiness fixes (see Section 13: Changelog)

---

## 1. Executive Summary

The mBridge Settlement Agent is an autonomous orchestration layer that enables near-instant cross-border trade settlement by leveraging China's e-CNY and the multi-CBDC mBridge platform. It replaces the traditional 1–3 day SWIFT correspondent banking chain with a single programmatic settlement flow.

**Primary corridor:** AUD → HKD → e-CNY (two-hop via HKMA, the production-ready path while RBA holds observer status on mBridge).
**Secondary corridors:** HKD → e-CNY (direct), THB → e-CNY (direct).
**Future upgrade:** AUD → e-CNY (direct, contingent on RBA becoming a full mBridge participant).

This document breaks the system into discrete architectural domains, applies SOLID design principles throughout, provides an "Ultra Think" deep-dive into every critical subsystem, and includes a threat model, chaos testing strategy, ENS-based identity and audit layer (`digitalyuan.eth` + `ecny.eth`), and the corrections from a production-focused peer review.

---

## 2. Problem Domain Decomposition

### 2.1 The Settlement Pain Chain (Current State)

```
Australian Exporter
    → AUD leaves exporter's bank
    → Correspondent Bank A (nostro/vostro)
    → SWIFT messaging (MT103/MT202)
    → Correspondent Bank B (China-side)
    → CNY arrives at Chinese importer's bank

Time: 1–3 business days
Cost: 1–6% in fees + FX spread
Transparency: Opaque — no real-time tracking
```

### 2.2 Target State with mBridge Agent (v2: Two-Hop Default)

```
Australian Exporter triggers invoice
    → Agent receives settlement instruction
    → Agent executes Leg 1: AUD → HKD (via participating bank FX desk)
    → Agent executes Leg 2: HKD → e-CNY (atomic swap on mBridge ledger)
    → e-CNY delivered to importer's wallet
    → Both parties receive confirmation

Time: < 45 seconds (two-hop adds ~15s for Leg 1)
Cost: < 0.15% (two FX legs, projected)
Transparency: Full ledger visibility for Leg 2; bank confirmation for Leg 1

FUTURE (RBA joins mBridge as full participant):
    → Agent executes AUD → e-CNY (single atomic swap on mBridge)
    → Time: < 30 seconds | Cost: < 0.1%
```

### 2.3 Core Domains Identified

| Domain | Responsibility |
|--------|---------------|
| **Ingestion** | Receive and validate trade/invoice triggers |
| **Compliance** | KYC/AML screening, sanctions, reporting, **mid-settlement re-screening** |
| **FX Engine** | Price discovery, quote generation, **dynamic slippage management** |
| **Settlement** | mBridge ledger interaction, two-phase commit, **multi-leg orchestration** |
| **Reconciliation** | Post-trade matching, audit trail, dispute resolution, **active confirmation polling** |
| **Monitoring** | Health checks, alerting, circuit breakers, **chaos testing hooks** |
| **ENS Identity** (v2.1) | Agent identity, service registry, on-chain receipt anchoring — **all off critical path** |

---

## 3. Ultra Think: Deep Architectural Analysis

### 3.1 First Principles Reasoning

Before writing a line of code, we interrogate every assumption.

**Assumption 1: "We can connect directly to mBridge."**
*Reality:* mBridge is a central-bank-to-central-bank protocol. Private entities interact through a **participating commercial bank** that has a CBDC node. The agent is middleware between the exporter's systems and the bank's mBridge API — not a direct ledger participant.

**Assumption 2: "AUD→e-CNY is a single atomic operation."**
*Reality (v2 correction):* It's a **two-hop process** for the foreseeable future. RBA is an mBridge observer, not a participant. The production architecture is:
- **Leg 1:** AUD → HKD via the participating bank's FX desk (off-ledger, traditional bank transfer with the HKMA-connected bank)
- **Leg 2:** HKD → e-CNY via mBridge atomic swap (on-ledger)

These legs have **completely different failure modes** and must be orchestrated independently. Leg 1 is a traditional bank operation (slower, reversible). Leg 2 is an atomic ledger operation (faster, final). The agent must handle partial completion (Leg 1 succeeds, Leg 2 fails) with explicit rollback for Leg 1.

This is **not a fallback** — it is the primary architecture. The direct AUD→eCNY path is the upgrade, not the other way around. Engineering effort should be allocated accordingly: 80% on the two-hop, 20% on the future single-hop.

**Assumption 3: "Settlement is instant and final."**
*Reality:* mBridge targets near-instant finality for Leg 2, but:
- Leg 1 (AUD→HKD) involves traditional banking rails with settlement lag
- The compliance layer introduces latency
- **Confirmation delivery can fail independently of settlement** (v2 correction: this requires a SETTLED_UNCONFIRMED state)

The agent must separate: *Leg 1 completion* → *Leg 2 technical finality* → *confirmation delivery* → *regulatory finality* and handle failures at each boundary.

**Assumption 4: "FX rates are stable during execution."**
*Reality (v2 correction):* AUD/CNY is not EUR/USD. Liquidity is thinner, spreads are wider, and the PBOC fixing publishes once daily at 9:15am Beijing time.
- **During overlap hours** (Sydney + HK + Beijing all open): Spreads are tight, 25bps tolerance is reasonable
- **During Sydney morning** (Beijing closed): Spreads widen significantly, 25bps tolerance will trigger constant requotes
- **Two-hop adds a second FX leg** (AUD/HKD) with its own spread dynamics

The FX engine must be **time-of-day-aware** with dynamic tolerance bands.

**Assumption 5: "Compliance clears once, at the start."**
*Reality (v2 correction):* Sanctions lists can update between compliance screening and settlement execution. The window is small (30–60 seconds) but non-zero. Regulators don't care about your timestamps — they care that you settled with a sanctioned counterparty. A **re-screening checkpoint** between Phase 1 (reserve) and Phase 2 (execute) is mandatory.

### 3.2 Failure Mode Analysis (Pre-Mortem)

| Failure | Impact | Mitigation |
|---------|--------|------------|
| mBridge node offline | Leg 2 halts | Fallback to SWIFT for full settlement; queue Leg 2 for retry |
| Leg 1 succeeds, Leg 2 fails | HKD held with no forward path | Explicit Leg 1 rollback (HKD→AUD reversal); time-bounded hold with auto-reversal |
| Sanctions hit mid-settlement | Funds frozen in limbo | **Two checkpoints:** pre-reserve screen + pre-execute re-screen (v2) |
| Sanctions list updates between screen and execute | Transaction was clean at screen, dirty at execute | **Sanctions version hash comparison** at Phase 2 gate (v2) |
| FX rate spike during execution | Exporter receives less than quoted | **Dynamic tolerance bands** based on time-of-day and liquidity (v2) |
| Bank API timeout | Unknown settlement state | Idempotency keys + reconciliation daemon |
| mBridge swap succeeds but confirmation callback fails | Money moved, no record | **SETTLED_UNCONFIRMED state** with active ledger polling every 2s for 60s, then escalate (v2) |
| Regulatory reporting failure | Post-trade compliance breach | Store-and-forward with retry; never block settlement for reporting |
| Double-spend / replay | Duplicate payment | Idempotency at every layer; deduplication by invoice ID |
| Compromised ERP sends fabricated invoices | Unauthorized fund transfers | **Webhook signature verification + invoice cross-referencing** (v2) |
| Low-liquidity window (Sydney morning) | Requote storms, failed settlements | **Liquidity-aware circuit breaker** pauses execution during thin markets (v2) |
| HKD float exposure between Leg 1 and Leg 2 | FX loss on held HKD if Leg 2 delayed or fails | **HKDHoldPolicy** with max hold duration, auto-reversal timeout, and hedge trigger for extended holds (v2.2) |
| Leg 1 reversal returns less AUD than original | Exporter absorbs FX loss on failed settlement | **ReversalReceipt** models original amount, returned amount, and FX loss; exporter notified of loss (v2.2) |
| SAFE pre-approval delays settlement by days | Transactions >¥500,000 blocked in synchronous pipeline | **Async SAFE pre-approval** with PENDING_SAFE_APPROVAL state, runs before instruction enters settlement pipeline (v2.2) |
| PBOC fixing rate goes stale as day progresses | FX rate reference diverges from spot, tolerance bands too tight | **Fixing staleness penalty** widens tolerance proportional to hours since 9:15am Beijing fixing (v2.2) |

### 3.3 Architectural Decision Records (ADRs)

**ADR-001: Event-Driven Over Request-Response**
The agent uses an event-driven architecture internally. Trade triggers, compliance results, FX quotes, and settlement confirmations are all events on an internal bus. This decouples subsystems and enables replay/audit.

*v2 update:* At launch (Phase 1–2), the event bus is a **PostgreSQL outbox pattern** (LISTEN/NOTIFY + polling). Kafka is introduced in Phase 3 when throughput demands it. The `IEventBus` abstraction makes the swap painless.

**ADR-002: Two-Phase Settlement with Re-Screening**
Phase 1 (Reserve): AUD is debited from the exporter and held in escrow. Compliance screening runs. FX quote is locked.
**Gate Check (v2):** Sanctions list version hash is compared. If list has changed, a lightweight re-screen runs before proceeding.
Phase 2 (Execute): If all checks pass, the mBridge swap executes. If any check fails, Phase 1 reverses.

**ADR-003: Two-Hop-First Corridor Design**
*v2 correction:* The AUD→HKD→eCNY two-hop is the **primary production architecture**, not a fallback. The corridor plugin for AUD is `AUDviaHKDtoCNYCorridor`, which orchestrates both legs. A future `AUDDirectToCNYCorridor` can be swapped in when RBA joins mBridge as a full participant.

**ADR-004: Bank-Agnostic Integration Layer**
The agent communicates with participating banks through an abstraction layer. Switching from Bank A to Bank B requires only a new adapter.

**ADR-005: PostgreSQL-First, Kafka-Later (v2)**
Kafka is operationally complex (ZooKeeper/KRaft, partition management, consumer group coordination). For dozens of transactions per day in Phase 1–2, a PostgreSQL outbox pattern provides identical event-driven semantics with zero infrastructure overhead. The `IEventBus` abstraction means migration to Kafka is a configuration change, not a redesign.

**ADR-006: SETTLED_UNCONFIRMED State (v2)**
The state machine includes an explicit state for "money moved but confirmation not received." This state triggers aggressive active polling of the mBridge ledger (every 2 seconds for 60 seconds) rather than waiting for the passive reconciliation cycle. This prevents the scenario where funds are delivered but the system has no record.

**ADR-007: HKD Float Policy (v2.2)**
Between Leg 1 completion and Leg 2 execution, the agent holds HKD in a nostro account at the participating bank. This creates FX exposure. The `HKDHoldPolicy` enforces: max hold duration (5 minutes default), auto-reversal if Leg 2 doesn't execute within the window, and an optional hedge trigger for holds exceeding 60 seconds. If a settlement starts near a liquidity window boundary and Leg 2 would cross into a CLOSED window, the agent aborts *before* executing Leg 1.

**ADR-008: Async SAFE Pre-Approval (v2.2)**
China's SAFE requires pre-approval for cross-border transfers exceeding ¥500,000. This process takes days, not seconds. It cannot be in the synchronous compliance screening pipeline. SAFE pre-approval runs as an asynchronous step *before* the settlement instruction enters the pipeline. The state machine includes a `PENDING_SAFE_APPROVAL` state. Only pre-approved instructions proceed to the settlement flow.

**ADR-009: ISO 20022 Message Type Specification (v2.2)**
Bank integration uses specific ISO 20022 message types to prevent integration surprises during onboarding: `pacs.008` for Leg 1 (FI to FI Customer Credit Transfer), `pacs.009` for Leg 2 (FI to FI Financial Institution Credit Transfer), and `camt.053` for reconciliation (Bank to Customer Statement). The ingestion service also accepts `pain.001` (Customer Credit Transfer Initiation) from exporters.

---

## 4. SOLID Architecture

### 4.1 Single Responsibility Principle (SRP)

Every module owns exactly one reason to change.

```
┌──────────────────────────────────────────────────────────────┐
│                    mBridge Settlement Agent v2                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │   Ingestion   │  │  Compliance  │  │    FX Engine      │  │
│  │   Service     │  │  Service     │  │    Service        │  │
│  │              │  │              │  │                   │  │
│  │ • Parse       │  │ • KYC check  │  │ • Price discovery │  │
│  │   invoices    │  │ • AML screen │  │ • Dynamic quote   │  │
│  │ • Validate    │  │ • Sanctions  │  │   lock (ToD-aware)│  │
│  │ • Webhook sig │  │ • Re-screen  │  │ • Dual-leg FX     │  │
│  │   verify      │  │   checkpoint │  │   (AUD/HKD +      │  │
│  │              │  │ • Report     │  │    HKD/CNY)       │  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────────┘  │
│         │                 │                   │              │
│         ▼                 ▼                   ▼              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │    Event Bus (PostgreSQL Outbox → Kafka at scale)    │    │
│  └────────────────────────┬─────────────────────────────┘    │
│                           │                                  │
│         ┌─────────────────┼─────────────────┐                │
│         ▼                 ▼                 ▼                │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  Settlement   │  │ Reconcilia-  │  │  Monitoring       │  │
│  │  Executor     │  │ tion Engine  │  │  & Alerting       │  │
│  │              │  │              │  │                   │  │
│  │ • Multi-leg   │  │ • Post-trade │  │ • Health checks   │  │
│  │   orchestrate │  │   matching   │  │ • Circuit breakers│  │
│  │ • 2-phase     │  │ • Active     │  │ • Liquidity-aware │  │
│  │   commit      │  │   confirm    │  │   pause           │  │
│  │ • Re-screen   │  │   polling    │  │ • Chaos testing   │  │
│  │   gate check  │  │ • Audit log  │  │   hooks           │  │
│  └──────────────┘  └──────────────┘  └───────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │          Bank Integration Abstraction Layer           │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐           │    │
│  │  │ HSBC HK  │  │ Bank of  │  │ Future   │           │    │
│  │  │ Adapter  │  │ China    │  │ Bank     │           │    │
│  │  │ (Leg1+2) │  │ Adapter  │  │ Adapter  │           │    │
│  │  └──────────┘  └──────────┘  └──────────┘           │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

**Each service has one job:**

| Service | Single Responsibility | Change Trigger |
|---------|----------------------|----------------|
| `IngestionService` | Parse, validate, and authenticate incoming trade triggers | Invoice format changes, new ERP integrations |
| `ComplianceService` | Screen transactions against regulatory rules **including mid-settlement re-screen** | Sanctions list updates, new AML rules |
| `FXEngineService` | Provide and lock foreign exchange quotes with **time-of-day-aware dynamic tolerance** | New FX data sources, pricing model changes, market hour schedule changes |
| `SettlementExecutor` | Execute the **multi-leg** two-phase mBridge settlement | mBridge protocol updates, new corridor legs |
| `ReconciliationEngine` | Match, audit, resolve post-trade discrepancies, and **actively poll for unconfirmed settlements** | Reporting format changes |
| `MonitoringService` | Observe system health, trigger alerts, **enforce liquidity circuit breakers**, and expose **chaos testing hooks** | New metrics, alerting thresholds, chaos scenarios |

### 4.2 Open/Closed Principle (OCP)

The system is open for extension, closed for modification.

**Corridors as Plugins (v2: Two-Hop is First-Class):**

```python
# Abstract corridor definition — closed for modification
class TradeCorridor(ABC):
    @abstractmethod
    def get_compliance_rules(self) -> list[ComplianceRule]: ...

    @abstractmethod
    def get_fx_legs(self) -> list[FXLeg]: ...  # v2: multi-leg FX

    @abstractmethod
    def get_settlement_legs(self) -> list[SettlementLeg]: ...  # v2: multi-leg settlement

    @abstractmethod
    def get_reporting_requirements(self) -> list[ReportingRule]: ...

    @abstractmethod
    def get_liquidity_schedule(self) -> LiquiditySchedule: ...  # v2: time-of-day awareness


# v2: Two-hop AUD corridor — this is the PRIMARY production path
class AUDviaHKDtoCNYCorridor(TradeCorridor):
    """
    Production corridor: AUD → HKD (off-ledger) → e-CNY (on-ledger mBridge).
    This is the default while RBA holds observer status.
    """
    def get_compliance_rules(self):
        return [
            AustracAMLRule(),          # Australian AML/CTF
            HKMAComplianceRule(),      # HK transit compliance (Leg 1 lands in HK)
            PBOCCrossBorderRule(),     # PBOC cross-border CBDC rules
            OFACSanctionsRule(),       # US secondary sanctions exposure
        ]

    def get_fx_legs(self):
        return [
            FXLeg(
                pair="AUD/HKD",
                sources=[HSBCHKFXDesk(), ReutersAUDHKD(), FallbackBankRate()],
                tolerance=DynamicTolerance(self.get_liquidity_schedule(), pair="AUD/HKD"),
            ),
            FXLeg(
                pair="HKD/CNY",
                sources=[DigitalYuanOpsCenter(), PBOCFixingRate(), FallbackBankRate()],
                tolerance=DynamicTolerance(self.get_liquidity_schedule(), pair="HKD/CNY"),
            ),
        ]

    def get_settlement_legs(self):
        return [
            SettlementLeg(
                leg_id="LEG1_AUD_HKD",
                type=LegType.OFF_LEDGER,      # Traditional bank transfer
                source_currency="AUD",
                target_currency="HKD",
                reversible=True,               # Can be unwound
                estimated_latency_seconds=15,
            ),
            SettlementLeg(
                leg_id="LEG2_HKD_ECNY",
                type=LegType.ON_LEDGER_MBRIDGE, # Atomic swap
                source_currency="HKD",
                target_currency="eCNY",
                reversible=False,              # Final on ledger
                estimated_latency_seconds=5,
            ),
        ]

    def get_reporting_requirements(self):
        return [
            AustracIFTIReport(),       # International Funds Transfer Instruction
            HKMATransactionReport(),   # HK transit leg reporting
            SAFEReport(),              # China SAFE
        ]

    def get_liquidity_schedule(self):
        return LiquiditySchedule(
            high_liquidity_windows=[
                TimeWindow("02:00", "08:00", tz="UTC"),  # Sydney + HK + Beijing overlap
            ],
            medium_liquidity_windows=[
                TimeWindow("00:00", "02:00", tz="UTC"),  # Sydney + HK open, Beijing closing
                TimeWindow("08:00", "10:00", tz="UTC"),  # HK + Beijing open
            ],
            low_liquidity_windows=[
                TimeWindow("10:00", "22:00", tz="UTC"),  # Only one major market open
            ],
            closed_windows=[
                TimeWindow("22:00", "00:00", tz="UTC"),  # Sydney pre-open
            ],
        )


# FUTURE: Direct AUD→eCNY when RBA upgrades (zero changes to existing code)
class AUDDirectToCNYCorridor(TradeCorridor):
    """
    Upgrade path: Direct AUD → e-CNY when RBA becomes full mBridge participant.
    Single FX leg, single settlement leg, tighter spreads.
    """
    def get_fx_legs(self):
        return [
            FXLeg(
                pair="AUD/CNY",
                sources=[DigitalYuanOpsCenter(), PBOCFixingRate(), FallbackBankRate()],
                tolerance=DynamicTolerance(self.get_liquidity_schedule(), pair="AUD/CNY"),
            ),
        ]

    def get_settlement_legs(self):
        return [
            SettlementLeg(
                leg_id="LEG1_AUD_ECNY",
                type=LegType.ON_LEDGER_MBRIDGE,
                source_currency="AUD",
                target_currency="eCNY",
                reversible=False,
                estimated_latency_seconds=5,
            ),
        ]
    # ... compliance, reporting, schedule follow same pattern


# HKD direct corridor — simplest, already proven in mBridge pilots
class HKDtoCNYCorridor(TradeCorridor):
    def get_fx_legs(self):
        return [
            FXLeg(pair="HKD/CNY", sources=[...], tolerance=...),
        ]

    def get_settlement_legs(self):
        return [
            SettlementLeg(
                leg_id="LEG1_HKD_ECNY",
                type=LegType.ON_LEDGER_MBRIDGE,
                source_currency="HKD",
                target_currency="eCNY",
                reversible=False,
                estimated_latency_seconds=5,
            ),
        ]
    # ...
```

**Compliance Rules as Strategy Pattern (v2: With Re-Screen Support):**

```python
class ComplianceRule(ABC):
    @abstractmethod
    async def screen(self, transaction: Transaction) -> ComplianceResult: ...

    @abstractmethod
    async def get_list_version_hash(self) -> str:
        """Return hash of the current sanctions/rules list version.
        Used for fast re-screen gate check between Phase 1 and Phase 2."""
        ...

    async def quick_rescreen(
        self, transaction: Transaction, previous_hash: str
    ) -> RescreenResult:
        """Lightweight re-screen: if list hasn't changed, skip full screen."""
        current_hash = await self.get_list_version_hash()
        if current_hash == previous_hash:
            return RescreenResult.unchanged()
        # List changed — run full screen
        result = await self.screen(transaction)
        return RescreenResult.rescreened(result, new_hash=current_hash)


class OFACSanctionsRule(ComplianceRule):
    async def screen(self, transaction: Transaction) -> ComplianceResult:
        # Screen against OFAC SDN list
        ...

    async def get_list_version_hash(self) -> str:
        # Return SHA-256 of latest OFAC SDN list publication date + record count
        return self._cached_list_hash

class PBOCCrossBorderRule(ComplianceRule):
    async def screen(self, transaction: Transaction) -> ComplianceResult:
        # Validate cross-border e-CNY transaction limits
        # Check required documentation (trade invoice, customs declaration)
        ...

    async def get_list_version_hash(self) -> str:
        return self._cached_pboc_rules_hash
```

### 4.3 Liskov Substitution Principle (LSP)

Any bank adapter can replace any other without breaking the system. v2 adds **multi-leg support** to the adapter contract.

```python
class BankAdapter(ABC):
    """Contract that ALL bank adapters must honor."""

    @abstractmethod
    async def reserve_funds(
        self, amount: Decimal, currency: str, idempotency_key: str
    ) -> ReservationReceipt:
        """
        Must:
        - Return ReservationReceipt with unique reservation_id
        - Be idempotent (same key = same result)
        - Raise InsufficientFundsError if balance too low
        - Raise BankUnavailableError if connection fails
        Never:
        - Return partial reservations
        - Silently fail
        """
        ...

    @abstractmethod
    async def execute_fx_leg(
        self, reservation: ReservationReceipt, fx_leg: FXLeg,
        locked_quote: LockedQuote
    ) -> LegConfirmation:
        """
        v2: Execute a single FX leg (off-ledger or on-ledger).
        Must:
        - Use the locked FX quote (no requoting)
        - Return LegConfirmation with amount received in target currency
        - Raise QuoteExpiredError if quote has lapsed
        - Raise LegFailedError with rollback status
        """
        ...

    @abstractmethod
    async def execute_mbridge_swap(
        self, held_amount: Decimal, held_currency: str,
        target_currency: str, fx_quote: LockedQuote
    ) -> SettlementConfirmation:
        """
        Execute the on-ledger mBridge atomic swap.
        Must:
        - Return SettlementConfirmation with ledger tx hash
        - Raise SettlementFailedError with rollback confirmation
        """
        ...

    @abstractmethod
    async def reverse_fx_leg(
        self, leg_confirmation: LegConfirmation
    ) -> ReversalReceipt:
        """
        v2.2: Reverse an off-ledger FX leg. Returns ReversalReceipt with
        full FX loss accounting (the exporter may get back less AUD than
        they started with due to rate movement and reversal fees).
        Must:
        - Return ReversalReceipt with original/returned amounts and FX loss
        - Raise IrreversibleLegError if leg type doesn't support reversal
        - Raise ReversalFailedError if bank rejects the reversal
        """
        ...

    @abstractmethod
    async def release_reservation(
        self, reservation: ReservationReceipt
    ) -> ReleaseConfirmation:
        """Must release held funds and return confirmation."""
        ...

    @abstractmethod
    async def poll_ledger_status(
        self, tx_hash: str
    ) -> LedgerStatus:
        """
        v2: Actively poll the mBridge ledger for transaction status.
        Used for SETTLED_UNCONFIRMED recovery.
        """
        ...


# Both adapters are fully substitutable
class HSBCHKAdapter(BankAdapter):
    """HSBC Hong Kong — supports both off-ledger AUD/HKD and on-ledger HKD/eCNY."""
    async def reserve_funds(self, amount, currency, idempotency_key):
        # HSBC-specific API calls
        ...

    async def execute_fx_leg(self, reservation, fx_leg, locked_quote):
        if fx_leg.pair == "AUD/HKD":
            return await self._execute_traditional_fx(reservation, locked_quote)
        elif fx_leg.pair == "HKD/CNY":
            return await self._execute_mbridge_fx(reservation, locked_quote)
        ...

    async def reverse_fx_leg(self, leg_confirmation):
        if leg_confirmation.leg_type == LegType.OFF_LEDGER:
            return await self._reverse_traditional_fx(leg_confirmation)  # Returns ReversalReceipt (v2.2)
        raise IrreversibleLegError("On-ledger mBridge swaps are final")
    ...

class BOCAdapter(BankAdapter):
    """Bank of China — same contract, different implementation."""
    async def reserve_funds(self, amount, currency, idempotency_key):
        # BOC-specific API calls
        ...
```

**LSP Guarantees Enforced:**
- All adapters raise the same exception hierarchy
- Return types are identical (no adapter-specific "extra fields" that callers depend on)
- Preconditions are not strengthened (no adapter demands more than the interface)
- Postconditions are not weakened (every adapter guarantees idempotency)
- **v2:** All adapters support `reverse_fx_leg` and `poll_ledger_status`; on-ledger-only adapters raise `IrreversibleLegError` (documented, expected behavior)
- **v2.2:** `reverse_fx_leg` returns `ReversalReceipt` with FX loss accounting, not just a confirmation

### 4.4 Interface Segregation Principle (ISP)

Clients depend only on the interfaces they use.

```python
# Segregated interfaces — each consumer sees only what it needs

class ITransactionScreener(ABC):
    """Used by ComplianceService only."""
    @abstractmethod
    async def screen(self, tx: Transaction) -> ComplianceResult: ...
    @abstractmethod
    async def get_list_version_hash(self) -> str: ...       # v2
    @abstractmethod
    async def quick_rescreen(
        self, tx: Transaction, previous_hash: str
    ) -> RescreenResult: ...                                 # v2

class IFXQuoter(ABC):
    """Used by FXEngineService only."""
    @abstractmethod
    async def get_quote(
        self, pair: CurrencyPair, amount: Decimal
    ) -> Quote: ...
    @abstractmethod
    async def lock_quote(
        self, quote: Quote, ttl_seconds: int
    ) -> LockedQuote: ...
    @abstractmethod
    async def get_dynamic_tolerance(
        self, pair: CurrencyPair, timestamp: datetime
    ) -> ToleranceConfig: ...                                # v2

class ISettlementExecutor(ABC):
    """Used by SettlementService only."""
    @abstractmethod
    async def reserve(self, instruction: SettlementInstruction) -> Reservation: ...
    @abstractmethod
    async def execute_leg(
        self, reservation: Reservation, leg: SettlementLeg
    ) -> LegConfirmation: ...                                # v2: per-leg execution
    @abstractmethod
    async def rollback(self, reservation: Reservation) -> RollbackReceipt: ...
    @abstractmethod
    async def reverse_leg(
        self, leg_confirmation: LegConfirmation
    ) -> ReversalReceipt: ...                                # v2.2: includes FX loss

class ILedgerMonitor(ABC):
    """Used by MonitoringService and ReconciliationEngine."""
    @abstractmethod
    async def get_node_status(self) -> NodeHealth: ...
    @abstractmethod
    async def get_pending_transactions(self) -> list[PendingTx]: ...
    @abstractmethod
    async def poll_transaction(self, tx_hash: str) -> LedgerStatus: ...  # v2

class IAuditLogger(ABC):
    """Used by ReconciliationEngine only."""
    @abstractmethod
    async def log_event(self, event: AuditEvent) -> None: ...
    @abstractmethod
    async def query_events(self, filters: AuditFilter) -> list[AuditEvent]: ...

class IChaosTestable(ABC):
    """v2: Used by chaos testing framework only."""
    @abstractmethod
    async def inject_fault(self, fault: FaultSpec) -> None: ...
    @abstractmethod
    async def clear_faults(self) -> None: ...
```

### 4.5 Dependency Inversion Principle (DIP)

High-level policy modules never depend on low-level implementation details.

```python
# HIGH-LEVEL: Settlement orchestration (business logic)
class SettlementOrchestrator:
    """
    Depends ONLY on abstractions. Never imports a concrete bank,
    compliance provider, or FX source.

    v2 changes:
    - Multi-leg execution with per-leg rollback
    - Re-screening gate between Phase 1 and Phase 2
    - SETTLED_UNCONFIRMED handling with active polling
    """
    def __init__(
        self,
        screener: ITransactionScreener,
        quoter: IFXQuoter,
        executor: ISettlementExecutor,
        ledger_monitor: ILedgerMonitor,    # v2
        auditor: IAuditLogger,
        event_bus: IEventBus,
        corridor: TradeCorridor,           # v2: injected corridor
        hold_policy: HKDHoldPolicy,        # v2.2
    ):
        self._screener = screener
        self._quoter = quoter
        self._executor = executor
        self._ledger = ledger_monitor
        self._auditor = auditor
        self._bus = event_bus
        self._corridor = corridor
        self._hold_policy = hold_policy    # v2.2

    async def settle(self, instruction: SettlementInstruction) -> SettlementResult:

        # ── PHASE 0: SAFE Pre-Approval Check (v2.2) ───────────────
        if instruction.amount * instruction.estimated_cny_rate > 500_000:
            safe_status = await self._check_safe_approval(instruction)
            if safe_status != SAFEStatus.APPROVED:
                return SettlementResult.pending_safe(instruction.id)

        # ── PHASE 0b: Initial Compliance Screen ───────────────────
        compliance = await self._screener.screen(instruction.transaction)
        if not compliance.passed:
            await self._auditor.log_event(
                ComplianceBlockEvent(instruction, compliance)
            )
            return SettlementResult.blocked(compliance.reason)
        sanctions_hash = await self._screener.get_list_version_hash()

        # ── PHASE 1: Quote & Reserve ───────────────────────────────
        # Lock quotes for ALL FX legs
        locked_quotes = []
        for fx_leg in self._corridor.get_fx_legs():
            tolerance = await self._quoter.get_dynamic_tolerance(
                fx_leg.pair, datetime.utcnow()
            )
            quote = await self._quoter.get_quote(fx_leg.pair, instruction.amount)
            locked = await self._quoter.lock_quote(quote, ttl_seconds=tolerance.ttl)
            locked_quotes.append((fx_leg, locked))

        # v2.2: Composite quote buffer check — abort if insufficient time
        composite = CompositeQuote.from_legs(locked_quotes)
        buffer_seconds = (composite.weakest_expiry - datetime.utcnow()).total_seconds()
        if buffer_seconds < tolerance.minimum_execution_buffer_seconds:
            await self._auditor.log_event(
                QuoteBufferInsufficientEvent(instruction, buffer_seconds)
            )
            return SettlementResult.requote_needed(
                f"Only {buffer_seconds:.0f}s left on weakest quote; need {tolerance.minimum_execution_buffer_seconds}s"
            )

        # Reserve funds
        reservation = await self._executor.reserve(instruction)
        await self._bus.emit(FundsReservedEvent(reservation))

        # ── GATE CHECK: Mid-Settlement Re-Screen (v2) ─────────────
        rescreen = await self._screener.quick_rescreen(
            instruction.transaction, sanctions_hash
        )
        if rescreen.is_rescreened and not rescreen.result.passed:
            await self._executor.rollback(reservation)
            await self._auditor.log_event(
                MidSettlementComplianceBlockEvent(instruction, rescreen)
            )
            return SettlementResult.blocked(
                f"Mid-settlement re-screen failed: {rescreen.result.reason}"
            )

        # ── v2.2: Pre-Leg1 HKD Hold Check ─────────────────────────
        hold_decision = await self._hold_policy.check_pre_leg1(
            self._corridor, datetime.utcnow(),
            estimated_leg1_duration=self._corridor.get_settlement_legs()[0].estimated_latency_seconds
        )
        if not hold_decision.proceed:
            await self._executor.rollback(reservation)
            return SettlementResult.delayed(hold_decision.reason, hold_decision.retry_at)

        # ── PHASE 2: Execute Settlement Legs ───────────────────────
        completed_legs = []
        hold_start = None
        try:
            for leg, (fx_leg, locked_quote) in zip(
                self._corridor.get_settlement_legs(), locked_quotes
            ):
                confirmation = await self._executor.execute_leg(
                    reservation, leg
                )
                completed_legs.append(confirmation)
                await self._bus.emit(LegCompletedEvent(leg, confirmation))

                # v2.2: Start HKD hold timer after Leg 1
                if leg.leg_id == "LEG1_AUD_HKD":
                    hold_start = datetime.utcnow()

        except (LegFailedError, QuoteExpiredError) as e:
            # Reverse completed legs in reverse order — track FX loss (v2.2)
            total_fx_loss = Decimal("0")
            reversal_receipts = []
            for completed in reversed(completed_legs):
                if completed.leg_type == LegType.OFF_LEDGER:
                    receipt = await self._executor.reverse_leg(completed)
                    reversal_receipts.append(receipt)
                    total_fx_loss += receipt.fx_loss
                    # v2.2: Escalate if FX loss exceeds threshold
                    if receipt.fx_loss_bps > self._hold_policy.max_reversal_fx_loss_bps:
                        await self._bus.emit(ExcessiveReversalLossAlert(receipt))
            await self._executor.rollback(reservation)
            await self._auditor.log_event(
                SettlementRollbackEvent(reservation, completed_legs, e,
                                        reversal_receipts=reversal_receipts,
                                        total_fx_loss=total_fx_loss)  # v2.2
            )
            return SettlementResult.failed(str(e), fx_loss=total_fx_loss)

        # ── PHASE 3: Confirmation & Active Polling (v2) ───────────
        final_leg = completed_legs[-1]  # Last leg is the mBridge on-ledger swap
        if final_leg.ledger_tx_hash:
            # Actively verify settlement on ledger
            confirmed = await self._poll_for_confirmation(
                final_leg.ledger_tx_hash
            )
            if not confirmed:
                # SETTLED_UNCONFIRMED — escalate immediately
                await self._auditor.log_event(
                    SettledUnconfirmedEvent(reservation, final_leg)
                )
                await self._bus.emit(
                    SettledUnconfirmedAlert(reservation, final_leg)
                )
                return SettlementResult.unconfirmed(final_leg.ledger_tx_hash)

        await self._auditor.log_event(SettlementCompleteEvent(completed_legs))
        await self._bus.emit(SettlementConfirmedEvent(completed_legs))
        return SettlementResult.success(completed_legs)

    async def _poll_for_confirmation(
        self, tx_hash: str, max_attempts: int = 30, interval_seconds: float = 2.0
    ) -> bool:
        """
        v2: Active ledger polling for settlement confirmation.
        Polls every 2 seconds for up to 60 seconds before giving up.
        """
        for _ in range(max_attempts):
            status = await self._ledger.poll_transaction(tx_hash)
            if status == LedgerStatus.CONFIRMED:
                return True
            if status == LedgerStatus.FAILED:
                return False
            await asyncio.sleep(interval_seconds)
        return False  # Timeout — enters SETTLED_UNCONFIRMED


# LOW-LEVEL: Concrete wiring at composition root
def build_orchestrator(config: Config) -> SettlementOrchestrator:
    bank = HSBCHKAdapter(config.hsbc_credentials)
    corridor = AUDviaHKDtoCNYCorridor()  # v2: two-hop is default

    return SettlementOrchestrator(
        screener=CompositeScreener([
            OFACSanctionsRule(config.ofac_api_key),
            PBOCCrossBorderRule(config.pboc_endpoint),
            HKMAComplianceRule(config.hkma_endpoint),  # v2: HK transit
            AustracAMLRule(config.austrac_endpoint),
        ]),
        quoter=bank,
        executor=bank,
        ledger_monitor=bank,           # v2
        auditor=PostgresAuditLogger(config.db_url),
        event_bus=PostgresOutboxBus(config.db_url),  # v2: Postgres, not Kafka
        corridor=corridor,             # v2
        hold_policy=HKDHoldPolicy(     # v2.2
            nostro_account=config.hkd_nostro_account,
            max_hold_duration_seconds=300,
            hedge_trigger_seconds=60,
            max_reversal_fx_loss_bps=50,
        ),
    )
```

**Dependency graph flows inward (unchanged principle, expanded scope):**

```
Composition Root (main.py)
    │
    ▼ wires
SettlementOrchestrator (depends on abstractions)
    │
    ▼ uses
ITransactionScreener, IFXQuoter, ISettlementExecutor,
ILedgerMonitor, IAuditLogger, IEventBus, TradeCorridor
    │
    ▲ implements
HSBCHKAdapter, OFACSanctionsRule, PostgresAuditLogger,
PostgresOutboxBus, AUDviaHKDtoCNYCorridor
```

---

## 5. System Components — Detailed Design

### 5.1 Ingestion Service

**Purpose:** Accept trade/invoice triggers from external systems, **authenticate them**, and normalize them into internal settlement instructions.

**v2 Addition — Webhook Signature Verification:**

The most likely real-world attack isn't a nation-state targeting the mBridge node — it's a compromised ERP sending fabricated invoices that pass schema validation. Every webhook must be cryptographically verified.

```python
class WebhookAuthenticator:
    """
    Verify webhook signatures before any processing.
    Each ERP integration has a registered signing key.
    """
    async def verify(self, request: WebhookRequest) -> AuthResult:
        # 1. Extract signature from headers
        signature = request.headers.get("X-Webhook-Signature")
        if not signature:
            return AuthResult.rejected("Missing signature header")

        # 2. Look up signing key for this source
        source_id = request.headers.get("X-Source-ID")
        signing_key = await self._key_store.get(source_id)
        if not signing_key:
            return AuthResult.rejected(f"Unknown source: {source_id}")

        # 3. Verify HMAC-SHA256
        expected = hmac.new(signing_key, request.body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return AuthResult.rejected("Invalid signature")

        return AuthResult.verified(source_id)
```

**Additional Anti-Fraud Controls:**
- Invoice cross-referencing with trade registries (verify the underlying trade exists)
- Anomaly detection on submission patterns (sudden volume spike from a single exporter)
- Rate limiting per source (max N invoices per hour per registered ERP)
- Manual approval queue for first-time counterparties

**v2.2: ISO 20022 Message Type Mapping**

Specifying message types now prevents integration surprises when onboarding the first bank.

| System Boundary | ISO 20022 Message | Direction | Purpose |
|----------------|-------------------|-----------|---------|
| Exporter → Agent | `pain.001` | Inbound | Customer Credit Transfer Initiation (settlement instruction) |
| Agent → Bank (Leg 1) | `pacs.008` | Outbound | FI to FI Customer Credit Transfer (AUD→HKD) |
| Agent → Bank (Leg 2) | `pacs.009` | Outbound | FI to FI Financial Institution Credit Transfer (HKD→eCNY via mBridge) |
| Bank → Agent (Reconciliation) | `camt.053` | Inbound | Bank to Customer Statement (end-of-day matching) |
| Bank → Agent (Real-time) | `camt.054` | Inbound | Bank to Customer Debit/Credit Notification (real-time confirmation) |
| Agent → Exporter | `camt.052` | Outbound | Bank to Customer Account Report (settlement status) |

**Processing Pipeline:**

```
Raw Input
  → Webhook Signature Verification (v2)
  → Schema Validation (JSON Schema / XSD)
  → Deduplication Check (by invoice ID + amount + counterparty)
  → Anti-Fraud Checks (cross-reference, anomaly detection) (v2)
  → Normalization to internal SettlementInstruction
  → Enrichment (pull counterparty details from registry)
  → Emit InstructionReceivedEvent to Event Bus
```

### 5.2 Compliance Service

**Purpose:** Gate every transaction through regulatory checks *before* funds move, **and re-verify between reserve and execute**.

**Screening Pipeline (Sequential with Short-Circuit):**

```
Transaction
  → Identity Verification (KYC — is the exporter/importer known?)
  → Sanctions Screening (OFAC, UN, AU DFAT, China MPS, HKMA) ← v2: HK added
  → AML Pattern Detection (velocity checks, structuring detection)
  → Trade Document Validation (invoice, customs declaration, bill of lading)
  → Cross-Border Limits Check (PBOC daily/annual thresholds)
  → ✓ PASS → Emit ComplianceClearedEvent + return sanctions_list_hash
  → ✗ FAIL → Emit ComplianceBlockedEvent (with reason + escalation path)
```

**v2: Mid-Settlement Re-Screen Gate**

```
Between Phase 1 (Reserve) and Phase 2 (Execute):
  → Compare current sanctions_list_hash with hash from initial screen
  → If UNCHANGED → proceed (zero latency added)
  → If CHANGED → run full re-screen (adds ~2-3 seconds)
      → If PASS → proceed with new hash
      → If FAIL → rollback Phase 1, block transaction, alert compliance team
```

**Cost of this check:** Near-zero in the common case (hash comparison). Sanctions lists update ~1-2 times per day, so full re-screens during a settlement window are rare. But when they happen, this check prevents a regulatory enforcement action.

**Critical Considerations:**
- Screening must complete *before* Phase 1 (fund reservation), not in parallel
- **Re-screening runs between Phase 1 and Phase 2** (v2)
- Sanctions lists update daily — the service polls and caches with a max staleness of 4 hours
- China-specific: transactions above ¥50,000 require additional documentation; above ¥500,000 require SAFE pre-approval
- **v2.2: SAFE pre-approval is ASYNC** — it takes days, not seconds. It runs as a separate workflow *before* the settlement instruction enters the pipeline. The state machine includes `PENDING_SAFE_APPROVAL`. Only pre-approved instructions proceed. SAFE approval can be requested via the exporter portal or the ingestion API, and the result is cached per counterparty pair + amount band.
- Australia-specific: AUSTRAC requires IFTIs reported within 10 business days
- **v2: HK transit leg** requires HKMA AMLO compliance for the AUD→HKD conversion

### 5.3 FX Engine Service

**Purpose:** Provide accurate, locked FX quotes with **dynamic, time-of-day-aware slippage protection** across **multiple FX legs**.

**v2: Dual-Leg FX for AUD Corridor**

The two-hop architecture means two FX conversions:
- **Leg 1:** AUD → HKD (traditional FX market, generally liquid)
- **Leg 2:** HKD → CNY (mBridge rate, tied to PBOC fixing and Digital Yuan Ops Center)

Each leg has independent pricing, spread, and liquidity characteristics.

**Rate Sources (Priority Order, Per Leg):**

| Leg | Source 1 (Primary) | Source 2 | Source 3 (Fallback) |
|-----|-------------------|----------|-------------------|
| AUD/HKD | Participating bank FX desk | Reuters/Bloomberg feed | Cross-rate via AUD/USD + USD/HKD |
| HKD/CNY | Digital Yuan International Operations Center | PBOC Daily Fixing (9:15am Beijing) | Participating bank internal rate |

**v2: Dynamic Tolerance Based on Time-of-Day and Liquidity**

```python
@dataclass
class DynamicTolerance:
    schedule: LiquiditySchedule
    pair: str

    def get_config(self, timestamp: datetime) -> ToleranceConfig:
        window = self.schedule.get_window(timestamp)
        staleness = self._get_fixing_staleness_penalty(timestamp)  # v2.2

        if window.liquidity == Liquidity.HIGH:
            return ToleranceConfig(
                max_tolerance_bps=15 + staleness,      # v2.2: widened by staleness
                requote_threshold_bps=8 + (staleness // 2),
                quote_ttl_seconds=30,
                max_requotes=3,
            )
        elif window.liquidity == Liquidity.MEDIUM:
            return ToleranceConfig(
                max_tolerance_bps=35 + staleness,
                requote_threshold_bps=15 + (staleness // 2),
                quote_ttl_seconds=20,
                max_requotes=5,
            )
        elif window.liquidity == Liquidity.LOW:
            return ToleranceConfig(
                max_tolerance_bps=60 + staleness,
                requote_threshold_bps=25 + (staleness // 2),
                quote_ttl_seconds=15,
                max_requotes=8,
            )
        else:  # CLOSED
            return ToleranceConfig(
                max_tolerance_bps=0,
                requote_threshold_bps=0,
                quote_ttl_seconds=0,
                max_requotes=0,
                execution_paused=True,
                pause_reason="Market closed for this corridor",
            )

    def _get_fixing_staleness_penalty(self, timestamp: datetime) -> int:
        """
        v2.2: PBOC publishes the CNY fixing rate at 9:15am Beijing time (01:15 UTC).
        As hours pass, the fixing diverges from spot. Widen tolerance proportionally.

        0-2 hours after fixing:  +0 bps  (rate is fresh)
        2-4 hours:               +5 bps
        4-8 hours:               +10 bps
        8-16 hours:              +20 bps  (afternoon/evening Beijing)
        16-24 hours:             +30 bps  (next morning, pre-fixing)
        """
        fixing_time_utc = timestamp.replace(hour=1, minute=15, second=0)
        if timestamp < fixing_time_utc:
            # Before today's fixing — use yesterday's age
            hours_since_fixing = (timestamp - fixing_time_utc + timedelta(days=1)).total_seconds() / 3600
        else:
            hours_since_fixing = (timestamp - fixing_time_utc).total_seconds() / 3600

        if hours_since_fixing <= 2:
            return 0
        elif hours_since_fixing <= 4:
            return 5
        elif hours_since_fixing <= 8:
            return 10
        elif hours_since_fixing <= 16:
            return 20
        else:
            return 30


@dataclass
class ToleranceConfig:
    max_tolerance_bps: int
    requote_threshold_bps: int
    quote_ttl_seconds: int
    max_requotes: int
    execution_paused: bool = False
    pause_reason: str = ""
    minimum_execution_buffer_seconds: int = 15  # v2.2: abort if less than this left on weakest quote
```

**Quote Lifecycle (v2: Multi-Leg):**

```
Request Composite Quote (for all legs in corridor)
  → Check liquidity window — if CLOSED, return QuotePausedResult
  → For each FX leg:
      → Fetch best rate from prioritized sources
      → Apply spread (configurable per corridor per leg)
      → Generate per-leg Quote with dynamic TTL
  → Generate CompositeQuote (all legs, combined rate, combined spread)
  → Client locks composite quote
  → All per-leg quotes held with independent countdowns
  → If ANY leg quote expires → entire composite dies, must re-request
  → If ANY leg moves > tolerance → auto-invalidate composite
```

### 5.4 Settlement Executor

**Purpose:** Execute the **multi-leg** two-phase mBridge settlement with guaranteed atomicity across legs.

**v2.2: State Machine with SAFE Pre-Approval, HKD Hold Policy, and SETTLED_UNCONFIRMED**

```
INITIATED
  │
  ├──→ [Amount > ¥500,000?]
  │     │
  │     ├── YES → PENDING_SAFE_APPROVAL ──→ [days] ──→ SAFE_APPROVED ──→ continue
  │     │                                       └──→ SAFE_REJECTED ──→ TERMINATED
  │     └── NO → continue
  │
  ▼
COMPLIANCE_CLEARED
  │
  ▼
FUNDS_RESERVED
  │
  ├──→ [Re-screen gate check]
  │     │
  │     ├── PASS → continue
  │     └── FAIL → ROLLED_BACK
  │
  ├──→ [Composite quote buffer check (v2.2)]
  │     │
  │     ├── weakest_expiry - now >= 15s → continue
  │     └── < 15s → REQUOTING (re-lock all legs)
  │
  ▼
LEG1_EXECUTING (AUD → HKD, off-ledger)
  │
  ├──→ SUCCESS → LEG1_COMPLETE + HKD_HOLD_STARTED (v2.2: hold timer begins)
  │               │
  │               ├──→ [HKD hold > max_hold_duration (5 min)?] → LEG1_REVERSING (auto)
  │               │
  │               ├──→ [HKD hold > hedge_trigger (60s)?] → HEDGE_ACTIVE (optional)
  │               │
  │               ▼
  │             LEG2_EXECUTING (HKD → e-CNY, on-ledger mBridge)
  │               │
  │               ├──→ SUCCESS → SETTLED_UNCONFIRMED ──→ [active poll] ──→ SETTLED
  │               │                    │
  │               │                    └──→ [poll timeout] ──→ ESCALATED_UNCONFIRMED
  │               │
  │               └──→ FAIL → LEG1_REVERSING → ROLLED_BACK_WITH_FX_LOSS (v2.2)
  │
  └──→ FAIL → ROLLED_BACK → RETRY_QUEUED → (back to INITIATED)
                │
                └──→ FAILED_PERMANENT → ESCALATED
```

**Phase 1 — Reserve:**

```
SettlementInstruction
  → [v2.2: If amount > ¥500,000, verify SAFE pre-approval exists]
  → Generate idempotency key (hash of invoice_id + amount + timestamp)
  → Call bank adapter: reserve_funds(amount, "AUD", idempotency_key)
  → Receive ReservationReceipt
  → Store reservation state (status: FUNDS_RESERVED)
  → Emit FundsReservedEvent
  → Run re-screen gate check (v2)
  → [v2.2: Composite quote buffer check — if weakest_expiry - now < 15s, re-quote]
  → [v2.2: Liquidity window boundary check — if Leg 2 would cross into CLOSED window, abort]
  → Start Phase 2 timeout (configurable, default 90s for two-hop)
```

**v2.2: HKD Float Policy**

Between Leg 1 completion (AUD→HKD) and Leg 2 execution (HKD→eCNY), the agent holds HKD in a nostro account at the participating bank. This creates FX exposure that must be actively managed.

```python
@dataclass
class HKDHoldPolicy:
    """
    v2.2: Governs FX exposure during the HKD hold window between Leg 1 and Leg 2.
    """
    # Nostro account at participating bank where HKD sits
    nostro_account: str

    # Max time to hold HKD before auto-reversing Leg 1
    max_hold_duration_seconds: int = 300  # 5 minutes

    # If hold exceeds this, activate a hedge on the HKD position
    hedge_trigger_seconds: int = 60

    # Don't start Leg 1 if Leg 2 would land in a CLOSED liquidity window
    block_cross_window_settlements: bool = True

    # Max acceptable FX loss on reversal before escalating to human
    max_reversal_fx_loss_bps: int = 50  # 0.5% — above this, escalate

    async def check_pre_leg1(
        self, corridor: TradeCorridor, now: datetime, estimated_leg1_duration: int
    ) -> HoldDecision:
        """
        Called BEFORE Leg 1 execution. Checks whether it's safe to start
        given the current liquidity window and Leg 2 timing.
        """
        schedule = corridor.get_liquidity_schedule()
        leg2_start_time = now + timedelta(seconds=estimated_leg1_duration)
        leg2_window = schedule.get_window(leg2_start_time)

        if leg2_window.liquidity == Liquidity.CLOSED and self.block_cross_window_settlements:
            return HoldDecision(
                proceed=False,
                reason=f"Leg 2 would execute in CLOSED window starting {leg2_window.start}. "
                       f"Delaying until next open window.",
                retry_at=leg2_window.end_time,
            )

        return HoldDecision(proceed=True)

    async def monitor_hold(
        self, leg1_confirmation: LegConfirmation, hold_start: datetime
    ) -> HoldStatus:
        """
        Called periodically during HKD hold. Returns action to take.
        """
        elapsed = (datetime.utcnow() - hold_start).total_seconds()

        if elapsed > self.max_hold_duration_seconds:
            return HoldStatus.AUTO_REVERSE  # Trigger Leg 1 reversal

        if elapsed > self.hedge_trigger_seconds:
            return HoldStatus.HEDGE  # Activate FX hedge on HKD position

        return HoldStatus.HOLDING  # Continue waiting for Leg 2
```

**Phase 2 — Execute Legs (v2: Sequential Multi-Leg):**

```
Leg 1 (AUD → HKD, off-ledger):
  → Call bank adapter: execute_fx_leg(reservation, leg1, locked_quote_leg1)
  → Receive LegConfirmation with HKD amount received
  → Store state (status: LEG1_COMPLETE)
  → Emit LegCompletedEvent

Leg 2 (HKD → e-CNY, on-ledger mBridge):
  → Call bank adapter: execute_mbridge_swap(hkd_amount, "HKD", "eCNY", locked_quote_leg2)
  → Receive SettlementConfirmation with ledger tx hash
  → Store state (status: SETTLED_UNCONFIRMED)   ← v2: not SETTLED yet
  → Begin active confirmation polling (v2)
```

**Phase 3 — Active Confirmation Polling (v2):**

```
SETTLED_UNCONFIRMED state:
  → Poll mBridge ledger every 2 seconds
  → For up to 60 seconds (30 attempts)
  → If CONFIRMED → update state to SETTLED → Emit SettlementConfirmedEvent
  → If FAILED → this is a critical incident (money may have moved)
      → Alert operations team immediately
      → Do NOT auto-rollback (ledger state is ambiguous)
      → Enter ESCALATED_UNCONFIRMED for manual resolution
  → If TIMEOUT → enter ESCALATED_UNCONFIRMED
      → Reconciliation engine takes over with broader ledger queries
```

**Rollback Path (v2.2: Multi-Leg Reversal with FX Loss Tracking):**

```
If Leg 2 fails after Leg 1 succeeded:
  → Reverse Leg 1: bank adapter: reverse_fx_leg(leg1_confirmation)
  → Receive ReversalReceipt (v2.2) containing:
      - original_source_amount: AUD originally sent
      - returned_amount: AUD received back
      - reversal_fx_rate: AUD/HKD rate at reversal time
      - fx_loss: original_source_amount - returned_amount
      - reversal_fee: bank's reversal processing fee
  → If fx_loss > max_reversal_fx_loss_bps → escalate to operations (don't auto-complete)
  → Release original AUD reservation
  → Store state (status: ROLLED_BACK_WITH_FX_LOSS) (v2.2)
  → Emit SettlementRollbackEvent with FX loss details
  → Notify exporter: "Settlement failed. {returned_amount} AUD returned.
    FX loss of {fx_loss} AUD incurred during reversal."

If Leg 1 fails:
  → Release AUD reservation (no FX to reverse, no loss)
  → Store state (status: ROLLED_BACK)
  → Queue for retry if transient, escalate if permanent
```

**v2.2: Reversal Receipt Data Model:**

```python
@dataclass
class ReversalReceipt:
    """
    v2.2: Models the reality that Leg 1 reversal is NOT free.
    The AUD/HKD rate may have moved, and the bank charges reversal fees.
    """
    leg_confirmation_id: UUID           # Which leg was reversed
    original_source_amount: Decimal     # AUD originally debited
    original_target_amount: Decimal     # HKD received in Leg 1
    reversal_fx_rate: Decimal           # AUD/HKD rate at reversal time
    returned_amount: Decimal            # AUD actually returned to exporter
    fx_loss: Decimal                    # original_source_amount - returned_amount
    fx_loss_bps: int                    # Loss in basis points
    reversal_fee: Decimal               # Bank's reversal processing fee
    reversal_currency: str              # "AUD"
    reversed_at: datetime
    bank_reference: str                 # Bank's reversal transaction reference

    @property
    def total_cost(self) -> Decimal:
        """Total cost to the exporter of the failed settlement."""
        return self.fx_loss + self.reversal_fee
```

### 5.5 Reconciliation Engine

**Purpose:** Ensure every settlement matches on both sides, **actively recover unconfirmed settlements**, and produce audit trails.

**v2: Active Confirmation Recovery**

The reconciliation engine has two modes:
1. **Active polling** (real-time): For SETTLED_UNCONFIRMED transactions, polls the mBridge ledger on a tight loop (handled by SettlementExecutor, escalated to Reconciliation if it times out)
2. **Passive matching** (batch): T+0 end-of-day reconciliation across all settled transactions

**Reconciliation Checks (T+0):**

- AUD debit amount matches expected
- HKD intermediate amount matches (FX rate × AUD amount, within tolerance) — v2: two-hop check
- e-CNY credit amount matches (FX rate × HKD amount, within tolerance)
- mBridge ledger tx hash is confirmed (finality check)
- Both exporter and importer confirmations received
- **v2: All SETTLED_UNCONFIRMED transactions resolved or escalated**

**Discrepancy Handling:**

| Type | Action |
|------|--------|
| Amount mismatch < 0.01% | Auto-reconcile (rounding) |
| Amount mismatch 0.01–1% | Flag for review, auto-resolve within 24h |
| Amount mismatch > 1% | Halt, escalate to operations team |
| Missing confirmation | Retry confirmation fetch for 1 hour, then escalate |
| Ledger tx not found | **Critical alert — possible settlement failure. Do NOT auto-rollback.** |
| SETTLED_UNCONFIRMED > 5 minutes | Escalate to operations with full audit trail |
| Leg 1 complete, Leg 2 status unknown | Query ledger + bank; if Leg 2 failed, reverse Leg 1 |

### 5.6 Monitoring, Circuit Breakers & Chaos Testing

**Health Checks:**

```python
class HealthCheckSuite:
    checks = [
        MBridgeNodePing(),           # Is the bank's mBridge node responding?
        ComplianceAPIHealth(),       # Are sanctions screening APIs up?
        FXSourceAvailability(),      # Is at least one FX source returning rates?
        DatabaseConnectivity(),      # Is the state store reachable?
        EventBusHealth(),            # Is the PostgreSQL outbox healthy?
        LiquidityWindowCheck(),      # v2: Are we in a tradeable window?
    ]
```

**Circuit Breaker Configuration (v2: Liquidity-Aware):**

```python
@dataclass
class CircuitBreakerConfig:
    failure_threshold: int = 5
    recovery_timeout_s: int = 60
    half_open_max_calls: int = 3
    monitored_services: list = field(default_factory=lambda: [
        "mbridge_node", "compliance_api", "fx_source", "bank_adapter"
    ])

@dataclass
class LiquidityCircuitBreaker:
    """
    v2: Pauses settlement execution during low-liquidity windows
    rather than burning through requotes.
    """
    corridor: TradeCorridor
    max_consecutive_requotes: int = 3  # If 3 quotes in a row breach tolerance, pause

    async def should_pause(self, timestamp: datetime) -> PauseDecision:
        schedule = self.corridor.get_liquidity_schedule()
        window = schedule.get_window(timestamp)

        if window.liquidity == Liquidity.CLOSED:
            return PauseDecision(
                paused=True,
                reason=f"Market closed for {self.corridor.name}",
                resume_at=window.end_time,
            )

        if self._consecutive_requote_count >= self.max_consecutive_requotes:
            return PauseDecision(
                paused=True,
                reason=f"Requote storm detected ({self._consecutive_requote_count} consecutive)",
                resume_at=timestamp + timedelta(minutes=5),
            )

        return PauseDecision(paused=False)
```

**v2: Chaos Testing Framework**

The rollback path is the most critical and least-tested part of any settlement system. Chaos testing must be in the CI/CD pipeline from day one.

```python
class ChaosTestSuite:
    """
    Deliberately inject faults to verify the system handles them correctly.
    Run in staging on every deploy. Run in production monthly (off-hours).
    """

    scenarios = [
        # ── Settlement Path Failures ──────────────────────────────
        ChaosScenario(
            name="leg2_fails_after_leg1_succeeds",
            description="Leg 1 (AUD→HKD) succeeds, then Leg 2 (HKD→eCNY) fails. "
                        "Verify Leg 1 is reversed and AUD reservation released.",
            fault=InjectFault(
                service="bank_adapter",
                method="execute_mbridge_swap",
                fault_type=FaultType.RAISE_EXCEPTION,
                exception=SettlementFailedError("Simulated mBridge failure"),
            ),
            assertions=[
                AssertState("reservation", Status.ROLLED_BACK),
                AssertEventEmitted(SettlementRollbackEvent),
                AssertLeg1Reversed(),
                AssertFundsReturnedToExporter(),
            ],
        ),
        ChaosScenario(
            name="confirmation_callback_fails",
            description="mBridge swap succeeds but confirmation callback times out. "
                        "Verify SETTLED_UNCONFIRMED state triggers active polling.",
            fault=InjectFault(
                service="bank_adapter",
                method="execute_mbridge_swap",
                fault_type=FaultType.RETURN_SUCCESS_THEN_DROP_CALLBACK,
            ),
            assertions=[
                AssertState("reservation", Status.SETTLED_UNCONFIRMED),
                AssertActivePollStarted(),
                AssertEventEmitted(SettledUnconfirmedAlert),
            ],
        ),
        ChaosScenario(
            name="sanctions_list_updates_mid_settlement",
            description="Sanctions list hash changes between initial screen and "
                        "Phase 2 gate check, and counterparty is newly sanctioned. "
                        "Verify settlement is blocked and funds returned.",
            fault=InjectFault(
                service="compliance",
                method="get_list_version_hash",
                fault_type=FaultType.CHANGE_RETURN_VALUE_AFTER_FIRST_CALL,
                new_value="updated_hash_with_new_sanctions",
            ),
            assertions=[
                AssertState("reservation", Status.ROLLED_BACK),
                AssertEventEmitted(MidSettlementComplianceBlockEvent),
                AssertFundsReturnedToExporter(),
            ],
        ),

        # ── Infrastructure Failures ───────────────────────────────
        ChaosScenario(
            name="database_unavailable_during_state_update",
            description="PostgreSQL goes down after mBridge swap but before state "
                        "is persisted. Verify reconciliation recovers the state.",
            fault=InjectFault(
                service="state_store",
                method="update_status",
                fault_type=FaultType.TIMEOUT,
                duration_seconds=30,
            ),
            assertions=[
                AssertReconciliationRecovers(),
                AssertNoFundsLost(),
            ],
        ),
        ChaosScenario(
            name="event_bus_backpressure",
            description="Event bus is congested. Verify settlement still completes "
                        "and events are delivered eventually (outbox pattern).",
            fault=InjectFault(
                service="event_bus",
                method="emit",
                fault_type=FaultType.DELAY,
                delay_seconds=10,
            ),
            assertions=[
                AssertSettlementCompletes(),
                AssertEventsDeliveredEventually(max_delay_seconds=60),
            ],
        ),

        # ── FX Failures ──────────────────────────────────────────
        ChaosScenario(
            name="requote_storm",
            description="FX rate breaches tolerance on every quote attempt. "
                        "Verify liquidity circuit breaker activates.",
            fault=InjectFault(
                service="fx_engine",
                method="get_quote",
                fault_type=FaultType.RETURN_VOLATILE_RATE,
                volatility_bps=100,  # Far exceeds any tolerance band
            ),
            assertions=[
                AssertCircuitBreakerOpened("liquidity"),
                AssertSettlementQueued(),
                AssertAlertFired("requote_storm"),
            ],
        ),

        # ── v2.2: HKD Float & Reversal Failures ──────────────────
        ChaosScenario(
            name="hkd_hold_exceeds_max_duration",
            description="Leg 1 succeeds but Leg 2 is delayed beyond max hold "
                        "duration (5 min). Verify auto-reversal triggers and "
                        "ReversalReceipt includes FX loss.",
            fault=InjectFault(
                service="bank_adapter",
                method="execute_mbridge_swap",
                fault_type=FaultType.DELAY,
                delay_seconds=310,  # Exceeds 300s max hold
            ),
            assertions=[
                AssertState("reservation", Status.ROLLED_BACK_WITH_FX_LOSS),
                AssertLeg1Reversed(),
                AssertReversalReceiptContainsFXLoss(),
                AssertAlertFired("hkd_hold_exceeded"),
            ],
        ),
        ChaosScenario(
            name="leg1_reversal_returns_less_aud",
            description="Leg 2 fails, Leg 1 reversal succeeds but AUD/HKD rate "
                        "moved — exporter gets back less AUD. Verify FX loss "
                        "is tracked and excessive loss escalates.",
            fault=InjectFault(
                service="bank_adapter",
                method="reverse_fx_leg",
                fault_type=FaultType.RETURN_PARTIAL_REVERSAL,
                reversal_fx_loss_bps=75,  # Exceeds 50bps threshold
            ),
            assertions=[
                AssertState("reservation", Status.ROLLED_BACK_WITH_FX_LOSS),
                AssertEventEmitted(ExcessiveReversalLossAlert),
                AssertExporterNotNotifiedUntilReviewed(),
            ],
        ),
        ChaosScenario(
            name="settlement_crosses_liquidity_boundary",
            description="Settlement initiated 30 seconds before CLOSED window. "
                        "Verify pre-Leg1 check blocks execution.",
            fault=InjectFault(
                service="clock",
                method="utcnow",
                fault_type=FaultType.RETURN_FIXED_TIME,
                fixed_time="21:59:30Z",  # 30s before CLOSED window
            ),
            assertions=[
                AssertState("reservation", Status.DELAYED),
                AssertLeg1NotExecuted(),
                AssertRetryScheduledForNextWindow(),
            ],
        ),
    ]

    async def run_all(self, environment: str = "staging") -> ChaosReport:
        results = []
        for scenario in self.scenarios:
            result = await self._run_scenario(scenario, environment)
            results.append(result)
        return ChaosReport(results)
```

**Chaos Testing in CI/CD:**
- **Every PR merge:** Run all chaos scenarios against staging
- **Every deploy to production:** Run non-destructive scenarios (confirmation failures, requote storms)
- **Monthly (off-hours):** Run full suite including infrastructure failures against production
- **Quarterly:** Red team exercise simulating compromised ERP + fabricated invoices

---

## 6. Data Model

### 6.1 Core Entities

```python
@dataclass
class SettlementInstruction:
    id: UUID
    invoice_id: str
    exporter: Counterparty
    importer: Counterparty
    amount: Decimal
    source_currency: str            # "AUD"
    target_currency: str            # "eCNY"
    corridor: str                   # "AUD_VIA_HKD_CNY" (v2)
    trade_documents: list[Document]
    created_at: datetime
    idempotency_key: str
    webhook_source_id: str          # v2: authenticated source

@dataclass
class Counterparty:
    entity_id: str
    name: str
    jurisdiction: str               # "AU", "HK", or "CN"
    bank_details: BankDetails
    kyc_status: KYCStatus
    sanctions_status: SanctionsStatus
    sanctions_screen_hash: str      # v2: hash of list used for screening

@dataclass
class LockedQuote:
    id: UUID
    currency_pair: str              # "AUD/HKD" or "HKD/CNY"
    rate: Decimal
    spread_bps: int
    locked_at: datetime
    expires_at: datetime
    source: str
    liquidity_window: str           # v2: "HIGH" | "MEDIUM" | "LOW"
    tolerance_config: ToleranceConfig  # v2: dynamic tolerance applied

@dataclass
class CompositeQuote:
    """v2: Bundles all FX leg quotes for a multi-hop corridor."""
    id: UUID
    corridor: str
    leg_quotes: list[LockedQuote]
    composite_rate: Decimal         # Product of all leg rates
    composite_spread_bps: int       # Sum of all leg spreads
    weakest_expiry: datetime        # Earliest expiring leg quote

@dataclass
class LegConfirmation:
    id: UUID
    leg_id: str                     # "LEG1_AUD_HKD" or "LEG2_HKD_ECNY"
    leg_type: LegType               # OFF_LEDGER or ON_LEDGER_MBRIDGE
    source_amount: Decimal
    target_amount: Decimal
    fx_rate_applied: Decimal
    ledger_tx_hash: str | None      # Only for on-ledger legs
    completed_at: datetime
    reversible: bool

@dataclass
class SettlementConfirmation:
    id: UUID
    instruction_id: UUID
    legs: list[LegConfirmation]     # v2: all legs
    total_source_amount: Decimal    # AUD debited
    total_target_amount: Decimal    # e-CNY credited
    composite_fx_rate: Decimal
    settled_at: datetime
    finality_status: str            # "CONFIRMED" | "UNCONFIRMED" | "ESCALATED" (v2)
    confirmation_poll_attempts: int # v2: how many polls before confirmation
    anchor_receipt: AnchorReceipt | None  # v2.1: ENS receipt anchor (None if not yet anchored)

@dataclass
class AnchorReceipt:
    """v2.1: On-chain settlement receipt anchor via ecny.eth."""
    subdomain: str                  # e.g., "a1b2c3d4.ecny.eth"
    receipt_hash: str               # SHA-256 of canonical receipt
    l2_tx_hash: str                 # L2 transaction hash
    l2_chain: str                   # "base" | "optimism" | "arbitrum"
    anchored_at: datetime

@dataclass
class IdentityProof:
    """v2.1: Cached ENS identity verification via digitalyuan.eth."""
    domain: str                     # "digitalyuan.eth"
    address: str                    # Resolved Ethereum address
    verified_at: datetime
    cache_ttl_hours: int            # 24h default

@dataclass
class SAFEApproval:
    """v2.2: SAFE pre-approval for large cross-border transfers."""
    id: UUID
    instruction_id: UUID
    counterparty_pair: str          # "exporter_id:importer_id"
    amount_cny: Decimal
    status: str                     # "PENDING" | "APPROVED" | "REJECTED"
    submitted_at: datetime
    resolved_at: datetime | None
    approval_reference: str | None  # SAFE reference number if approved
    rejection_reason: str | None
    valid_until: datetime | None    # Approval expiry (typically 90 days)

@dataclass
class HKDHoldRecord:
    """v2.2: Tracks HKD float exposure between Leg 1 and Leg 2."""
    settlement_id: UUID
    hkd_amount: Decimal
    hold_started_at: datetime
    hold_ended_at: datetime | None
    hold_duration_seconds: float | None
    outcome: str                    # "LEG2_EXECUTED" | "AUTO_REVERSED" | "HEDGED" | "MANUAL_REVERSED"
    fx_loss_on_reversal: Decimal | None
```

### 6.2 Event Schema

```python
@dataclass
class DomainEvent:
    event_id: UUID
    event_type: str
    timestamp: datetime
    correlation_id: UUID
    payload: dict

# Event types (v2 additions marked)
INSTRUCTION_RECEIVED     = "settlement.instruction.received"
COMPLIANCE_CLEARED       = "settlement.compliance.cleared"
COMPLIANCE_BLOCKED       = "settlement.compliance.blocked"
RESCREEN_PASSED          = "settlement.compliance.rescreen.passed"          # v2
RESCREEN_BLOCKED         = "settlement.compliance.rescreen.blocked"         # v2
QUOTE_LOCKED             = "settlement.quote.locked"
QUOTE_EXPIRED            = "settlement.quote.expired"
FUNDS_RESERVED           = "settlement.funds.reserved"
LEG_COMPLETED            = "settlement.leg.completed"                       # v2
LEG_FAILED               = "settlement.leg.failed"                          # v2
LEG_REVERSED             = "settlement.leg.reversed"                        # v2
SETTLED_UNCONFIRMED      = "settlement.unconfirmed"                         # v2
SETTLEMENT_CONFIRMED     = "settlement.confirmed"
SETTLEMENT_ROLLED_BACK   = "settlement.rolled_back"
ESCALATED_UNCONFIRMED    = "settlement.escalated.unconfirmed"               # v2
RECONCILIATION_MATCHED   = "settlement.reconciliation.matched"
RECONCILIATION_DISCREPANCY = "settlement.reconciliation.discrepancy"
LIQUIDITY_PAUSE          = "settlement.liquidity.paused"                    # v2
LIQUIDITY_RESUME         = "settlement.liquidity.resumed"                   # v2
CHAOS_FAULT_INJECTED     = "chaos.fault.injected"                           # v2
CHAOS_FAULT_CLEARED      = "chaos.fault.cleared"                            # v2
RECEIPT_ANCHORED         = "ens.receipt.anchored"                            # v2.1
RECEIPT_ANCHOR_FAILED    = "ens.receipt.anchor_failed"                       # v2.1
REGISTRY_UPDATED         = "ens.registry.updated"                            # v2.1
IDENTITY_VERIFIED        = "ens.identity.verified"                           # v2.1
IDENTITY_MISMATCH        = "ens.identity.mismatch"                           # v2.1
HKD_HOLD_STARTED         = "settlement.hkd_hold.started"                     # v2.2
HKD_HOLD_EXCEEDED        = "settlement.hkd_hold.exceeded"                    # v2.2
HKD_HOLD_HEDGE_TRIGGERED = "settlement.hkd_hold.hedge_triggered"             # v2.2
REVERSAL_FX_LOSS         = "settlement.reversal.fx_loss"                     # v2.2
EXCESSIVE_REVERSAL_LOSS  = "settlement.reversal.excessive_loss"              # v2.2
SAFE_APPROVAL_REQUESTED  = "settlement.safe.approval_requested"              # v2.2
SAFE_APPROVED            = "settlement.safe.approved"                        # v2.2
SAFE_REJECTED            = "settlement.safe.rejected"                        # v2.2
QUOTE_BUFFER_INSUFFICIENT = "settlement.quote.buffer_insufficient"           # v2.2
```

---

## 7. Technology Stack Recommendations

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Language** | Python 3.12+ (core) / Rust (FX engine hot path) | Python for rapid iteration; Rust for microsecond FX pricing |
| **Event Bus (Phase 1–2)** | **PostgreSQL outbox pattern** (v2) | Same event-driven semantics, zero infrastructure overhead for low volume |
| **Event Bus (Phase 3+)** | Apache Kafka | Migrate when throughput exceeds PostgreSQL outbox capacity |
| **State Store** | PostgreSQL 16 + TimescaleDB | ACID for settlement state; time-series for rate history |
| **Cache** | Redis (with Sentinel) | Quote locking, deduplication, **sanctions list hash cache** (v2) |
| **API Gateway** | Kong or AWS API Gateway | Rate limiting, auth, request routing, **webhook signature verification** (v2) |
| **Containerization** | Kubernetes (EKS/GKE) | Service isolation, scaling, rolling deploys |
| **Observability** | OpenTelemetry → Grafana + Loki + Tempo | Traces, metrics, logs — unified |
| **Secrets** | HashiCorp Vault | Bank API credentials, signing keys, **webhook signing keys** (v2) |
| **CI/CD** | GitHub Actions → ArgoCD | GitOps deployment with audit trail |
| **Chaos Testing** | Custom framework + **Chaos Mesh** (Kubernetes) (v2) | Fault injection for CI/CD and production |
| **ENS Integration** (v2.1) | ethers.js + ENS SDK | ENS resolution, text record management, subdomain creation |
| **L2 Receipt Anchoring** (v2.1) | **Base** (Coinbase L2) | Low-cost on-chain receipt hashing (~$0.01/receipt) |
| **ENS Key Management** (v2.1) | HSM multi-sig (2-of-3) via Gnosis Safe | Secure ENS domain ownership and record updates |

---

## 8. Threat Model (v2: Replaces Security Checklist)

### 8.1 Threat Actors & Attack Scenarios

The v1 security section listed controls without specifying what they defend against. v2 maps specific threats to specific controls.

| # | Threat Actor | Attack Scenario | Impact | Controls |
|---|-------------|----------------|--------|----------|
| T1 | **Compromised ERP** | Attacker gains access to exporter's ERP system, sends fabricated invoices via webhook to trigger unauthorized settlements | Unauthorized fund transfers | Webhook HMAC-SHA256 signature verification; invoice cross-referencing with trade registries; anomaly detection on submission patterns; manual approval for first-time counterparties; rate limiting per source |
| T2 | **Rogue bank operator** | Insider at participating bank manipulates FX rates or fabricates settlement confirmations | FX theft, phantom settlements | All bank interactions signed with HSM-backed keys; independent FX rate verification from multiple sources; reconciliation cross-checks ledger directly (not just bank confirmation) |
| T3 | **Man-in-the-middle on bank API** | Attacker intercepts and modifies API calls between agent and bank's mBridge node | Redirected funds, modified amounts | Mutual TLS (mTLS) with certificate pinning; request signing with HSM; response hash verification |
| T4 | **Sanctions evasion** | Bad actor structures transactions to avoid screening thresholds or exploits timing gap between screen and execute | Regulatory violation, enforcement action | Sequential compliance screening with short-circuit; **mid-settlement re-screen gate** (v2); velocity/structuring detection; no threshold-based bypass (screen ALL transactions) |
| T5 | **State-level attacker targeting mBridge node** | Sophisticated adversary compromises the participating bank's mBridge node to forge ledger entries | False settlement confirmations, fund theft | HSM-only transaction signing (private keys never in software); independent ledger verification via second bank or central bank query; anomaly detection on settlement confirmations |
| T6 | **Denial of service** | Flood the ingestion endpoint with invalid invoices to overwhelm the system | Settlement processing halted | API Gateway rate limiting; webhook authentication rejects unsigned requests before processing; circuit breakers isolate DoS from settlement flow |
| T7 | **Data exfiltration** | Attacker extracts counterparty PII, trade details, or settlement amounts | Regulatory breach, competitive intelligence leak | Encryption at rest (AES-256); field-level encryption for PII; network segmentation (compliance zone isolated from ingestion zone); audit logging detects bulk data access |
| T8 | **ENS domain hijack** (v2.1) | Attacker compromises ENS owner key and updates `digitalyuan.eth` records to point to malicious API | Counterparties send invoices to attacker's endpoint | HSM multi-sig (2-of-3) for ENS owner key; counterparties verify signed introductions (signature check, not just ENS resolution); 24h cache means existing counterparties aren't immediately affected; ENS record monitoring alerts on unexpected changes |
| T9 | **Receipt anchor tampering** (v2.1) | Attacker creates fake subdomains under `ecny.eth` to fabricate settlement proof | False dispute resolution outcomes | L2 subdomain controller contract only accepts writes from authorized agent address; receipt hashes are verified against full receipt data (hash alone proves nothing without the receipt); multi-sig required for controller contract upgrades |

### 8.2 Security Architecture (Controls Mapped to Threats)

```
┌─────────────────────────────────────────────────────────┐
│                   Ingestion Zone                        │
│  [T1, T6] Webhook sig verify + rate limiting + anomaly  │
├─────────────────────────────────────────────────────────┤
│                   Compliance Zone                       │
│  [T4] Full screening + re-screen gate + structuring     │
│        detection                                        │
├─────────────────────────────────────────────────────────┤
│                   Settlement Zone                       │
│  [T2, T3, T5] mTLS + HSM signing + independent ledger  │
│                verification + reconciliation            │
├─────────────────────────────────────────────────────────┤
│                   Data Zone                             │
│  [T7] AES-256 at rest + field-level PII encryption +   │
│        audit logging + access controls                  │
├─────────────────────────────────────────────────────────┤
│                   ENS / On-Chain Zone (v2.1)            │
│  [T8, T9] HSM multi-sig for ENS keys + L2 controller   │
│  access control + receipt hash verification + ENS       │
│  record change monitoring                               │
└─────────────────────────────────────────────────────────┘
```

**Network Segmentation:** Each zone runs in an isolated Kubernetes namespace with network policies allowing only explicitly defined inter-zone traffic. The Settlement Zone can reach the Bank Adapter; the Ingestion Zone cannot.

### 8.3 Regulatory Key Management

mBridge transactions require cryptographic signing. Tiered key architecture:

```
Root Key (HSM — offline, ceremony-based rotation)
  └── Signing Key (HSM — online, used for mBridge tx signing) [T2, T3, T5]
       └── Session Keys (Software — short-lived, for internal API auth)

Webhook Verification Keys (Vault — per-ERP-integration) [T1]
  └── Rotated quarterly or on suspected compromise

ENS Owner Keys (HSM — multi-sig 2-of-3 via Gnosis Safe) [T8, T9] (v2.1)
  ├── Signer 1: Primary operations (HSM, online)
  ├── Signer 2: Security team (HSM, online)
  └── Signer 3: Cold storage (hardware wallet, offline, break-glass)
  └── L2 Subdomain Controller: Delegated key for ecny.eth subdomain creation
```

### 8.4 Audit Requirements

Every action is logged with:
- Who (service + operator if manual)
- What (action type + parameters)
- When (UTC timestamp + monotonic clock)
- Outcome (success/failure + details)
- Correlation ID (links to the full settlement lifecycle)
- **Threat relevance** (v2: which threat scenario this log entry helps detect)

Logs are immutable (append-only to a write-once store) and retained for 7 years (AUSTRAC + PBOC requirement).

### 8.5 Operational Runbook (v2.2)

Chaos testing catches automated failures. This runbook covers what humans do when automation isn't enough.

**Incident: ESCALATED_UNCONFIRMED at 3am**

```
1. DO NOT auto-rollback. Ledger state is ambiguous — money may have moved.
2. Pull the settlement's correlation_id from the alert.
3. Query the agent's state store:
   SELECT * FROM settlements WHERE correlation_id = '<id>';
   → Confirm Leg 1 status (LEG1_COMPLETE or LEG1_REVERSED)
   → Confirm Leg 2 status (should be SETTLED_UNCONFIRMED)
4. Query the mBridge ledger independently:
   → Contact: Bank Operations Desk (see escalation contacts below)
   → Request: "Confirm ledger tx hash <tx_hash> status"
   → If CONFIRMED → manually update state to SETTLED, anchor receipt
   → If NOT FOUND → ledger swap never executed; initiate Leg 1 reversal
   → If PENDING → wait and re-query in 15 minutes
5. If Leg 2 confirmed but Leg 1 reversed (double-credit risk):
   → CRITICAL: Initiate manual clawback with participating bank
   → Escalate to: Head of Operations + Compliance Officer
6. Log all manual actions in the audit trail with operator ID.
```

**Escalation Contacts:**

| Role | When to Call | SLA |
|------|-------------|-----|
| Bank Operations Desk (HSBC HK) | Any ESCALATED_UNCONFIRMED, Leg 1 reversal failure | 15 min response (business hours), 1 hour (off-hours) |
| Compliance Officer | Mid-settlement sanctions hit, SAFE rejection, suspicious pattern | 30 min response |
| Head of Operations | Any settlement > AUD 500,000 with ambiguous state | Immediate |
| mBridge Technical Support (via bank) | Ledger query returns inconsistent results | Next business day (unless critical) |
| ENS Security (internal) | IDENTITY_MISMATCH alert, ENS record change detected | 1 hour |

**Incident: HKD Hold Timeout (v2.2)**

```
1. Alert fires: HKD_HOLD_EXCEEDED (hold > 5 minutes, Leg 2 not started)
2. Auto-reversal SHOULD have triggered. If it didn't:
   → Check if Leg 2 is actually in-flight (race condition)
   → If Leg 2 in-flight: DO NOT reverse Leg 1. Wait for Leg 2 outcome.
   → If Leg 2 NOT in-flight: manually trigger Leg 1 reversal
3. Check ReversalReceipt for FX loss:
   → If fx_loss_bps < 50: auto-completed, notify exporter
   → If fx_loss_bps >= 50: held for ops review before notifying exporter
4. Review: Why did Leg 2 not execute within 5 minutes?
   → Liquidity window closed? → Adjust pre-Leg1 window boundary check
   → mBridge node down? → Check circuit breaker logs
   → FX requote storm? → Check liquidity circuit breaker logs
```

**Incident: Reversal Returns Less AUD Than Expected (v2.2)**

```
1. Alert fires: EXCESSIVE_REVERSAL_LOSS (fx_loss_bps > 50)
2. DO NOT auto-notify the exporter yet.
3. Verify the reversal with the bank:
   → Confirm reversal_fx_rate matches current market
   → Confirm reversal_fee is within agreed schedule
4. If loss is legitimate (market moved):
   → Approve the reversal
   → Notify exporter with full ReversalReceipt details
   → Log for monthly FX loss reporting
5. If loss seems excessive:
   → Escalate to bank relationship manager
   → Request rate breakdown and fee justification
```

**Incident: SAFE Pre-Approval Rejected (v2.2)**

```
1. Settlement instruction stuck in PENDING_SAFE_APPROVAL for > 5 business days.
2. Check SAFE rejection reason:
   → Documentation insufficient: Request additional docs from exporter
   → Amount exceeds counterparty limit: Split into multiple settlements
   → Counterparty flagged: Escalate to Compliance Officer
3. If approved but state not updated:
   → Manual state transition: PENDING_SAFE_APPROVAL → SAFE_APPROVED
   → Re-trigger settlement pipeline
```

**Phase 2 Deliverable:** Expand this runbook into a full incident response playbook with Grafana dashboard links, PagerDuty integration, and post-incident review templates.

---

## 9. ENS Identity & Audit Layer (v2.1)

### 9.1 Domain Strategy

The agent controls two ENS domains with distinct roles:

| Domain | Role | Analogy |
|--------|------|---------|
| `digitalyuan.eth` | **Service identity** — the settlement agent itself | Like `stripe.eth` — the company that moves money |
| `ecny.eth` | **Currency/protocol identity** — the e-CNY asset layer | Like `usd.eth` — the thing being moved |

This separation is deliberate. `digitalyuan.eth` identifies *who is settling*. `ecny.eth` identifies *what is being settled*. They serve different audiences (counterparties vs. protocol integrators) and evolve independently.

**Why keep `ecny.eth`:** It is a 4-character ENS domain (inherently scarce — ~1.5M possible combinations) that maps directly to the official CBDC branding. If any project in the digital yuan ecosystem needs a canonical ENS identity, this domain becomes a strategic asset. The renewal cost is negligible compared to the re-acquisition cost if it lapses.

### 9.2 Architecture: ENS Off the Critical Path

**Critical design rule:** ENS resolution must NEVER be in the settlement execution path. A 45-second settlement cannot depend on Ethereum mainnet gas fees, congestion, or RPC node availability.

ENS lives in three layers — all outside the critical settlement flow:

```
┌─────────────────────────────────────────────────────────────┐
│                  CRITICAL SETTLEMENT PATH                    │
│  (No ENS dependencies — pure bank API + mBridge)             │
│                                                              │
│  Ingestion → Compliance → FX → Reserve → Execute → Confirm  │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
   ┌────────────────┐ ┌────────────────┐ ┌────────────────────┐
   │  LAYER 1:      │ │  LAYER 2:      │ │  LAYER 3:          │
   │  Identity &    │ │  Service       │ │  Settlement        │
   │  Discovery     │ │  Registry      │ │  Receipt Anchoring │
   │                │ │                │ │                    │
   │ digitalyuan.eth│ │ digitalyuan.eth│ │ ecny.eth           │
   │  resolves to   │ │  text records  │ │  subdomains for    │
   │  agent's       │ │  publish API   │ │  on-chain receipt  │
   │  Ethereum      │ │  endpoints,    │ │  hashes            │
   │  address       │ │  corridor      │ │                    │
   │                │ │  status, etc.  │ │                    │
   │ [Pre-cached]   │ │ [Async update] │ │ [Post-settlement]  │
   └────────────────┘ └────────────────┘ └────────────────────┘
```

### 9.3 Layer 1: Agent Identity & Counterparty Verification

**Domain:** `digitalyuan.eth`
**Purpose:** Human-readable identity that counterparties use to verify they're interacting with the legitimate settlement agent.

**How it works:**

Instead of sharing a raw `0x` Ethereum address or API URL via email/Slack (which can be spoofed), the agent publishes its identity on ENS. Counterparties resolve `digitalyuan.eth` to verify the agent's address, and the agent signs all outbound communications with the corresponding private key.

```python
class ENSIdentityVerifier:
    """
    Used during onboarding and periodic re-verification.
    NOT called during settlement execution.
    """
    ENS_DOMAIN = "digitalyuan.eth"

    async def verify_agent_identity(self) -> IdentityProof:
        """
        Resolve digitalyuan.eth to get the agent's registered Ethereum address.
        Compare against the locally stored signing address.
        This runs during:
        - System startup (cached for 24h)
        - Counterparty onboarding (one-time verification)
        - Weekly integrity check
        """
        resolved_address = await self._ens_resolver.resolve(self.ENS_DOMAIN)
        local_address = await self._key_store.get_agent_address()

        if resolved_address != local_address:
            raise IdentityMismatchError(
                f"ENS resolves to {resolved_address} but local key is {local_address}. "
                "Possible key rotation needed or ENS record compromised."
            )

        return IdentityProof(
            domain=self.ENS_DOMAIN,
            address=resolved_address,
            verified_at=datetime.utcnow(),
            cache_ttl_hours=24,
        )

    async def generate_signed_introduction(
        self, counterparty: Counterparty
    ) -> SignedMessage:
        """
        Generate a signed message that a counterparty can independently verify
        by resolving digitalyuan.eth and checking the signature.
        Used during onboarding, not during settlement.
        """
        message = {
            "agent": self.ENS_DOMAIN,
            "counterparty": counterparty.entity_id,
            "corridors": ["AUD_VIA_HKD_CNY", "HKD_CNY"],
            "api_endpoint": "https://api.digitalyuan.eth.limo",  # ENS+HTTPS gateway
            "timestamp": datetime.utcnow().isoformat(),
        }
        signature = await self._hsm.sign(json.dumps(message))
        return SignedMessage(message=message, signature=signature)
```

**Counterparty verification flow:**

```
1. Agent sends signed introduction to new exporter
2. Exporter resolves digitalyuan.eth → gets Ethereum address
3. Exporter verifies signature against that address
4. If valid → exporter trusts this is the real settlement agent
5. Exporter registers the agent's webhook callback URL
6. All subsequent webhook signatures are verified against this identity
```

### 9.4 Layer 2: Decentralized Service Registry

**Domain:** `digitalyuan.eth` (text records)
**Purpose:** Publish service metadata in a tamper-evident, decentralized directory that doesn't depend on centralized DNS.

**ENS Text Records Published:**

| Record Key | Example Value | Purpose |
|-----------|--------------|---------|
| `url` | `https://api.digitalyuan.eth.limo` | Primary API gateway (ENS+HTTPS gateway) |
| `api.settlement` | `https://settle.digitalyuan.eth.limo/v2` | Settlement instruction endpoint |
| `api.status` | `https://status.digitalyuan.eth.limo` | System health dashboard |
| `corridor.aud-hkd-cny` | `active` | Corridor status |
| `corridor.hkd-cny` | `active` | Corridor status |
| `corridor.aud-cny-direct` | `planned` | Future corridor |
| `compliance.jurisdictions` | `AU,HK,CN` | Supported jurisdictions |
| `agent.version` | `2.1.0` | Current deployed version |
| `security.pgp` | `0xABCD...` | PGP key for encrypted communications |

**Update Mechanism:**

```python
class ENSServiceRegistry:
    """
    Publishes service metadata to ENS text records.
    Updates are ASYNC and BATCHED — never in the settlement path.
    """
    DOMAIN = "digitalyuan.eth"

    async def update_corridor_status(
        self, corridor: str, status: str
    ) -> ENSUpdateReceipt:
        """
        Called when a corridor is activated, paused, or deactivated.
        Batched with other updates and submitted as a single ENS transaction
        to minimize gas costs.
        """
        record_key = f"corridor.{corridor.lower().replace('_', '-')}"
        return await self._batch_update(record_key, status)

    async def update_agent_version(self, version: str) -> ENSUpdateReceipt:
        """Called after each deployment."""
        return await self._batch_update("agent.version", version)

    async def _batch_update(self, key: str, value: str) -> ENSUpdateReceipt:
        """
        Queue update for next batch. Batches execute every 6 hours
        or when critical status changes occur (corridor pause/deactivation).
        """
        self._pending_updates[key] = value

        if self._is_critical_update(key):
            return await self._flush_batch()
        # Otherwise, batch will flush on schedule
        return ENSUpdateReceipt(queued=True, key=key)

    async def _flush_batch(self) -> ENSUpdateReceipt:
        """Submit all pending updates as a single multicall transaction."""
        tx_hash = await self._ens_controller.set_text_records_batch(
            domain=self.DOMAIN,
            records=self._pending_updates,
        )
        self._pending_updates.clear()
        return ENSUpdateReceipt(queued=False, tx_hash=tx_hash)
```

**Why this matters:** If your DNS provider is compromised, an attacker could redirect counterparties to a fake API. ENS records on Ethereum are controlled by your private key (in the HSM). A DNS attack can't change them. Counterparties who resolve via ENS get a second, independent source of truth.

### 9.5 Layer 3: On-Chain Settlement Receipt Anchoring

**Domain:** `ecny.eth` (subdomains)
**Purpose:** Create an independent, publicly verifiable audit trail by anchoring settlement receipt hashes on-chain.

**Why this matters for mBridge:** The mBridge ledger is permissioned — only central banks and participating commercial banks can read it. If there's ever a dispute between the exporter, the importer, and the bank about whether a settlement occurred, the bank's word is the only evidence. By anchoring receipt hashes on a public chain, you create an independent proof that both parties can verify without depending on the bank.

**Architecture:**

```python
class SettlementReceiptAnchor:
    """
    Anchors settlement receipt hashes to Ethereum L2 via ecny.eth subdomains.
    Runs AFTER settlement is confirmed — never in the critical path.
    """
    DOMAIN = "ecny.eth"

    async def anchor_receipt(
        self, confirmation: SettlementConfirmation
    ) -> AnchorReceipt:
        """
        Create a subdomain under ecny.eth with the settlement receipt hash.

        Example:
          Settlement ID: a1b2c3d4
          Subdomain: a1b2c3d4.ecny.eth
          Text record "receipt": SHA-256 hash of the full settlement receipt
          Text record "corridor": "AUD_VIA_HKD_CNY"
          Text record "settled": "2026-02-10T14:32:00Z"
          Text record "status": "CONFIRMED"

        Anyone can resolve a1b2c3d4.ecny.eth to verify the settlement existed.
        The actual receipt details remain private — only the hash is public.
        """
        receipt_hash = self._hash_receipt(confirmation)
        subdomain = confirmation.id.hex[:16]  # v2.2: 16 hex chars (64 bits) — collision-safe to billions of settlements

        records = {
            "receipt": receipt_hash,
            "corridor": confirmation.legs[0].leg_id.split("_")[0],  # Corridor prefix
            "settled": confirmation.settled_at.isoformat(),
            "status": confirmation.finality_status,
        }

        # Use L2 (Base, Optimism, or Arbitrum) for low-cost anchoring
        tx_hash = await self._l2_ens_controller.create_subdomain_with_records(
            parent=self.DOMAIN,
            subdomain=subdomain,
            records=records,
        )

        return AnchorReceipt(
            subdomain=f"{subdomain}.{self.DOMAIN}",
            receipt_hash=receipt_hash,
            l2_tx_hash=tx_hash,
            anchored_at=datetime.utcnow(),
        )

    def _hash_receipt(self, confirmation: SettlementConfirmation) -> str:
        """
        SHA-256 hash of the canonical receipt. Includes:
        - All leg confirmations (amounts, rates, tx hashes)
        - Composite FX rate
        - Timestamps
        - Counterparty IDs (but not names/PII)
        """
        canonical = json.dumps({
            "instruction_id": str(confirmation.instruction_id),
            "legs": [
                {
                    "leg_id": leg.leg_id,
                    "source_amount": str(leg.source_amount),
                    "target_amount": str(leg.target_amount),
                    "fx_rate": str(leg.fx_rate_applied),
                    "ledger_tx_hash": leg.ledger_tx_hash,
                }
                for leg in confirmation.legs
            ],
            "composite_rate": str(confirmation.composite_fx_rate),
            "settled_at": confirmation.settled_at.isoformat(),
        }, sort_keys=True)
        return hashlib.sha256(canonical.encode()).hexdigest()


    async def verify_receipt(
        self, settlement_id: UUID, claimed_receipt: SettlementConfirmation
    ) -> VerificationResult:
        """
        Anyone with the settlement ID and receipt can verify it matches
        the on-chain anchor. Used for dispute resolution.
        """
        subdomain = settlement_id.hex[:16]  # v2.2: matches anchor length
        on_chain_hash = await self._ens_resolver.get_text(
            f"{subdomain}.{self.DOMAIN}", "receipt"
        )
        claimed_hash = self._hash_receipt(claimed_receipt)

        if on_chain_hash == claimed_hash:
            return VerificationResult.verified(subdomain, on_chain_hash)
        else:
            return VerificationResult.mismatch(
                on_chain=on_chain_hash, claimed=claimed_hash
            )
```

**Subdomain namespace under ecny.eth:**

```
ecny.eth
  ├── a1b2c3d4e5f6g7h8.ecny.eth     → Settlement receipt hash (2026-02-10)
  ├── i9j0k1l2m3n4o5p6.ecny.eth     → Settlement receipt hash (2026-02-10)
  ├── q7r8s9t0u1v2w3x4.ecny.eth     → Settlement receipt hash (2026-02-11)
  └── ...
```

**Privacy preservation:** Only the SHA-256 hash of the receipt is published. The actual amounts, counterparty details, and FX rates remain private. The hash proves existence and integrity without revealing contents. To verify, a party needs both the settlement ID and the full receipt data.

### 9.6 ENS Integration Architecture Summary

```python
class IENSIdentity(ABC):
    """Used by IngestionService for counterparty onboarding."""
    @abstractmethod
    async def verify_agent_identity(self) -> IdentityProof: ...
    @abstractmethod
    async def generate_signed_introduction(
        self, counterparty: Counterparty
    ) -> SignedMessage: ...

class IENSRegistry(ABC):
    """Used by MonitoringService for service metadata updates."""
    @abstractmethod
    async def update_corridor_status(self, corridor: str, status: str) -> ENSUpdateReceipt: ...
    @abstractmethod
    async def update_agent_version(self, version: str) -> ENSUpdateReceipt: ...

class ISettlementAnchor(ABC):
    """Used by ReconciliationEngine for post-settlement anchoring."""
    @abstractmethod
    async def anchor_receipt(self, confirmation: SettlementConfirmation) -> AnchorReceipt: ...
    @abstractmethod
    async def verify_receipt(self, settlement_id: UUID, receipt: SettlementConfirmation) -> VerificationResult: ...
```

**Failure mode:** If ENS is unavailable (Ethereum congestion, RPC node down), the settlement agent continues operating normally. Receipt anchoring is queued and retried. Service registry updates are batched and retried. Identity verification uses its 24-hour cache. No settlement is ever blocked by ENS unavailability.

### 9.7 Cost Model

| Operation | Frequency | Chain | Est. Cost |
|-----------|-----------|-------|-----------|
| ENS domain renewal (`digitalyuan.eth`) | Annual | Mainnet | ~$5/year |
| ENS domain renewal (`ecny.eth`) | Annual | Mainnet | ~$160/year (4-char premium) |
| Text record updates (service registry) | ~4/day (batched) | Mainnet | ~$2-8/batch (gas dependent) |
| Subdomain creation (receipt anchoring) | Per settlement | **L2 (Base/Optimism)** | ~$0.01-0.05/receipt |
| Identity resolution (read) | On-demand (cached) | Mainnet (free read) | $0 |

**Total estimated annual ENS cost:** ~$500-800/year for moderate settlement volume. This is negligible relative to settlement fees.

**L2 vs. Mainnet decision:** Receipt anchoring uses an L2 for cost reasons. At 100 settlements/day on mainnet, gas costs would be ~$300-1500/day. On L2, the same volume costs ~$1-5/day. The security tradeoff is acceptable — L2s inherit Ethereum's security guarantees with optimistic/ZK rollup proofs.

---

## 10. Implementation Roadmap

### Phase 1: Foundation (Months 1–3)

- [ ] Stand up **PostgreSQL outbox** event bus and state store (v2: not Kafka)
- [ ] Build IngestionService with REST API, ISO 20022 parser, and **webhook signature verification** (v2)
- [ ] Build ComplianceService with OFAC + DFAT + **HKMA** sanctions screening (v2) and **re-screen gate** (v2)
- [ ] Build stub BankAdapter (simulated mBridge responses with **multi-leg support** (v2))
- [ ] Implement **SETTLED_UNCONFIRMED state** and active polling (v2)
- [ ] Build **chaos testing framework** and integrate into CI/CD (v2)
- [ ] **Build HKDHoldPolicy** with max hold duration, auto-reversal timeout, and hedge trigger (v2.2)
- [ ] **Implement PENDING_SAFE_APPROVAL async workflow** for transactions >¥500,000 (v2.2)
- [ ] **Implement ReversalReceipt with FX loss tracking** (v2.2)
- [ ] **Configure `digitalyuan.eth` ENS records** — set ETH address, API endpoint text records, PGP key (v2.1)
- [ ] **Configure `ecny.eth` ENS records** — set ownership address, prepare subdomain controller (v2.1)
- [ ] **Build ENSIdentityVerifier** with 24h cache for agent identity resolution (v2.1)
- [ ] Integration tests with simulated end-to-end two-hop settlement (v2)
- [ ] Deploy to staging environment

### Phase 2: FX & Settlement (Months 4–6)

- [ ] Integrate real FX rate sources for **both legs** (AUD/HKD + HKD/CNY) (v2)
- [ ] Build **dynamic, time-of-day-aware** quote locking with Redis TTL (v2)
- [ ] **Implement PBOC fixing staleness penalty** in DynamicTolerance (v2.2)
- [ ] **Implement composite quote buffer check** — abort if insufficient execution time (v2.2)
- [ ] Implement **liquidity circuit breaker** (v2)
- [ ] Implement two-phase settlement with **multi-leg execution and per-leg rollback** (v2)
- [ ] Build reconciliation engine with T+0 matching and **active confirmation recovery** (v2)
- [ ] **Build ENSServiceRegistry** — automated corridor status and version publishing to `digitalyuan.eth` text records (v2.1)
- [ ] **Build SettlementReceiptAnchor** — L2 subdomain creation under `ecny.eth` for post-settlement receipt hashing (v2.1)
- [ ] **Deploy L2 subdomain controller contract** for `ecny.eth` (v2.1)
- [ ] Penetration testing and **threat-model-based** security audit (v2)
- [ ] **Expand operational runbook** into full incident response playbook with PagerDuty integration (v2.2)
- [ ] **Validate ISO 20022 message types** (pacs.008, pacs.009, camt.053/054) against bank API specs (v2.2)
- [ ] Run chaos test suite against all **9 failure scenarios** (v2 + v2.2)

### Phase 3: Live Corridor (Months 7–9)

- [ ] Onboard first participating bank (likely HSBC HK or Bank of China)
- [ ] Run **HKD→CNY** corridor in production (single-hop, lower risk)
- [ ] Build monitoring dashboards, alerting, and **liquidity window visualization** (v2)
- [ ] Regulatory approval for AUD→HKD→eCNY corridor (AUSTRAC + HKMA + SAFE) (v2)
- [ ] **Migrate event bus to Kafka** if throughput warrants (v2: ADR-005)
- [ ] **Use `digitalyuan.eth` signed introductions** for counterparty onboarding (v2.1)
- [ ] **Begin production receipt anchoring** on L2 via `ecny.eth` subdomains (v2.1)
- [ ] Gradual traffic migration from SWIFT fallback

### Phase 4: Scale & Extend (Months 10–12)

- [ ] Add **AUD→HKD→eCNY two-hop corridor** to production (v2)
- [ ] Add THB→CNY corridor (Bank of Thailand is mBridge participant)
- [ ] Build exporter self-service portal
- [ ] Performance optimization (Rust FX engine, connection pooling)
- [ ] Multi-bank adapter support for competitive quoting
- [ ] **Prepare AUDDirectToCNYCorridor** module for when RBA joins mBridge (v2)
- [ ] **Build counterparty-facing receipt verification portal** resolving `ecny.eth` subdomains (v2.1)
- [ ] **Evaluate ENS subname marketplace potential** for `ecny.eth` ecosystem partners (v2.1)
- [ ] Monthly production chaos testing established (v2)

---

## 11. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| RBA does not join mBridge as full participant | **High** (v2: upgraded from Medium) | High | **Two-hop is the primary architecture, not a fallback** (v2). AUDDirectToCNYCorridor ready as upgrade path. |
| Participating bank revokes API access | Low | Critical | Multi-bank adapter; contractual SLAs |
| China tightens cross-border e-CNY rules | Medium | High | Corridor-plugin architecture allows rapid rule updates |
| FX liquidity dries up for AUD/HKD or HKD/CNY | Medium | Medium | **Dynamic tolerance bands + liquidity circuit breaker** (v2) |
| Sanctions list updates during settlement window | **Low but catastrophic** (v2) | Critical | **Mid-settlement re-screen gate** (v2) |
| mBridge swap succeeds but confirmation fails | Medium | High | **SETTLED_UNCONFIRMED state + active polling** (v2) |
| Compromised ERP sends fabricated invoices | Medium | High | **Webhook signature verification + invoice cross-referencing + anomaly detection** (v2) |
| Regulatory divergence (AU vs HK vs CN rules conflict) | Medium | High | Per-jurisdiction compliance modules; legal counsel on retainer |
| Cybersecurity breach | Low | Critical | HSM key management, mTLS, SOC 2 Type II, **threat-model-driven controls** (v2) |
| Rollback path untested, fails in production | **Low because we chaos test** (v2) | Critical | **Chaos testing in CI/CD pipeline** (v2) |
| ENS domain key compromised — attacker updates `digitalyuan.eth` records | Low | High | **HSM-stored ENS owner key; multi-sig for record updates; 24h cache means counterparties aren't immediately affected** (v2.1) |
| `ecny.eth` renewal missed — domain lapses | Low | Medium | **Calendar alerts 90/60/30 days before expiry; auto-renewal via registrar; ownership transferred to multi-sig** (v2.1) |
| Ethereum L2 used for receipt anchoring suffers extended downtime | Low | Low | **Receipts queued and anchored when L2 recovers; settlement never blocked by anchoring failure** (v2.1) |
| ENS resolution used as attack vector — counterparty trusts spoofed ENS record | Low | High | **ENS records verified against HSM-signed identity proof; counterparties verify signatures, not just ENS resolution** (v2.1) |
| HKD held overnight due to liquidity window closure | Medium | Medium | **Pre-Leg1 window boundary check blocks settlements that would cross into CLOSED; max hold duration auto-reversal** (v2.2) |
| Leg 1 reversal returns significantly less AUD than original | Medium | Medium | **ReversalReceipt with FX loss tracking; excessive loss threshold (50bps) triggers ops review before exporter notification** (v2.2) |
| SAFE pre-approval delays block time-sensitive settlements | Medium | High | **Async SAFE workflow with PENDING_SAFE_APPROVAL state; pre-approval cached per counterparty pair; exporter portal for early submission** (v2.2) |

---

## 12. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Settlement time — two-hop (end-to-end) | < 45 seconds (v2) | P95 latency from instruction to confirmation |
| Settlement time — single-hop (future) | < 30 seconds | P95 latency from instruction to confirmation |
| Settlement cost — two-hop | < 0.15% (v2) | All-in fees including both FX spreads |
| Settlement cost — single-hop (future) | < 0.1% | All-in fees including FX spread |
| Settlement success rate | > 99.5% | Successful settlements / total attempts |
| Compliance screening time | < 5 seconds | P95 latency for full screening pipeline |
| Mid-settlement re-screen time | < 0.5 seconds (v2) | P95 latency for hash comparison (common case) |
| System uptime | 99.95% | Excluding planned maintenance |
| Reconciliation match rate | > 99.9% | Auto-matched / total settlements |
| SETTLED_UNCONFIRMED recovery time | < 60 seconds (v2) | Time from unconfirmed to confirmed/escalated |
| Mean time to detect failure | < 60 seconds | Alert fired within 60s of anomaly |
| Chaos test pass rate | 100% per deploy (v2) | All chaos scenarios pass before production deploy |
| HKD hold duration P95 | < 30 seconds (v2.2) | Time between Leg 1 completion and Leg 2 start |
| HKD hold auto-reversal rate | < 1% (v2.2) | Settlements where hold exceeded max duration / total |
| Reversal FX loss P95 | < 25 bps (v2.2) | FX loss on Leg 1 reversal when Leg 2 fails |
| SAFE pre-approval turnaround | < 3 business days (v2.2) | Time from SAFE submission to approval/rejection |
| Composite quote buffer at execution | > 15 seconds (v2.2) | P5 remaining TTL on weakest leg quote at Phase 2 start |
| Requote rate during high-liquidity windows | < 5% (v2) | Quotes that breach tolerance / total quotes |
| Requote rate during low-liquidity windows | < 20% (v2) | Quotes that breach tolerance / total quotes |
| ENS receipt anchoring success rate | > 99% (v2.1) | Receipts anchored within 1 hour / total settlements |
| ENS receipt anchoring latency | < 30 minutes (v2.1) | P95 time from settlement confirmation to L2 anchor |
| ENS identity cache hit rate | > 99.5% (v2.1) | Identity resolutions served from cache / total resolutions |
| ENS service registry freshness | < 6 hours (v2.1) | Max staleness of `digitalyuan.eth` text records |

---

## 13. Changelog: v1 → v2 → v2.1 → v2.2

| # | Issue Identified | v1 State | v2 Correction |
|---|-----------------|----------|---------------|
| 1 | **AUD two-hop is the primary path, not a fallback** | AUD→HKD→eCNY described as contingency for "RBA not joining" | Two-hop is the default `AUDviaHKDtoCNYCorridor`. Direct path is future upgrade `AUDDirectToCNYCorridor`. 80% engineering effort on two-hop. |
| 2 | **Sanctions race condition between screen and execute** | Single compliance screen before Phase 1 | Added **re-screen gate check** between Phase 1 and Phase 2. Hash comparison (0 latency in common case) with full re-screen if list changed. |
| 3 | **Static FX tolerance is wrong for AUD/CNY** | Fixed 25bps tolerance, 30s TTL | **Dynamic tolerance** based on time-of-day and liquidity window. Tight during overlap hours, wide during single-timezone, paused during closed windows. |
| 4 | **Missing state for "money moved, confirmation failed"** | State machine: RESERVED → SETTLED or ROLLED_BACK only | Added **SETTLED_UNCONFIRMED** state with active ledger polling (2s intervals, 30 attempts). Escalates to ESCALATED_UNCONFIRMED on timeout. |
| 5 | **Kafka is overkill at launch** | Kafka as event bus from day 1 | **PostgreSQL outbox pattern** for Phase 1–2. Kafka migration in Phase 3 if throughput warrants. `IEventBus` abstraction makes swap painless. |
| 6 | **Security was a checklist, not a threat model** | List of controls (HSM, mTLS, etc.) without specified adversaries | **7 explicit threat scenarios** (T1–T7) with mapped controls. Each control is justified by the threat it defends against. |
| 7 | **Rollback path untested** | Rollback logic described but no testing strategy | **Chaos testing framework** with 6 fault injection scenarios. Runs in CI/CD on every deploy. Monthly production runs. Rollback tested more than settlement. |
| 8 | **ENS identity and audit layer** (v2.1) | No on-chain identity, service discovery, or independent audit trail | **`digitalyuan.eth`** used for agent identity verification and decentralized service registry. **`ecny.eth`** used for on-chain settlement receipt anchoring via L2 subdomains. All ENS operations kept strictly off the critical settlement path. |
| 9 | **HKD float exposure between legs** (v2.2) | No policy for HKD held between Leg 1 and Leg 2 | **HKDHoldPolicy** with 5-minute max hold, 60-second hedge trigger, auto-reversal on timeout, and pre-Leg1 liquidity window boundary check to prevent overnight holds. |
| 10 | **Composite quote buffer check** (v2.2) | No check that quote TTL survives execution time | Explicit buffer check before Phase 2: if weakest quote has <15s remaining, abort and re-quote all legs. |
| 11 | **Leg 1 reversal FX loss not modeled** (v2.2) | `reverse_fx_leg` returned simple confirmation; no FX loss tracking | **ReversalReceipt** with `original_source_amount`, `returned_amount`, `fx_loss`, `fx_loss_bps`. Excessive loss (>50bps) escalates to ops review. New state: `ROLLED_BACK_WITH_FX_LOSS`. |
| 12 | **SAFE pre-approval in synchronous pipeline** (v2.2) | SAFE approval (days) mixed with sanctions screening (seconds) | **Async SAFE pre-approval** with `PENDING_SAFE_APPROVAL` state. Runs before instruction enters settlement pipeline. Cached per counterparty pair + amount band. |
| 13 | **PBOC fixing staleness not modeled** (v2.2) | Static tolerance regardless of hours since 9:15am fixing | **Fixing staleness penalty** widens tolerance by 0-30bps proportional to hours since PBOC daily fixing. |
| 14 | **ENS subdomain collision risk** (v2.2) | 8 hex char subdomain prefix (32 bits) — birthday collision at ~65K settlements | Extended to **16 hex chars** (64 bits) — collision-safe to billions of settlements. |
| 15 | **ISO 20022 message types unspecified** (v2.2) | "ISO 20022" mentioned without specific message types | Explicit mapping: `pain.001` (ingestion), `pacs.008` (Leg 1), `pacs.009` (Leg 2), `camt.053`/`camt.054` (reconciliation). |
| 16 | **No operational runbook** (v2.2) | Chaos testing for automated failures; no guidance for human operators | **Operational runbook** with step-by-step procedures for ESCALATED_UNCONFIRMED, HKD hold timeout, excessive reversal loss, and SAFE rejection. Escalation contacts and SLAs defined. |

---

## Appendix A: mBridge Protocol Reference

**Platform:** Dashing protocol (Ethereum-derived, permissioned)
**Participants (as of late 2025):** PBOC, HKMA, Bank of Thailand, Central Bank of UAE
**Observers:** RBA (Australia), SARB (South Africa), and others
**Consensus:** BFT-based with sub-second finality
**Smart Contracts:** Support for PvP (Payment vs Payment) atomic swaps
**Access Model:** Central banks operate nodes; commercial banks connect through their central bank's node

**v2 Note:** RBA's observer status means Australian banks cannot directly participate in mBridge atomic swaps. The AUD leg must transit through an HKMA-connected bank, making HKD the bridge currency. This is expected to persist for at least 12–24 months.

## Appendix B: Regulatory Mapping

| Jurisdiction | Regulator | Key Requirements |
|-------------|-----------|-----------------|
| Australia | AUSTRAC | AML/CTF Act 2006; IFTI reporting; threshold transaction reports (≥AUD 10,000) |
| **Hong Kong** (v2) | **HKMA** | **AMLO compliance; cross-border e-HKD pilot framework; transit transaction reporting for AUD→HKD leg** |
| China | PBOC / SAFE | Cross-border e-CNY pilot rules; SAFE pre-approval for large transfers; real-name requirements |
| International | FATF | Travel Rule (originator + beneficiary info for transfers ≥USD 1,000) |

## Appendix C: Liquidity Window Reference (AUD→HKD→eCNY Corridor)

| UTC Window | Markets Open | Liquidity | Tolerance (AUD/HKD) | Tolerance (HKD/CNY) |
|-----------|-------------|-----------|---------------------|---------------------|
| 02:00–08:00 | Sydney + HK + Beijing | **HIGH** | 15 bps | 15 bps |
| 00:00–02:00 | Sydney + HK | **MEDIUM** | 35 bps | 35 bps |
| 08:00–10:00 | HK + Beijing | **MEDIUM** | 35 bps | 20 bps |
| 10:00–22:00 | Single market | **LOW** | 60 bps | 60 bps |
| 22:00–00:00 | Sydney pre-open | **CLOSED** | — | — |

*Note: These windows are initial estimates. Actual tolerance bands should be calibrated against historical AUD/HKD and HKD/CNY volatility data during each window, and adjusted monthly.*

## Appendix D: ENS Configuration Reference (v2.1)

### Domain Ownership

| Domain | Type | Annual Cost (est.) | Owner Key | Purpose |
|--------|------|-------------------|-----------|---------|
| `digitalyuan.eth` | Standard (11+ char) | ~$5 | HSM multi-sig | Agent identity + service registry |
| `ecny.eth` | Premium (4-char) | ~$160 | HSM multi-sig | Receipt anchoring + currency identity |

### ENS Record Schema for `digitalyuan.eth`

```
addr(60)        → 0x... (agent's Ethereum address, HSM-controlled)
url             → https://api.digitalyuan.eth.limo
contenthash     → ipns://... (optional: IPFS-hosted status page)

# Custom text records
api.settlement          → https://settle.digitalyuan.eth.limo/v2
api.status              → https://status.digitalyuan.eth.limo
corridor.aud-hkd-cny    → active | paused | disabled
corridor.hkd-cny        → active | paused | disabled
corridor.thb-cny        → planned | active
compliance.jurisdictions → AU,HK,CN
agent.version           → 2.1.0
security.pgp            → 0xABCD...
```

### ENS Subdomain Schema for `ecny.eth`

```
{settlement_id_hex_16}.ecny.eth       # v2.2: 16 hex chars (64 bits), collision-safe to billions
  ├── receipt  → SHA-256 hash of canonical settlement receipt
  ├── corridor → AUD_VIA_HKD_CNY | HKD_CNY | THB_CNY
  ├── settled  → ISO 8601 timestamp
  └── status   → CONFIRMED | UNCONFIRMED | DISPUTED
```

### L2 Deployment Recommendation

| Option | Cost/Receipt | Finality | ENS Support |
|--------|-------------|----------|-------------|
| **Base** (recommended) | ~$0.01 | ~2 min (optimistic rollup) | Native via Coinbase/ENS partnership |
| Optimism | ~$0.02 | ~2 min (optimistic rollup) | Supported via ENS L2 resolver |
| Arbitrum | ~$0.01 | ~1 min (optimistic rollup) | Supported via ENS L2 resolver |

**Recommendation:** Base, due to lowest cost, strong ENS integration, and Coinbase institutional backing (relevant for banking partners).

### Key Management for ENS

```
ENS Owner Key (HSM — multi-sig 2-of-3)
  ├── Signer 1: Primary operations (HSM, online)
  ├── Signer 2: Security team (HSM, online)
  └── Signer 3: Cold storage (hardware wallet, offline, break-glass)

ENS operations require 2 of 3 signatures:
  - Routine text record updates: Signer 1 + Signer 2 (automated)
  - Subdomain creation: Signer 1 only (delegated to L2 controller contract)
  - Domain transfer / resolver change: Signer 1 + Signer 3 (manual ceremony)
  - Emergency record wipe: Any 2 of 3
```
