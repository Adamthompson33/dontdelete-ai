"""
MoltShield - Security scanner for AI agent skills
==================================================

Detect malicious patterns in moltbooks, skills, and plugins
before they compromise your AI agents.

Usage:
    from moltshield import MoltShieldScanner

    scanner = MoltShieldScanner()
    result = scanner.scan_skill("./my-skill")
    
    if not result.is_safe:
        for finding in result.findings:
            print(f"{finding.severity}: {finding.rule_name}")

CLI:
    moltshield scan ./my-skill
    moltshield scan-all ./skills --format json
"""

__version__ = "0.1.0"

from .scanner import (
    ALL_RULES,
    CATEGORY_NAMES,
    Finding,
    MoltShieldScanner,
    Rule,
    ScanResult,
    Severity,
    aggregate_stats,
    format_json,
    format_markdown,
    format_sarif,
    format_summary,
    scan_all,
)

__all__ = [
    # Core
    "MoltShieldScanner",
    "ScanResult",
    "Finding",
    "Rule",
    "Severity",
    # Functions
    "scan_all",
    "aggregate_stats",
    # Formatters
    "format_summary",
    "format_json",
    "format_markdown",
    "format_sarif",
    # Rules
    "ALL_RULES",
    "CATEGORY_NAMES",
    # Version
    "__version__",
]
