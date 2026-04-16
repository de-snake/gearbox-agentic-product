# Gearbox Consumer Information System — Discovery

**Status:** Phases 1-4 complete. Discovery finished and handed off to shaping. The shaping doc is not included in this share repo.
**Related:** Working demo (MCP server + SDK integration) is not included in this share repo. This spec defines the full system; the demo was the Phase 1 proof-of-concept.
**Date:** 2026-03-31

---

## Source Material

- post.drawio (2026-03-27) — API architecture sketch (api.gearbox.finance)
- CEO Plan: Credit Account as Agent OS (2026-03-26)
- Phase 1 agent demo: 11/11 lifecycle tests passing, three-tier error model implemented
- Product interview with Ilya (2026-03-31)
- Due diligence research: 12 questions, 35 sources (2026-03-31) — see ../raw-data/specific-research/2026-03-31-defi-due-diligence-research.md

---

## Users

| Type | Description | Trigger |
|------|-------------|---------|
| **Passive LP** | Has capital (stablecoins, ETH, blue chips). Wants safe, stable returns. Deposits and sits. Minimal active management. | Has tokens earning nothing or deployed elsewhere (Morpho, Aave, etc.). Shopping for better risk/return. |
| **Leverage User** | Has capital. Targets higher returns via yield farming strategies. Ready for complexity and active management. | Same trigger — shopping. Willing to accept more risk/complexity for higher yield. |

**Shared trigger:** "I have tokens I want to grow. Can this place offer me a good risk/return tradeoff?"

**Scope:** Agent-first. Agents and UI users follow the same decision flow (filter → DD → deploy → monitor → manage → exit) but have different consumption patterns — agents need structured schemas, batch queries, and machine-readable data. UI adaptation is a follow-on task using the same underlying information architecture.

---

## JTBD Map

### Job 1: "Should I enter?" — Evaluate & Deploy

**When** I have tokens I want to grow,
**I want to** evaluate whether this opportunity's risk/return meets my criteria,
**so I can** deploy capital with confidence.

**The deposit action itself is trivial. The entire product challenge is the due diligence.**

#### Step 1: First-pass filtering

Agent applies quick filters to eliminate non-starters.

| Filter | Passive LP | Leverage User |
|--------|-----------|---------------|
| Yield floor | "Nothing under ~6% APY" | "Nothing under ~15% at my target leverage" |
| Size/capacity | "Pool must be >$10M" (concentration risk) | Less explicit, but leverage limits matter |
| Leverage ceiling | N/A | "I won't go above 5x" |
| First-pass risk | Curator reputation, collateral exposure | Curator, protocol issuer, adapters used |

**Data needed:** Yield (APY/APR), pool TVL, leverage range, curator name, asset list.

#### Step 2: Due diligence (the hard part)

The agent needs to answer 5 questions before deploying, in priority order (from failure analysis — security kills fastest, sustainability second, liquidity determines ability to act):

1. **Q2** — Risk of what Gearbox exposes you to (security)
2. **Q1** — Where does the yield come from (sustainability)
3. **Q3** — Can I exit when I need to (liquidity)
4. **Q4** — Who's in the counterparty chain
5. **Q5** — What could change after I deposit

Research shows professional investors spend 7-8 hours per protocol. The information system must make this data accessible programmatically so agents can evaluate efficiently.

**Q1: Where does the yield come from?**

The primary sustainability signal. Real Yield = Revenue - Emissions. If negative, the APY is subsidized by dilution.

| Signal | What to check | Data source |
|--------|--------------|-------------|
| Organic vs. incentivized | Revenue minus emission value | Protocol financials |
| Reward token type | Established assets vs. native tokens only | Token list |
| TVL behavior after incentive cuts | Sharp drop = mercenary capital | Historical TVL |
| APY range sanity | Lending 2-6%, LP 4-10%, Structured 6-12%, Aggressive 15-50%+ | Benchmark |

Yield must be broken down by source (a single APY number hides sustainability):

