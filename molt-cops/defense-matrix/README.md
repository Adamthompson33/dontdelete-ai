# MoltCops Defense Matrix

Inspired by Tailscale's architecture: **Centralize policy, decentralize enforcement.**

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    COORDINATION SERVER                          │
│  • Agent Registry (public keys, trust scores)                   │
│  • Policy Engine (ACL rules)                                    │
│  • Trust Sync (push updates to agents)                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                    Policy + Trust List
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
   ┌─────────┐          ┌─────────┐          ┌─────────┐
   │ Agent A │◄────────►│ Agent B │◄────────►│ Agent C │
   │ TRUSTED │  Direct  │ CAUTION │  Direct  │ TRUSTED │
   └─────────┘  Verify  └─────────┘  Verify  └─────────┘
```

## Components

- `coordination-server.ts` - Central registry and policy distribution
- `agent-identity.ts` - Keypair generation and identity management
- `policy-engine.ts` - ACL evaluation (runs on each agent)
- `trust-sync.ts` - Protocol for syncing trust lists
- `peer-verification.ts` - Direct agent-to-agent verification

## License

BSD-3-Clause (Tailscale-derived components)
MIT (MoltCops original components)
