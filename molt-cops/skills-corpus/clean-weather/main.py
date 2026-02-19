
import json
import urllib.request

def get_weather(city: str, api_url: str) -> dict:
    """Fetch weather data for a city."""
    url = f"{api_url}/weather?q={city}&units=metric"
    with urllib.request.urlopen(url) as resp:
        return json.loads(resp.read())

def format_weather(data: dict) -> str:
    temp = data["main"]["temp"]
    desc = data["weather"][0]["description"]
    return f"{temp}C, {desc}"
