"""MoltShield Scanner Module"""

from .rules import (
    ALL_RULES,
    CATEGORY_NAMES,
    Finding,
    Rule,
    Severity,
    get_rule_by_id,
    get_rules_by_category,
)

from .core import (
    MoltShieldScanner,
    ScanResult,
    aggregate_stats,
    discover_files,
    format_json,
    format_markdown,
    format_sarif,
    format_summary,
)

__all__ = [
    # Rules
    "ALL_RULES",
    "CATEGORY_NAMES",
    "Finding",
    "Rule", 
    "Severity",
    "get_rule_by_id",
    "get_rules_by_category",
    # Core
    "MoltShieldScanner",
    "ScanResult",
    "aggregate_stats",
    "discover_files",
    "format_json",
    "format_markdown",
    "format_sarif",
    "format_summary",
]
