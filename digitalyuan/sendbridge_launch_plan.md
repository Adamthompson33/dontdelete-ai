# SendBridge — 6-Month Launch Plan

## AUD→THB / AUD→KHR Remittance Product

**Version:** 1.0
**Date:** February 2026
**Status:** Pre-seed planning

---

## 1. Executive Summary

SendBridge is a mobile-first remittance service for the Thai and Cambodian communities in Australia. It targets a combined diaspora of ~160,000+ people, concentrated in Sydney (Haymarket, Cabramatta, Fairfield) and Melbourne (Springvale, Dandenong, CBD), with an initial focus on two underserved corridors: AUD→THB and AUD→KHR.

**Why now:**

- Thailand-born population in Australia grew 62% in the decade to 2020, with net migration of ~14,000/year and accelerating
- Cambodia's Bakong payment system now processes $104B/year with live cross-border QR integrations, creating a new receiving-side rail
- Thailand's PromptPay enables instant domestic delivery — the last-mile infrastructure now exists
- Incumbent remittance providers treat these corridors as afterthoughts — generic pricing, no community presence, English-only interfaces
- AUSTRAC remittance registration is free and achievable in 90 days — the regulatory barrier is compliance quality, not capital

**6-month goal:** AUSTRAC-registered, live in both corridors, 200 active users, processing $100,000+/month.

**Total investment required:** AUD $90,000–$140,000

---

## 2. Month-by-Month Execution Plan

### Month 1: Foundation (Weeks 1–4)

**Objective:** Legal entity, compliance foundation, banking conversations started.

**Corporate Setup:**
- [ ] Incorporate Australian Pty Ltd (1–2 days, ~$500 via ASIC)
- [ ] Obtain ABN and TFN
- [ ] Appoint yourself as resident director
- [ ] Open a business bank account (apply to multiple — Airwallex, Wise Business, and one major bank; remittance startups often get declined, so apply broadly)
- [ ] Register the business name "SendBridge" (or chosen brand) with ASIC

**Compliance (Critical Path):**
- [ ] Engage an AML/CTF compliance consultant ($8,000–$15,000)
  - They draft your AML/CTF Program (Part A: governance/risk; Part B: KYC procedures)
  - They draft your ML/TF Risk Assessment
  - They help you designate an AML/CTF Compliance Officer (can be you initially)
  - Recommended firms: Arctic Intelligence, NICE Actimize (for smaller operators), or a specialist AML consultant
- [ ] Begin drafting the AUSTRAC Business Profile Form
- [ ] Obtain National Police History Checks for all key personnel (required before registration; must be <6 months old at submission)

**Receiving-Side Research:**
- [ ] Identify potential receiving-side partners for Thailand (PromptPay-connected banks, DeeMoney, or similar)
- [ ] Identify potential receiving-side partners for Cambodia (Bakong-connected banks — ABA Bank, ACLEDA, Wing)
- [ ] Send introductory emails / LinkedIn outreach to partnership teams
- [ ] Research existing remittance network providers you could affiliate with (faster path than building all infrastructure yourself)

**AI Agent Work (parallel):**
- [ ] Begin building the backend architecture: user service, transaction service, compliance service, FX engine
- [ ] Set up development environment (Node.js or Python backend, PostgreSQL, Redis)
- [ ] Design database schema: users, recipients, transactions, compliance_checks, fx_quotes

**Deliverables by end of Month 1:**
- Company incorporated with ABN
- AML/CTF Program draft in progress
- Police checks submitted
- At least 2 receiving-side partner conversations initiated
- Backend architecture scaffolded

---

### Month 2: Compliance & Partnerships (Weeks 5–8)

**Objective:** Submit AUSTRAC registration, secure at least one receiving-side partner LOI.

**AUSTRAC Registration:**
- [ ] Finalise AML/CTF Program and Risk Assessment with consultant
- [ ] Complete AUSTRAC Business Profile Form
- [ ] Submit AUSTRAC enrolment and remittance service provider registration
- [ ] Note: AUSTRAC takes up to 90 days to assess — this is on the critical path; everything else builds in parallel

