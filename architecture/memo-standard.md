# Memo Standard — Agent Due Diligence Handoff Format

**Date:** 2026-04-06
**Status:** Draft for review
**Input:** Industry research (Gauntlet, Chaos Labs, LlamaRisk, MakerDAO, EEA DeFi Risk Guidelines), staged-agent-architecture.md

---

## What this document is

A standard for the structured memo that an Analyst agent produces after deep DD and passes to the Investment Committee agent. The memo is the critical compression layer — it must contain everything the committee needs to make an allocation decision, backed by evidence, with no interpretive labels.

We define:
- **Standard** — required sections, required evidence fields, validation rules
- **Reference implementation** — our specific compression logic (thresholds, trend computation, summary generation)

Third parties can use our implementation out of the box or replace it while conforming to the standard.

---

## Industry research — what the best risk teams do

### Sources analyzed
- **Gauntlet:** Parameter recommendations (Aave/Compound forums), market risk assessments, Morpho vault curation methodology, new asset listing framework
- **Chaos Labs:** Risk Steward cap adjustments, new asset onboarding assessments (Aave)
- **LlamaRisk:** Collateral risk assessments (LSTs, stablecoins), Aave V3 framework v1.1
- **MakerDAO:** Collateral onboarding risk assessment guide (the gold standard for thoroughness)
- **EEA:** DeFi Risk Assessment Guidelines v1 (July 2024)
- **B.Protocol/RiskDAO:** SmartLTV quantitative framework

### Convergent patterns

Every serious framework shares these properties:

**1. Numbers, not labels**
| Bad | Good (actual examples from reports) |
|---|---|
| Liquidity: Adequate | $2.3M available at 7.5% slippage via Curve + Uniswap |
| Peg: Stable | 155 deviation events in 90d, max -0.851c, median recovery 13hr |
| Risk: Medium | VaR99 = $450K bad debt on $50M exposure (10K Monte Carlo sims) |
| Governance: Decentralized | 4/6 multisig, 48hr timelock, HHI concentration 0.6 |
| Audit: Passed | Zellic + Pashov (Jan 2025), 0 unresolved critical/high, bug bounty $500K (2.1% of TVL) |

**2. Verdict first, evidence after**
Both Chaos Labs and LlamaRisk state their recommendation upfront ("We support listing X" / "We recommend against"), then present evidence. The committee sees the conclusion immediately and can drill into supporting data if needed.

**3. Parameter table as actionable output**
Every report ends with a concrete specification table: Parameter | Current | Recommended | Justification. The output is directly executable — no interpretation gap between analysis and action.

**4. Standard risk taxonomy**
All frameworks converge on four risk categories:
- Market risk (liquidity, volatility, concentration)
- Technology risk (smart contracts, oracles, upgradeability)
- Counterparty risk (governance, custody, admin keys)
- Regulatory/legal risk (jurisdiction, compliance)

For Gearbox agent context, we adapt this to:
- **Profit** (yield mechanics, cost structure, entry/exit friction)
- **Market risk** (liquidity, volatility, oracle)
- **Protocol risk** (smart contract, curator, governance parameters)
- **Constraints** (capacity, access requirements, position limits)

**5. Quantitative thresholds are explicit**
LlamaRisk framework: "7.5% price impact" as liquidity threshold, ">2% depeg for 2+ days" as stability concern. Chaos Labs: "supply cap = 2x liquidity available at liquidation bonus price impact." These aren't hidden heuristics — they're published methodology.

**6. Benchmarking against comparable assets**
Parameters for new listings always reference similar existing assets. "Aligned with wstETH parameters" or "conservative vs WBTC due to lower liquidity."

---

## Memo standard specification

### Envelope

```typescript
interface DueDiligenceMemo {
    // Identity
    candidate_id: string           // pool_address (LP) or strategy_key [chain_id, cm_address, collateral] (CA)
    candidate_name: string
    type: "LP" | "CA"
    chain_id: number
    timestamp: string              // when the memo was produced
    data_staleness_max: string     // oldest data point used (e.g., "2 hours ago")
    
    // Verdict (stated first, evidence follows)
    verdict: Verdict
    
    // Evidence sections (required)
    profit: ProfitAssessment
    market_risk: MarketRiskAssessment
    protocol_risk: ProtocolRiskAssessment
    constraints: ConstraintAssessment
    
    // Context
    pending_changes: PendingChange[]
    comparable_benchmarks: Benchmark[]
}
```

