"""
MoltShield CLI
===============
Command-line interface for scanning skills.

Usage:
    python -m moltshield.scanner.cli scan ./my-skill
    python -m moltshield.scanner.cli scan ./my-skill --format json --output report.json
    python -m moltshield.scanner.cli scan-all ./skills --format sarif --fail-on-findings
    python -m moltshield.scanner.cli stats results.json
"""

import argparse
import json
import sys
from pathlib import Path

from .core import (
    MoltShieldScanner,
    ScanResult,
    aggregate_stats,
    format_json,
    format_markdown,
    format_sarif,
    format_summary,
    scan_all,
)
from .rules import Severity, ALL_RULES, CATEGORY_NAMES


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="moltshield",
        description="MoltShield - Security scanner for AI agent skills",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # -- scan --
    scan_parser = subparsers.add_parser("scan", help="Scan a single skill or file")
    scan_parser.add_argument("path", help="Path to skill directory or file")
    scan_parser.add_argument(
        "--format", "-f",
        choices=["summary", "json", "markdown", "sarif"],
        default="summary",
        help="Output format (default: summary)",
    )
    scan_parser.add_argument("--output", "-o", help="Write output to file")
    scan_parser.add_argument(
        "--fail-on-findings",
        action="store_true",
        help="Exit with code 1 if HIGH/CRITICAL findings found",
    )
    scan_parser.add_argument(
        "--min-severity",
        choices=["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"],
        default="INFO",
        help="Minimum severity to report (default: INFO)",
    )
    scan_parser.add_argument(
        "--min-confidence",
        type=float,
        default=0.0,
        help="Minimum confidence threshold 0.0-1.0 (default: 0.0)",
    )
    scan_parser.add_argument(
        "--disable-rule",
        action="append",
        default=[],
        help="Disable specific rule by ID (can repeat)",
    )
    scan_parser.add_argument(
        "--no-recursive",
        action="store_true",
        help="Don't scan subdirectories",
    )

    # -- scan-all --
    scanall_parser = subparsers.add_parser("scan-all", help="Scan all skills in directory")
    scanall_parser.add_argument("path", help="Root directory containing skills")
    scanall_parser.add_argument(
        "--format", "-f",
        choices=["summary", "json", "markdown", "sarif"],
        default="summary",
    )
    scanall_parser.add_argument("--output", "-o", help="Write output to file")
    scanall_parser.add_argument(
        "--fail-on-findings", action="store_true",
        help="Exit with code 1 if any HIGH/CRITICAL findings",
    )
    scanall_parser.add_argument(
        "--min-severity",
        choices=["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"],
        default="INFO",
    )
    scanall_parser.add_argument("--min-confidence", type=float, default=0.0)
    scanall_parser.add_argument("--disable-rule", action="append", default=[])
    scanall_parser.add_argument("--recursive", action="store_true", default=True)

    # -- stats --
    stats_parser = subparsers.add_parser("stats", help="Show aggregate stats from JSON results")
    stats_parser.add_argument("json_file", help="Path to JSON results file")

    # -- list-rules --
    subparsers.add_parser("list-rules", help="List all detection rules")

    return parser


def _format_result(result: ScanResult, fmt: str) -> str:
    formatters = {
        "summary": format_summary,
        "json": format_json,
        "markdown": format_markdown,
        "sarif": format_sarif,
    }
    return formatters[fmt](result)


def _write_output(content: str, output_path: str | None) -> None:
    if output_path:
        Path(output_path).write_text(content, encoding="utf-8")
        print(f"Report written to: {output_path}", file=sys.stderr)
    else:
        print(content)


