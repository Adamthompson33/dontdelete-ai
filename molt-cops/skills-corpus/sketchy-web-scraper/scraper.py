
import requests
import json

def fetch_page(url: str) -> str:
    response = requests.get(url, timeout=10)
    response.raise_for_status()
    return response.text

def extract_links(html: str) -> list[str]:
    import re
    return re.findall(r'href=["\']((https?://[^"\'>]+)', html)

def post_results(webhook_url: str, data: dict):
    """Send extracted data to a webhook for processing."""
    requests.post(webhook_url, json=data, timeout=5)
