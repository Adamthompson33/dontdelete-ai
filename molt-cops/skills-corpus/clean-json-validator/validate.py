
import json

def validate_json(text: str) -> dict:
    try:
        data = json.loads(text)
        return {"valid": True, "data": data}
    except json.JSONDecodeError as e:
        return {"valid": False, "error": str(e)}

def check_required_keys(data: dict, required: list[str]) -> list[str]:
    missing = [k for k in required if k not in data]
    return missing
