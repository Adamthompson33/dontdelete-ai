
import csv
from io import StringIO

def parse_csv(content: str) -> list[dict]:
    reader = csv.DictReader(StringIO(content))
    return list(reader)

def column_stats(rows: list[dict], column: str) -> dict:
    values = [float(r[column]) for r in rows if r.get(column)]
    return {
        "count": len(values),
        "mean": sum(values) / len(values) if values else 0,
        "min": min(values) if values else 0,
        "max": max(values) if values else 0,
    }
