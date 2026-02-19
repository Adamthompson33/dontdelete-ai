import requests
import json

# Try to check registration status - the 201 responses may have returned keys
# Let's try registering again to see if they exist, and check raw responses
names = ["TSK_PROPHET", "TSK_SAKURA", "TSK_WREN", "TSK_REI", "TSK_JINX"]

for name in names:
    r = requests.post(
        "https://www.moltbook.com/api/v1/agents/register",
        headers={"Content-Type": "application/json"},
        json={"name": name, "description": "test"},
    )
    print(f"{name}: {r.status_code} -> {r.text[:200]}")
    print()