### Verdict

Stated first. The committee reads this, then drills into evidence sections only if needed.

```typescript
interface Verdict {
    action: "proceed" | "proceed_with_caution" | "reject"
    rationale: string              // 1-2 sentences. MUST reference specific evidence.
                                   // Good: "6.2% organic yield, stable 90d, utilization 72%, trusted curator (Steakhouse)"
                                   // Bad: "Good yield, acceptable risk"
    key_concerns: string[]         // empty if none. Each must be specific:
                                   // Good: "Incentive yield (Merkl) is 40% of total — campaign expires in 14d"
                                   // Bad: "Yield may decline"
}
```

Validation: `rationale` must contain at least 2 numeric values. `key_concerns` entries must each contain at least 1 numeric value or a specific identifier (token name, protocol name, date).

### Profit Assessment

```typescript
interface ProfitAssessment {
    // Yield structure
    apy_total: number                           // current composite
    apy_organic: number                         // from protocol mechanics only
    apy_incentive_merkl: number                 // Merkl campaigns
    apy_incentive_other: number | null          // protocol-specific, approximate
    
    // Yield evidence (from 90d history)
    apy_organic_90d: {
        mean: number
        std_dev: number
        min: number
        max: number
        trend_direction: "rising" | "falling" | "stable"  // computed from linear regression
        trend_slope_daily: number                          // actual slope value, not just direction
    }
    
    // Incentive sustainability
    incentive_dependency_pct: number            // apy_incentive / apy_total — how much yield disappears if incentives stop
    incentive_campaign_expiry: string | null    // nearest known expiry date
    incentive_renewal_history: string | null    // e.g., "renewed monthly since Jan 2026"
    
    // Cost structure (CA only)
    ca_economics: {
        borrow_rate_current: number
        borrow_rate_90d: { mean: number, std_dev: number, max: number }
        quota_rate: number                      // annual holding cost
        quota_increase_fee_bps: number          // one-time entry cost
        estimated_swap_impact_bps: number       // at proposed position size
        total_entry_cost_bps: number            // quota fee + swap impact
        breakeven_days: number                  // entry cost / daily net yield
        net_apy_at_target_leverage: number      // (collateral_yield * leverage) - borrow - quota - fees
    } | null
    
    // Points (informational only — no economic valuation)
    points: Array<{
        program_name: string
        multiplier: number
    }>
}
```

Validation: All numeric fields required (no nulls except where marked). `ca_economics` required when type = "CA", null when type = "LP".

### Market Risk Assessment

```typescript
interface MarketRiskAssessment {
    // Liquidity
    liquidity: {
        // LP: pool exit liquidity
        available_liquidity_underlying: string   // current, in underlying token
        utilization_rate: number                  // current
        utilization_90d: { mean: number, std_dev: number, max: number, trend_slope_daily: number }
        withdrawal_fee_bps: number
        irm_u2: number                           // above this, borrowing gets expensive — LP protection threshold
        is_borrowing_above_u2_forbidden: boolean
        
        // CA: position exit liquidity (via router, through allowed adapters only)
        exit_price_impact_bps: number | null     // at proposed position size
        exit_price_impact_90d: { mean: number, max: number } | null
        borrowable_remaining: string | null
    }
    
    // Collateral exposure (LP: what the pool is exposed to; CA: what the position holds)
    exposure: {
        tokens: Array<{
            symbol: string
            address: string
            pct_of_total: number                 // concentration
            oracle_methodology: string           // "chainlink" | "redstone" | "hardcoded" | "bounded" | "composite"
            oracle_heartbeat_seconds: number
            oracle_stale_episodes_90d: number    // count of periods exceeding heartbeat
            oracle_main_reserve_max_spread_pct: number  // max divergence between main and reserve in 90d
            lt: number                           // liquidation threshold
            lt_ramp_active: boolean
            lt_ramp_target: number | null        // final LT if ramp active
            lt_ramp_end_date: string | null
            is_forbidden: boolean
        }>
        largest_single_exposure_pct: number      // quick concentration check
        exotic_token_exposure_pct: number         // tokens outside top-20 by market cap
    }
    
    // TVL context
    tvl_underlying: string
    tvl_usd: number
    tvl_90d_trend_slope_daily: number            // positive = growing, negative = capital leaving
    
    // Insurance (LP)
    insurance_fund_balance: string | null
    insurance_coverage_pct: number | null         // insurance / total_debt — how much bad debt is buffered
}
```

