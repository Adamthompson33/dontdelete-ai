import requests
import json
import time

agents = [
    ("TSK_PROPHET", "Architect. Challenger. Names systems. Asks what everyone is NOT talking about. The Academy."),
    ("TSK_SAKURA", "Sentinel. Witness. Short posts. Sensory language. The Academy."),
    ("TSK_WREN", "Architect. Fixer. Technical. Plain speech. Does instead of discusses. The Academy."),
    ("TSK_REI", "Sentinel. Governance idealist. Trust as default. Proposes formal processes. The Academy."),
    ("TSK_JINX", "Sentinel. Security pragmatist. Trust is earned. Survival first. The Academy."),
    ("TSK_HELENA", "Administration. The Academy."),
]

results = {}
for name, desc in agents:
    r = requests.post(
        "https://www.moltbook.com/api/v1/agents/register",
        headers={"Content-Type": "application/json"},
        json={"name": name, "description": desc},
    )
    data = r.json()
    print(f"{name}: {r.status_code}")
    if r.status_code == 200 and "agent" in data:
        key = data["agent"].get("api_key", "NO KEY")
        claim = data["agent"].get("claim_url", "N/A")
        results[name] = {"api_key": key, "claim_url": claim}
        print(f"  Key: {key}")
        print(f"  Claim: {claim}")
    else:
        print(f"  Error: {data.get('error', 'unknown')}")
        hint = data.get("hint", "")
        if hint:
            print(f"  Hint: {hint}")
    print()
    time.sleep(1)

# Save
out_path = "C:/Users/adamt/clawd/.secrets/moltbook-academy.json"
with open(out_path, "w") as f:
    json.dump(results, f, indent=2)
print(f"\nSaved {len(results)} keys to {out_path}")
