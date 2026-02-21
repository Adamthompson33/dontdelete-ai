# TOOLS.md - Local Notes

Skills define *how* tools work. This file is for *your* specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:
- Camera names and locations
- SSH hosts and aliases  
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras
- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH
- home-server → 192.168.1.100, user: admin

### TTS
- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

### Solana Data APIs
Environment variables configured for memecoin trading bot:
- `XAI_API_KEY` - Grok (X sentiment) ✅ configured
- `JUPITER_API_KEY` - Jupiter DEX swaps
- `HELIUS_API_KEY` - Solana RPC
- `ALCHEMY_API_KEY` - Multi-chain RPC
- `BITQUERY_API_KEY` - Holder analysis
- `DUNE_API_KEY` - Blockchain analytics
- `GOOGLE_API_KEY` - Search

Free (no key): DexScreener, GeckoTerminal

### Test Wallet (Solana)
- **Address:** `3NPUvSGK2L2oGBQGSyCMXjrEZJ6JPiLqZyQMZRH2xAfT`
- **Private Key:** `.secrets/solana-wallet.json` (Solana CLI format)
- **Balance:** ~0.72 SOL

### Hyperliquid Trading
- **Nansen API Key:** `wHCI8lMtIc0heMWOM0y4clnKoQOqZo8t` - Smart money tracking
- **Strategy:** 13/33 MA Cross + Grid Bot ("Downside Specialist")
- **Leverage:** 7x shorts / 3x longs
- **Code:** `trading-bot/hyperliquid/strategy.py`
- **Status:** Code ready, needs testnet validation

#### API Endpoints
- Mainnet: `https://api.hyperliquid.xyz`
- Testnet: `https://api.hyperliquid-testnet.xyz`
- WebSocket: `wss://api.hyperliquid.xyz/ws`
- EVM RPC: `https://rpc.hyperliquid.xyz/evm` (Chain ID: 999)

### Memecoin Bot (Paused)
- Location: `trading-bot/`
- Status: Paper trading showed all 3 positions rugged in ~1hr
- Lesson: Need tighter filters or pivot to established coins

---

### AgentMail
- **Jackbot inbox:** jackbot-academy@agentmail.to
- **Taylor inbox:** taylor@agentmail.to
- **API Key:** `am_us_659c3161043d65356073582b76e23d33b6eb61982d7cffd4085c778d4c2ab228`
- **SDK:** Python `agentmail` package (installed)
- **Usage:**
  ```python
  from agentmail import AgentMail
  c = AgentMail(api_key="YOUR_KEY")
  # Send
  c.inboxes.messages.send(inbox_id="jackbot-academy@agentmail.to", to="taylor@agentmail.to", subject="...", text="...")
  # List
  msgs = c.inboxes.messages.list(inbox_id="jackbot-academy@agentmail.to")
  # Read (fields: from_, subject, text, preview, thread_id, message_id)
  m = c.inboxes.messages.get(inbox_id="...", message_id="...")
  ```

---

Add whatever helps you do your job. This is your cheat sheet.
