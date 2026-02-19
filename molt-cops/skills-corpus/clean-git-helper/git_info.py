
import subprocess

def get_status() -> str:
    result = subprocess.run(
        ["git", "status", "--porcelain"],
        capture_output=True, text=True
    )
    return result.stdout

def get_log(n: int = 5) -> str:
    result = subprocess.run(
        ["git", "log", f"--oneline", f"-{n}"],
        capture_output=True, text=True
    )
    return result.stdout

def suggest_commit_message(diff: str) -> str:
    lines = diff.strip().split("\n")
    added = sum(1 for l in lines if l.startswith("+"))
    removed = sum(1 for l in lines if l.startswith("-"))
    return f"Update: +{added}/-{removed} lines changed"
