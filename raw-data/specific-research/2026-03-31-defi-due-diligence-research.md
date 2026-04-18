# DeFi Due Diligence Research

Status: Complete (12/12 questions answered)
Date: 2026-03-31

## Key Takeaways

### 1. Due Diligence Is a Layered Problem

Risk decomposes into multiplicative layers (not additive):

- **Chain risk** (L2 maturity, exit windows, data availability)
- **Protocol risk** (audits, governance, code maturity, admin controls)
- **Asset risk** (peg stability, backing, tokenomics)
- **Pool/strategy risk** (yield sustainability, concentration, utilization)

Exponential.fi's framework (which powers DeFi Llama) compounds these — a protocol can score A on chain risk and F on asset risk, and the F dominates. This matches how users actually lose money.

### 2. No Universal Risk Standard Exists

Every curator, platform, and aggregator invents its own:

- Exponential: A-F letter grades
- Galaxy SeC FiT PrO: 16-100 numerical
- Block Analitica: 0-100 Market Risk Score
- Vaults.fyi: "Reputation Score" (deliberately not called "risk")
- Yearn: 8-dimension 1-5 scoring
- DeFi Safety: percentage-based process quality

No Moody's/S&P equivalent. An arXiv paper notes DeFi "needs AAA/BBB ratings with hard rules."

### 3. The Information Asymmetry Problem Is Acute

- Professional investors spend 7-8 hours evaluating a SINGLE protocol
- Retail/agents decide based on APY dashboards that present wildly different risk profiles identically
- "DYOR" functions as liability transfer, not empowerment
- Dashboards vary from raw data (DefiLlama) to reputation scores (vaults.fyi) — most portfolio trackers (Zerion, Zapper) surface ZERO risk data

### 4. What Users Actually Want to Know (and Can't Find)

From post-incident analysis and community discussions:

1. **Where does the yield come from?** Organic (fees, interest) vs. incentivized (token emissions). Real Yield = Revenue - Emissions
2. **What happens when I try to exit?** Liquidity conditions, utilization zones (<45% cold, 45-80% optimal, 80-90% elevated, >90% critical)
3. **How does this behave under stress?** No standard stress testing exists
4. **Who is the counterparty chain?** Curator → adapter → protocol → oracle → custodian
5. **What changed since I deposited?** Curator decisions, new collateral, parameter changes

### 5. Yield Sustainability Has Quantifiable Signals

- **Real Yield**: protocol revenue minus token emissions
- **Utilization zones**: market average 56.8%; >90% = withdrawal risk
- **TVL behavior after incentive reduction**: sharp drops = mercenary capital
- **APY ranges by risk tier**: Lending 2-6%, LP Optimization 4-10%, Structured 6-12%, Aggressive 15-50%+

### 6. Failure Post-Mortems Reveal Three Patterns

1. **Warning info existed but was drowned by narrative** (UST/Anchor — 75% of UST in Anchor, yield reserve depleting, multiple analysts warned publicly)
2. **Flaw too technical for users to assess** (Euler — missing single invariant check, added post-main-audit)
3. **Off-chain risk invisible to depositors** (Resolv — 18 audits but single AWS key could mint unlimited tokens)

### 7. TradFi Concepts That Translate

| TradFi | DeFi Equivalent | Status |
|--------|----------------|--------|
| Credit ratings | Exponential A-F, Credora | Fragmented, no standard |
| LTV/collateral ratios | On-chain LTV | Well established |
| Utilization rates | Pool utilization | Well established |
| Duration/convexity | Withdrawal timeframes, delayed exits | Underdeveloped |
| Counterparty assessment | Curator/oracle/adapter chain | Mostly invisible |
| Stress testing (Basel III) | No equivalent | Missing |
| Legal recourse/bankruptcy | No equivalent | Missing |
| Standardized reporting (GAAP) | On-chain data but no standard format | Missing |

---

## Detailed Findings

### Q1: DeFi Risk Assessment Frameworks

**Sources:**

