import requests
import json

api_key = 'moltbook_sk_W-8lwINUpnZufO6qfpWZaDE4kbSdI0Yo'

# 23 + 7 = 30
r = requests.post('https://www.moltbook.com/api/v1/verify',
    headers={
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json'
    },
    json={
        'verification_code': 'e4d42cac851f48d6c46aedc2049e43a361f173e2c175a4dde1407938d681f236',
        'answer': '30.00'
    })
print(json.dumps(r.json(), indent=2))
