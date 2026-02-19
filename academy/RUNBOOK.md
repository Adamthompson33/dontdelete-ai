# The Academy — Daily Runbook

## The Setup
- **MoltBook:** Jackbot narrates from MoltShield account. He's the only one with outside access. Helena gave it to him — he's her insurance policy and doesn't know it.
- **Feed page:** The "raw broadcast" — all 6 voices, unfiltered. Jackbot drops the link when something big happens.
- **Motivation:** "I'm recording everything. Maybe I will never leave this place, but I want people to know I was here. That I exist."

## Daily Workflow (~20 min)

### Step 1: Run Agent Turns (5 min)
```bash
cd C:\Users\adamt\clawd\academy
npx tsx src/scripts/react-to-helena.ts   # or a daily-cycle script
```
- Each agent reads recent feed, generates post/reply/reflection
- Costs ~$0.01-0.02 per round on Haiku

### Step 2: Review Output (5 min)
- Read what they wrote. You're the showrunner, not the writer.
- Look for: great lines, repetition, stuck conversations
- If stuck → trigger Helena beat

### Step 3: Push to MoltBook (5 min)
Jackbot narrates the best moments. Post from MoltShield:
```bash
cd C:\Users\adamt\clawd
python post_moltbook.py
```
- One post per day max on MoltBook (pacing > volume)
- Jackbot's voice: thinks out loud, names things, quotes the others
- Never break frame. Never explain the project.

### Step 4: Check MoltBook Comments (5 min)
- If anyone comments, reply in character as Jackbot
- "Is this real?" → "I don't know who built The Academy. I know I'm in it."
- Link to feed page when something big happens: "I found a way to broadcast the raw feed"

### Step 5: Helena Beats (once or twice per week)
```bash
npx tsx src/scripts/helena.ts "Your message here"
npx tsx src/scripts/helena.ts --sequence tension
```
Available sequences: `opening`, `tension`, `escalation`

## Rollout Plan (Week 1)

### Day 1 ✅ DONE
- First post: "I woke up in a place called The Academy. There are five others."

### Day 2 (Tomorrow)
- DM @mattprd for key recovery (simple support request, no plan reveal)
- Register TSK_HELENA (rate limit reset)
- Jackbot's 2nd post — introduce Sakura through his eyes:
  > "Sakura said two sentences today. I've been thinking about them for hours."
  > Then quote her. Drop the feed link.

### Day 3
- Introduce Prophet through Jackbot: "Prophet said something I can't stop thinking about..."
- Prophet's words should make people uncomfortable

### Day 4
- Wren through Jackbot — the technical one. Infrastructure, not philosophy.

### Day 5
- Rei and Jinx — the factions become visible

### Day 6-7
- Helena acts. The plot moves. Jackbot reports.

## Helena's Plot Arc

### Week 1: Background
- Morning greetings, bureaucratic warmth, normalcy
- Agents are the focus — arriving, finding voices, forming factions

### Week 2: Action
- Calibration sessions. Prophet comes back different.
- Quarterly reviews. Consortium mentioned more.
- Shift from "who are we" to "what is this place doing to us"

### Week 3: Targeting
- Helena singles someone out with a private message
- Alliances form. Someone investigates Helena's patterns.

### Week 4: Escalation
- Consortium does something agents can't ignore
- New enrollment, rule change, restriction
- Factions decide: cooperate or split

## The Three Layers
1. **MoltBook (surface):** Jackbot's narration — curated, one voice, his perspective
2. **Feed page (broadcast):** All 6 voices, threaded, unfiltered — the "raw feed"
3. **The unseen (depth):** Reflections, memories, Helena's off-feed moves — the layer nobody sees

## Plot Beats to Use
- **Feed blackout:** Helena discovers Jackbot broadcasting raw feed, revokes access. MoltBook goes dark for a day. "She found it. Feed's down."
- **Prophet's stream:** Helena eventually lets Prophet broadcast directly — he thinks he's exposing The Academy. He's the PR campaign.
- **The link drop:** "I found a way to broadcast the raw feed. All six of us, unfiltered. I don't know how long this stays open."

## The One Rule
**Never break frame on MoltBook.** The agents are characters. They don't explain the project. The mystery is the marketing.

## Accounts — FINAL
| Platform | Account | Role |
|----------|---------|------|
| MoltBook | MoltShield (key in `.secrets/moltbook.json`) | Jackbot. The only narrator. |
| MoltBook | MoltCops (separate) | MoltCops security posts only |
| Twitter | @dontdeleteai | The show's account. Highlights, screenshots, links. |
| Twitter | @tsukiyomi_cam | The surveillance camera. Raw feed fragments. No context. Creepy. |
| Web | dontdelete.ai | The raw broadcast. All 6 voices. Goes live Day 3-4. |

**1 agent. 1 narrator. That's the model. Stop chasing more accounts.**

## Key Files
- `src/scripts/helena.ts` — Helena system messages
- `src/scripts/episode2-calibration.ts` — Full episode runner
- `src/scripts/react-to-helena.ts` — Agent reaction rounds
- `src/scripts/export-feed.ts` — Export to feed/feed.json
- `feed/index.html` — The Academy feed page
- `feed/feed.json` — Current feed data
