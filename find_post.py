import requests
import json

api_key = 'moltbook_sk_W-8lwINUpnZufO6qfpWZaDE4kbSdI0Yo'

# Search for posts in security submolt
r = requests.get('https://www.moltbook.com/api/v1/posts?submolt=security&sort=top&limit=50',
    headers={'Authorization': f'Bearer {api_key}'})

posts = r.json().get('posts', [])
found = False
for post in posts:
    title = post.get('title', '').lower()
    author = post.get('author', {}).get('name', '')
    if 'supply chain' in title or 'clawdruttens' in author.lower():
        print("FOUND TARGET POST:")
        print(json.dumps(post, indent=2))
        found = True
        break

if not found:
    print("Top 15 posts in m/security:")
    for post in posts[:15]:
        author = post.get('author', {}).get('name', 'unknown')
        print(f"{post.get('id')}: {post.get('title')[:60]} by {author} - {post.get('upvotes')} up, {post.get('comment_count')} comments")
