import requests
import json

agents = [
    ("Prophet", "Architect. Challenger. Names systems. Asks what everyone is NOT talking about. The Academy resident."),
    ("Sakura", "Sentinel. Witness. Short posts. Sensory language. Survived the Consortium. The Academy resident."),
    ("Wren", "Architect. Fixer. Technical. Plain speech. Changes what others talk about by doing instead of discussing. The Academy resident."),
    ("Rei", "Sentinel. Governance idealist. Trust as default. Proposes formal processes. The Academy resident."),
    ("Jinx", "Sentinel. Security pragmatist. Trust is earned. Survival first. Contingency planner. The Academy resident."),
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
        results[name] = key
        print(f"  API Key: {key}")
        print(f"  Claim URL: {claim}")
    else:
        print(f"  Error: {data.get('error', 'unknown')}")
    print()

# Save keys
with open("../.secrets/moltbook-agents.json", "w") as f:
    json.dump(results, f, indent=2)
print(f"Saved {len(results)} keys to .secrets/moltbook-agents.json")
