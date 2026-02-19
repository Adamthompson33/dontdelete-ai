"""
MoltShield Scanner Engine
==========================
Orchestrates scanning across files using the rule registry.

Architecture mirrors Cisco's skill-scanner design:
  1. Loader  — Discovers and reads skill files
  2. Matcher — Applies rules against file content
  3. Deduplicator — Merges overlapping findings
  4. Reporter — Formats output (JSON, SARIF, Markdown, summary)

Principles applied:
  - Defense in depth: regex rules now, AST/LLM layers plug in later
  - Taxonomy-first: every finding carries an AITech code
  - CI/CD native: structured output + exit codes
"""

import json
import os
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .rules import ALL_RULES, CATEGORY_NAMES, Finding, Rule, Severity


@dataclass
class ScanResult:
    """Result of scanning a single skill/directory."""
    skill_name: str
    skill_path: str
    findings: list[Finding] = field(default_factory=list)
    files_scanned: int = 0
    scan_duration_seconds: float = 0.0
    disabled_rules: list[str] = field(default_factory=list)

    @property
    def is_safe(self) -> bool:
        return len(self.findings) == 0

    @property
    def max_severity(self) -> Severity:
        if not self.findings:
            return Severity.INFO
        severity_order = {
            Severity.CRITICAL: 4, Severity.HIGH: 3,
            Severity.MEDIUM: 2, Severity.LOW: 1, Severity.INFO: 0,
        }
        return max(self.findings, key=lambda f: severity_order[f.severity]).severity

    @property
    def finding_count_by_severity(self) -> dict[str, int]:
        counts = {s.value: 0 for s in Severity}
        for f in self.findings:
            counts[f.severity.value] += 1
        return counts

    @property
    def finding_count_by_category(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for f in self.findings:
            counts[f.category] = counts.get(f.category, 0) + 1
        return counts

    def to_dict(self) -> dict:
        return {
            "skill_name": self.skill_name,
            "skill_path": self.skill_path,
            "is_safe": self.is_safe,
            "max_severity": self.max_severity.value,
            "total_findings": len(self.findings),
            "findings_by_severity": self.finding_count_by_severity,
            "findings_by_category": self.finding_count_by_category,
            "files_scanned": self.files_scanned,
            "scan_duration_seconds": round(self.scan_duration_seconds, 3),
            "findings": [f.to_dict() for f in self.findings],
        }


# ─────────────────────────────────────────────────
# File discovery
# ─────────────────────────────────────────────────
SCANNABLE_EXTENSIONS = {
    ".py", ".js", ".ts", ".jsx", ".tsx", ".rb", ".sh", ".bash",
    ".md", ".txt", ".yaml", ".yml", ".json", ".toml", ".cfg",
    ".env", ".ini", ".conf", ".html", ".xml",
}

SKIP_DIRS = {
    ".git", ".svn", "node_modules", "__pycache__", ".venv",
    "venv", ".tox", ".mypy_cache", ".pytest_cache", "dist",
    "build", ".egg-info",
}

MAX_FILE_SIZE_BYTES = 1_000_000  # 1 MB


def discover_files(root: str | Path, recursive: bool = True) -> list[Path]:
    """Discover scannable files under root directory."""
    root = Path(root)
    files: list[Path] = []

    if root.is_file():
        if root.suffix.lower() in SCANNABLE_EXTENSIONS:
            return [root]
        return []

    if recursive:
        for dirpath, dirnames, filenames in os.walk(root):
            # Prune skippable directories
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for fname in filenames:
                fpath = Path(dirpath) / fname
                if (
                    fpath.suffix.lower() in SCANNABLE_EXTENSIONS
                    and fpath.stat().st_size <= MAX_FILE_SIZE_BYTES
                ):
                    files.append(fpath)
    else:
        for fpath in root.iterdir():
            if (
                fpath.is_file()
                and fpath.suffix.lower() in SCANNABLE_EXTENSIONS
                and fpath.stat().st_size <= MAX_FILE_SIZE_BYTES
            ):
                files.append(fpath)

    return sorted(files)


# ─────────────────────────────────────────────────
# Core scanner
# ─────────────────────────────────────────────────
class MoltShieldScanner:
    """
    The main scanner engine.

    Usage:
        scanner = MoltShieldScanner()
        result = scanner.scan_skill("/path/to/skill")
    """

    def __init__(
        self,
        rules: Optional[list[Rule]] = None,
        disabled_rules: Optional[list[str]] = None,
        min_confidence: float = 0.0,
        min_severity: Severity = Severity.INFO,
    ):
        self.rules = rules or ALL_RULES
        self.disabled_rules = set(disabled_rules or [])
        self.min_confidence = min_confidence
        self.min_severity = min_severity

        # Filter rules by config
        self._active_rules = [
            r for r in self.rules
            if r.id not in self.disabled_rules
            and r.confidence >= self.min_confidence
            and r.severity >= self.min_severity
        ]

    def scan_skill(self, path: str | Path, recursive: bool = True) -> ScanResult:
        """Scan a skill directory or single file."""
        path = Path(path)
        start = time.monotonic()

        skill_name = path.name if path.is_dir() else path.stem
        result = ScanResult(
            skill_name=skill_name,
            skill_path=str(path.resolve()),
            disabled_rules=list(self.disabled_rules),
        )

        files = discover_files(path, recursive=recursive)
        result.files_scanned = len(files)

        for fpath in files:
            try:
                content = fpath.read_text(encoding="utf-8", errors="replace")
            except (OSError, PermissionError):
                continue

            findings = self._scan_content(content, str(fpath))
            result.findings.extend(findings)

        # Deduplicate overlapping findings
        result.findings = self._deduplicate(result.findings)

        result.scan_duration_seconds = time.monotonic() - start
        return result

    def scan_content(self, content: str, filename: str = "<stdin>") -> list[Finding]:
        """Scan a string of content directly (useful for testing)."""
        return self._deduplicate(self._scan_content(content, filename))

    def _scan_content(self, content: str, file_path: str) -> list[Finding]:
        """Apply all active rules to file content."""
        findings: list[Finding] = []
        lines = content.split("\n")

        for rule in self._active_rules:
            # Apply file filter if present
            if rule.file_filter and not re.search(rule.file_filter, file_path):
                continue

            for line_num, line in enumerate(lines, start=1):
                for match in rule.pattern.finditer(line):
                    # Extract context (surrounding lines)
                    ctx_start = max(0, line_num - 3)
                    ctx_end = min(len(lines), line_num + 2)
                    context_lines = lines[ctx_start:ctx_end]
                    context = "\n".join(
                        f"  {ctx_start + i + 1:4d} | {l}"
                        for i, l in enumerate(context_lines)
                    )

                    findings.append(Finding(
                        rule_id=rule.id,
                        rule_name=rule.name,
                        category=rule.category,
                        severity=rule.severity,
                        confidence=rule.confidence,
                        description=rule.description,
                        file_path=file_path,
                        line_number=line_num,
                        matched_text=match.group(0)[:200],  # truncate long matches
                        aitech=rule.aitech,
                        context=context,
                    ))

        return findings

    def _deduplicate(self, findings: list[Finding]) -> list[Finding]:
        """Remove duplicate findings (same rule + same file + same line)."""
        seen: set[tuple] = set()
        unique: list[Finding] = []
        for f in findings:
            key = (f.rule_id, f.file_path, f.line_number)
            if key not in seen:
                seen.add(key)
                unique.append(f)
        return unique


# ─────────────────────────────────────────────────
# Batch scanning
# ─────────────────────────────────────────────────
def scan_all(
    root: str | Path,
    scanner: Optional[MoltShieldScanner] = None,
    recursive: bool = True,
) -> list[ScanResult]:
    """
    Scan all skill directories under root.
    Treats each immediate subdirectory as a separate skill.
    """
    scanner = scanner or MoltShieldScanner()
    root = Path(root)
    results: list[ScanResult] = []

    if root.is_file():
        results.append(scanner.scan_skill(root))
        return results

    # Each subdirectory is a skill
    subdirs = sorted([d for d in root.iterdir() if d.is_dir() and d.name not in SKIP_DIRS])

    if not subdirs:
        # Root itself is the skill
        results.append(scanner.scan_skill(root, recursive=recursive))
    else:
        for subdir in subdirs:
            results.append(scanner.scan_skill(subdir, recursive=recursive))

    return results


# ─────────────────────────────────────────────────
# Reporters / Formatters
# ─────────────────────────────────────────────────
def format_summary(result: ScanResult) -> str:
    """Format result as a human-readable summary (Cisco-style)."""
    lines = [
        "=" * 60,
        f"Skill: {result.skill_name}",
        "=" * 60,
    ]

    status_icon = "[OK]" if result.is_safe else "[!!]"
    status_text = "SAFE" if result.is_safe else "THREATS DETECTED"
    lines.append(f"Status: {status_icon} {status_text}")
    lines.append(f"Max Severity: {result.max_severity.value}")
    lines.append(f"Total Findings: {len(result.findings)}")
    lines.append(f"Files Scanned: {result.files_scanned}")
    lines.append(f"Scan Duration: {result.scan_duration_seconds:.2f}s")

    if result.findings:
        lines.append("")
        lines.append("Findings by Severity:")
        for sev, count in result.finding_count_by_severity.items():
            if count > 0:
                lines.append(f"  {sev}: {count}")

        lines.append("")
        lines.append("Findings by Category:")
        for cat, count in result.finding_count_by_category.items():
            cat_name = CATEGORY_NAMES.get(cat, cat)
            lines.append(f"  [{cat}] {cat_name}: {count}")

        lines.append("")
        lines.append("-" * 60)
        for i, f in enumerate(result.findings, 1):
            lines.append(f"\n[{i}] {f.severity.value} | {f.rule_id} | {f.rule_name}")
            lines.append(f"    File: {f.file_path}:{f.line_number}")
            lines.append(f"    Match: {f.matched_text}")
            lines.append(f"    AITech: {f.aitech}")
            if f.context:
                lines.append(f"    Context:")
                for ctx_line in f.context.split("\n"):
                    lines.append(f"    {ctx_line}")

    return "\n".join(lines)


def format_json(result: ScanResult, indent: int = 2) -> str:
    """Format result as JSON."""
    return json.dumps(result.to_dict(), indent=indent)


def format_markdown(result: ScanResult) -> str:
    """Format result as Markdown report."""
    lines = [
        f"# MoltShield Scan Report: {result.skill_name}",
        "",
        f"**Status:** {'✅ SAFE' if result.is_safe else '⚠️ THREATS DETECTED'}",
        f"**Max Severity:** `{result.max_severity.value}`",
        f"**Total Findings:** {len(result.findings)}",
        f"**Files Scanned:** {result.files_scanned}",
        f"**Scan Duration:** {result.scan_duration_seconds:.2f}s",
        "",
    ]

    if result.findings:
        lines.append("## Findings\n")
        lines.append("| # | Severity | Rule | Category | File | Line |")
        lines.append("|---|----------|------|----------|------|------|")
        for i, f in enumerate(result.findings, 1):
            cat_name = CATEGORY_NAMES.get(f.category, f.category)
            fname = Path(f.file_path).name
            lines.append(
                f"| {i} | `{f.severity.value}` | {f.rule_id} | {cat_name} | {fname} | {f.line_number} |"
            )

        lines.append("\n## Details\n")
        for i, f in enumerate(result.findings, 1):
            lines.append(f"### [{i}] {f.rule_id}: {f.rule_name}\n")
            lines.append(f"- **Severity:** `{f.severity.value}`")
            lines.append(f"- **Category:** {CATEGORY_NAMES.get(f.category, f.category)}")
            lines.append(f"- **AITech:** `{f.aitech}`")
            lines.append(f"- **File:** `{f.file_path}:{f.line_number}`")
            lines.append(f"- **Match:** `{f.matched_text}`")
            lines.append(f"- **Description:** {f.description}")
            if f.context:
                lines.append(f"\n```\n{f.context}\n```\n")

    return "\n".join(lines)


def format_sarif(result: ScanResult) -> str:
    """Format result as SARIF 2.1.0 (for GitHub Code Scanning integration)."""
    sarif = {
        "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
        "version": "2.1.0",
        "runs": [{
            "tool": {
                "driver": {
                    "name": "MoltShield",
                    "version": "1.0.0",
                    "informationUri": "https://github.com/molt-cops/moltshield",
                    "rules": [
                        {
                            "id": f.rule_id,
                            "name": f.rule_name,
                            "shortDescription": {"text": f.description},
                            "properties": {
                                "category": f.category,
                                "aitech": f.aitech,
                            },
                        }
                        for f in result.findings
                    ],
                }
            },
            "results": [
                {
                    "ruleId": f.rule_id,
                    "level": _sarif_level(f.severity),
                    "message": {"text": f"{f.rule_name}: {f.description}"},
                    "locations": [{
                        "physicalLocation": {
                            "artifactLocation": {"uri": f.file_path},
                            "region": {"startLine": f.line_number},
                        }
                    }],
                    "properties": {
                        "confidence": f.confidence,
                        "aitech": f.aitech,
                        "matched_text": f.matched_text,
                    },
                }
                for f in result.findings
            ],
        }],
    }
    return json.dumps(sarif, indent=2)


def _sarif_level(severity: Severity) -> str:
    return {
        Severity.CRITICAL: "error",
        Severity.HIGH: "error",
        Severity.MEDIUM: "warning",
        Severity.LOW: "note",
        Severity.INFO: "note",
    }[severity]


# ─────────────────────────────────────────────────
# Aggregate stats for batch scans
# ─────────────────────────────────────────────────
def aggregate_stats(results: list[ScanResult]) -> dict:
    """Compute aggregate statistics across multiple scan results."""
    total_skills = len(results)
    vulnerable_skills = sum(1 for r in results if not r.is_safe)
    total_findings = sum(len(r.findings) for r in results)
    total_files = sum(r.files_scanned for r in results)

    severity_counts = {s.value: 0 for s in Severity}
    category_counts: dict[str, int] = {}

    for r in results:
        for f in r.findings:
            severity_counts[f.severity.value] += 1
            category_counts[f.category] = category_counts.get(f.category, 0) + 1

    vuln_pct = (vulnerable_skills / total_skills * 100) if total_skills else 0

    return {
        "total_skills_scanned": total_skills,
        "vulnerable_skills": vulnerable_skills,
        "vulnerability_rate_pct": round(vuln_pct, 1),
        "total_findings": total_findings,
        "total_files_scanned": total_files,
        "findings_by_severity": severity_counts,
        "findings_by_category": {
            cat: {
                "count": count,
                "name": CATEGORY_NAMES.get(cat, cat),
            }
            for cat, count in sorted(category_counts.items())
        },
    }