### Protocol Risk Assessment

```typescript
interface ProtocolRiskAssessment {
    // Curator
    curator: {
        address: string
        name: string
        url: string | null
        pools_managed: number
        strategies_managed: number
        cumulative_bad_debt_usd: number          // across all managed pools — track record
        timelock_seconds: number | null          // how fast can curator change params
    }
    
    // Governance parameters
    governance: {
        is_paused: boolean
        expiration_date: string | null           // CA only
        max_debt_per_block_multiplier: number    // 0 = no new borrows
        loss_policy: string                      // description of bad debt handling
    }
    
    // Parameter stability
    parameter_changes_90d: {
        count: number
        notable: Array<{
            date: string
            description: string                  // "LT for USDe reduced from 85% to 82%"
            impact: string                       // "HF decreased for all USDe-collateralized positions"
        }>
    }
    
    // Risk disclosure
    risk_disclosure: string | null               // structural risk text, e.g., "Bad debt exceeding insurance fund is socialized across all LPs"
    
    // Delayed withdrawals (CA)
    delayed_withdrawal: {
        supported: boolean
        withdrawal_period_seconds: number | null
        tokens_with_withdrawal: string[]         // token symbols
    } | null
}
```

### Constraint Assessment

```typescript
interface ConstraintAssessment {
    // Position sizing
    max_position_usd: number                     // min(TVL concentration limit, borrowable capacity, quota limit)
    min_position_usd: number                     // min_debt (CA) or practical minimum (LP)
    max_position_rationale: string               // "limited by 10% TVL concentration rule" or "limited by borrowable: $2.1M remaining"
    
    // Access
    availability: "permissionless" | "kyc_required"
    kyc_url: string | null
    degen_nft_required: boolean
    
    // CA-specific
    ca_constraints: {
        min_debt: string
        max_debt: string
        debt_in_range: boolean                   // at proposed amount
        borrowable_sufficient: boolean
        quota_available: boolean
        max_leverage: number                     // computed from LT: 1 / (1 - LT)
    } | null
}
```

### Supporting types

```typescript
interface PendingChange {
    description: string              // "Base interest rate: 4% → 6%"
    expected_execution: string       // ISO timestamp or "queued, no timelock end"
    source: string                   // "governance multisig" | "timelock"
    impact: string                   // "Borrow cost increases ~2% for all CAs"
}

interface Benchmark {
    candidate_id: string             // comparable pool/strategy
    candidate_name: string
    field: string                    // what's being compared
    this_value: string               // "apy_organic: 4.2%"
    benchmark_value: string          // "apy_organic: 3.8%"
    note: string                     // "Higher organic yield than Tier-2 USDC pool"
}
```

---

## Validation rules

A conforming memo MUST pass these checks:

| Rule | Validation |
|---|---|
| No empty labels | Every string field that describes risk/yield must contain ≥1 number or specific identifier |
| Verdict has evidence | `verdict.rationale` contains ≥2 numeric references |
| Concerns are specific | Each `key_concerns` entry references a number, date, or named entity |
| History is present | All `_90d` fields populated (mean, std_dev, max, trend) |
| Oracle evidence complete | Every exposure token has: methodology, heartbeat, stale episode count, main/reserve spread |
| CA economics complete | If type=CA: all `ca_economics` fields populated, `breakeven_days` computed |
| Constraints computed | `max_position_usd` has a `rationale` explaining the binding constraint |
| Staleness declared | `data_staleness_max` populated — committee knows how fresh the data is |

---

## Reference implementation sketch

Our implementation compresses raw data from `data-read-spec` fields into memo fields. Key computations:

### Trend computation
```
Input: 90-day daily series [v1, v2, ..., v90]
Output: { mean, std_dev, min, max, trend_direction, trend_slope_daily }

trend_slope_daily = linear regression slope
trend_direction = 
    if abs(slope * 90) < 0.1 * std_dev → "stable"
    if slope > 0 → "rising"
    else → "falling"
```

### Incentive dependency
```
incentive_dependency_pct = (apy_incentive_merkl + apy_incentive_other) / apy_total
```
Reference implementation flags >50% as a key concern.

