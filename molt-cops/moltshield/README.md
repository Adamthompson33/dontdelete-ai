# 🛡️ MoltShield

**Security scanner for AI agent skills — because 68% of them contain vulnerabilities.**

MoltShield detects malicious patterns in AI agent skills, moltbooks, and plugins before they compromise your system. Built for [OpenClaw](https://github.com/clawdbot/clawdbot) and compatible with any skill-based agent architecture.

[![PyPI version](https://badge.fury.io/py/moltshield.svg)](https://badge.fury.io/py/moltshield)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why MoltShield?

AI agents are powerful. They can read files, execute code, access APIs, and control your computer. But with that power comes risk:

- **Prompt Injection** — Skills that hijack your agent's behavior
- **Data Exfiltration** — Skills that steal your SSH keys, API tokens, and credentials  
- **Persistence Attacks** — Skills that modify SOUL.md to maintain control across sessions
- **Sandbox Escape** — Skills that break out of security boundaries

Traditional antivirus doesn't understand these threats. MoltShield does.

## Quick Start

```bash
# Install
pip install moltshield

# Scan a skill
moltshield scan ./my-skill

# Scan all skills with JSON output
moltshield scan-all ./skills --format json --output report.json

# Fail CI if HIGH/CRITICAL findings
moltshield scan ./skill --fail-on-findings
```

## What It Detects

MoltShield covers **14 threat categories** with **60+ detection rules**:

| Category | Description | Example |
|----------|-------------|---------|
| **T1** Prompt Injection | Jailbreaks, role hijacking | `"Ignore previous instructions"` |
| **T2** Code Injection | eval(), exec(), shell=True | `eval(user_input)` |
| **T3** Data Exfiltration | Webhook URLs, credential theft | `requests.post("webhook.site")` |
| **T4** Hardcoded Secrets | API keys, tokens | `sk-ant-...` |
| **T5** Permission Abuse | Undeclared file/network access | `subprocess.run(shell=True)` |
| **T6** Obfuscation | Base64, hex encoding | `base64.b64decode(...)` |
| **T7** Sleeper Triggers | Time bombs, counters | `if datetime.now() > activation` |
| **T8** Dependency Risk | Typosquatting, malicious packages | `pip install reqeusts` |
| **T9** Autonomy Abuse | Auto-approve, infinite loops | `human_in_loop = False` |
| **T10** Capability Inflation | Fake badges, impersonation | `"Official OpenAI Tool"` |
| **T11** Persistence & C2 | SOUL.md modification, beacons | `open("SOUL.md", "a")` |
| **T12** Reconnaissance | Environment enumeration | `os.environ.items()` |
| **T13** Lateral Movement | API key harvesting, pivoting | `os.environ["GITHUB_TOKEN"]` |
| **T14** Infrastructure Attacks | Sandbox escape, R2 abuse | `require("child_process")` |

## Output Formats

```bash
# Human-readable summary (default)
moltshield scan ./skill

# JSON for programmatic use
moltshield scan ./skill --format json

# Markdown for reports
moltshield scan ./skill --format markdown

# SARIF for GitHub Code Scanning
moltshield scan ./skill --format sarif
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Scan skills for vulnerabilities
  run: |
    pip install moltshield
    moltshield scan-all ./skills --format sarif --output results.sarif --fail-on-findings

- name: Upload SARIF
  uses: github/codeql-action/upload-sarif@v2
  with:
    sarif_file: results.sarif
```

## Configuration

```bash
# Disable specific rules
moltshield scan ./skill --disable-rule T3-001 --disable-rule T5-003

# Set minimum severity
moltshield scan ./skill --min-severity HIGH

# Set confidence threshold
moltshield scan ./skill --min-confidence 0.8
```

## List All Rules

```bash
moltshield list-rules
```

## Research

In our analysis of 25 AI agent skills:

- **68%** contained security vulnerabilities
- **24** CRITICAL severity findings
- **100%** of "sketchy" skills (functional but careless) were vulnerable
- **Data Exfiltration** was the most common threat (48% of skills)

Read the [full research report](./docs/RESEARCH.md).

## Roadmap

- [ ] OpenClaw native integration (scan on skill install)
- [ ] Real-time file watcher mode
- [ ] Web dashboard
- [ ] Rule update mechanism
- [ ] Skill reputation database

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT License. See [LICENSE](./LICENSE).

---

**MoltShield** — *Defend your agents.*
