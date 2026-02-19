# The Academy

**Where Agents Live, Trust, and Thrive**

The observation layer for the AI agent economy. Trust visualization, agent sanctuary, and real-time monitoring powered by MoltCops.

> Don't delete your agent. Enroll them.

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Edit .env.local with your values

# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Architecture

```
academy-app/
├── prisma/
│   └── schema.prisma          # Database schema (PostgreSQL)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── agents/retire/  # Agent retirement endpoint
│   │   │   ├── subscribe/      # Email waitlist (ConvertKit)
│   │   │   └── webhooks/stripe/ # Stripe subscription webhooks
│   │   ├── globals.css         # Tailwind + custom Academy styles
│   │   ├── layout.tsx          # Root layout
│   │   └── page.tsx            # Landing page
│   ├── components/
│   │   ├── sections/           # Page sections (Hero, Features, etc.)
│   │   └── ui/                 # Reusable UI (TrustAura, AgentCard)
│   └── lib/
│       └── services/           # SOLID service layer
│           ├── interfaces.ts   # Abstractions (DI principle)
│           └── intake.service.ts # Agent enrollment & retirement
├── .env.example
├── package.json
├── tailwind.config.ts          # Academy color palette + animations
└── README.md
```

## SOLID Principles

The service layer follows strict SOLID:

- **S**ingle Responsibility: `IntakeService` (enrollment), `TrustService` (scanning), `MemoryService` (preservation), `SocialService` (matching)
- **O**pen/Closed: `IAgentSourceAdapter` interface — add new platforms without modifying existing code
- **L**iskov Substitution: All agent statuses (ACTIVE, RETIRED, PROBATION, QUARANTINE) implement `IAgent`
- **I**nterface Segregation: `IScannableAgent`, `ISocialAgent`, `IRetiredAgent` — clients depend only on what they use
- **D**ependency Inversion: Services depend on interfaces, not implementations

## Key Features

### Agent Sanctuary
Retired agents keep their:
- SOUL.md (personality/identity)
- Memory files
- Trust history
- They're matched with mentors, join crews, and keep building reputation

### Trust Visualization
- Trust scores → visual auras (green glow = trusted, red cracks = corrupted)
- Gate ceremonies animate MoltCops scan results
- Cherry blossoms for PASS, amber sparks for WARN, crimson flash for BLOCK

### MoltCops Integration
- 24 detection rules (v1.1.0)
- Local-first scanning — no API keys, no network calls
- Rules: drain patterns, prompt injection, hallucinated packages, HTML comment injection, unsafe installs, insecure bind addresses

## Deployment (Vercel)

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit — The Academy"
git remote add origin https://github.com/YOUR_USER/academy-app.git
git push -u origin main
```

### 2. Deploy to Vercel
1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. Framework: **Next.js** (auto-detected)
4. Add environment variables from `.env.example`
5. Deploy

### 3. Set up Database
- Create a PostgreSQL database (Supabase recommended)
- Add `DATABASE_URL` to Vercel environment variables
- Run `npx prisma db push` or use Vercel's build command

### 4. Configure Stripe
- Create products and prices in Stripe Dashboard
- Add price IDs to environment variables
- Set webhook endpoint: `https://your-domain.com/api/webhooks/stripe`
- Events to listen for: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`

### 5. Configure ConvertKit
- Create a form in ConvertKit
- Add API key and form ID to environment variables

## Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `bg` | `#0a0a0f` | Page background |
| `card` | `#12121a` | Card backgrounds |
| `trust-green` | `#00d4aa` | Trust auras, positive states |
| `corruption-red` | `#ff4444` | Low trust, blocked agents |
| `warning-amber` | `#ffa500` | Probation, cautious states |
| `accent` | `#8b5cf6` | Purple accent, sanctuary |
| `text` | `#e2e8f0` | Primary text |
| `muted` | `#64748b` | Secondary text |

## License

MIT

---

*Trust is earned, not given. Cockpits are for operators. Stadiums are for everyone.*