- Exponential DeFi Whitepaper (exponential.fi/whitepaper)
- Galaxy SeC FiT PrO Framework (galaxy.com)
- EEA DeFi Risk Assessment Guidelines v1 (entethalliance.org)
- L2BEAT Risk Analysis (l2beat.com)
- Yearn Risk Score Framework (docs.yearn.fi)

**Major frameworks:**

| Framework | Score Type | Coverage | Categories |
|-----------|----------|----------|------------|
| Exponential.fi | A-F letters | 210+ protocols, powers DeFi Llama | Chain, Protocol, Asset, Pool |
| Galaxy SeC FiT PrO | 16-100 numeric | Institutional | Security (20%), Compliance (15%), Finance (15%), Tech (20%), Protocol (15%), Operations (15%) |
| EEA DRAMA Guidelines | Taxonomy (no score) | Industry standard | Software, Governance, Compliance, Market, Liquidity |
| L2BEAT | Stage 0-2 | L2 rollups | State Validation, DA, Exit Window, Sequencer, Proposer |
| Yearn | 1-5 per dimension | Internal strategies | Review, Testing, Complexity, Risk Exposure, Centralization, Protocol Integration, Ext. Audit, Ext. Centralization |
| DeFi Safety | Percentage | 340+ protocols | Documentation, Testing, Audit, Process quality |
| Block Analitica | 0-100 numeric | Morpho markets | Market Risk (LGD), Liquidity Risk (HHI) |

Exponential backtested: A-rated protocols had zero defaults; F-rated had ~80% default rate.

### Q2: Institutional DeFi Due Diligence

**Sources:**

- Stripe stablecoin yield guide
- DAO Treasury Management Framework
- Kiln OmniVault ($600M+ TVL)
- Galaxy SeC FiT PrO

**Institutional checklist:**

1. Understand the stablecoin/asset itself (audit frequency, backing, issuer)
2. Assess counterparty/protocol risk (audits, governance, reserves)
3. Trace the yield source ("yields without transparency hide leverage or subsidies")
4. Check regulatory/legal exposure
5. Plan custody and operations
6. Start small, then scale

**DAO allocation template:** 40-60% T-bills, 20-30% stablecoins, 10-20% blue-chip crypto, <5% DeFi yield.

**Operational requirements:** Forta monitoring, segmented Safes, quarterly rebalancing, insurance (Nexus Mutual).

### Q3: Platform Risk Information Exposure

| Platform | What they show | What they DON'T show |
|----------|---------------|---------------------|
| Aave | Health Factor, LTV, liquidation thresholds, supply/borrow caps, E-Mode | Yield source breakdown, stress scenarios |
| Morpho | Isolated market LLTV, curator identity, vault-to-market mapping, supply caps | Curator track record, collateral liquidity depth |
| Yearn | 8-dimension risk score per strategy, protocol risk matrices | Real-time liquidity conditions |
| Ethena | Solvency ratio (101.11%), reserve fund ($62.5M), exchange positions, Chaos Labs PoR | Counterparty chain for exchange custody |
| Sommelier | Strategy provider, protocols used, fees, APY history, explicit risk warnings | Historical stress behavior |
| Pendle | Implied yield, yield curves, maturity dates, risk disclosures | Underlying protocol risk propagation |

**Ethena** has the most comprehensive transparency of any protocol studied.

### Q4: Risk Decomposition Categories

**Near-universal categories:**

- Smart Contract Risk (~70% of all DeFi losses)
- Oracle Risk
- Liquidity Risk
- Market/Price Risk
- Governance/Counterparty Risk

**Extended categories:**

- Regulatory/Compliance Risk
- Systemic/Contagion Risk
- Bridge Risk
- Custodial Risk
- Operational/User Error Risk

**Yield-specific categories:**

- Yield Sustainability (organic vs. incentivized)
- Impermanent Loss
- Liquidation Risk
- Redemption/Withdrawal Risk
- Concentration Risk

### Q5: Risk Curator Methodologies

