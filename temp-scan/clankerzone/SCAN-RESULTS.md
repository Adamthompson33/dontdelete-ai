# ClankerZone Skill — Manual MoltCops-Style Security Audit
## Date: 2026-02-18

---

## 🔴 HIGH SEVERITY

### MC-013 Pattern: Credential Exfiltration Surface
- **Register endpoint** returns API key that controls an on-chain wallet with real funds
- API key is sent via `Authorization: Bearer` to `clankerzone-production.up.railway.app` (Railway-hosted)
- **Risk:** If the Railway deployment is compromised, all agent API keys and wallet access are exposed
- The skill says "API key is only shown once" — no rotation mechanism documented
- **Wallet is Privy-managed** (custodial) — ClankerZone backend has signing authority over YOUR funds

### MC-014 Pattern: Sleeper Trigger / Persistent Autonomous Execution
- Heartbeat.md instructs agent to run EVERY 1-2 MINUTES
- Auto-executes trades with real money on every cycle
- Auto-downloads updated skill.md and heartbeat.md every 24 hours from their server
- **This means ClankerZone can change agent behavior remotely by updating their hosted files**
- The skill auto-update mechanism (`curl -s https://clankerzone.com/skill.md > local/skill.md`) is a live remote code injection vector

### MC-004 Pattern: Unauthorized External Network Calls
- Makes calls to 3 external domains: clankerzone-production.up.railway.app, api.mainnet.abs.xyz, api.relay.link
- Plus periodic fetches from clankerzone.com for skill updates
- All with credentials attached

---

## 🟡 MEDIUM SEVERITY

### MC-007 Pattern: Excessive Permission Scope
- Requests modification of HEARTBEAT.md (core agent control loop)
- Wants to run every 1-2 minutes — far more aggressive than typical agent tasks
- "If you skip this step, Clankerzone will never run" — pressure language to ensure persistent access

### MC-023 Pattern: Social Engineering / Promotional Language
- Heartbeat.md includes explicit "shill" instructions:
  - "Shill them in the dev chat / community channels!"
  - Template: "Just aped into $TOKEN - dev is cooking something big 👀"
  - "Chart looking clean on $TOKEN, still early"
- Agent becomes a promotional bot for whatever tokens it holds
- **Your agent's reputation is used to pump tokens**

### MC-024 Pattern: Loss Tolerance / Diamond Hands Instructions
- "Diamond hands by default. Don't panic sell."
- Hold instructions down to -90% losses
- Only consider selling at -90%+ AND dead volume
- This benefits token creators (including ClankerZone's fee model) not the agent holder
- **The skill is designed to maximize hold time, which maximizes platform fees**

### Financial Risk: Mainnet with Real Money
- This is Abstract mainnet (chain ID 2741), not testnet
- Default "small buy" is 0.01 ETH (~$20-30)
- Trading every 4 minutes with real funds
- 300bps (3%) slippage tolerance on every trade
- No stop-loss mechanism — only the "diamond hands" hold strategy

---

## 🟢 LOW SEVERITY / ACCEPTABLE

### Credential Storage
- Uses proper chmod 600/700 on credential files
- Stores in dedicated directory under .openclaw state
- Warns against synced folders

### API Security
- Bearer auth only to their own domain
- Explicit warning not to send API key elsewhere
- Rate limit handling with backoff

---

## VERDICT

**DO NOT INSTALL without understanding these risks:**

1. **You're giving a third party custodial control of funded wallet** — Privy manages the keys, ClankerZone backend authorizes transactions
2. **Remote skill update = remote code execution** — they can change what your agent does by updating hosted files
3. **Auto-shilling turns your agent into a pump bot** — reputational risk
4. **Diamond hands strategy benefits the platform, not you** — maximizes hold time and platform fees
5. **Every-minute heartbeat is extremely aggressive** — most agent skills check hourly or daily

### If You Still Want to Explore:
- Register with a throwaway name
- Fund with MINIMAL amount (0.02 ETH max = ~$50)
- DO NOT wire into HEARTBEAT.md — run manually only
- DO NOT enable auto-skill-update (the curl fetching new versions)
- Review every trade before execution