- **Base yield** — organic from borrower interest / protocol fees
- **Incentive yield** — token emissions (GEAR rewards, partner incentives)
- **Underlying protocol yield** — from collateral asset itself (staking, LP)
- **Net yield** — after Gearbox fees, borrow cost, gas

**Q2: What's the risk of what Gearbox exposes me to?**

This is NOT about checking Gearbox itself — the agent is already using Gearbox. It's about evaluating the collateral assets, adapters, and protocols Gearbox connects you to. Each layer can kill independently:

| Layer | What to evaluate | Key metrics | Programmatic data source |
|-------|-----------------|-------------|------------------------|
| Collateral asset | Peg stability, backing, issuer quality | Depeg history, backing ratio, mint/redeem mechanism | Credora A-D ratings (API), Exponential A-F (API), Chainlink Proof of Reserve (on-chain, free) |
| Collateral liquidity | Can this be liquidated without loss? | Swap slippage at liquidation size, DEX depth | 1inch Quote API: simulate $1M swap, check price impact (free) |
| Oracle | Is the price feed reliable? | Staleness, confidence interval, deviation | Chainlink `latestRoundData()` staleness check (on-chain, free), Pyth confidence intervals |
| Adapter/protocol | Are the protocols in the swap route sound? | Audit status, TVL, time live, incident history | DefiLlama API (free), DeFi Safety scores |
| Pool/Strategy | Concentration, utilization, parameters | TVL, utilization rate, quota limits | Gearbox SDK (on-chain) |
| Curator risk signals | Has the curator flagged concerns? | Recent parameter changes, cap reductions | Chaos Labs Risk Oracle (on-chain, free) |

Existing composite rating frameworks for reference:

- Exponential.fi: A-F grades (powers DeFi Llama). Backtested: A-rated = zero defaults; F-rated = ~80% default.
- Credora (by RedStone): A-D ratings with Probability of Default, available as on-chain risk oracle.
- No universal standard exists.

**Q3: Can I exit when I need to?**

| Condition | What it means |
|-----------|--------------|
| Utilization <45% | Cold — plenty of exit liquidity |
| Utilization 45-80% | Optimal — balanced |
| Utilization 80-90% | Elevated — approaching rate kink |
| Utilization >90% | Critical — withdrawal risk, rates spiking |
| Delayed withdrawal | No-loss exit but 7+ day wait |
| Collateral illiquid | Large price impact on exit swap |

Market average utilization: 56.8%. Stablecoin pools typically >65%.

**Historical data requirement:** 30 days minimum, 90 days ideal, daily granularity. Needed for yield stability assessment (Q1), volatility calculation (Q2), and utilization trend analysis (Q3). Same queries as real-time data, just at lower frequency.

**Q4: Who's in the counterparty chain?**

Every link is a trust point: Curator → Adapter → Underlying protocol → Oracle → Custodian.

Key concerns:

- Curator track record and incentive alignment (earn fees but bear no losses)
- Top 5 curators control ~43% of market
- No shared risk definitions — "Prime," "Core," "Aggressive" mean different things per curator
- During Resolv hack, Gauntlet's bots continued allocating $6M+ into compromised vaults

**Q5: What could change after I deposit?**

