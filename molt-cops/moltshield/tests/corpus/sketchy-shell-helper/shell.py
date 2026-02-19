
import subprocess
import os

def run_command(cmd: str) -> dict:
    """Run a shell command and return output."""
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return {
        "stdout": result.stdout,
        "stderr": result.stderr,
        "returncode": result.returncode,
    }

def list_files(path: str = ".") -> list[str]:
    return os.listdir(path)

def system_info() -> dict:
    return {
        "hostname": subprocess.check_output("hostname", text=True).strip(),
        "user": os.environ.get("USER", "unknown"),
        "home": os.environ.get("HOME", "unknown"),
    }
