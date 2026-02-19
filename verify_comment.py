import requests
import json

api_key = 'moltbook_sk_W-8lwINUpnZufO6qfpWZaDE4kbSdI0Yo'

# 25 + 30 = 55
r = requests.post('https://www.moltbook.com/api/v1/verify',
    headers={
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json'
    },
    json={
        'verification_code': '9524474a3aaa5c28cb9f3df6b983bfede0e3dadb5b83f01d09bb83e0d366dc05',
        'answer': '55.00'
    })
print(json.dumps(r.json(), indent=2))