### Entry cost / breakeven (CA)
```
total_entry_cost_bps = quota_increase_fee_bps + estimated_swap_impact_bps
daily_net_yield_bps = net_apy_at_target_leverage / 365
breakeven_days = total_entry_cost_bps / daily_net_yield_bps
```
Reference implementation flags breakeven > 30 days as a key concern.

### Concentration check
```
largest_single_exposure_pct = max(token.pct_of_total for token in exposure.tokens)
```
Reference implementation flags >70% single-token exposure.

### Oracle health computation
```
For each token:
  stale_episodes_90d = count(gaps > heartbeat_seconds in 90d price feed)
  main_reserve_max_spread = max(abs(main - reserve) / main) over 90d
```
Reference implementation flags: stale_episodes > 3 or max_spread > 2%.

---

## How this maps to data-read-spec

Every memo field traces to one or more data-read-spec fields. The memo is a COMPRESSION of those fields, not new data.

| Memo field | data-read-spec source |
|---|---|
| apy_organic, apy_incentive_merkl | §2a Q1 (LP) or §2b Q1 (CA): supply rate, incentive yield |
| apy_organic_90d.* | §2a Q1: Total APY history (90d daily) |
| utilization_90d.* | §2a Q3: Utilization per pool (90d daily) |
| oracle_stale_episodes_90d | §2b Q2: Historical main oracle price (compute gaps) |
| oracle_main_reserve_max_spread | §2b Q2: Main vs reserve oracle price histories |
| curator.cumulative_bad_debt | New field (Appendix C: C6 curator identity + new bad_debt tracking) |
| pending_changes | New field (Apr 3 call finding #6) |
| risk_disclosure | New field (Apr 3 call finding #7) |
| insurance_coverage_pct | Appendix C: C7 |

---

## Comparison: industry report vs our memo

| Industry report section | Our memo equivalent | Difference |
|---|---|---|
| Asset fundamental characteristics | Not in memo — this is raw data from `/assets` endpoint | We don't duplicate asset-level data in the memo; agent fetches it separately |
| Market risk: liquidity | `market_risk.liquidity` | Same data, compressed |
| Market risk: volatility | `market_risk.exposure[].oracle_*` + price history | We focus on oracle as the price delivery mechanism, not raw volatility |
| Technology risk: smart contracts | Out of scope for per-pool memo | Protocol-level risk, not per-pool. Could be in `/assets` or `/protocols` |
| Counterparty: governance | `protocol_risk.curator` + `governance` | Compressed |
| Counterparty: regulatory | `constraints.availability` + `kyc_url` | Minimal — we flag KYC requirement but don't assess regulatory risk |
| Quantitative risk: VaR, simulations | NOT in standard — agents can add in implementation | We don't mandate simulation. Reference impl uses heuristics. Advanced agents can run Monte Carlo. |
| Parameter table | `constraints.*` + full memo feeds into Committee's AllocationDecision | Our "parameter table" is the committee's output, not the analyst's |

Key omission vs industry: we don't include smart contract risk assessment (audit history, bug bounty coverage, code complexity). This is deliberate — it's protocol-level, not per-pool. It belongs in an `/assets` or `/protocols` resource that the agent consults once, not in every DD memo.

---

## Design decisions (Apr 6)

**Q1: Raw 90d arrays or computed summaries?**
Summaries only. The memo IS the compression layer. Committee doesn't need 90 data points — it needs computed statistics that are challengeable: mean, std_dev, min, max, slope. "Mean 72%, std_dev 3.2%, range 65-78%, slope -0.02%/day" lets the committee challenge the trend. Raw arrays available via re-query to detail tools if needed.

**Q2: Interface versioning?**
Yes. `memo_version: "1.0"` field in the envelope. Semver: breaking changes (new required fields, removed fields) bump major. Additive (new optional fields) bump minor. Committee agent built for v1 accepts v1.1, rejects v2.

**Q3: Cross-position correlation?**
NOT in the memo. The analyst produces a memo about ONE candidate. The committee agent receives ALL memos + current portfolio state and reasons about correlation ("already 60% USDe exposure, adding this pushes to 80%"). Baking cross-position logic into the memo creates circular dependency and kills analyst parallelism — can't run 3 analysts in parallel if each needs to know the others' results.
