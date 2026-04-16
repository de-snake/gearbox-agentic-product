# Staged Agent Architecture — Context Handoff Design

**Date:** 2026-04-06
**Status:** Draft for review
**Input:** ../outputs/agentic-data-flow.md, 3AprCall transcript, ../raw-data/source-docs/2026-04-03-team-updated-spec.md (team's tool spec), analysis session

---

## The core idea

The agent lifecycle mirrors the decision-making pipeline in an investment firm. Each stage is a distinct role with a clear mandate, a defined input, and a compressed output that feeds the next stage.

The design problem is NOT "what data exists" (agentic-data-flow already answers that). The design problem is: **what context does each stage receive, and what does it pass forward?**

Each stage acts as a compression layer. The scout doesn't dump 50 pool records on the analyst — it passes a ranked shortlist of 3 with a sentence each on why. The analyst doesn't dump 90-day price history on the committee — it passes "oracle: stable, no episodes" or "oracle: 3 stale events in 90d, needs attention."

This is a context budget problem. The downstream agent should receive everything it needs and nothing it doesn't.

```
Scout ──shortlist──→ Analyst ──memos──→ Committee ──allocation──→ Exec Desk ──receipts──→ Ops
  ↑                                                                                       |
  └───────────────────────────── alerts ──────────────────────────────────────────────────┘
```

---

## Stage mapping

| # | Stage | Investment firm analogy | Agent role | Input | Output |
|---|-------|----------------------|------------|-------|--------|
| 1 | Discover | Scout | Scan the universe, coarse filter | AgentTask (role + asset + amount) | Shortlist (3–5 candidates with summary scores) |
| 2 | Analyze | Research Analyst | Deep DD on each candidate | Shortlist + raw data access | Research Memo per candidate |
| 3 | Propose | Investment Committee | Decide allocation across candidates | Research Memos + agent constraints | Allocation Decision |
| 4 | Preview | Execution Desk (pre-trade) | Validate against real chain state | Allocation Decision | Go/No-Go per position + calldata |
| 5 | Execute | Execution Desk (trade) | Submit transactions | Calldata bundle | Tx receipts |
| 6 | Monitor | Portfolio Ops | Watch positions, detect drift | Position state + alert rules | Alerts → re-enter at appropriate stage |

---

## Stage 1: Scout / Discover

### Role
Scan all available pools (LP) or strategies (CA). Apply coarse filters. Produce a compact ranked shortlist.

### Input: AgentTask
```typescript
interface AgentTask {
    role: "LP" | "CA" | "Any",
    asset_class: "USD" | "ETH" | "BTC",
    amount_usd: number,
}
```

Decision from Apr 3 call: asset categories match frontend filters (USD = stablecoin strategies, ETH = ETH-correlated, BTC = BTC-correlated). Agent arrives with a category, not a specific token.

### Data available (from agentic-data-flow)
- LP: pool_name, underlying_token, apy_total, tvl, tvl_usd, is_paused
- CA: strategy_name, underlying_token, collateral_token, borrowable_liquidity, min/max_debt, net_apy_estimate, is_paused

### New fields to add (from Apr 3 call findings)
- CA: `availability: "Permissionless" | "KYC'd"` — skip if agent can't meet requirements
- CA: `points: Array<{ program_name: string, multiplier: number }>` — informational, no economic valuation (call consensus: don't try to price points)
- Both: chain_id — multi-chain context

### Output → Analyst: Shortlist
```typescript
interface Shortlist {
    task: AgentTask,
    candidates: Array<{
        id: string,                    // pool_address (LP) or strategy_key (CA)
        name: string,
        headline_apy: number,          // apy_total (LP) or net_apy_estimate (CA)
        headline_tvl_usd: number,
        why_included: string,          // one-line: "highest organic yield in USD pools"
        flags: string[],              // ["low_tvl", "incentive_dependent", "near_capacity"]
    }>
}
```

Compression: 50 pools → 3–5 candidates. Each candidate has one score (APY), one size metric (TVL), and a reason. Everything else is discarded.

---

## Stage 2: Research Analyst / Analyze

### Role
Deep due diligence on each shortlisted candidate. Produce a structured Research Memo that contains everything the Investment Committee needs to make an allocation decision — and nothing more.

### Input
Shortlist from Scout + access to raw data via detail tools (get_pool_detail, get_strategy_detail, get_curator).

### Data available (from agentic-data-flow)
Everything in Stage 2a (LP) and Stage 2b (CA). This is where agentic-data-flow shines — the per-field "agent decision story" tables are the analyst's research checklist.

### New fields to add (from Apr 3 call findings)

**Curator as standalone resource:**
```typescript
interface CuratorProfile {
    address: string,
    name: string,
    url: string,
    socials: string[],
    bad_debt_history: number,          // cumulative bad debt across all managed pools
    pools_managed: number,
    strategies_managed: number,
}
```
Rationale: curator data is shared across pools/CMs. Standalone endpoint avoids duplication and lets the analyst build a trust model once.

**Entry cost (CA):**
The Apr 3 call highlighted that swap costs on entry can eat weeks of yield. Example: swapping USDC→USDe costs ~$100-200 on moderate positions. If strategy earns 3-4% APY, that's 2-3 weeks of profit before you break even on entry alone.

Add to CA Evaluate Q1:
```
| Entry swap cost estimate (at position size) | "How much do I lose just getting in?" |
| Breakeven period (entry cost / daily net yield) | "How long until entry cost is recovered?" |
```

**Pending governance changes:**
Apr 3 call consensus: both Analyze and Monitor need visibility into queued governance changes (Safe TX queue, timelock).

Add to both LP Q5 and CA Q4:
```
| Pending changes | Array<{ description, expected_execution, parameters }> |
```
These are parsed from governance queue — "BASE_INTEREST_RATE: 4% → 6%, executes in 48h."

**Risk disclosure text:**
Simple text field explaining structural risks: "In case of bad debt exceeding insurance fund, losses are socialized across all LPs" or "This collateral has a 7-day withdrawal queue; forced exit may take longer."

Add to CA Evaluate Q2:
```
| risk_disclosure | string — structural risk description |
```

**Borrow rate as liquidation risk:**
Apr 3 call debate resolved: borrow rate spikes are a risk, not just a cost reduction. Historical episodes where high utilization drove borrow rates to 80%+, wiping months of yield in days AND potentially triggering liquidation via interest accrual.

Our spec already has borrow rate history in Q1-CA. Add a cross-reference note in Q2-CA: "Borrow rate history also serves as a risk signal — extreme rate spikes can cause liquidation via rapid interest accrual, not just reduced profit."

### Output → Committee: Research Memo

This is the key compression. The analyst consumes 90-day price histories, oracle update logs, IRM curves — and produces a structured assessment.

```typescript
interface ResearchMemo {
    candidate_id: string,
    candidate_name: string,
    type: "LP" | "CA",
    
    // Verdict
    recommendation: "strong" | "acceptable" | "risky" | "reject",
    one_liner: string,                 // "Stable 6% organic yield, low utilization, trusted curator"
    
    // Profit assessment
    profit: {
        headline_apy: number,
        apy_organic: number,
        apy_incentive: number,
        apy_trend: "stable" | "growing" | "declining",
        yield_sustainability: string,   // "organic rate alone meets 4% floor; incentives are bonus"
        entry_cost_bps: number,         // CA only: total entry friction
        breakeven_days: number,         // CA only: entry cost / daily yield
    },
    
    // Risk assessment
    risk: {
        summary: string,               // "Low risk. Single exotic collateral (USDe) at 12% exposure."
        exposure_concentration: string, // "60% wstETH (low risk), 25% USDe (medium), 15% sUSDe (medium)"
        oracle_health: string,          // "All Chainlink, no staleness episodes in 90d"
        exit_feasibility: string,       // "Utilization 72%, stable. <1% price impact at $100k"
        borrow_rate_risk: string,       // CA only: "Rate stable 4-6% range, no spikes >20% in 90d"
        curator_trust: string,          // "Steakhouse, established, no bad debt history"
        pending_changes: string,        // "None" or "IRM update queued, executes Apr 10"
    },
    
    // Constraints
    constraints: {
        max_position_usd: number,       // limited by TVL concentration or borrowable
        min_position_usd: number,       // min_debt or practical minimum
        availability: string,           // "Permissionless" or "Requires KYC via <url>"
    },
}
```

Compression: hundreds of data points → one structured memo per candidate. The committee never sees raw price arrays or IRM parameters. It sees "oracle: healthy" or "borrow rate: volatile, 2 spikes >30% in 90d."

**Critical design question:** Who does the compression — the API or the agent? 

Option A: API returns raw data (current agentic-data-flow), agent's analyst module compresses into memo.
Option B: API returns pre-compressed assessments (e.g., oracle_health: "stable").

Recommendation: Option A. The API serves raw facts. The agent does the reasoning. This is consistent with the user's principle: "agent-facing data must be financially meaningful... raw data + computed projections, never interpretive labels/recommendations. Agent applies own judgment."

The memo format above is the agent's INTERNAL handoff — not an API response shape. The API serves what agentic-data-flow describes; the analyst agent produces the memo.

---

## Stage 3: Investment Committee / Propose

### Role
Receive research memos for all candidates. Apply portfolio-level constraints (diversification, max concentration, risk budget). Produce an allocation decision.

### Input
Array of ResearchMemos + agent's portfolio constraints (max allocation per pool, risk tolerance, existing positions).

### Data needed from API
Minimal — most of what the committee needs is in the memos. But some portfolio-level checks:
- Current positions (if rebalancing): existing pool/strategy positions via Monitor tools
- Cross-pool correlation: "Am I already exposed to USDe through another pool?" — requires the agent to track this internally

### Output → Execution Desk: Allocation Decision
```typescript
interface AllocationDecision {
    decisions: Array<{
        candidate_id: string,
        action: "deposit" | "open_position" | "skip",
        amount_usd: number,
        rationale: string,             // "Highest organic yield, acceptable risk, 50% of capital"
        // CA-specific
        target_leverage?: number,
        collateral_token?: string,
    }>,
    total_deployed_usd: number,
    reserve_usd: number,               // capital held back
    committee_notes: string,           // "Conservative allocation due to market uncertainty"
}
```

Compression: N memos → M actions (M ≤ N, some candidates skipped). Each action has an amount and a reason.

### Optional: Review subagent
Apr 3 call mentioned a "critic" agent that reviews the committee's decision before passing to execution. "Be an awful critic. If there's a one-in-a-million chance of losing money, reject."

This is an optional loop: Committee → Critic → Committee (revise) → Execution. The critic receives the same memos + the allocation decision and tries to find flaws.

---

## Stage 4: Execution Desk / Preview

### Role
Take each allocation decision and test it against real chain state. Produce go/no-go with actual calldata.

### Input
AllocationDecision entries.

### Data needed from API (new — not in agentic-data-flow)
These are the fields from the team's tool spec (../raw-data/source-docs/2026-04-03-team-updated-spec.md) that our spec currently ignores:

**LP preview:**
- expected_shares at deposit amount
- share_price (current exchange rate)
- pool_tvl_after (projected)
- concentration_pct (agent's share of pool after deposit)
- deviation_from_expected (vs proposal)
- gas_estimate + gas_estimate_usd
- warnings (e.g., "pool utilization will exceed 95% after deposit")
- calldata (ready to submit)

**CA preview:**
- simulated health_factor after open
- position_value_usd
- actual_leverage (may differ from target due to swap impact)
- swap_impact_bps (actual slippage)
- token_balances after open
- deviation from proposal (HF delta, leverage delta)
- gas_estimate
- warnings
- multicall_data (ready to submit)

### Output → Execute
```typescript
interface ExecutionPlan {
    actions: Array<{
        candidate_id: string,
        status: "go" | "no_go",
        reason?: string,              // if no_go: "swap impact 3.2% exceeds 2% threshold"
        calldata: string,
        gas_estimate_usd: number,
        expected_outcome: {            // for post-execution verification
            shares?: string,           // LP
            health_factor?: number,    // CA
            leverage?: number,         // CA
        }
    }>
}
```

Compression: allocation decisions → validated, ready-to-submit transactions. No-go items are filtered out with reasons. If too many no-go, the plan loops back to Committee.

---

## Stage 5: Execute

### Role
Submit transactions. Collect receipts. Compare actual outcomes to expected.

Straightforward — no design decisions here beyond what the team's spec already covers.

---

## Stage 6: Portfolio Ops / Monitor

### Role
Watch all positions. Detect drift from expectations. Generate alerts that re-enter the pipeline at the appropriate stage.

### Alert routing
| Condition | Re-enter at |
|---|---|
| Better opportunity found | Scout (Discover) |
| Risk composition shifted | Analyst (Analyze) — re-evaluate current position |
| APY dropped below floor | Committee (Propose) — decide: hold, reduce, exit |
| HF approaching threshold | Execution (Preview) — prepare deleverage tx |
| HF critical | Execute — immediate action |
| Pending governance change detected | Analyst — assess impact |

Monitor data is well-covered in agentic-data-flow (Stage 3a/3b). No structural changes needed, but add:

**New monitor fields (from Apr 3 call):**
- Pending governance changes (same as Analyze — queued Safe TX)
- Emergency state bundle (pause + forbidden tokens + loss policy status)

---

## Findings from Apr 3 call — complete list

For reference, all findings that should be applied to agentic-data-flow when we update it:

### Must add (S = small, M = medium effort to spec)

| # | Finding | Where in agentic-data-flow | Size |
|---|---------|------------------------|------|
| 1 | `/curators` endpoint fields (address, name, bad_debt, url, socials) | Architecture + new section | S |
| 2 | `strategy_key: [chain_id, cm_address, collateral_address]` | §1b (CA Discover) | S |
| 3 | `availability: "Permissionless" \| "KYC'd"` | §1b (CA Discover) | S |
| 4 | `points: Array<{ program_name, multiplier }>` | §1b (CA Discover) | S |
| 5 | Entry cost section (swap cost estimate + breakeven) | §2b Q1 (CA Economics) | M |
| 6 | Pending governance changes | §2a Q5, §2b Q4, §3a, §3b | M |
| 7 | `risk_disclosure: string` | §2b Q2 (CA Collateral safety) | S |
| 8 | Formalize AgentTask interface | §0 (Intent) | S |
| 9 | Borrow rate as liquidation risk cross-reference | §2b Q2 (CA Collateral safety) | S |

### Should add (next iteration)

| # | Finding | Where | Size |
|---|---------|-------|------|
| 10 | Preview-stage data fields (shares, HF, deviation, calldata) | New Stage 4 section | M |
| 11 | APY source harmonization note | §1a + Architecture | S |
| 12 | Emergency state grouping | §3b (CA Monitor) | S |

### Backlog

| # | Finding | Size |
|---|---------|------|
| 13 | Liquidation ecosystem health (# of liquidators, competition) | L |
| 14 | Curator action history aggregation | M |

---

## How this changes agentic-data-flow

The current spec is structured as: **stage → question → fields**.

Proposed restructure:

**stage → input contract → questions → fields → output contract**

Each stage gets two new sections:
1. **Receives from previous stage:** what the input looks like (the compressed handoff)
2. **Passes to next stage:** what the output looks like (the compression target)

The field tables stay exactly as they are — they describe what raw data the API serves. The input/output contracts describe what the AGENT does with that data at each stage.

This means agentic-data-flow remains a backend-facing document ("here's what we need you to serve"), but now includes the agent-side context that explains WHY each field matters at a system level, not just at an individual decision level.

---

## Decisions (Apr 6 review)

1. **Preview fields go in agentic-data-flow.** New Stage 4 section. Simulation results, gas estimates, deviation checks, calldata — these are data requirements like any other stage.

2. **Memo: lightweight standard + reference implementation.** We define the structure and required fields. We also ship our own implementation that shows how to use it. Third parties can use ours out of the box or build their own. See "Memo standard" section below.

3. **Critic agent: out of scope.** Critique at each stage is an implementation detail, not a pipeline stage. Agents can add review loops internally.

4. **Chain ID flow: needs separate research.** Parked for now.

---

## Memo standard — design principles

The memo is the critical handoff between Analyst and Committee. Getting it wrong means either: the committee flies blind (too compressed) or drowns in noise (not compressed enough).

### Anti-pattern: traffic-light ratings
"Oracle: healthy" is bullshit. An investment committee that hears "oracle: healthy" has no way to form independent judgment, challenge the assessment, or know what "healthy" even means. This is an interpretive label masquerading as analysis.

### The right pattern: evidence-backed compression
The memo compresses raw data (90-day price series, oracle update logs) into **computed facts with evidence** — not labels. The committee member reads the facts and applies their own judgment.

| Bad (label) | Good (evidence-backed compression) |
|---|---|
| oracle: healthy | Chainlink, 1h heartbeat, 0 stale episodes in 90d, main/reserve max spread 0.3% |
| yield: stable | Organic 4.2% ± 0.4% over 90d, no single-day drop >1%. Incentive (Merkl): 2.1%, campaign renewed monthly since Jan |
| risk: low | 3 collateral tokens, largest exposure wstETH at 58%. No forbidden tokens. No LT ramps active. Insurance fund covers 12% of total debt |
| exit: easy | Utilization 72% (90d range: 65-78%). Price impact <0.5% at $500k. Withdrawal fee 10bps |

The standard defines: every memo field MUST include the underlying numbers that support the assessment. An agent that outputs "oracle: healthy" without the heartbeat, staleness count, and spread data is non-conforming.

### Standard vs implementation boundary

**Standard (we define):**
- Required sections (profit, risk, constraints, pending changes)
- Required evidence fields per section (what numbers must be present)
- Output format (TypeScript interface)
- Validation rules (e.g., "risk section must reference oracle methodology and staleness data")

**Implementation (we provide as reference, others can replace):**
- How to compute trend assessments from 90d series
- Thresholds for flagging (e.g., when is utilization "concerning"?)
- Weighting / ranking logic
- Natural language generation for summary fields

### Next step
Separate research task: design the memo standard. Inputs:
- agentic-data-flow field tables (what raw data is available)
- The investment firm analogy (what would an analyst actually write?)
- The agent principle: raw data + computed projections, never interpretive labels

Output: memo interface with required evidence fields, plus our reference implementation.

---

## Remaining open questions

1. **Multi-chain: how does chain_id flow through the pipeline?** Needs research. Does the scout filter by chain upfront, or return cross-chain results?
