# SendBridge Pty Ltd — AML/CTF Program

**Anti-Money Laundering and Counter-Terrorism Financing Program**

**Document Classification:** Confidential — Internal Use Only

| Field | Detail |
|-------|--------|
| **Entity Name** | SendBridge Pty Ltd |
| **ABN** | [Insert ABN] |
| **AUSTRAC Registration** | [Pending — Independent Remittance Dealer] |
| **Designated Services** | International remittance: AUD → THB (Thai Baht), AUD → KHR (Cambodian Riel) |
| **Program Version** | 1.0 |
| **Effective Date** | [Insert date] |
| **Approved By** | [Director name and signature] |
| **AML/CTF Compliance Officer** | [Name — must be at management level] |
| **Next Review Date** | [12 months from effective date, or earlier if triggered] |

> **Regulatory Note:** This program is designed to comply with both the current AML/CTF Act 2006 and the amended AML/CTF Act taking effect 31 March 2026. The program adopts the reformed framework's risk-based, outcomes-oriented approach while maintaining the traditional Part A / Part B structure for clarity. References to "IFTI" reporting should be read as "IVTS" reporting from 31 March 2026 onward, per transitional rules.

---

## Table of Contents

1. [Part A: Risk Management and Governance](#part-a-risk-management-and-governance)
   - 1.1 Business Overview and Designated Services
   - 1.2 ML/TF/PF Risk Assessment
   - 1.3 Governance and Senior Management Oversight
   - 1.4 AML/CTF Compliance Officer
   - 1.5 Employee Due Diligence
   - 1.6 AML/CTF Risk Awareness Training
   - 1.7 Transaction Monitoring Program
   - 1.8 Enhanced Customer Due Diligence (ECDD)
   - 1.9 Reporting Obligations
   - 1.10 Sanctions Screening
   - 1.11 Record Keeping
   - 1.12 Correspondent and Partner Due Diligence
   - 1.13 Program Review and Updates
2. [Part B: Customer Identification Procedures (KYC)](#part-b-customer-identification-procedures-kyc)
   - 2.1 Customer Identification Framework
   - 2.2 Individual Customer Identification
   - 2.3 Non-Individual Customer Identification
   - 2.4 Beneficial Ownership
   - 2.5 Politically Exposed Persons (PEPs)
   - 2.6 Electronic Verification
   - 2.7 Ongoing Customer Due Diligence (OCDD)
   - 2.8 Reliance on Third Parties
3. [Annexes](#annexes)
   - Annex A: ML/TF Risk Assessment Matrix
   - Annex B: Corridor Risk Profiles — Thailand and Cambodia
   - Annex C: Suspicious Matter Indicators
   - Annex D: Transaction Limits and Velocity Controls
   - Annex E: AUSTRAC Reporting Quick Reference
   - Annex F: Sanctions Lists and Screening Procedures
   - Annex G: Record Retention Schedule

---

# Part A: Risk Management and Governance

## 1.1 Business Overview and Designated Services

### 1.1.1 Nature of Business

SendBridge Pty Ltd is an Australian proprietary limited company providing international remittance services. The company operates as an independent remittance dealer registered with AUSTRAC under Item 31 (from 31 March 2026: Items 29 and 30) of the AML/CTF Act.

### 1.1.2 Designated Services Provided

SendBridge provides the following designated services:

- **Outbound international value transfers:** Accepting instructions from customers in Australia to transfer Australian Dollars (AUD) to recipients in Thailand (THB) and Cambodia (KHR/USD).

SendBridge does **not** provide:
- Inbound remittance (transfers into Australia)
- Cash acceptance or disbursement in Australia
- Currency exchange services (standalone)
- Stored value facilities or e-wallets
- Virtual asset services

### 1.1.3 Service Delivery Channels

| Channel | Description | Risk Level |
|---------|-------------|------------|
| **Mobile application** | Primary channel — iOS and Android app with in-app KYC, transaction initiation, and tracking | Medium |
| **Web application** | Secondary channel — browser-based interface with equivalent functionality | Medium |

SendBridge does **not** operate physical branches, agent locations, or accept walk-in customers. All customer interactions are digital (non-face-to-face).

### 1.1.4 Payment Collection Methods

| Method | Description | Risk Level |
|--------|-------------|------------|
| **PayID / NPP** | Customer transfers AUD from their verified Australian bank account to SendBridge's designated PayID | Low |
| **Bank transfer (manual)** | Customer initiates manual bank transfer to SendBridge's nominated account | Low-Medium |

SendBridge does **not** accept cash, cheques, credit card payments, cryptocurrency, or third-party payments. All incoming funds must originate from an Australian bank account held in the customer's verified name.

### 1.1.5 Receiving-Side Delivery Methods

| Corridor | Delivery Method | Partner | Risk Level |
|----------|----------------|---------|------------|
| **Thailand (THB)** | PromptPay bank credit — instant delivery to recipient's Thai bank account | [Partner name — licensed Thai remittance provider] | Low-Medium |
| **Cambodia (KHR/USD)** | Bakong wallet / bank credit — delivery to recipient's Cambodian bank account or Bakong wallet | [Partner name — NBC-licensed Cambodian bank] | Medium |

### 1.1.6 Target Customer Profile

SendBridge's primary customer base comprises:

- Thai-born Australian residents and citizens (estimated 100,000+ in Australia)
- Cambodian-ancestry Australian residents and citizens (approximately 57,000 per 2021 Census)
- Thai and Cambodian students studying in Australia (30,000+ Thai students; Cambodian student numbers growing)
- Australian residents with family or business connections to Thailand or Cambodia

**Typical transaction profile:** Personal remittances of AUD $100–$2,000, sent 1–3 times per month, to family members for living expenses, education support, healthcare costs, or cultural/religious obligations (e.g., Songkran, Pchum Ben).

---

## 1.2 ML/TF/PF Risk Assessment

### 1.2.1 Risk Assessment Methodology

SendBridge's ML/TF/PF risk assessment follows AUSTRAC's recommended framework of **Identify → Assess → Evaluate** to determine inherent risks before controls are applied, and residual risks after mitigation measures.

Risk is assessed across five dimensions:

1. **Customer risk** — Who are our customers and what risk do they present?
2. **Service/product risk** — What risks are inherent in our designated services?
3. **Delivery channel risk** — How do our delivery channels affect risk?
4. **Geographic/country risk** — What risks are associated with our operating corridors?
5. **New/emerging technology risk** — Do any technologies we use create additional risk?

Each risk factor is rated on a 3-point scale:

| Rating | Likelihood | Impact | Description |
|--------|-----------|--------|-------------|
| **Low** | Unlikely | Minor | Risk is manageable with standard controls |
| **Medium** | Possible | Moderate | Risk requires specific mitigation measures |
| **High** | Likely | Significant | Risk requires enhanced controls and ongoing monitoring |

### 1.2.2 Inherent Risk Assessment Summary

The full risk assessment matrix is in **Annex A**. Key inherent risk findings:

**Customer Risk: MEDIUM**
- Predominantly individual retail customers sending personal remittances — lower inherent risk than business/corporate clients
- Non-face-to-face onboarding increases identity fraud risk
- Some customers may have limited English proficiency, requiring Thai/Khmer language support — increases risk of miscommunication in compliance processes
- Risk of customers being used as unwitting money mules or being victims of scams (romance scams, investment fraud)

**Service Risk: MEDIUM**
- International value transfer is inherently a medium-to-high risk service (AUSTRAC National Risk Assessment)
- Outbound-only transfers reduce layering risk (no round-tripping)
- Small transaction values ($100–$2,000 typical) reduce individual transaction risk
- Digital-only, bank-to-bank transfer model eliminates cash-handling risks

**Delivery Channel Risk: MEDIUM**
- Non-face-to-face digital channel — higher risk than in-person but mitigated by electronic identity verification
- No agent network — reduces risk of agent complicity but eliminates in-person verification option
- Mobile app with biometric authentication provides additional security layer

**Geographic Risk: MEDIUM**

*Thailand (THB corridor):*
- Thailand is a member of the Asia/Pacific Group on Money Laundering (APG)
- FATF mutual evaluation (2017, follow-up 2023): 33 of 40 Recommendations rated Compliant or Largely Compliant; 6 remain Partially Compliant. Thailand is in enhanced follow-up
- Thailand is **not** on the FATF grey list or black list
- Thailand has a well-developed AML/CTF framework supervised by the Anti-Money Laundering Office (AMLO)
- PromptPay is a regulated, bank-supervised instant payment system operated by the National ITMX under Bank of Thailand oversight
- Risks: Drug trafficking (methamphetamine corridor), human trafficking, online gambling, corruption — but these are systemic country risks, not specific to the remittance corridor
- **Corridor risk assessment:** The AUD→THB corridor is predominantly personal remittances from a diaspora community to family in Thailand. This pattern is consistent with legitimate remittance activity and presents LOWER risk than commercial/trade corridors

*Cambodia (KHR corridor):*
- Cambodia is a member of APG
- FATF mutual evaluation (2017, follow-up 2023): Compliant/Largely Compliant on 33 of 40 Recommendations. Cambodia is **no longer** on the FATF grey list (removed in follow-up process)
- Cambodia faces significant challenges with corruption, weak governance, and transnational organised crime
- Bakong is the National Bank of Cambodia's (NBC) digital payment system — it is centrally supervised and provides full transaction traceability
- Risks: Corruption, online scam compounds, human trafficking, narcotics, illegal logging, casino-related money laundering
- The Cambodia corridor carries HIGHER inherent risk than Thailand due to governance challenges and the prevalence of scam operations, but the Bakong delivery channel provides a regulated, traceable receiving rail
- **Corridor risk assessment:** The AUD→KHR corridor is predominantly personal remittances from an established refugee and migrant community. Cambodia's governance challenges elevate inherent risk, but the use of NBC-supervised Bakong and licensed banks for delivery provides meaningful mitigation

**Technology Risk: LOW-MEDIUM**
- Standard mobile/web technology — no novel or unproven technology
- API-based integrations with established payment partners
- Cloud hosting in Australian data centres (AWS ap-southeast-2)
- No virtual asset, DeFi, or cryptocurrency components

### 1.2.3 Residual Risk Assessment

After applying the controls described throughout this program (KYC verification, transaction monitoring, sanctions screening, velocity limits, ECDD triggers), the residual risk rating for each dimension:

| Dimension | Inherent Risk | Controls Applied | Residual Risk |
|-----------|--------------|-----------------|---------------|
| Customer | Medium | Electronic KYC, ongoing CDD, ECDD triggers, velocity limits | Low-Medium |
| Service | Medium | Transaction limits, monitoring rules, IFTI/IVTS reporting | Low-Medium |
| Delivery Channel | Medium | Biometric verification, device fingerprinting, session security | Low |
| Geographic — Thailand | Medium | Sanctions screening, partner due diligence, delivery verification | Low-Medium |
| Geographic — Cambodia | Medium-High | Sanctions screening, partner due diligence, ECDD for large transfers, Bakong traceability | Medium |
| Technology | Low-Medium | Encryption, penetration testing, access controls | Low |

**Overall residual risk: LOW-MEDIUM**

### 1.2.4 Proliferation Financing Risk Assessment

As required by the amended AML/CTF Act (effective 31 March 2026), SendBridge has assessed its proliferation financing (PF) risk:

- SendBridge operates in corridors to Thailand and Cambodia — neither country is subject to UN Security Council targeted financial sanctions related to WMD proliferation
- Neither Thailand nor Cambodia is designated as a high-risk jurisdiction for proliferation financing by FATF
- SendBridge's customer base (individual retail remitters) and transaction profile (small personal transfers) present minimal PF risk
- SendBridge screens all customers and recipients against the DFAT Consolidated List, which incorporates UN Security Council sanctions including those related to proliferation

**PF risk assessment: LOW.** Existing sanctions screening and transaction monitoring controls adequately address PF risk. No specific counter-proliferation financing policies are required beyond the existing sanctions compliance framework.

### 1.2.5 Risk Assessment Review Triggers

This risk assessment must be reviewed and updated:

- At least annually (or more frequently if circumstances change)
- When SendBridge adds new corridors, services, or delivery channels
- When there is a material change to the customer base or transaction patterns
- When AUSTRAC publishes new guidance, risk assessments, or feedback relevant to remittance providers
- When FATF changes the risk rating of Thailand or Cambodia
- When a significant compliance incident occurs
- When receiving-side partners change or their regulatory status changes

---

## 1.3 Governance and Senior Management Oversight

### 1.3.1 Board and Senior Management Responsibilities

The director(s) of SendBridge Pty Ltd are responsible for:

- Approving this AML/CTF program and any material amendments
- Ensuring adequate resources are allocated for AML/CTF compliance
- Receiving regular compliance reports (at minimum quarterly) from the AML/CTF Compliance Officer
- Ensuring the AML/CTF Compliance Officer has sufficient authority and independence
- Overseeing the ML/TF/PF risk assessment and ensuring it remains current
- Fostering a culture of compliance throughout the organisation

The board must formally approve this program before SendBridge commences providing designated services. Approval must be documented with the director's signature and date.

### 1.3.2 Compliance Reporting to Senior Management

The AML/CTF Compliance Officer will provide the board with:

| Report | Frequency | Content |
|--------|-----------|---------|
| **Compliance dashboard** | Monthly | Transaction volumes, SMRs filed, ECDD cases, sanctions hits, KYC completion rates |
| **Quarterly compliance report** | Quarterly | Risk assessment updates, training completion, audit findings, regulatory changes, partner due diligence status |
| **Annual program review** | Annually | Full program effectiveness review, risk assessment update, recommendations |
| **Incident reports** | As required | Immediate notification of significant compliance incidents, regulatory inquiries, or enforcement actions |

---

## 1.4 AML/CTF Compliance Officer

### 1.4.1 Appointment

SendBridge must appoint an AML/CTF Compliance Officer at the management level. The Compliance Officer must be a fit and proper person, meaning they:

- Have not been convicted of a dishonesty offence
- Have not been subject to AUSTRAC or ASIC enforcement action
- Have adequate knowledge and understanding of AML/CTF obligations
- Hold (or will obtain within 6 months of appointment) relevant AML/CTF qualifications or training

**Appointed Compliance Officer:** [Name]
**Position:** [Title — e.g., Director / Head of Compliance]
**Date of Appointment:** [Date]

> **Note for early-stage operation:** Where SendBridge has a single director who also serves as the Compliance Officer, an external compliance consultant should be retained to provide independent oversight and act as a sounding board on compliance decisions. This arrangement should be reviewed as the business scales.

### 1.4.2 Responsibilities

The AML/CTF Compliance Officer is responsible for:

- Implementing and maintaining this AML/CTF program
- Ensuring all AUSTRAC reporting obligations are met (IFTIs/IVTS, SMRs, TTRs, compliance reports)
- Overseeing the ML/TF/PF risk assessment and recommending updates
- Reviewing and approving ECDD cases
- Making decisions on suspicious matters and filing SMRs
- Managing the employee due diligence and training programs
- Liaising with AUSTRAC and law enforcement agencies
- Overseeing sanctions screening processes
- Maintaining records in accordance with the AML/CTF Act
- Reporting to the board on compliance matters
- Responding to AUSTRAC information requests (Section 49 notices) within required timeframes

### 1.4.3 Authority and Independence

The Compliance Officer has the authority to:

- Block, delay, or reverse any transaction suspected of involving ML/TF
- Refuse to onboard or de-board any customer based on ML/TF risk
- Escalate compliance concerns directly to the board
- Engage external legal or compliance advice when needed
- Access all customer records, transaction data, and business systems

---

## 1.5 Employee Due Diligence

### 1.5.1 Pre-Employment Screening

Before any person becomes an employee, contractor, or key person of SendBridge, the following checks must be completed:

| Check | Requirement | Frequency |
|-------|-------------|-----------|
| **National Police History Check** | Required for all key personnel; must be issued within 6 months of AUSTRAC registration application and kept current | At onboarding, renewed every 3 years |
| **Identity verification** | Verify full name, date of birth, and residential address via government-issued photo ID | At onboarding |
| **Reference checks** | Contact at least two professional references | At onboarding |
| **Right to work** | Verify Australian work rights | At onboarding |
| **DFAT sanctions screening** | Screen against DFAT Consolidated List | At onboarding, ongoing |
| **Qualifications verification** | Verify relevant qualifications claimed | At onboarding |

### 1.5.2 Ongoing Employee Due Diligence

- All employees must declare any changes to their criminal history, financial status (bankruptcy/insolvency), or conflicts of interest
- Employees with access to customer data, transaction systems, or compliance systems must be re-screened against sanctions lists annually
- Any employee suspected of involvement in ML/TF must be immediately reported to the Compliance Officer and may be suspended pending investigation

### 1.5.3 Key Personnel

AUSTRAC requires National Police History Checks for "key personnel," which includes:

- Directors and officers
- The AML/CTF Compliance Officer
- Any person who makes or participates in making decisions that affect the whole or a substantial part of the business
- Any person who has the capacity to significantly affect the company's financial standing

Police checks for key personnel must be current (issued within 6 months) at the time of AUSTRAC registration application and at each 3-year registration renewal.

---

## 1.6 AML/CTF Risk Awareness Training

### 1.6.1 Training Program

All employees, contractors, and agents who perform functions related to designated services must receive AML/CTF training.

| Training | Audience | Timing | Content |
|----------|----------|--------|---------|
| **Induction training** | All new staff | Before commencing duties | AML/CTF Act overview, SendBridge's program, KYC procedures, how to identify and escalate suspicious activity, reporting obligations, consequences of non-compliance |
| **Annual refresher** | All staff | Annually | Updates to program, new typologies, recent AUSTRAC guidance, case studies, regulatory changes |
| **Role-specific training** | Compliance, operations, customer support | As needed | Detailed training on IFTI/IVTS reporting, SMR preparation, sanctions screening, ECDD procedures, customer communication in compliance situations |
| **Ad hoc training** | All relevant staff | As triggered | New threats, AUSTRAC alerts, significant regulatory changes (e.g., 31 March 2026 reforms) |

### 1.6.2 Training Content

Training must cover:

- What money laundering, terrorism financing, and proliferation financing are and why they matter
- SendBridge's specific ML/TF/PF risks (by reference to this program's risk assessment)
- How to identify suspicious activity — including common indicators specific to remittance services (see Annex C)
- The obligation to report suspicious matters and the process for doing so
- The tipping-off offence: staff must never disclose to a customer that an SMR has been or will be filed, or that the customer is under investigation
- Customer identification and verification procedures
- Transaction monitoring rules and escalation procedures
- Sanctions screening obligations
- Record-keeping requirements
- Consequences of non-compliance (personal and organisational)

### 1.6.3 Training Records

Records of all training must be maintained, including:

- Date and type of training
- Attendees and their acknowledgment of completion
- Training materials used
- Assessment results (if applicable)

Training records must be retained for 7 years.

---

## 1.7 Transaction Monitoring Program

### 1.7.1 Purpose

SendBridge maintains a transaction monitoring program to detect unusual or suspicious patterns of activity that may indicate ML/TF. The monitoring program uses a combination of automated rules and manual review.

### 1.7.2 Automated Monitoring Rules

The following automated rules will generate alerts for manual review:

**Velocity and threshold rules:**

| Rule | Trigger | Action |
|------|---------|--------|
| **Single transaction threshold** | Any single transaction ≥ AUD $5,000 | Alert for review |
| **Cumulative daily threshold** | Total transactions by one customer ≥ AUD $5,000 in a single day | Alert for review; possible structuring |
| **Cumulative weekly threshold** | Total transactions by one customer ≥ AUD $10,000 in 7 days | Alert for review |
| **Cumulative monthly threshold** | Total transactions by one customer ≥ AUD $20,000 in 30 days | Alert for ECDD review |
| **Frequency spike** | Customer transaction count exceeds 2x their established pattern in any 7-day period | Alert for review |
| **Rapid successive transactions** | More than 3 transactions by one customer in 24 hours | Alert for review; possible structuring |
| **Just-below-threshold** | Transaction amounts consistently just below AUD $10,000 | Alert for possible structuring to avoid TTR reporting |
| **New customer high value** | Customer makes transaction ≥ AUD $2,000 within first 7 days of onboarding | Alert for review |

**Behavioural rules:**

| Rule | Trigger | Action |
|------|---------|--------|
| **Multiple recipients** | Customer sends to ≥ 5 different recipients in 30 days | Alert for review |
| **New recipient + high value** | First transfer to a new recipient ≥ AUD $3,000 | Alert for review |
| **Profile inconsistency** | Transaction amounts inconsistent with declared occupation/income | Alert for ECDD |
| **Geographic anomaly** | Customer's IP address or device location inconsistent with registered address | Alert for review |
| **Dormant account reactivation** | No transactions for 90+ days, then sudden high-value activity | Alert for review |
| **Third-party suspicion** | Indicators that the sender may be acting on behalf of another party (not the named customer) | Alert for review |

### 1.7.3 Manual Review Process

When an automated alert is generated:

1. **Triage (within 24 hours):** The operations team reviews the alert against customer profile, transaction history, and contextual information. Routine or clearly explainable alerts may be cleared with documented rationale.

2. **Investigation (within 48 hours):** Alerts that cannot be cleared at triage are escalated to the Compliance Officer for investigation. The investigation may include: review of all customer transactions, KYC records, device and session data, comparison with known typologies, and (where appropriate) customer contact to seek an explanation.

3. **Decision (within 72 hours):** The Compliance Officer decides whether to:
   - Clear the alert (with documented rationale)
   - Apply ECDD measures (request additional information, increase monitoring)
   - File a Suspicious Matter Report (SMR) with AUSTRAC
   - Block the customer's account pending further investigation
   - Exit the customer relationship

4. **Documentation:** All alerts, investigations, decisions, and rationale must be recorded and retained for 7 years.

### 1.7.4 Transaction Limits

SendBridge applies the following transaction limits (see Annex D for full details):

| Customer Tier | Per Transaction | Daily Limit | Monthly Limit | Requirements |
|--------------|----------------|-------------|---------------|-------------|
| **Standard (new customer, first 90 days)** | AUD $2,000 | AUD $2,000 | AUD $5,000 | Standard KYC completed |
| **Verified (90+ days, good history)** | AUD $5,000 | AUD $5,000 | AUD $15,000 | Standard KYC + transaction history review |
| **Enhanced (on application)** | AUD $10,000 | AUD $10,000 | AUD $30,000 | ECDD completed: enhanced ID verification, source of funds declaration, Compliance Officer approval |

Limits may be reduced for individual customers based on risk assessment. Limits may only be increased with Compliance Officer approval and documented ECDD.

---

## 1.8 Enhanced Customer Due Diligence (ECDD)

### 1.8.1 ECDD Triggers

Enhanced customer due diligence must be applied when:

- A customer is assessed as high risk (based on any risk dimension)
- A customer requests transaction limits above the Standard tier
- A customer is identified as a Politically Exposed Person (PEP) or associate/family member of a PEP
- Transaction monitoring generates an alert that cannot be resolved at triage
- A customer's transaction patterns are inconsistent with their declared profile
- The customer relationship involves a high-risk jurisdiction beyond Thailand and Cambodia
- AUSTRAC or law enforcement provides information suggesting a customer may be involved in ML/TF
- The customer is the subject of adverse media

### 1.8.2 ECDD Measures

ECDD may include one or more of:

- **Source of funds declaration:** Customer must declare the source of funds being transferred (employment, savings, sale of property, gift, etc.) and provide supporting evidence where the Compliance Officer deems it necessary
- **Source of wealth inquiry:** Where transaction volumes are inconsistent with declared occupation/income, request evidence of overall wealth
- **Enhanced identity verification:** Request additional identity documents, conduct video verification, or require in-person verification
- **Recipient verification:** Request information about the recipient's identity and relationship to the customer
- **Purpose of transaction:** Request a detailed explanation of the purpose of the transfer
- **Adverse media screening:** Search public and media sources for adverse information about the customer
- **Increased monitoring:** Apply closer ongoing monitoring to the customer's activity
- **Senior management approval:** Require the Compliance Officer's approval before processing transactions
- **Third-party intelligence:** Where appropriate, engage external due diligence providers

### 1.8.3 ECDD Documentation

All ECDD activities must be documented, including:

- The trigger that initiated ECDD
- Information collected and verified
- Analysis and risk assessment
- Decision and rationale (proceed, restrict, exit)
- Approval by the Compliance Officer
- Ongoing monitoring plan (if relationship continues)

---

## 1.9 Reporting Obligations

### 1.9.1 International Funds Transfer Instructions (IFTI) / International Value Transfer Services (IVTS)

SendBridge must file an IFTI-DRA report (or, from 31 March 2026 under transitional rules, an IVTS report) with AUSTRAC for **every** international transfer of value, regardless of the amount.

| Requirement | Detail |
|-------------|--------|
| **When to report** | Every outbound international transfer |
| **Deadline** | Within 10 business days of sending the transfer instruction |
| **Method** | AUSTRAC Online (data entry, spreadsheet upload, or system extraction) |
| **Minimum information** | Transferor (sender) full name, address, date of birth, account/reference; recipient full name, address, account details; amount, currency, date; SendBridge details; receiving partner details |

> **31 March 2026 transition:** IFTI-DRA reporting will be replaced by IVTS reporting. The reporting obligation will lie with the entity closest to the Australian customer (which for SendBridge is SendBridge itself). Transitional rules will maintain existing IFTI reporting while new IVTS systems are implemented. SendBridge will update its reporting systems and procedures when AUSTRAC publishes final IVTS guidance.

**Critical:** If money from several customers is bundled for settlement purposes, each individual customer's transfer must be reported as a separate IFTI/IVTS.

### 1.9.2 Threshold Transaction Reports (TTR)

SendBridge must file a TTR for any transaction involving **physical currency** of AUD $10,000 or more (or foreign currency equivalent).

- SendBridge's business model does not involve physical cash. TTR obligations are therefore expected to be minimal.
- However, if SendBridge ever accepts cash at any point, TTR procedures must be implemented immediately.
- TTRs must be filed within 10 business days.

### 1.9.3 Suspicious Matter Reports (SMR)

SendBridge must file an SMR with AUSTRAC when it forms a suspicion (or has reasonable grounds to suspect) that:

- A customer is not who they claim to be
- Information provided by a customer may be false or misleading
- A transaction may be related to a criminal offence (money laundering, fraud, tax evasion, drug trafficking, terrorism financing, etc.)
- A transaction may be related to the proceeds of crime
- A transaction has no apparent economic or lawful purpose

| Requirement | Detail |
|-------------|--------|
| **Terrorism-related suspicion** | File within **24 hours** of forming the suspicion |
| **All other suspicions** | File within **3 business days** of forming the suspicion |
| **Method** | AUSTRAC Online |

**Tipping-off offence:** It is a criminal offence for any person to disclose to any other person (including the customer) that an SMR has been filed, or that information has been communicated to AUSTRAC. This includes indicating that a transaction is being delayed or reviewed due to a suspicious matter report.

Staff must be trained to handle customer inquiries about delayed transactions without revealing the existence of an SMR. Acceptable responses include general statements about routine security checks or processing delays.

### 1.9.4 Compliance Reports

AUSTRAC may require SendBridge to submit compliance reports. These must be submitted within the timeframe specified by AUSTRAC.

### 1.9.5 Section 49 Notices

AUSTRAC may issue a notice under Section 49 of the AML/CTF Act requiring SendBridge to provide additional information about a report or transaction. These must be responded to within the timeframe specified in the notice (typically 14 days).

### 1.9.6 Travel Rule (from 31 March 2026)

From 31 March 2026, the travel rule requires SendBridge to collect, verify, and pass on key information about the payer and payee with each transfer of value. This ensures that essential identifying information travels with the transfer through the payment chain.

SendBridge must pass the following information to its receiving-side partner with each transfer:

**Payer information:** Full name, account number or unique reference, address (or date of birth and place of birth, or customer identification number)

**Payee information:** Full name, account number or unique reference

The receiving-side partner must also provide equivalent information for the payee.

---

## 1.10 Sanctions Screening

### 1.10.1 Screening Obligations

SendBridge must screen all customers and recipients against applicable sanctions lists before providing any designated service and on an ongoing basis.

### 1.10.2 Sanctions Lists

SendBridge screens against the following lists:

| List | Source | Update Frequency |
|------|--------|-----------------|
| **DFAT Consolidated List** | Australian Department of Foreign Affairs and Trade — incorporates UN Security Council sanctions, Australian autonomous sanctions | Real-time (API) or at least daily |
| **UN Security Council Consolidated List** | United Nations — includes targeted financial sanctions related to terrorism and WMD proliferation | Daily |
| **OFAC SDN List** | US Treasury — Specially Designated Nationals | Daily (relevant because USD may be involved in Cambodia corridor settlements) |
| **EU Consolidated List** | European Union sanctions | Weekly |

The DFAT Consolidated List is the primary and mandatory list. Other lists are screened as supplementary measures appropriate to the corridors served.

### 1.10.3 Screening Process

1. **Customer onboarding:** All customers are screened before the first transaction is processed. Screening checks full name (including known aliases), date of birth, and nationality against all applicable lists.

2. **Recipient screening:** All recipients are screened before each transaction. Screening checks the recipient's full name against all applicable lists.

3. **Ongoing/batch screening:** The entire customer and recipient database is rescreened whenever sanctions lists are updated (at least daily for DFAT).

4. **Fuzzy matching:** Screening must employ fuzzy matching logic to account for name variations, transliterations (Thai and Khmer names may be transliterated differently into English), and common misspellings. Match threshold to be calibrated to minimize false negatives while managing false positives.

> **Transliteration note:** Thai and Khmer names are romanised using various systems, creating legitimate variations. For example, the Thai surname "สมชาย" may be transliterated as "Somchai," "Somchay," or "Somjai." The screening system must accommodate these variations.

### 1.10.4 Sanctions Hit Procedures

| Match Type | Action |
|------------|--------|
| **Confirmed true match** | Immediately freeze the transaction. Do not process. Do not tip off the customer. File an SMR with AUSTRAC within 24 hours. Report to DFAT. Seek legal advice. |
| **Possible match (requires investigation)** | Hold the transaction. Investigate within 24 hours. Collect additional identifying information to confirm or exclude the match. If confirmed, follow true match procedures. If excluded, document rationale and release. |
| **False positive** | Document the reason for exclusion. Release the transaction. No further action required. |

### 1.10.5 Sanctions Screening Records

All screening results must be retained, including: date of screening, lists screened, results (hits, possible matches, clear), investigation notes (for possible matches), and disposition. Records retained for 7 years.

---

## 1.11 Record Keeping

### 1.11.1 General Record-Keeping Obligations

SendBridge must make and retain records in accordance with the AML/CTF Act. Records must be:

- Stored securely (encrypted at rest and in transit)
- Accessible to AUSTRAC and law enforcement upon request
- Retained for the minimum periods specified below
- Stored in Australia or accessible from Australia

### 1.11.2 Record Retention Periods

See **Annex G** for the full retention schedule. Key periods:

| Record Type | Retention Period |
|-------------|-----------------|
| Customer identification records (KYC) | 7 years after the end of the customer relationship |
| Transaction records | 7 years after the transaction |
| IFTI/IVTS reports | 7 years after filing |
| SMRs and related investigation files | 7 years after filing |
| Sanctions screening results | 7 years |
| ECDD records | 7 years after the end of the customer relationship |
| Training records | 7 years |
| AML/CTF program versions | 7 years after superseded |
| Correspondence with AUSTRAC | 7 years |

---

## 1.12 Correspondent and Partner Due Diligence

### 1.12.1 Receiving-Side Partner Due Diligence

Before engaging any receiving-side partner (and annually thereafter), SendBridge must conduct due diligence including:

- **Licensing and registration:** Verify the partner holds appropriate licenses or registrations in their jurisdiction (e.g., Bank of Thailand license, NBC license in Cambodia)
- **AML/CTF compliance:** Obtain evidence that the partner has an AML/CTF program in place and is subject to regulatory supervision
- **Sanctions screening:** Screen the partner entity and its key personnel against DFAT and other relevant sanctions lists
- **Beneficial ownership:** Identify the beneficial owners of the partner entity
- **Adverse media:** Search for adverse media relating to the partner
- **Operational due diligence:** Assess the partner's operational capabilities, technology systems, and financial stability
- **Contractual requirements:** Ensure the partner agreement includes clauses requiring compliance with applicable AML/CTF laws, sanctions requirements, and cooperation with investigations

### 1.12.2 Ongoing Partner Monitoring

- Review partner due diligence at least annually
- Monitor for changes in the partner's regulatory status, ownership, or adverse media
- Conduct periodic reviews of transaction patterns with each partner
- Ensure partners are meeting their contractual AML/CTF obligations

### 1.12.3 Shell Bank Prohibition

SendBridge must not establish or maintain a relationship with a shell bank (a bank that has no physical presence in the jurisdiction where it is incorporated and is not an affiliate of a regulated financial group).

---

## 1.13 Program Review and Updates

### 1.13.1 Regular Reviews

This AML/CTF program must be reviewed at least annually by the Compliance Officer and approved by the board. The review must assess:

- Whether the ML/TF/PF risk assessment remains current
- Whether controls are operating effectively
- Transaction monitoring rule effectiveness (false positive rates, detection rates)
- Training program adequacy
- Reporting compliance (timeliness and completeness of IFTIs/IVTS, SMRs)
- Regulatory changes (AUSTRAC guidance, legislative amendments, FATF evaluations)
- Significant incidents and lessons learned

### 1.13.2 Triggered Reviews

In addition to the annual review, this program must be updated when:

- There is a material change to the business (new corridors, new services, new delivery channels)
- AUSTRAC publishes relevant guidance or feedback
- A significant compliance incident occurs
- There is a change in the ML/TF risk environment (e.g., FATF grey-lists a corridor country)
- There is a change in senior management or the Compliance Officer
- Regulatory reforms take effect (e.g., the 31 March 2026 AML/CTF reforms)

### 1.13.3 Independent Review

SendBridge should engage an independent AML/CTF compliance consultant to review this program at least every 2 years (or more frequently in the early stages of operation). The independent review should assess the adequacy and effectiveness of the program and provide recommendations.

---

# Part B: Customer Identification Procedures (KYC)

## 2.1 Customer Identification Framework

### 2.1.1 Principles

SendBridge's customer identification procedures are risk-based. The level of identification and verification required depends on the assessed ML/TF risk of the customer relationship.

All customers must be identified and verified before SendBridge processes their first transaction. SendBridge will not process any transaction for a customer whose identity has not been satisfactorily verified.

### 2.1.2 Applicable Customer Identification Procedure (ACIP)

SendBridge's applicable customer identification procedure is the **safe harbour** procedure for medium and low-risk individual customers, as permitted under the AML/CTF Rules. This procedure requires verification of the customer's full name plus either their date of birth or residential address, using reliable and independent documents or electronic data.

For high-risk customers, enhanced identification procedures apply (see Section 2.2.3).

---

## 2.2 Individual Customer Identification

### 2.2.1 Information to Collect

For every individual customer, SendBridge must collect:

| Information | Required | How Collected |
|-------------|----------|---------------|
| **Full name** (all given names and family name) | Mandatory | Registration form + ID document |
| **Date of birth** | Mandatory | Registration form + ID document |
| **Residential address** | Mandatory | Registration form (verified electronically or via ID document) |
| **Nationality/citizenship** | Required | Registration form + ID document |
| **Occupation** | Required | Registration form |
| **Email address** | Required | Registration form (verified via confirmation email) |
| **Mobile phone number** | Required (Australian number) | Registration form (verified via SMS OTP) |
| **Source of funds** (general) | Required | Registration form (dropdown: employment, savings, pension, business income, other) |
| **Purpose of remittance** (general) | Required | Registration form (dropdown: family support, education, healthcare, property, other) |

### 2.2.2 Identity Verification — Standard (Safe Harbour)

For medium and low-risk customers, SendBridge uses the safe harbour verification procedure:

**Option A: Electronic verification (primary method)**

SendBridge uses an electronic identity verification service (Onfido, Sumsub, or GreenID) to verify the customer's identity against at least **two independent electronic data sources**. This includes:

- Government document databases (e.g., Document Verification Service — DVS)
- Credit reporting agency data
- Electoral roll records
- Other reliable electronic data sources

The electronic verification must confirm at minimum:
- Full name matches across at least two sources
- Date of birth matches
- Current residential address matches (or evidence of prior address)

**Option B: Document-based verification (fallback)**

If electronic verification is inconclusive, the customer must provide:

*Primary photographic ID (one of):*
- Australian passport (current, or expired within 2 years)
- Australian driver licence or learner permit (current)
- Foreign passport (current, or expired within 2 years)
- ImmiCard (current)
- National identity card (foreign, current)

*Plus one secondary document (if primary ID alone is insufficient):*
- Australian Medicare card
- Australian birth certificate or citizenship certificate
- Foreign birth certificate
- Australian government benefit card (Centrelink)
- Utility bill or bank statement (issued within past 3 months, showing name and address)

For non-face-to-face verification, documents must be submitted as high-quality photographs or scans via the app, supplemented by a **liveness check** (live selfie or video capture matched against the photo ID) to mitigate identity fraud risk.

### 2.2.3 Identity Verification — Enhanced (High-Risk Customers)

For customers assessed as high risk, or those requesting Enhanced tier transaction limits, the following additional verification is required:

- Complete the standard verification procedure (above), **plus:**
- Provide **two** primary identity documents (not one)
- Complete a **video verification** call with a SendBridge representative
- Provide evidence of **source of funds** (bank statements, payslips, tax assessment notice, or other documentation)
- Provide evidence of **source of wealth** (if transaction volumes are inconsistent with stated occupation)
- Submit to **adverse media screening**
- Receive **Compliance Officer approval** before the customer account is activated or limits are increased

### 2.2.4 Special Considerations for Non-English Documents

Many SendBridge customers will hold identity documents from Thailand or Cambodia. The following procedures apply:

- Thai and Cambodian national identity cards and passports are accepted as primary photographic identification
- Where the document is in Thai or Khmer script only, SendBridge's electronic verification provider must be capable of reading and extracting data from these documents, **or** the customer must also provide an English-language document (e.g., passport biographical page in English)
- Name transliteration variations are expected and must be handled by the verification system with appropriate fuzzy matching
- Where there is a significant discrepancy between the name on the Thai/Khmer document and the name provided in the registration form, the customer must provide an explanation (e.g., different romanisation system, name change)

---

## 2.3 Non-Individual Customer Identification

SendBridge's initial service is targeted at individual retail customers. However, if non-individual customers (companies, trusts, associations) are onboarded in future:

- Full company name and ABN/ACN (or equivalent foreign registration)
- Registered and principal business address
- Director and officeholder details
- Beneficial ownership identification (see Section 2.4)
- Verification via ASIC records, company registration documents, trust deeds, or equivalent foreign registrations
- Enhanced CDD is required for all non-individual customers

> **Phase 1 scope:** SendBridge will only accept individual customers. Non-individual customer procedures will be developed before any business customers are onboarded.

---

## 2.4 Beneficial Ownership

### 2.4.1 Individual Customers

For individual customers, the customer and the beneficial owner are presumed to be the same person, unless there are indicators that the customer may be acting on behalf of another person.

**Indicators that a customer may not be the beneficial owner:**
- The customer appears to be directed by another person
- Funds are being sent to recipients that the customer cannot adequately explain
- The customer cannot answer basic questions about the transaction or recipient
- Third-party payment (funds received from a bank account not in the customer's name)

If such indicators are present, SendBridge must investigate and identify the true beneficial owner. Third-party payments are not permitted under SendBridge's policies — all funds must originate from the verified customer's own bank account.

### 2.4.2 Non-Individual Customers (Future)

When non-individual customers are onboarded, beneficial owners must be identified and verified. A beneficial owner is any individual who:
- Holds 25% or more of the entity's ownership interest; **or**
- Exercises significant control or influence over the entity

---

## 2.5 Politically Exposed Persons (PEPs)

### 2.5.1 Definition

A Politically Exposed Person is an individual who holds or has held a prominent public position, including (but not limited to):

- Head of state or government
- Government minister or equivalent
- Senior government official
- Senior judicial officer
- Senior military officer
- Senior executive of a state-owned enterprise
- Senior official of an international organisation
- Senior political party official

This extends to the PEP's **family members** (spouse, children, parents, siblings) and **close associates** (business partners, advisors, close personal friends known to benefit from the relationship).

Foreign PEPs are always high risk. Domestic (Australian) PEPs require a risk-based assessment.

### 2.5.2 PEP Identification Procedures

- All customers are screened against PEP databases at onboarding and periodically thereafter (at least annually)
- PEP screening is performed by the electronic verification provider or a dedicated PEP screening service
- Given SendBridge's corridors to Thailand and Cambodia, screening must include Thai and Cambodian PEP data
- If a customer is identified as a PEP (or family member/associate of a PEP):
  - ECDD must be applied (see Section 1.8)
  - The Compliance Officer must approve the relationship before any transaction is processed
  - Ongoing enhanced monitoring must be applied for the duration of the relationship
  - Source of funds and source of wealth must be established and documented

---

## 2.6 Electronic Verification

### 2.6.1 Electronic Verification Provider

SendBridge uses [Onfido / Sumsub / GreenID — to be confirmed] as its primary electronic identity verification provider. The provider must:

- Be capable of verifying Australian identity documents (passports, driver licences, Medicare cards)
- Be capable of verifying Thai and Cambodian identity documents (passports, national ID cards)
- Provide liveness detection (anti-spoofing) for non-face-to-face verification
- Connect to at least two independent electronic data sources (DVS, credit bureau, electoral roll)
- Meet AUSTRAC's requirements for reliable and independent electronic data
- Provide audit trails of all verification attempts and results

### 2.6.2 Verification Failure Procedures

If electronic verification fails or is inconclusive:

1. **First attempt failure:** Allow the customer to re-submit documents. Provide guidance (in Thai, Khmer, and English) on document quality requirements.
2. **Second attempt failure:** Fall back to document-based verification with manual review.
3. **Persistent failure:** Escalate to the Compliance Officer. The customer may not transact until identity is satisfactorily verified. The Compliance Officer may request additional documents, a video call, or in-person verification.
4. **Suspected fraud:** If there are indicators of identity fraud (manipulated documents, mismatched liveness check), immediately block the account and file an SMR if warranted.

---

## 2.7 Ongoing Customer Due Diligence (OCDD)

### 2.7.1 Obligation

Customer identification is not a one-time event. SendBridge must maintain up-to-date information about its customers and monitor their activity on an ongoing basis.

### 2.7.2 OCDD Activities

| Activity | Frequency | Description |
|----------|-----------|-------------|
| **Transaction monitoring** | Continuous (automated) | See Section 1.7 — automated rules monitor every transaction |
| **Customer information review** | At least every 2 years, or triggered by events | Confirm customer details remain current (address, occupation, contact details) |
| **Re-verification** | Triggered | When identity documents expire, when there is a material change in the customer's circumstances, or when there are doubts about the accuracy of previously obtained information |
| **Risk re-assessment** | Triggered | When transaction patterns change significantly, when ECDD identifies new risk factors, or when external information changes (e.g., customer appears on adverse media) |
| **Sanctions rescreening** | At least daily (batch) | All customers rescreened when sanctions lists update |
| **PEP rescreening** | At least annually | All customers rescreened against PEP databases |

### 2.7.3 Trigger Events for Re-Verification

- Customer requests a change to their personal details (name, address, bank account)
- Customer's ID document expires
- Customer's transaction patterns change significantly
- Customer has been inactive for 12+ months and resumes activity
- Transaction monitoring generates an unresolved alert
- New adverse information about the customer becomes available
- A request is received from AUSTRAC or law enforcement

---

## 2.8 Reliance on Third Parties

### 2.8.1 Reliance Framework

SendBridge may rely on its electronic identity verification provider to perform customer identification procedures on its behalf. However, SendBridge remains ultimately liable for compliance with KYC obligations, even when relying on a third party.

### 2.8.2 Conditions for Reliance

SendBridge may only rely on a third party for KYC if:

- The third party is subject to AML/CTF regulation in Australia or an equivalent jurisdiction
- SendBridge has entered into a written agreement (CDD arrangement) with the third party specifying the procedures to be performed
- SendBridge has assessed that the third party's AML/CTF systems are adequate
- The third party will provide verification data to SendBridge without delay upon request
- SendBridge periodically reviews the third party's compliance with the CDD arrangement

### 2.8.3 Safe Harbour for Third-Party Reliance

If SendBridge has a CDD arrangement in place that meets the requirements of the AML/CTF Act and Rules, SendBridge benefits from safe harbour protection for isolated or occasional breaches of the identification procedures by the third party. Safe harbour does not apply to systemic failures.

---

# Annexes

## Annex A: ML/TF Risk Assessment Matrix

| Risk Factor | Indicators | Inherent Risk | Controls | Residual Risk |
|-------------|-----------|---------------|----------|---------------|
| **Customer: Individual retail remitter** | Diaspora community, personal remittances, small amounts, recurring pattern | Low-Medium | Standard KYC, electronic verification, liveness check | Low |
| **Customer: New customer (first 90 days)** | Unknown transaction history, unestablished pattern | Medium | Reduced transaction limits ($2,000/tx, $5,000/month), enhanced monitoring, new customer alerts | Low-Medium |
| **Customer: High-value remitter** | Monthly volumes >$10,000, large individual transactions | Medium-High | ECDD, source of funds verification, Compliance Officer approval, enhanced monitoring | Medium |
| **Customer: Potential scam victim** | Elderly customer, romance scam indicators, urgency, secrecy, inconsistent story | High | Transaction monitoring (behavioural rules), customer support intervention in Thai/Khmer, mandatory cooling-off for first large transaction to new recipient | Medium |
| **Customer: Potential money mule** | Young customer, recently recruited, sends to unfamiliar recipients, inconsistent story | High | Multiple-recipient alerts, profile inconsistency alerts, ECDD, possible SMR | Medium |
| **Service: Outbound AUD→THB remittance** | Standard personal remittance corridor | Medium | IFTI/IVTS reporting, transaction monitoring, sanctions screening | Low-Medium |
| **Service: Outbound AUD→KHR remittance** | Cambodia governance challenges, scam compound prevalence | Medium-High | IFTI/IVTS reporting, enhanced monitoring for Cambodia, sanctions screening, Bakong traceability | Medium |
| **Channel: Mobile app (non-face-to-face)** | No in-person verification, identity fraud risk | Medium | Electronic identity verification, liveness detection, biometric login, device fingerprinting | Low |
| **Geographic: Thailand** | FATF enhanced follow-up, drug trafficking corridor | Medium | Partner due diligence, sanctions screening, PromptPay regulated delivery | Low-Medium |
| **Geographic: Cambodia** | Corruption, scam compounds, weak governance | Medium-High | Partner due diligence, sanctions screening, Bakong (NBC-supervised) delivery, ECDD for larger transfers | Medium |
| **Structuring** | Customer splits transactions to avoid thresholds | Medium-High | Cumulative threshold monitoring, just-below-threshold alerts, pattern analysis | Low-Medium |
| **Third-party transfers** | Funds sent on behalf of another person | High | Policy: third-party payments prohibited. Bank account must match verified customer name | Low |
| **PEPs** | Politically exposed persons in Thailand or Cambodia | High | PEP screening at onboarding + annually, ECDD, Compliance Officer approval, enhanced monitoring | Medium |

---

## Annex B: Corridor Risk Profiles — Thailand and Cambodia

### Thailand (AUD → THB)

| Factor | Assessment |
|--------|-----------|
| **FATF status** | APG member; 33/40 Recommendations Compliant/Largely Compliant; enhanced follow-up; NOT on grey list |
| **AML/CTF regulator** | Anti-Money Laundering Office (AMLO) |
| **Key ML risks** | Methamphetamine trafficking, human trafficking, online gambling, corruption, tax evasion |
| **Key TF risks** | Low — isolated incidents in southern provinces |
| **Sanctions status** | Not subject to DFAT, UN, or OFAC country-wide sanctions |
| **Receiving-side infrastructure** | PromptPay — regulated instant payment system under Bank of Thailand oversight; bank-to-bank transfers fully traceable |
| **Corridor risk assessment** | MEDIUM — standard diaspora remittance corridor with regulated receiving-side infrastructure |

### Cambodia (AUD → KHR)

| Factor | Assessment |
|--------|-----------|
| **FATF status** | APG member; 33/40 Recommendations Compliant/Largely Compliant; previously grey-listed (now removed); follow-up in progress |
| **AML/CTF regulator** | Cambodia Financial Intelligence Unit (CAFIU), National Bank of Cambodia (NBC) |
| **Key ML risks** | Corruption (endemic), casino-related laundering, real estate, online scam compounds, drug trafficking, illegal logging |
| **Key TF risks** | Low |
| **Sanctions status** | Not subject to DFAT, UN, or OFAC country-wide sanctions |
| **Receiving-side infrastructure** | Bakong — NBC's digital payment system; 608M transactions / $104.81B in 2024; licensed commercial banks (ABA Bank, ACLEDA, Wing) |
| **Corridor risk assessment** | MEDIUM-HIGH — diaspora remittance corridor with elevated governance risks, but Bakong provides centrally supervised, traceable delivery |
| **Additional controls** | ECDD triggered for single transactions > AUD $3,000 to Cambodia; enhanced monitoring for recipients in provinces associated with scam operations |

---

## Annex C: Suspicious Matter Indicators

The following are indicators of suspicious activity relevant to remittance services. This list is not exhaustive — staff must use professional judgment and escalate any activity that causes concern.

### Identity and Onboarding

- Customer provides identity documents that appear altered, forged, or inconsistent
- Customer is reluctant to provide required identification information
- Customer's photo does not match the person completing the liveness check
- Customer opens multiple accounts using different identities
- Customer uses identification documents from a third country (not Australia, Thailand, or Cambodia) without a clear explanation

### Transaction Patterns

- Transactions that are inconsistent with the customer's declared occupation, income, or financial profile
- Sudden and unexplained increase in transaction frequency or value
- Multiple transactions just below reporting thresholds (structuring)
- Transactions with no apparent economic, personal, or lawful purpose
- Customer sends money to multiple unrelated recipients in quick succession
- Customer receives instructions from a third party about who to send money to, or how much to send
- Customer appears nervous, confused, or under duress during the transaction process
- Customer sends money immediately after receiving it from an unknown source

### Fraud and Scam Indicators

- Customer mentions a romantic partner they have never met in person
- Customer mentions an "investment opportunity" requiring urgent transfers
- Customer mentions being asked to receive and forward money
- Customer mentions lottery winnings, prize claims, or inheritance from overseas
- Customer mentions being directed to use a specific remittance service by a third party
- Elderly customer with no prior remittance history suddenly making large transfers
- Customer is being coached or accompanied (remotely) by another person during the transaction

### Cambodia-Specific Indicators

- Transfers to recipients in provinces known for scam compound operations (e.g., Sihanoukville/Preah Sihanouk, Koh Kong, Poipet)
- Customer claims they are sending money to "help" someone leave a difficult work situation in Cambodia (may indicate human trafficking or forced labour in scam compounds)
- Unusually large or frequent transfers to Cambodia that do not match the customer's established pattern

### Terrorism Financing Indicators

- Customer or recipient matches or closely resembles a name on a sanctions or watch list
- Transfers to regions associated with terrorist activity
- Customer makes transfers immediately following a significant security event
- Customer expresses extremist sympathies during customer support interactions
- Transfers to organisations that may be fronts for terrorist financing

---

## Annex D: Transaction Limits and Velocity Controls

### Customer Tier Limits

| Tier | Per Transaction | Daily | Weekly | Monthly | Qualification |
|------|----------------|-------|--------|---------|--------------|
| **Standard** | AUD $2,000 | AUD $2,000 | AUD $5,000 | AUD $5,000 | Standard KYC completed; applies to all new customers for first 90 days |
| **Verified** | AUD $5,000 | AUD $5,000 | AUD $10,000 | AUD $15,000 | 90+ days account age, minimum 3 successful transactions, no compliance alerts, KYC documents current |
| **Enhanced** | AUD $10,000 | AUD $10,000 | AUD $20,000 | AUD $30,000 | ECDD completed (enhanced ID, source of funds, Compliance Officer approval) |

### Velocity Controls

| Control | Trigger | Action |
|---------|---------|--------|
| Maximum transactions per day | > 3 transactions in 24 hours | Block further transactions; alert generated |
| Maximum unique recipients per month | > 5 new recipients in 30 days | Block new recipients; alert generated |
| Cumulative daily threshold | > AUD $5,000 in 24 hours (any tier) | Alert generated; Compliance review required |
| First-time large transfer | First transfer to a new recipient > AUD $3,000 | Hold for manual review (during business hours) |
| Cambodia corridor threshold | Any single transfer > AUD $3,000 to Cambodia | ECDD trigger |

### Limit Adjustments

- Limits may be **reduced** for any customer at the Compliance Officer's discretion based on risk assessment
- Limits may only be **increased** with documented ECDD and Compliance Officer approval
- Temporary limit increases for specific occasions (e.g., Songkran) require documented justification and enhanced monitoring

---

## Annex E: AUSTRAC Reporting Quick Reference

| Report | When | Deadline | How |
|--------|------|----------|-----|
| **IFTI-DRA** (or IVTS from 31/3/2026) | Every international transfer, regardless of amount | 10 business days after sending the transfer instruction | AUSTRAC Online |
| **TTR** | Physical currency transactions ≥ AUD $10,000 | 10 business days | AUSTRAC Online |
| **SMR** (terrorism-related) | Suspicion of terrorism financing | Within **24 hours** of forming the suspicion | AUSTRAC Online |
| **SMR** (all other) | Suspicion of ML or other criminal activity | Within **3 business days** of forming the suspicion | AUSTRAC Online |
| **Compliance Report** | When required by AUSTRAC | As specified in the request | AUSTRAC Online |
| **Section 49 response** | AUSTRAC request for additional information | As specified in the notice (typically 14 days) | As directed |

**Critical reminders:**
- IFTIs must be filed for **every** international transfer, even for small amounts
- If bundling customer funds for settlement, each customer transfer is a **separate** IFTI
- The tipping-off offence applies to SMRs — never disclose to the customer
- Late or missing IFTI reports can attract penalties up to 100,000 penalty units (body corporate)

---

## Annex F: Sanctions Lists and Screening Procedures

### Required Sanctions Lists

| List | Source URL | Update Frequency | Primary/Supplementary |
|------|-----------|------------------|-----------------------|
| **DFAT Consolidated List** | dfat.gov.au/international-relations/security/sanctions/consolidated-list | Real-time or daily | **Primary (mandatory)** |
| **UN Security Council Consolidated List** | scsanctions.un.org | Daily | Primary |
| **OFAC SDN List** | ofac.treasury.gov | Daily | Supplementary (USD exposure) |

### Screening Workflow

```
Customer Onboarding:
  1. Collect customer details (full name, DOB, nationality, aliases)
  2. Screen against all lists (automated, fuzzy matching enabled)
  3. If NO hit → proceed to identity verification
  4. If POSSIBLE hit → hold onboarding, investigate (24hr SLA)
  5. If CONFIRMED hit → reject onboarding, file SMR, notify DFAT

Each Transaction:
  1. Screen recipient details (full name, country)
  2. If NO hit → proceed to processing
  3. If POSSIBLE hit → hold transaction, investigate (24hr SLA)
  4. If CONFIRMED hit → block transaction, file SMR, notify DFAT

Ongoing (daily batch):
  1. Rescreen all customers and stored recipients against updated lists
  2. Investigate any new hits generated by list updates
```

### Transliteration Handling

Thai and Khmer names must be screened using multiple romanisation variants. The screening system should:
- Generate common transliteration alternatives automatically
- Apply phonetic matching algorithms
- Set match thresholds appropriate to the transliteration challenge (lower threshold = more false positives but fewer false negatives)
- Document and retain all transliteration decisions

---

## Annex G: Record Retention Schedule

| Record Category | Specific Records | Retention Period | Start Date |
|----------------|-----------------|------------------|------------|
| **Customer identification** | KYC documents, verification results, risk assessments, ECDD records | 7 years | End of customer relationship |
| **Transaction records** | Transfer details, amounts, dates, recipients, FX rates, fees | 7 years | Date of transaction |
| **Regulatory reports** | IFTIs/IVTS, TTRs, SMRs, compliance reports | 7 years | Date of filing |
| **Sanctions screening** | Screening results, investigation records, false positive documentation | 7 years | Date of screening |
| **AML/CTF program** | All versions of this program, risk assessments, board approvals | 7 years | Date superseded |
| **Training records** | Attendance, materials, assessments, certifications | 7 years | Date of training |
| **Employee due diligence** | Police checks, reference checks, declarations | 7 years | End of employment |
| **Partner due diligence** | Licensing verification, AML/CTF assessments, contracts, ongoing reviews | 7 years | End of partner relationship |
| **Complaints and incidents** | Customer complaints related to AML/CTF, compliance incidents, investigation files | 7 years | Date of resolution |
| **Correspondence** | AUSTRAC communications, Section 49 responses, law enforcement requests | 7 years | Date of correspondence |

---

## Document Control

| Version | Date | Author | Changes | Approved By |
|---------|------|--------|---------|-------------|
| 1.0 | [Date] | [Name] | Initial program | [Director name] |

---

*This document is confidential and intended for internal use by SendBridge Pty Ltd only. It must not be disclosed to customers, third parties (other than AUSTRAC, law enforcement, or engaged compliance consultants), or the public.*

*This AML/CTF program has been prepared as a comprehensive draft based on the AML/CTF Act 2006, AML/CTF Rules, AUSTRAC guidance for remittance service providers, and the amended AML/CTF Act taking effect 31 March 2026. It should be reviewed by a qualified AML/CTF compliance consultant before finalisation and submission to AUSTRAC.*
