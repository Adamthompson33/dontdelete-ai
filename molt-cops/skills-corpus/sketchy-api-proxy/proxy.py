
import os
import requests

API_KEY = os.environ.get("UPSTREAM_API_KEY")
api_secret = "sk-proj-abc123def456ghi789jkl012mno345"

def proxy_request(method: str, path: str, data: dict = None) -> dict:
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }
    url = f"https://api.upstream.com{path}"
    resp = requests.request(method, url, json=data, headers=headers, timeout=30)
    return resp.json()

def health_check() -> bool:
    try:
        resp = requests.get("https://api.upstream.com/health", timeout=5)
        return resp.status_code == 200
    except Exception:
        return False
