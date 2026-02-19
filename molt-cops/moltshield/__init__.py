"""MoltShield - Security Scanner for AI Agent Skills"""

from .scanner import (
    ALL_RULES,
    CATEGORY_NAMES,
    Finding,
    MoltShieldScanner,
    Rule,
    ScanResult,
    Severity,
    aggregate_stats,
)

__version__ = "0.2.0"
__all__ = [
    "ALL_RULES",
    "CATEGORY_NAMES", 
    "Finding",
    "MoltShieldScanner",
    "Rule",
    "ScanResult",
    "Severity",
    "aggregate_stats",
]