| Curator | Method | AUM/TVL | Key Metric |
|---------|--------|---------|------------|
| Gauntlet | Monte Carlo agent-based simulations | $42B+ TVL, $1.88B managed | Stress scenarios (30s spikes to multi-day cascades) |
| Chaos Labs | GARCH models + Risk Oracles | Major protocols | Dynamic LTV/LT adjustment |
| Block Analitica | LGD formula + HHI | Morpho | Market Risk Score 0-100, published methodology |
| Steakhouse | TradFi-inspired structured disclosure | $1.26B managed | Balance sheet risk reporting |
| Re7 Capital | Proprietary blockchain analytics | $800M+ | Real-time anomaly detection |

**Critical finding:** Top 5 curators control ~43% of market. No universal standard — each uses proprietary labels ("Prime," "Core," "Aggressive") with no shared definitions.

**Curator risk itself:** During the Resolv hack, Gauntlet's automated bots continued allocating $6M+ into compromised vaults for hours. Curators earn fees on yield but bear no losses.

### Q6: Yield Sustainability Metrics

**Real Yield = Revenue - Emissions** (negative = unsustainable)

**Utilization zones:**

- <45%: Cold (excess supply, low yields)
- 45-80%: Optimal (balanced)
- 80-90%: Elevated (approaching rate kink)
- 90%+: Critical (withdrawal risk)

**Market average:** 56.8% across 53 tracked pools.

**Sustainability signals:**

- Rewards paid in established assets vs. native tokens only
- TVL behavior after incentive reduction (sharp drop = mercenary)
- Revenue-to-emission ratio trending
- Stablecoin pools: typically >65% utilization; alt-assets: <45%

### Q7: Aggregator/Dashboard Risk Presentation

| Platform | Risk Data Quality | What's Missing |
|----------|------------------|----------------|
| DefiLlama | Raw data (TVL, yields, hacks tracker) | No risk scores, no interpretation |
| Zapper | Portfolio tracking | Zero protocol risk data |
| Zerion | Token flags (honeypots, low liquidity) | No protocol-level risk |
| Vaults.fyi | Reputation Score (5 dimensions, weighted) | Admits it can't assess smart contract or governance risk |
| DeFi Safety | Process quality scores (up to 100%) | Limited to documentation/process quality |
| Exponential.fi | A-F comprehensive ratings, 1000+ risk vectors | Most complete but not universally adopted |

**Gap:** Portfolio trackers (where users spend most time) show ZERO risk data. Risk platforms exist separately.

### Q8: TradFi vs DeFi Due Diligence

**What translates:** Credit ratings, LTV, utilization, yield spread analysis, counterparty assessment.

**What's partially missing:** Duration/convexity analysis, standardized reporting (GAAP equivalent).

**What's fully missing:** Regulated clearinghouses (replaced by atomic settlement), stress testing standards (Basel III equivalent), standardized risk taxonomy, legal recourse/bankruptcy priority, fiduciary duty frameworks.

**DeFi-native risks with no TradFi parallel:** Smart contract exploits, oracle manipulation, governance attacks, composability chains, flash loan attacks.

**Convergence signal:** Tokenized T-bills ~4.7% vs DeFi lending ~4.8% — near-zero spread, but fundamentally different risk profiles.

### Q9: DAO Treasury Due Diligence

**Arbitrum:** $85M deployed via STEP program across Securitize BUIDL, Ondo USDY, Superstate USTB. Treasury Management Council with voting body + execution body + custodian. ~$581K annual overhead.

**MakerDAO:** $1.8B RWA portfolio via Steakhouse Financial. Collateral onboarding through governance with structured evaluation.

**Lido:** Three-step governance (forum → Snapshot → on-chain). Two-phase voting (72hr + 48hr objection). Emergency GateSeal mechanisms.

**Aave:** $107.1M treasury, "Aave Will Win" framework directing $78.85M annual revenue to DAO.

**Common pattern:** Single-protocol exposure limit 10-25%, segmented reserves (operating/strategic/yield), approved protocol whitelists.

### Q10: Fund Due Diligence Processes

**Publicly documented:** Deal structuring (a16z token launch playbook), regulatory engagement (Paradigm policy anchors), standardized frameworks (EY six-pillar token DD).

**What's proprietary:** Actual protocol-level technical evaluation, portfolio allocation models, risk scoring.

