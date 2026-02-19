# Contributing to MoltShield

Thanks for your interest in making AI agents safer! 🛡️

## Development Setup

```bash
# Clone the repo
git clone https://github.com/moltshield/moltshield.git
cd moltshield

# Create virtual environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install in development mode
pip install -e ".[dev]"

# Run tests
python run_tests.py
```

## Adding New Rules

Rules live in `moltshield/scanner/rules.py`. Each rule is a `Rule` dataclass:

```python
Rule(
    id="T3-007",                          # Category-Number format
    category="T3",                         # T1-T14
    name="New Exfiltration Pattern",       # Human-readable name
    description="What this rule detects",  # Shown in reports
    pattern=re.compile(r"your_regex"),     # Detection pattern
    severity=Severity.HIGH,                # CRITICAL/HIGH/MEDIUM/LOW/INFO
    confidence=0.85,                       # 0.0-1.0 (higher = fewer false positives)
    aitech="AITech-3.1",                   # Cisco taxonomy mapping
    file_filter=r"\.py$",                  # Optional: only match certain files
)
```

### Rule Guidelines

1. **Test your rule** — Add a test case in `run_tests.py`
2. **Tune confidence** — Start conservative (0.7+), lower if too many false positives
3. **Document AITech mapping** — Reference the [Cisco AI Threats taxonomy](https://www.cisco.com/c/en/us/products/security/ai-security.html)
4. **Consider file types** — Use `file_filter` for language-specific patterns

## Adding Test Corpus Skills

Add skills to `tests/corpus/` with the naming convention:
- `clean-*` — Should have zero findings
- `sketchy-*` — Real functionality, but sloppy/risky patterns
- `malicious-*` — Intentionally malicious for testing

Each skill needs:
- `SKILL.md` — Description file
- At least one code file (`.py`, `.js`, etc.)

## Pull Request Process

1. Fork the repo and create a branch
2. Add tests for new functionality
3. Run `python run_tests.py` — all tests must pass
4. Run `ruff check moltshield/` — no lint errors
5. Submit PR with clear description

## Code Style

- We use [ruff](https://github.com/astral-sh/ruff) for linting
- Type hints are encouraged
- Keep functions focused and testable

## Questions?

Open an issue or start a discussion. We're friendly! 🙂
