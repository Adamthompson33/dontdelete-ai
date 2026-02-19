# Dune Analytics API

## Overview
Dune provides SQL-based blockchain analytics. Query pre-built dashboards or run custom queries.

**Base URL:** `https://api.dune.com/api/v1`

## Authentication
```bash
X-Dune-Api-Key: YOUR_API_KEY
```

Environment variable: `DUNE_API_KEY`

## Endpoints

### Execute Query
```bash
# Execute a saved query
POST /query/{query_id}/execute

# Get execution results
GET /execution/{execution_id}/results

# Get latest results (if cached)
GET /query/{query_id}/results
```

### Example: Execute and Get Results
```bash
# Start execution
curl -X POST "https://api.dune.com/api/v1/query/12345/execute" \
  -H "X-Dune-Api-Key: $DUNE_API_KEY"

# Response: {"execution_id": "01H..."}

# Poll for results
curl "https://api.dune.com/api/v1/execution/01H.../results" \
  -H "X-Dune-Api-Key: $DUNE_API_KEY"
```

### Query Parameters
```bash
# Pass parameters to parameterized queries
POST /query/{query_id}/execute
{
  "query_parameters": {
    "wallet_address": "0x...",
    "token_address": "..."
  }
}
```

## Useful Solana Queries on Dune

Search Dune for pre-built queries:
- Solana DEX volume
- Token holder snapshots
- Wallet activity tracking
- Protocol analytics (Raydium, Jupiter, etc.)

## Rate Limits

| Plan | Rate Limit | Daily Limit |
|------|------------|-------------|
| Free | 10 req/min | 100 req/day |
| Plus | 60 req/min | 3000 req/day |
| Pro | 100 req/min | Unlimited |

## Python Usage

```python
import requests

DUNE_API_KEY = os.getenv("DUNE_API_KEY")
BASE_URL = "https://api.dune.com/api/v1"

def execute_query(query_id: int, params: dict = None):
    """Execute a Dune query and return results."""
    headers = {"X-Dune-Api-Key": DUNE_API_KEY}
    
    # Start execution
    url = f"{BASE_URL}/query/{query_id}/execute"
    body = {"query_parameters": params} if params else {}
    resp = requests.post(url, headers=headers, json=body)
    execution_id = resp.json()["execution_id"]
    
    # Poll for results (simplified - add proper polling in production)
    import time
    while True:
        result_url = f"{BASE_URL}/execution/{execution_id}/results"
        result = requests.get(result_url, headers=headers).json()
        if result["state"] == "QUERY_STATE_COMPLETED":
            return result["result"]["rows"]
        elif result["state"] == "QUERY_STATE_FAILED":
            raise Exception(result.get("error", "Query failed"))
        time.sleep(2)

# Get latest cached results (faster, may be stale)
def get_latest_results(query_id: int):
    """Get cached results for a query."""
    headers = {"X-Dune-Api-Key": DUNE_API_KEY}
    url = f"{BASE_URL}/query/{query_id}/results"
    return requests.get(url, headers=headers).json()
```

## Best For
- Historical data analysis
- Cross-chain analytics
- Complex SQL queries on blockchain data
- Dashboard data for monitoring
- Wallet profiling and tracking