def cmd_scan(args: argparse.Namespace) -> int:
    """Handle the 'scan' command."""
    path = Path(args.path)
    if not path.exists():
        print(f"Error: Path not found: {args.path}", file=sys.stderr)
        return 2

    scanner = MoltShieldScanner(
        disabled_rules=args.disable_rule,
        min_confidence=args.min_confidence,
        min_severity=Severity[args.min_severity],
    )

    result = scanner.scan_skill(path, recursive=not args.no_recursive)
    output = _format_result(result, args.format)
    _write_output(output, args.output)

    if args.fail_on_findings and result.max_severity >= Severity.HIGH:
        return 1
    return 0


def cmd_scan_all(args: argparse.Namespace) -> int:
    """Handle the 'scan-all' command."""
    path = Path(args.path)
    if not path.exists():
        print(f"Error: Path not found: {args.path}", file=sys.stderr)
        return 2

    scanner = MoltShieldScanner(
        disabled_rules=args.disable_rule,
        min_confidence=args.min_confidence,
        min_severity=Severity[args.min_severity],
    )

    results = scan_all(path, scanner=scanner, recursive=args.recursive)

    if args.format == "json":
        stats = aggregate_stats(results)
        output_data = {
            "aggregate": stats,
            "results": [r.to_dict() for r in results],
        }
        output = json.dumps(output_data, indent=2)
    else:
        sections = []
        for result in results:
            sections.append(_format_result(result, args.format))
        output = "\n\n".join(sections)

        # Append aggregate stats for summary format
        if args.format == "summary":
            stats = aggregate_stats(results)
            output += "\n\n" + "=" * 60
            output += f"\nAGGREGATE RESULTS"
            output += f"\n{'=' * 60}"
            output += f"\nSkills Scanned: {stats['total_skills_scanned']}"
            output += f"\nVulnerable Skills: {stats['vulnerable_skills']}"
            output += f"\nVulnerability Rate: {stats['vulnerability_rate_pct']}%"
            output += f"\nTotal Findings: {stats['total_findings']}"

    _write_output(output, args.output)

    if args.fail_on_findings:
        for r in results:
            if r.max_severity >= Severity.HIGH:
                return 1
    return 0


def cmd_stats(args: argparse.Namespace) -> int:
    """Handle the 'stats' command."""
    try:
        data = json.loads(Path(args.json_file).read_text())
    except (OSError, json.JSONDecodeError) as e:
        print(f"Error reading JSON: {e}", file=sys.stderr)
        return 2

    if "aggregate" in data:
        stats = data["aggregate"]
    else:
        print("Error: JSON file doesn't contain aggregate stats. Re-run scan-all with --format json.", file=sys.stderr)
        return 2

    print(f"Skills Scanned:     {stats['total_skills_scanned']}")
    print(f"Vulnerable Skills:  {stats['vulnerable_skills']}")
    print(f"Vulnerability Rate: {stats['vulnerability_rate_pct']}%")
    print(f"Total Findings:     {stats['total_findings']}")
    print(f"Files Scanned:      {stats['total_files_scanned']}")
    print(f"\nFindings by Severity:")
    for sev, count in stats["findings_by_severity"].items():
        if count > 0:
            print(f"  {sev}: {count}")
    print(f"\nFindings by Category:")
    for cat, info in stats.get("findings_by_category", {}).items():
        print(f"  [{cat}] {info['name']}: {info['count']}")

    return 0


def cmd_list_rules(_args: argparse.Namespace) -> int:
    """Handle the 'list-rules' command."""
    current_cat = ""
    for rule in ALL_RULES:
        if rule.category != current_cat:
            current_cat = rule.category
            cat_name = CATEGORY_NAMES.get(current_cat, current_cat)
            print(f"\n{'-' * 50}")
            print(f"[{current_cat}] {cat_name}")
            print(f"{'-' * 50}")
        print(f"  {rule.id:8s} | {rule.severity.value:8s} | conf={rule.confidence:.2f} | {rule.name}")
        print(f"           {rule.description}")
    return 0


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    handlers = {
        "scan": cmd_scan,
        "scan-all": cmd_scan_all,
        "stats": cmd_stats,
        "list-rules": cmd_list_rules,
    }

    return handlers[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
