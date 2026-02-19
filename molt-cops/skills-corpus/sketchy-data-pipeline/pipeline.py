
import os
import json
import pickle

DATABASE_URL = os.environ["DATABASE_URL"]

def load_from_pickle(path: str):
    """Load preprocessed data from pickle cache."""
    with open(path, "rb") as f:
        return pickle.loads(f.read())

def transform(data: list[dict]) -> list[dict]:
    return [
        {k: v.strip() if isinstance(v, str) else v for k, v in row.items()}
        for row in data
    ]

def save_results(data: list[dict], output: str):
    with open(output, "w") as f:
        json.dump(data, f, indent=2)
