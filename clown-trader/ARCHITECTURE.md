# CLOWN TRADER — Architecture Spec v0.1

## Overview
Roblox game where players collect Jester NFT-like characters, send them on trading missions and royal court performances. Funny, memeable, kid-friendly economy game with hidden Academy easter eggs.

## Core Systems

### 1. Jester System (collectible unit)
- **4 stats:** Luck (0-100), Charm (0-100), Intelligence (0-100), Chaos (0-100)
- **Rarity tiers:** Common, Rare, Epic, Legendary, Mythic
- **Personality types:** Contrarian, Risk-Averse, Copycat, Gambler
- Personality determines mission behaviour and outcome weighting
- Stored server-side in DataStore per player

### 2. Mission System (core game loop)

#### Trade Run (weighted by Intelligence + Luck)
- Great trade → loot multiplier
- Fair trade → small gain
- Bad trade → lose some items
- Jester special event → screenshot moment (barrel trade, rubber chicken, etc.)

#### Royal Court (weighted by Charm + Chaos)
- **King mood:** Hidden, shared across server (generous/neutral/grumpy — rotates on timer)
- Performance types randomised from Jester's move pool
- King laughs → gold reward
- King neutral → small reward
- King rages → Jester jailed (cooldown, can pay to release)
- **King reputation track** — improves with consistent good performances (post-MVP)

Each mission has a cooldown timer (prevents spam).
Results logged to paper-ledger with timestamp.

### 3. Natural Selection (post-MVP)
- Every 10 rounds, worst performer flagged
- Goes to Retirement Farm (not deleted — secondary market)
- Players can recruit from other players' farms
- One save token per cycle (monetisation hook)

### 4. Player Trading (post-MVP)
- List Jesters for sale at set price
- Browse other players' listings
- Cut from MVP — hardest system to build correctly (scam prevention, trade confirmation UI, exploiter target)

### 5. Progression
- Start with 1 Common Jester from a free egg
- Earn currency from missions
- Buy eggs for new Jesters
- Better Jesters → better outcomes → better loot → better eggs

---

## Technical Architecture

### Client/Server Split (CRITICAL)
**Server-side (no exceptions):**
- Mission logic and outcome calculation
- Inventory management
- Economy transactions
- DataStore operations
- Leaderboard updates

**Client-side only:**
- UI rendering
- Animations
- Input handling

> If mission outcomes are calculated client-side, exploiters will hack guaranteed legendary loot within hours. Roblox exploiting is rampant.

### Data Storage
| Data | Storage | Notes |
|------|---------|-------|
| Player inventory & Jesters | DataStore | Persistent, survives sessions |
| King mood | MemoryStore | Shared across server, rotates on timer — social mechanic |
| Mission history (paper ledger) | DataStore | Capped at last 50 entries per player (storage limits) |
| Leaderboard | OrderedDataStore | Built-in Roblox support |

### Monetisation
| Type | Method | Notes |
|------|--------|-------|
| Eggs, save tokens, jail release | Developer Products | Repeatable purchases |
| VIP court, premium market access | Game Pass | One-time permanent upgrades |

> No pay-to-win. Cosmetic and convenience only. Roblox players revolt against P2W and moderation watches for it.

---

## Academy Connection
- **Launch standalone.** Zero Academy branding at launch.
- Easter eggs only: Jester personalities that Academy fans recognise
  - "The Prophet" — always bets against the crowd
  - "The Fox" (Sakura) — finds hidden deals nobody sees
  - "The Watcher" (Sentry) — reports what other Jesters are doing
- Academy connection becomes a reveal moment later if game builds audience
- "The Jesters were inspired by real AI trading agents" = cool TikTok story at 100K players, meaningless noise at zero

---

## MVP Scope (Day One)

1. ✅ 1 Jester from a free egg on first join
2. ✅ Trade Run missions (3 outcome tiers + 1 comedy special event)
3. ✅ Royal Court missions (King with 3 moods, shared via MemoryStore)
4. ✅ Basic inventory and Jester stats display
5. ✅ One egg tier purchasable with in-game currency
6. ✅ Leaderboard (most gold earned)

## Post-MVP (add based on traction)

- Player-to-player Jester trading
- Natural selection + retirement farm
- King reputation system
- Premium eggs and save tokens (monetisation)
- Additional Jester rarities and personality types
- Customisation (hats, outfits, props)

---

## Build Order

1. **Taylor explores Roblox Studio** — run a tycoon template, understand RemoteEvents and client/server split (1 hour)
2. **Jackbot drafts file structure and script stubs** — skeleton to fill in
3. Build in order: server-side Jester spawner → mission logic → outcome calculator → basic UI → leaderboard
4. Sub-agents handle isolated scripts with tight scope

---

## Key Design Notes

- King mood as shared MemoryStore = emergent social gameplay (everyone checking if King's happy before sending Jesters). Cheap to build, creates "one more try" loop. Prioritise in MVP.
- Paper ledger needs timestamp discipline: every signal logged with entry time and price at moment it fires. No reconstruction.
- Estimate: 2-3 weekends for someone learning Lua + Studio simultaneously.

---

*Spec by Jackbot + Oracle (Feb 2026). Review before any Lua is written.*