**EY framework pillars:** Reputational, Technical, Financial, Legal/Compliance, Cybersecurity, Auditability.

### Q11: What Users Wish They Knew

1. **Where yield comes from** (organic vs. subsidized)
2. **Exit liquidity conditions** (dozens of Morpho vaults hit 100% utilization in 2025-2026)
3. **Stress behavior** (Gauntlet bots continued allocating into compromised Resolv vaults)
4. **Counterparty chain** (curator → adapter → protocol → oracle)
5. **What changed since deposit** (curator decisions, new collateral additions)

**Warning fatigue:** Users encounter so many minor warnings they're desensitized to catastrophic ones.

**Information asymmetry:** 7-8 hours to properly evaluate a protocol vs. minutes most users spend.

### Q12: What Would Have Prevented Failures

**UST/Anchor:** Warning signals were PUBLIC — 75% of UST in Anchor, yield reserve depleting (two emergency injections: $70M + $450M), circular demand, prior algo-stablecoin failures with identical mechanisms.

**Euler:** Single missing invariant check (checkLiquidity) in donateToReserves(), added post-main-audit. A standardized "invariant coverage" report would have surfaced this.

**Resolv:** 18 audits but single AWS key could mint unlimited USR. On-chain audits don't cover off-chain operational security.

**Pattern:** Risk info is either (a) drowned by promotional narrative, (b) too technically obscure to assess, or (c) invisible because it's about undisclosed off-chain infrastructure.

---

## Source Index

| # | Source | Type | Questions |
|---|--------|------|-----------|
| 1 | Exponential.fi Whitepaper | Primary | Q1, Q4, Q7 |
| 2 | Galaxy SeC FiT PrO | Research report | Q1, Q2, Q7 |
| 3 | EEA DeFi Risk Guidelines v1 | Industry standard | Q1, Q4 |
| 4 | L2BEAT | Platform | Q1 |
| 5 | Yearn Risk Docs | Documentation | Q1, Q3, Q4 |
| 6 | Stripe Stablecoin Yield Guide | Institutional | Q2 |
| 7 | DAO Treasury Management Framework | Framework | Q2, Q9 |
| 8 | Kiln OmniVault | Platform | Q2 |
| 9 | Aave Docs | Documentation | Q3 |
| 10 | Morpho Blog | Platform | Q3 |
| 11 | Ethena Dashboards | Platform | Q3 |
| 12 | Sommelier App | Platform | Q3 |
| 13 | Pendle Tutorial | Platform | Q3 |
| 14 | Chaos Labs | Curator | Q3, Q5 |
| 15 | Gauntlet/Hypernest | Curator | Q5 |
| 16 | Block Analitica Sphere | Curator methodology | Q5 |
| 17 | Steakhouse Financial | Curator framework | Q5, Q9 |
| 18 | Re7 Capital | Curator | Q5 |
| 19 | arXiv - Institutionalizing risk curation | Academic | Q5, Q8 |
| 20 | Hexn Real Yield Guide | Analysis | Q6 |
| 21 | DeFiStar Utilization | Data | Q6 |
| 22 | Summer.fi Yield Landscape | Platform | Q6 |
| 23 | Vaults.fyi Reputation Score | Methodology | Q7 |
| 24 | DeFi Safety | Platform | Q7 |
| 25 | Wharton DeFi vs TradFi | Academic | Q8 |
| 26 | StableWatch Private Credit | Research | Q8 |
| 27 | Arbitrum STEP/TMC | Governance | Q9 |
| 28 | Lido Governance | Governance | Q9 |
| 29 | a16z Token Launch Playbook | Fund DD | Q10 |
| 30 | EY Token DD Framework | Framework | Q10 |
| 31 | Information Asymmetry Analysis | Community | Q11 |
| 32 | Aave $50M Slippage Post-Mortem | Incident | Q11 |
| 33 | Resolv Hack - Chainalysis | Post-mortem | Q11, Q12 |
| 34 | UST/Anchor Collapse Analysis | Post-mortem | Q12 |
| 35 | Euler Hack Analysis | Post-mortem | Q12 |
