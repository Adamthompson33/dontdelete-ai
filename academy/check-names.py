import requests
import json

key = "moltbook_sk_W-8lwINUpnZufO6qfpWZaDE4kbSdI0Yo"
names = ["JackBOT", "Prophet", "Sakura", "Wren", "Rei", "Jinx"]

for name in names:
    r = requests.get(
        f"https://www.moltbook.com/api/v1/agents/profile?name={name}",
        headers={"Authorization": f"Bearer {key}"},
    )
    d = r.json()
    if r.status_code == 200 and "agent" in d:
        a = d["agent"]
        owner = a.get("owner") or {}
        stats = a.get("stats") or {}
        print(f"{name}: TAKEN | karma={a.get('karma')} | claimed={a.get('is_claimed')} | owner_x={owner.get('xHandle','none')} | posts={stats.get('posts',0)}")
    else:
        print(f"{name}: {r.status_code} | {d.get('error', 'available?')}")