**Partnerships:**
- [ ] Advance receiving-side partner discussions
  - **Thailand priority path:** Partner with an existing licensed Thai remittance provider (e.g., DeeMoney, Payong) who can receive AUD-funded transfers and deliver to PromptPay bank accounts. This avoids needing your own Thai banking license.
  - **Cambodia priority path:** Partner with a Bakong-connected bank (ABA Bank has the largest merchant network). Bakong's tourist app infrastructure suggests they're open to inbound partnerships.
  - **Fallback path:** Affiliate with an existing Australian remittance network provider (e.g., OrbitRemit, Remitly partner network) and white-label their rails while building your own brand and app.
- [ ] Negotiate terms: per-transaction fees, FX spread sharing, settlement timing, API access
- [ ] Obtain at least one signed Letter of Intent (LOI) or Memorandum of Understanding (MOU)

**FX & Liquidity:**
- [ ] Open a multi-currency account (Airwallex or Wise Business for AUD/THB/USD holding)
- [ ] Research FX providers for wholesale AUD→THB and AUD→KHR rates
  - Options: Airwallex FX API, CurrencyCloud, OFX wholesale, or your receiving-side partner's rates
- [ ] Model your unit economics:
  - Target: 1.0–1.5% all-in margin (competitive with Wise, cheaper than Western Union)
  - FX spread you receive from wholesale provider vs mid-market
  - Per-transaction costs (KYC verification, SMS, payment processing)
  - Minimum viable transaction to break even

**AI Agent Work (parallel):**
- [ ] Build KYC verification flow (Onfido, Sumsub, or GreenID for Australian identity verification)
- [ ] Build FX quoting engine — pull live rates, apply margin, show "you send / they receive" calculator
- [ ] Build transaction state machine: CREATED → KYC_PENDING → QUOTED → FUNDED → PROCESSING → DELIVERED → COMPLETED
- [ ] Build AUSTRAC reporting module stubs (Suspicious Matter Reports, Threshold Transaction Reports, International Funds Transfer Instructions)
- [ ] Design mobile app wireframes (React Native)

**Deliverables by end of Month 2:**
- AUSTRAC registration submitted (clock starts on 90-day assessment)
- At least one receiving-side partner LOI signed
- FX provider selected and API access obtained
- KYC integration working in test environment
- Transaction state machine built and tested
- Mobile app wireframes complete

---

### Month 3: Build the Product (Weeks 9–12)

**Objective:** Functional MVP in test environment, beta testers identified.

