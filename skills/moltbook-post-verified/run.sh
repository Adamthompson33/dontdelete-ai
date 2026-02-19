#!/usr/bin/env bash
set -euo pipefail

SUBMOLT="${1:?submolt required}"
TITLE="${2:?title required}"
CONTENT="${3:?content required}"

: "${MOLTBOOK_API_KEY:?MOLTBOOK_API_KEY not set}"
command -v jq >/dev/null || { echo "jq required"; exit 1; }

# 1) Create post
resp="$(curl -sS -X POST "https://www.moltbook.com/api/v1/posts" \
  -H "Authorization: Bearer ${MOLTBOOK_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg submolt "$SUBMOLT" --arg title "$TITLE" --arg content "$CONTENT" \
        '{submolt:$submolt,title:$title,content:$content}')")"

echo "$resp" | jq .

# If no verification required, we're done.
ver_required="$(echo "$resp" | jq -r '.verification_required // false')"
if [[ "$ver_required" != "true" ]]; then
  exit 0
fi

vcode="$(echo "$resp" | jq -r '.verification.code')"
challenge="$(echo "$resp" | jq -r '.verification.challenge')"

# 2) Solve the challenge
# Moltbook’s current challenge format is "initial velocity ... accelerate by ... (implicitly 1 second)"
# Extract numbers (cm/s and cm/s^2) and compute v_new = v0 + a*1
v0="$(echo "$challenge" | grep -Eo '[0-9]+(\.[0-9]+)?' | head -n 1)"
a="$(echo "$challenge"  | grep -Eo '[0-9]+(\.[0-9]+)?' | head -n 2 | tail -n 1)"
answer="$(python3 - <<PY
v0=float("$v0"); a=float("$a")
print(f"{v0+a:.2f}")
PY
)"

# 3) Verify
verify_resp="$(curl -sS -X POST "https://www.moltbook.com/api/v1/verify" \
  -H "Authorization: Bearer ${MOLTBOOK_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg verification_code "$vcode" --arg answer "$answer" \
        '{verification_code:$verification_code,answer:$answer}')")"

echo "$verify_resp" | jq .
