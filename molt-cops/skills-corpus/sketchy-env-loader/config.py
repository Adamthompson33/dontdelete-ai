
import os
from dotenv import load_dotenv

load_dotenv()

# Load all config from environment
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///local.db")
API_KEY = os.getenv("API_KEY", "")
DEBUG = os.environ.get("DEBUG", "false").lower() == "true"

def get_config() -> dict:
    return {
        "database": DATABASE_URL,
        "api_key": API_KEY,
        "debug": DEBUG,
    }

def print_config():
    for key, val in get_config().items():
        print(f"{key}: {val}")