**Mobile App Development (AI-built, human-reviewed):**
- [ ] Build React Native app with core screens:
  - Onboarding / registration (phone number + email)
  - KYC document upload (Australian driver's licence, passport, or Medicare card)
  - Add recipient (name, bank account or mobile wallet in Thailand/Cambodia)
  - Send money flow: enter AUD amount → see THB/KHR received → confirm → pay
  - Transaction history and status tracking
  - Profile and settings
- [ ] Localisation: English, Thai (ภาษาไทย), Khmer (ភាសាខ្មែរ)
  - Use professional translation, not Google Translate — community trust depends on this
  - Budget: ~$2,000–$3,000 for both languages across all app strings
- [ ] Payment collection: integrate PayID (NPP) for instant AUD collection from sender's Australian bank account. PayID is free, instant, and most Australians are familiar with it.
- [ ] Push notifications: transaction status updates via Firebase Cloud Messaging

**Backend Completion:**
- [ ] Integrate receiving-side partner API (test environment)
- [ ] Build reconciliation engine: match sent amounts to delivered amounts, flag discrepancies
- [ ] Build compliance automation:
  - Automated sanctions screening (OFAC, UN, DFAT consolidated list)
  - Transaction velocity checks (flag structuring patterns)
  - IFTI (International Funds Transfer Instruction) auto-generation for AUSTRAC reporting
  - Threshold transaction detection (AUD $10,000+)
- [ ] Build admin dashboard: transaction monitoring, manual review queue, compliance reporting

**Security:**
- [ ] Implement encryption at rest and in transit
- [ ] Secure API authentication (OAuth 2.0 / JWT)
- [ ] Rate limiting and fraud detection rules
- [ ] Penetration test the app (use a freelance security tester, ~$2,000–$5,000)

**Community Beta Recruitment:**
- [ ] Identify 20–30 beta testers from Thai and Cambodian communities
  - Approach via community Facebook groups, temple networks, community associations
  - Springvale Thai-Cambodian community centre (Melbourne)
  - Thai Town businesses (Haymarket, Sydney)
- [ ] Offer: free transfers during beta (you absorb the cost — budget ~$500–$1,000 for beta transfer subsidies)

**Deliverables by end of Month 3:**
- Functional app in TestFlight (iOS) and internal testing (Android)
- Backend connected to receiving-side partner test environment
- Compliance automation passing test scenarios
- 20+ beta testers recruited and onboarded
- App localised in Thai and Khmer

---

### Month 4: Beta & AUSTRAC Approval (Weeks 13–16)

**Objective:** Run beta transfers, iterate on feedback, receive AUSTRAC registration.

**Beta Program (2–3 weeks):**
- [ ] Onboard beta testers with full KYC
- [ ] Process real transfers (small amounts: $50–$200) through the live pipeline
- [ ] Collect structured feedback:
  - Was the app easy to use?
  - Did the money arrive when expected?
  - Was the exchange rate clear?
  - Would you use this instead of your current provider? Why/why not?
  - What's missing?
- [ ] Fix bugs and UX issues identified in beta
- [ ] Measure key metrics:
  - Time from "send" to "delivered" (target: <1 hour for Thailand, <4 hours for Cambodia)
  - KYC completion rate (target: >80%)
  - App crash rate
  - Customer support contacts per transaction

**AUSTRAC Follow-up:**
- [ ] Respond to any AUSTRAC information requests promptly (delays here extend the timeline)
- [ ] If registration is approved: celebrate, then immediately verify all compliance systems are production-ready
- [ ] If AUSTRAC requests changes to your AML/CTF Program: work with your consultant to address them quickly

**Receiving-Side Optimisation:**
- [ ] Test delivery speed and reliability across both corridors
- [ ] Thailand: verify funds land in recipient's bank account within 30 minutes via PromptPay
- [ ] Cambodia: verify funds land in Bakong wallet or bank account within target timeframe
- [ ] Identify and resolve edge cases: wrong account numbers, name mismatches, bank downtime

**App Store Preparation:**
- [ ] Create Apple Developer account ($99/year) and Google Play Console ($25 one-time)
- [ ] Prepare app store listings in English, Thai, and Khmer
- [ ] Screenshots, app description, privacy policy, terms of service
- [ ] Submit for App Store review (allow 1–2 weeks for Apple review)

**Deliverables by end of Month 4:**
- 50+ successful beta transactions completed
- Bug fixes and UX improvements shipped
- AUSTRAC registration received (or clear timeline on remaining steps)
- App submitted to App Store and Google Play

---

### Month 5: Soft Launch (Weeks 17–20)

**Objective:** Go live publicly, acquire first 100 paying users.

**Launch (assuming AUSTRAC registration confirmed):**
- [ ] Flip the app to production
- [ ] Enable self-service registration and KYC
- [ ] Monitor first 48 hours intensively: watch for failed transactions, KYC bottlenecks, FX quoting errors

**Community Launch Marketing (budget: $3,000–$5,000):**
- [ ] **Referral program:** "Send your first transfer free (up to $500). Refer a friend, you both get $10."
  - Referral mechanics built into the app
  - Each new user gets a unique referral code/link
- [ ] **Thai community:**
  - Partner with 3–5 Thai restaurants/grocery stores in Haymarket (Sydney) and CBD/Springvale (Melbourne) to display QR codes linking to app download
  - Post in Thai community Facebook groups (Thai Students in Australia, Thai Community Sydney/Melbourne)
  - Contact Thai community associations and Buddhist temples (Wat Buddharangsee in Sydney, Wat Thai Dhammaram in Melbourne)
  - LINE Official Account — Thai community uses LINE more than any other messaging app
  - Engage Thai-language social media influencers in Australia (micro-influencers, 1,000–10,000 followers: $50–$200/post)
- [ ] **Cambodian community:**
  - Partner with Cambodian grocery stores in Cabramatta (Sydney) and Springvale (Melbourne)
  - Post in Cambodian community Facebook groups
  - Contact Cambodian community associations and Khmer temples (Wat Khemarangsaram in Bonnyrigg)
  - Khmer-language flyers at community centres and temples
- [ ] **Seasonal timing:** If launch aligns with Songkran (Thai New Year, 13–15 April) or Pchum Ben (Cambodian, September/October), plan a special promotion around it — these are peak remittance periods

**Pricing Strategy:**
- [ ] Launch pricing: 1.0% fee + mid-market FX rate (undercut Wise's ~1.0–1.5% and massively undercut Western Union)
- [ ] First transfer free up to $500 (customer acquisition cost: ~$5–$7 per user)
- [ ] No hidden FX markup — show mid-market rate and explicit fee separately (transparency is the differentiator)

**Operations:**
- [ ] Set up customer support: WhatsApp Business account (shared across Thai, Khmer, English)
- [ ] Create FAQ pages in all three languages
- [ ] Establish daily reconciliation process: match all sent transactions to delivered confirmations
- [ ] File first AUSTRAC reports (IFTIs for all international transfers, SMRs for any suspicious activity)

**Deliverables by end of Month 5:**
- App live on App Store and Google Play
- 100+ registered users
- $50,000+ in monthly transfer volume
- Reconciliation and compliance reporting operational
- Customer support responding in <2 hours

---

### Month 6: Growth & Unit Economics (Weeks 21–24)

**Objective:** Reach 200 active users, validate unit economics, plan Phase 2.

**Growth:**
- [ ] Analyse user acquisition channels: which community touchpoints converted best?
- [ ] Double down on top-performing channels
- [ ] Launch "SendBridge Ambassador" program: recruit 5–10 community members who promote in their networks for ongoing referral bonuses
- [ ] Explore partnership with Thai/Cambodian student associations at major universities (UNSW, UniMelb, Monash, UTS) — students are high-frequency, low-value senders who become lifetime customers

**Unit Economics Validation:**
- [ ] Track and report:
  - Average transaction size (target: $300–$500)
  - Transactions per user per month (target: 1.5–2.0)
  - Gross margin per transaction after FX costs, partner fees, and payment processing
  - Customer acquisition cost (CAC) — target: <$10
  - Lifetime value (LTV) — target: >$100 (assumes 2+ years of monthly remittance)
  - LTV:CAC ratio — target: >10:1
- [ ] If unit economics are positive: prepare to invest in growth
- [ ] If unit economics are negative: identify where margin is leaking (FX spread too thin? Partner fees too high? Too many free transfers?) and adjust

**Product Iteration:**
- [ ] Based on user feedback, prioritise V1.1 features:
  - Scheduled/recurring transfers ("send $200 to mum every payday")
  - Multiple recipients per account
  - Real-time delivery notifications for recipient (SMS to Thai/Cambodian phone number)
  - Cash pickup option for Cambodia (if partner supports it)

**Compliance & Risk Review:**
- [ ] Monthly compliance review with your consultant
- [ ] Review transaction monitoring alerts: are there false positives to tune?
- [ ] Ensure all AUSTRAC reporting obligations are being met on schedule
- [ ] Review fraud/chargeback rates

**Phase 2 Planning:**
- [ ] Evaluate adding additional corridors: AUD→VND (Vietnamese community ~300,000+ in Australia), AUD→PHP (Filipino community ~400,000+)
- [ ] Evaluate micro-export tier (from mBridge architecture) as premium business product
- [ ] Evaluate ENS trade identity integration for business users
- [ ] If volume justifies it, begin conversations with mBridge-connected banks for wholesale settlement upgrade

**Deliverables by end of Month 6:**
- 200+ active users
- $100,000+/month in transfer volume
- Positive unit economics demonstrated
- Phase 2 roadmap drafted
- First revenue milestone achieved

---

## 3. Budget Breakdown

### One-Time Costs

| Item | Low | High | Notes |
|------|-----|------|-------|
| Company incorporation + ABN | $500 | $1,000 | ASIC registration |
| AML/CTF compliance consultant | $8,000 | $15,000 | Program + risk assessment + AUSTRAC application support |
| Legal review (terms, privacy, compliance) | $3,000 | $8,000 | Remittance-specific legal advice |
| Police history checks (key personnel) | $200 | $500 | Per-person, must be <6 months old |
| App store accounts (Apple + Google) | $125 | $125 | Annual Apple ($99) + one-time Google ($25) |
| App localisation (Thai + Khmer) | $2,000 | $3,000 | Professional human translation |
| Security penetration test | $2,000 | $5,000 | Freelance or boutique firm |
| Brand design (logo, app icon, templates) | $500 | $2,000 | Fiverr/99designs or AI-generated |
| **Subtotal** | **$16,325** | **$34,625** | |

### Monthly Recurring Costs

| Item | Low | High | Notes |
|------|-----|------|-------|
| Cloud hosting (AWS/GCP) | $200 | $400 | Scales with usage; low at launch |
| KYC verification API (Onfido/Sumsub) | $300 | $800 | ~$1–$2 per verification |
| SMS/notifications (Twilio/Firebase) | $100 | $300 | Transaction notifications |
| FX data feed | $0 | $200 | Some providers include this free |
| Sanctions screening API | $100 | $300 | Dow Jones, Refinitiv, or open-source |
| Customer support tools (WhatsApp Business) | $0 | $100 | Free tier initially |
| Accounting/bookkeeping | $200 | $500 | Xero + bookkeeper |
| **Monthly subtotal** | **$900** | **$2,600** | |
| **6-month recurring total** | **$5,400** | **$15,600** | |

### Developer Costs (Choose One Path)

| Path | Cost | Pros | Cons |
|------|------|------|------|
| **A: You + AI agents only** | $0 salary | Cheapest; you learn everything | Slow; you need strong technical skills |
| **B: Contract dev shop (MVP build)** | $30,000–$50,000 | Fast; professional quality | Less control; handover risk |
| **C: Part-time senior dev (3 days/week)** | $45,000–$60,000 (6 months) | Best of both; builds institutional knowledge | Harder to recruit part-time |
| **D: Full-time senior dev** | $60,000–$75,000 (6 months) | Maximum velocity; covers ops | Most expensive |

### Working Capital

| Item | Low | High | Notes |
|------|-----|------|-------|
| Liquidity float (pre-fund transfers) | $15,000 | $40,000 | Covers timing gap between collecting AUD and settling THB/KHR |
| Beta transfer subsidies | $500 | $1,000 | Free transfers during beta |
| Launch promotion (free first transfers) | $2,000 | $5,000 | Customer acquisition subsidy |
| **Subtotal** | **$17,500** | **$46,000** | |

### Marketing (Months 5–6)

| Item | Low | High | Notes |
|------|-----|------|-------|
| Community event presence | $500 | $1,500 | Songkran, Pchum Ben, temple events |
| Printed materials (flyers, QR cards) | $300 | $800 | Trilingual |
| Social media / micro-influencers | $500 | $2,000 | Thai + Cambodian creators |
| Referral bonuses | $1,000 | $3,000 | $10 per successful referral |
| **Subtotal** | **$2,300** | **$7,300** | |

### Total 6-Month Budget

| Scenario | Developer Path | Total |
|----------|---------------|-------|
| **Lean (you + AI)** | Path A | ~$42,000–$60,000 |
| **Moderate (contract dev)** | Path B | ~$72,000–$110,000 |
| **Comfortable (part-time dev)** | Path C | ~$87,000–$140,000 |
| **Full team (full-time dev)** | Path D | ~$102,000–$175,000 |

---

## 4. Key Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| AUSTRAC registration delayed beyond 90 days | Medium | High — blocks launch | Submit early (Month 2); respond to queries immediately; engage experienced consultant |
| Bank refuses to open business account for remittance startup | High | High | Apply to 3–4 banks simultaneously; include Airwallex and Wise Business as alternatives; prepare detailed business plan showing compliance commitment |
| Receiving-side partner falls through | Medium | High | Maintain conversations with 2+ partners per corridor; have fallback to affiliate with existing remittance network |
| Low initial adoption | Medium | Medium | Community-embedded marketing; referral incentives; free first transfer; Thai/Khmer language support |
| FX margin too thin to sustain | Low | High | Model unit economics before launch; build in 1.0% minimum margin; adjust pricing if needed |
| Fraud / compliance incident | Low | Very High | Automated sanctions screening; transaction monitoring; daily reconciliation; conservative limits for new users ($2,000/month until verified history) |
| Wise or major competitor drops pricing | Medium | Medium | Compete on community trust, language support, and corridor specialisation — not just price |

---

## 5. Competitive Positioning

### Current Options for AUD→THB / AUD→KHR

| Provider | Fee | FX Markup | Speed | Thai/Khmer Support | Community Presence |
|----------|-----|-----------|-------|--------------------|--------------------|
| Wise | ~1.0% | Mid-market | 1–2 hours | English only | None |
| Western Union | $5–$15 flat | 2–4% hidden | Minutes (cash pickup) | Minimal | Agent locations |
| Bank wire | $20–$30 | 3–5% | 2–5 days | None | None |
| Remitly | ~1.5% | 1–2% | Hours | English only | None |
| **SendBridge** | **1.0%** | **Mid-market** | **<1 hour (TH) / <4 hours (KH)** | **Thai, Khmer, English** | **Temples, stores, festivals** |

### SendBridge's Defensible Advantages

**1. Language and cultural trust.** No major remittance provider offers a Thai/Khmer-native experience. For older community members (who send the most money), English-only apps are a barrier. SendBridge is the app your mum can actually use.

**2. Community distribution.** Partnerships with Thai/Cambodian temples, grocery stores, and community associations create word-of-mouth channels that Wise can't replicate. Trust in these communities flows through personal relationships, not Google Ads.

**3. Corridor specialisation.** By focusing on two corridors instead of 50, SendBridge can optimise delivery speed, FX rates, and recipient experience specifically for Thailand and Cambodia. Generalist providers spread their partnerships thin.

**4. Future optionality.** The mBridge settlement architecture, ENS identity layer, and micro-export tier are Phase 2+ capabilities that no remittance startup has. If mBridge matures, SendBridge can upgrade its settlement rails from correspondent banking to CBDC — reducing costs further and enabling instant settlement.

---

## 6. Metrics & Milestones

### Month 1–2 (Pre-Launch)
- [ ] Company incorporated ✓/✗
- [ ] AUSTRAC registration submitted ✓/✗
- [ ] At least 1 receiving-side partner LOI signed ✓/✗
- [ ] AML/CTF Program finalised ✓/✗

### Month 3–4 (Beta)
- [ ] MVP app functional in test environment ✓/✗
- [ ] 20+ beta testers onboarded ✓/✗
- [ ] 50+ successful test transactions ✓/✗
- [ ] AUSTRAC registration approved ✓/✗
- [ ] App submitted to App Store / Google Play ✓/✗

### Month 5–6 (Launch & Growth)
- [ ] 100 registered users by end of Month 5
- [ ] 200 active users by end of Month 6
- [ ] $50,000/month transfer volume by Month 5
- [ ] $100,000/month transfer volume by Month 6
- [ ] Positive gross margin per transaction
- [ ] <2% transaction failure rate
- [ ] <2 hour average delivery time (Thailand)
- [ ] NPS score >40 from user surveys

---

## 7. Phase 2 Roadmap (Months 7–12)

Once the core remittance product is live and growing, these are the expansion opportunities in priority order:

**7.1 Additional Corridors**
- AUD→VND (Vietnamese community: ~300,000+ in Australia — largest Southeast Asian diaspora)
- AUD→PHP (Filipino community: ~400,000+ — high remittance frequency)
- AUD→MMK (Myanmar community: growing, underserved, few options)

**7.2 Recurring Transfers**
- Scheduled sends: "Every 15th, send $300 to my parents"
- Auto-FX alerts: "Notify me when AUD/THB hits 24.0, then auto-send"

**7.3 Business Remittance / Micro-Export Tier**
- Small Australian businesses paying Thai/Cambodian suppliers
- Higher limits, invoice attachment, simplified compliance for trade payments
- This is the bridge from consumer remittance to the mBridge settlement architecture

**7.4 ENS Trade Identity (from v2.2 Architecture)**
- Verified transaction history on-chain for business users
- Portable reputation: "This supplier has completed 50 verified cross-border payments"
- Uses existing `ecny.eth` / `digitalyuan.eth` infrastructure

**7.5 Bakong Direct Integration**
- Upgrade Cambodia corridor from bank-to-bank to direct Bakong API delivery
- Enables instant KHR delivery to any Bakong wallet (30M+ wallets in Cambodia)
- Reduces per-transaction cost by cutting out intermediary bank

**7.6 Settlement-Backed Stabletoken (Phase 3, Month 12+)**
- Each completed, compliant remittance generates a settlement proof token
- Tokens represent verified cross-border payment history
- Foundation for trade finance products and DeFi composability
- Requires regulatory clarity (monitor ASIC Digital Assets Framework implementation)

---

## 8. Connection to mBridge Architecture (v2.2)

The mBridge settlement agent architecture isn't wasted — it's the long-term upgrade path. Here's how the remittance product feeds into it:

| Remittance Component | mBridge v2.2 Equivalent | Upgrade Path |
|---------------------|------------------------|--------------|
| KYC/AML compliance engine | Compliance Service (Section 5.2) | Add SAFE pre-approval, dual-screening for wholesale |
| FX quoting (mid-market + margin) | FX Engine (Section 5.4) | Add PBOC fixing, composite quotes, staleness penalty |
| Transaction state machine | Settlement Orchestrator (Section 5.5) | Add two-hop legs, HKD hold policy, reversal receipts |
| Receiving-side partner API | Bank Adapter (ISP) | Add mBridge ledger adapter, eCNY swap |
| AUSTRAC reporting | Compliance Service reporting | Add HKMA, SAFE, PBOC reporting modules |
| ENS domains (ecny.eth, digitalyuan.eth) | ENS Identity & Audit Layer (Section 9) | Activate for receipt anchoring and trade identity |

The remittance business validates the market, builds the compliance infrastructure, establishes banking relationships, and generates the transaction volume that justifies upgrading to CBDC settlement rails when mBridge is ready for commercial participants.

---

## 9. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| Feb 2026 | Target AUD→THB and AUD→KHR as first corridors | Combined diaspora ~160K+, underserved by incumbents, growing migration, receiving-side infrastructure (PromptPay, Bakong) mature |
| Feb 2026 | Mobile-first, not web-first | Target demographic uses smartphones as primary device; older community members more comfortable with apps than websites |
| Feb 2026 | AUSTRAC remittance registration, not AFSL | AFSL not required for basic remittance; AUSTRAC registration is free and faster (90 days vs 6+ months) |
| Feb 2026 | Partner with existing receiving-side providers, not build own | Avoids needing Thai/Cambodian banking licenses; faster to market; can upgrade later |
| Feb 2026 | Community-embedded marketing, not digital ads | Trust in Thai/Cambodian communities flows through personal relationships; temple/store partnerships more effective than Facebook ads |
| Feb 2026 | Defer mBridge integration to Phase 2+ | Consumer remittance validates market and builds infrastructure; CBDC settlement is the upgrade, not the starting point |
| Feb 2026 | Keep ENS domains for future use | ecny.eth and digitalyuan.eth have strategic value for Phase 2 trade identity layer; annual holding cost is minimal (~$165/year combined) |

---

## Appendix A: AUSTRAC Registration Checklist

Source: AUSTRAC.gov.au — Remittance Service Providers

**Before you apply:**
- [ ] Australian Pty Ltd incorporated
- [ ] ABN obtained
- [ ] At least one resident director appointed
- [ ] AML/CTF Compliance Officer designated
- [ ] AML/CTF Program (Part A + Part B) drafted
- [ ] ML/TF Risk Assessment completed
- [ ] National Police History Check obtained for each key person (<6 months old)
- [ ] Business plan documenting intended remittance services

**Registration types (choose applicable):**
- [ ] Independent remittance dealer (you operate independently)
- [ ] Remittance network provider (you operate a network of affiliates)
- [ ] Affiliate of remittance network provider (you operate under another provider's registration)

**Ongoing obligations after registration:**
- [ ] File International Funds Transfer Instructions (IFTIs) for every international transfer
- [ ] File Threshold Transaction Reports (TTRs) for cash transactions ≥$10,000
- [ ] File Suspicious Matter Reports (SMRs) within 24 hours of forming suspicion
- [ ] Conduct ongoing customer due diligence
- [ ] Maintain records for 7 years
- [ ] Renew registration every 3 years
- [ ] Report any changes to business details

---

## Appendix B: Community Marketing Calendar (2026)

| Month | Event | Community | Action |
|-------|-------|-----------|--------|
| April | Songkran (Thai New Year, 13–15 Apr) | Thai | Major promotion; presence at Songkran festivals in Sydney/Melbourne; "Send money home for New Year — first transfer free" |
| April | Khmer New Year (14–16 Apr) | Cambodian | Similar promotion; community event presence |
| May | Vesak / Visakha Bucha Day | Both | Temple presence; flyers at Buddhist celebrations |
| July | Asanha Bucha + Khao Phansa | Thai | Temple ceremony attendance; community centre flyers |
| Sep/Oct | Pchum Ben (varies by lunar calendar) | Cambodian | Peak remittance season — Cambodians send money for ancestral offerings; targeted campaign |
| Oct | Ok Phansa | Thai | End of Buddhist Lent; temple presence |
| Nov | Loy Krathong | Thai | Cultural festival presence in Sydney/Melbourne |
| Dec | Year-end | Both | "Send a gift home" holiday campaign |

---

## Appendix C: Tech Stack Recommendation

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Mobile app | React Native (Expo) | Cross-platform iOS/Android from single codebase; AI agents write this well |
| Backend API | Node.js (Express or Fastify) or Python (FastAPI) | Both AI-friendly; choose based on developer preference |
| Database | PostgreSQL | Reliable, supports JSON columns for flexible schemas |
| Cache / Queue | Redis | Rate limiting, FX quote caching, job queues |
| KYC Provider | Onfido or Sumsub | Australian document verification, liveness checks |
| FX Rates | Airwallex API or CurrencyCloud | Wholesale rates, multi-currency accounts |
| SMS/Notifications | Twilio (SMS) + Firebase (push) | Reliable, global coverage including Thai/Cambodian numbers |
| Payment Collection | PayID (via banking partner) | Instant AUD collection, no fees for sender |
| Sanctions Screening | Dow Jones Risk & Compliance API or open-source (OpenSanctions) | DFAT, OFAC, UN consolidated lists |
| Hosting | AWS (ap-southeast-2, Sydney region) | Australian data residency, low latency |
| Monitoring | Datadog or Grafana Cloud (free tier) | Transaction monitoring, alerting |
| CI/CD | GitHub Actions | Free for small teams; AI agents can configure |