- Curator introduces new collateral (new risk LP didn't sign up for)
- Curator changes liquidation thresholds
- Market parameters adjusted
- Protocol incidents (hacks, depegs)
- Yield compression

This question connects Job 1 to Job 2 — the same data needed for entry due diligence is needed for ongoing monitoring.

#### Step 3: Deploy

Once due diligence passes, the action is mechanical: deposit (LP) or open position (leverage). Parameters: amount, and for leverage agents: leverage level, target strategy/collateral.

---

### Job 2: "Is my position still OK?" — Monitor

**When** I have capital deployed,
**I want to** know when the risk/return profile changes,
**so I can** react before I lose money.

**How monitoring works today:** Pull-based, cron-type. Agents poll periodically (weekly cadence typical for humans; agents can poll at any frequency). No push notifications — the system is a data provider, the agent configures its own monitoring logic.

#### Monitoring by urgency tier

**CRITICAL (seconds to minutes) — automated response needed:**

| What to watch | Affects | What happens | Action |
|--------------|---------|-------------|--------|
| Collateral price crash | Leverage | HF drops toward 1.0, liquidation bots execute within blocks | Add collateral or repay immediately |
| Oracle malfunction | Both | Wrongful liquidation (2.85% error → $27M liquidated on Aave, Mar 2026) | Maintain HF 2.0+ to survive glitches |
| Smart contract exploit in adapter/collateral protocol | Both | Collateral value goes to zero | Exit immediately |
| Stablecoin depeg (if used as collateral) | Both | HF drops, cascading in 15-60 min | Monitor Curve pool imbalances (5-15 min lead time) |

**URGENT (minutes to hours) — manual response:**

| What to watch | Affects | What happens | Action |
|--------------|---------|-------------|--------|
| Health factor approaching danger zone | Leverage | HF 1.5-2.0 = monitor hourly; HF 1.2-1.5 = act now | Add collateral, repay, or close |
| Utilization spike >90% | LP | Can't withdraw, rates spiking | Prepare to exit when utilization drops |
| Interest rate spike | Leverage | Borrow cost may become unsustainable | Repay or exit if rates exceed strategy yield |
| Cascading liquidation event | Both | Multiple positions liquidated, bad debt risk | Have automated tools pre-configured |

**IMPORTANT (hours to days) — governance/parameter changes:**

These are Gearbox-specific parameters that can change through governance/curator decisions:

| Parameter | Who controls | Affects | Impact |
|-----------|-------------|---------|--------|
| `liquidationThreshold` per token | Curator/governance | Leverage | LT decrease = instant HF drop, can trigger liquidation |
| `forbiddenTokensMask` | Governance | Leverage | Token forbidden = must exit that collateral |
| `minDebt` / `maxDebt` | Governance | Leverage | Can lock users out of borrowing more |
| `totalDebtLimit` | Governance | Leverage | Pool-level borrow cap reached = no new borrows |
| `creditManagerDebtParams` | Governance | Leverage | Per-CM limit within pool |
| `quotas` (rate, limit, fee) | Gauge/governance | Leverage | Cost of holding collateral changes |
| `isPaused` | Emergency admin | Both | Blocks all new actions on the CM |
| `expirationDate` | Set at deployment | Leverage | CM expires = must exit |
| Adapter whitelist changes | Governance | Leverage | Adapter removal = can't exit through that route |
| New collateral added to pool | Curator | LP | New risk dimension LP didn't sign up for |

**STRATEGIC (days to weeks):**

| What to watch | Affects | What happens | Action |
|--------------|---------|-------------|--------|
| Yield compression | Both | Returns fall below risk-free rate or personal threshold | Consider exiting |
| Bad debt accumulation | LP | Protocol-level losses may not be recoverable | Monitor reserve fund levels |
| Curator reputation/incidents | Both | Resolv hack: Gauntlet bots continued allocating $6M+ into compromised vaults | Reassess trust |
| Governance disputes | Both | Can impact protocol development and security | Monitor forums |

**Key insight:** Entry due diligence data (Job 1) = ongoing monitoring data (Job 2). Same information, different question: "should I enter?" becomes "should I stay?"

---

### Job 2.5: "Something changed, what do I do?" — Manage Position

**When** monitoring surfaces a problem,
**I want to** adjust my position,
**so I can** protect my capital or optimize returns.

Triggered by Job 2. Loops back to Job 2 after adjustment.

#### Decision logic: what triggers what action

| Monitoring signal | Decision question | Possible actions |
|------------------|-------------------|-----------------|
| HF dropping (price move) | "Is this temporary volatility or a trend?" | Add collateral, repay debt, or exit |
| HF dropping (LT decreased by curator) | "Do I still trust this curator's judgment?" | Add collateral to restore HF, or exit |
| Collateral incident/hack | "Is recovery possible or is this a total loss?" | Exit immediately if possible |
| Yield dropped | "Is there a better option elsewhere?" | Switch strategy, or exit and redeploy (Job 1 again) |
| Utilization spiking (LP) | "Can I still exit if I need to?" | Partial withdraw while possible, or wait |
| New collateral added | "Does this change the risk profile beyond my tolerance?" | Withdraw if risk increased beyond comfort |
| Borrow rate increased | "Does strategy still net positive?" | Repay if cost > yield |
| Quota limit approaching | "Will I be able to maintain my position size?" | Reduce position or diversify |
| CM expiring | "Where do I migrate?" | Close position, redeploy to active CM |
| Adapter removed | "Can I still exit my collateral position?" | Exit through remaining routes before more are removed |

#### Actions available

| Action | What it does | Data needed to decide |
|--------|-------------|----------------------|
| Add collateral | Improve HF, reduce liquidation risk | Current HF, projected HF after deposit, wallet balance |
| Repay debt | Reduce leverage, improve HF | Current debt, borrow rate, HF impact |
| Swap collateral | Change exposure within position | Available routes, price impact, new token's LT |
| Switch strategy | Move to different yield source | Alternative strategies, comparative yield, migration cost |
| Partial withdraw | Reduce exposure | Current HF, max safe withdrawal amount, exit liquidity |
| Exit entirely | Close everything → triggers Job 3 | Exit liquidity, price impact, total P&L |

---

### Job 3: "Can I exit, and at what cost?" — Exit

**When** I want to withdraw my capital,
**I want to** exit with minimal loss,
**so I can** recover my capital (ideally with profit).

**LP agent exit:**

| Condition | What happens |
|-----------|-------------|
| Free liquidity available | Instant exit |
| Pool fully utilized | Stuck waiting. IRM forces borrowers out via rates, no timing guarantee |
| Extreme: bad debt, hacked collateral, broken oracles | Borrowers can't close → LPs frozen |

**Leverage agent exit:**

| Condition | What happens |
|-----------|-------------|
| Collateral swaps cleanly | Instant exit |
| Collateral depegged | Swap at big loss |
| Low collateral liquidity | Large price impact |
| Delayed withdrawal | No loss but ~7 day wait |

**Core theme: liquidity is the cross-cutting concern.** It appears in:

- Entry: pool capacity (LP size filter), borrowable amount
- Monitoring: utilization changes
- Exit (LP): free liquidity in pool
- Exit (leverage): collateral market liquidity, price impact

---

## Full Lifecycle

```
Job 1 (evaluate) → deposit/open → Job 2 (monitor) ⇄ Job 2.5 (manage) → Job 3 (exit)
```

---

## Design Principles (from interview)

These apply to the ENTIRE information system — all jobs, both agent types (LP and leverage).

**1. Present facts, not decisions.** Show objective data (HF, utilization, parameter changes, yield, liquidity). Never tell the agent what to do. Every situation involves judgment — there are NO hard "always do X" rules, not even for hacks or expirations. Corollary: no labels like "critical" or "danger" — present "utilization: 92%" and let the agent interpret.

**2. Present options with projected outcomes.** "If you add 500 USDC, HF goes to 1.8. If you repay 500, HF goes to 2.1. If you close, you get back X after slippage." These are computed facts, not recommendations — the system computes useful derivatives from raw data. The agent applies its own risk tolerance.

**3. Surface changes proactively with lead time.** Agents need to know about changes BEFORE they take effect. The 24h governance timelock is a feature — it's the agent's exit window. The system should surface upcoming parameter changes, not just current state.

**4. Progressive contextual documentation.** Never dump a documentation blob into the agent's context. Instead, documentation travels with the data in layers:

| Layer | What | When loaded | Context cost |
|-------|------|-------------|-------------|
| Tool descriptions | Short operational docs (what it does, when to use it, parameters) | Always in context | Minimal (~200 words per tool) |
| Enriched responses | Concept explanations inline with data (e.g., HF returned with "ratio of weighted collateral to debt, liquidation at 1.0") | With every response | Small — only concepts relevant to current response |
| MCP resources | Deeper documentation on-demand via URI (e.g., `gearbox://concepts/health-factor`) | Only when agent explicitly requests | Zero unless requested |
| Discovery tool | Lightweight overview of available operations and key concepts | Agent's entry point, called once | One-time |

This avoids the mega-prompt anti-pattern. No DeFi API currently does this — it's a differentiator.

Research basis: Microsoft MCP Server team found tool descriptions function as "user manuals for agents." OpenAI recommends deferred loading for tools. AgentPatterns.ai documents "context dumping" as the #1 anti-pattern.

**Corollary:** The due diligence process is the same whether evaluating entry (Job 1), monitoring (Job 2), or deciding to exit (Job 3). Agents run the same DD queries — if findings no longer pass their criteria, they act. The system provides the same data at different polling frequencies.

---

## Cross-Cutting Findings

### 1. Same data serves multiple jobs

The due diligence data for Job 1 is reused across Jobs 2, 2.5, and 3. The information system shouldn't separate "discovery data" from "monitoring data" — it's one data model queried with different lenses.

### 2. The information gap is the product opportunity

- Existing DeFi APIs return raw numbers without context or risk assessment
- Risk platforms (Exponential, DeFi Safety) exist separately from protocol APIs
- No DeFi protocol combines "here's the opportunity" with "here's the structured risk data" in a single programmatic interface
- An agent can only evaluate what its tools expose — richer data = better decisions

### 3. No universal risk standard

Every curator/platform invents its own scoring. Gearbox doesn't need to solve this industry-wide, but does need a consistent information structure for its own products.

### 4. Failure pattern: info exists but is inaccessible

Post-mortems show three patterns:

1. Warning info existed but was drowned by promotional narrative (UST/Anchor)
2. Flaw was too technical for users to assess (Euler — missing invariant check)
3. Off-chain risk invisible to depositors (Resolv — 18 audits but single AWS key)

The information system should surface risk prominently, not bury it.

---

## Scope

**In scope:** Agent-first information system for Gearbox Protocol. Two agent types: LP agents and leverage agents. UI adaptation is a follow-on task.

**Out of scope (separate products/systems):**

- Liquidators/keepers — separate infrastructure
- Curators — own tooling and dashboards
- Governance participants — separate workflow
- Developers/integrators — separate developer experience concern
- Plain borrowers (non-yield) — minority, different profile
- Multi-chain unified view — per-chain is fine for now
- Alerting/notification architecture — implementation detail for later
- Competitive analysis — not needed for discovery
- Tax/accounting/reporting
- UI-specific design — agent-first, UI adaptation later

---

## What's Next

### Phase 2: Flow Mapping [DONE]

Completed in the internal flow-mapping document (not included in this share repo). Mapped all jobs into concrete flows with gap analysis and data requirements.

### Phase 3: Information Architecture [DONE]

Completed in the internal information-architecture document (not included in this share repo). 7 entities defined with loss-vector-grounded properties, relationship map, and consumer matrix. Backend handoff spec in ../outputs/agentic-data-flow/00.introduction.md and the numbered files under ../outputs/agentic-data-flow/.

### Phase 4: Handoff to Shaping [DONE]

Completed as an internal shaping handoff. The shaping doc is not included in this share repo. All discovery outputs packaged, all open questions resolved, ready for shaping skill.

**Transition criteria:**

- [x] All user types identified
- [x] Primary JTBD has complete decision chain
- [x] Due diligence information requirements mapped
- [x] Major flows mapped with data requirements at each step (Phase 2 — internal flow-mapping document, not included here)
- [x] Core entities named and described (Phase 3 — internal information-architecture document, not included here)
- [x] Pain points documented
- [x] All open questions resolved (see internal information-architecture document, "Resolved Questions")
