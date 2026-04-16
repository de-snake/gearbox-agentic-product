# Gearbox agentic

## What this document is

Technical specification of MCP tools and data models that the API serves to third-party agents. Every tool and every field traces back to a specific stage in the Agent Loop. If someone asks "why do we need field X?", the answer is always: "because at stage Y, the agent calls tool Z, and can't make a decision without X."

## The Agent Loop

```
discover → analyze → propose → preview → execute → monitor
   ↑                                                   |
   └───────────────────────────────────────────────────┘
```

| Stage        | What happens                                    | Output                    |
| ------------ | ----------------------------------------------- | ------------------------- |
| **Discover** | Scan pools/strategies, coarse filter            | Shortlist of candidates   |
| **Analyze**  | Deep due diligence on shortlisted candidates    | Risk/reward assessment    |
| **Propose**  | Formulate a concrete action with parameters     | Action specification      |
| **Preview**  | Simulate, validate constraints                  | Go/no-go decision         |
| **Execute**  | Submit transaction on-chain                     | Tx receipt + confirmation |
| **Monitor**  | Watch position, detect changes, trigger re-loop | Alert or new iteration    |

## Intent (Pre-loop)

The agent knows its role before entering the loop:
- **LP agent** — passive yield on a single token, deposits into pools
- **CA agent** — leveraged strategy, opens credit accounts with collateral

Intent determines which variant of each tool the agent calls.

```typescript!
interface AgentTask{
    task: "Any" | "LP" | "Strategy",
    assets: "BTC" | "ETH" | "USD",
    amount: number,
}
```

---

## Stage 1: Discover

> **Human analogy:** you open the Gearbox website and browse the list of pools/strategies, scanning for something that fits.
>
> **Agent:** calls a single list tool with filters, gets back a compact list, decides which candidates are worth deep analysis.

### Tool: `list_pools`

**When:** LP agent has capital in a single token, wants to find pools to deposit into.

**Agent calls:**
```typescript
list_pools({
   assets: "BTC" | "ETH" | "USD",
})
```

**API returns:**
```typescript
interface PoolListItem {
  pool_address: string             // SDK   
  pool_name: string                // SDK, e.g. "dUSDC-V3-Tier1"
  underlying_token: TokenRef       // SDK, { symbol, address, decimals }
  apy_total: number                // backend, composite: organic + incentive, annualized
  tvl: string                      // SDK, in underlying token, wei string
  tvl_usd: number                  // SDK, TVL in USD for cross-pool comparison
  is_paused: boolean
}
```

**Agent logic:** Filter by token match → skip if APY < floor → skip if TVL too small → shortlist 1–3 pools → proceed to Analyze.

---

### Tool: `list_strategies`

**When:** CA agent has a market thesis (e.g. "long stETH vs ETH") and wants to find strategies that match.

**Agent calls:**
```typescript
list_strategies({
  collateral_token?: string,  // target asset agent wants to hold (e.g. "stETH")
  underlying_token?: string,  // what to borrow (e.g. "WETH")
  min_net_apy?: number,       // skip if estimated net yield too low
  min_borrowable?: string,    // skip if no capacity
  show_paused?: boolean,      // default false
})
```

**API returns:**
```typescript
interface StrategyListItem {
  cm_address: string
  strategy_name: string            // e.g. "stETH-leveraged-WETH"
  underlying_token: TokenRef
  collateral_token: TokenRef       // target asset
  borrowable_liquidity: string     // remaining capacity, wei string
  min_debt: string                 // wei string
  max_debt: string                 // wei string
  net_apy_estimate: number         // (collateral_yield * leverage) - borrow_cost - fees
  point_line: string,
  availability: "Permissionless" | "KYC'd", // Requirements: JSON
  is_paused: boolean
}
```

// Additional data: zeroSlippage, withdrawal time, points,..
// asset properties: KYC (?) | /assets 
// key strategies: KYC - degen NFT
// DegenNFT - minter(?)
// **degenNFT().minter().description()** - 
// KYC: `url:string`

**Agent logic:** Filter by collateral match → skip if borrowable = 0 → skip if position size outside min/max → skip if net APY < 0 → shortlist 1–3 → proceed to Analyze.

**Note on APY:** LP APY = pool supply rate + incentives. CA APY = (strategy base yield x leverage) - borrow cost - fees. Fundamentally different calculations, which is why they are separate tools.

---

## Stage 2: Analyze

> **Human analogy:** you click into a specific pool page and study yield breakdown, exposure, utilization, curator history — the full due diligence before committing money.
>
> **Agent:** calls detail tools for each shortlisted candidate, gets structured risk/reward data, makes a go/no-go decision.

### Tool: "get_curator"
get_curator({market}) -> CuratorData
Backend
```typescript
curator: {
    address: string,
    name: string,
    bad_debt?: number,
    url: string,
    socials: [],
}
```

### Tool: `get_pool_details`

**When:** LP agent runs deep DD on a shortlisted pool.

**Agent calls:**
```typescript
get_pool_detail({
  pool_address: string,
  include_history?: boolean,   // request 90d time series (default true)
  include_events?: boolean,    // request parameter change log (default true)
})
```


// LP DECISION MAKING
// Profits:
// - yield data (incentices, historical)
// - tvl, utilisation rate: historical data
//
//
// Risks:
// - collateral data & limits & oracles
// - utilisation rate: historical data
// - insurance fund
// - curator
// - shit_happens: "in case of bad debt: all liquidations are forbidden"
// - insolvency_monitor(?) - self-reporting
// - liquidation risks (markets)
//
// FUTURE STATE CHANGES
//    BASE_INTEREST_RATE: 4% -> 6%
// EMERGENCY STATE: pause, forbidden tokens, etc.

**API returns:**
```typescript
interface PoolDetail {
  // --- Identity ---
  pool_address: string
  pool_name: string
  underlying_token: TokenRef

  // --- Yield (Q1: "Is yield sustainable?") ---
  yield: {
    supply_rate_organic: number          // what the pool itself generates
    incentive_yield_merkl: number        // Merkl campaigns — stable, historical available
    incentive_yield_other: number | null // protocol-specific (e.g. apple farm) — approximate
    apy_total: number                    // composite
    history_90d: Array<{                 // daily snapshots (weighted avg)
      date: string
      supply_rate_organic: number
      incentive_yield_merkl: number
      apy_total: number
    }>
  }

  // --- Exposure chain (Q2: "What could blow up?") ---
    collateral_tokens: Array<{
        token: TokenRef
        liquidation_threshold: number  // 0 = no real exposure
        quota_limit: string  
      }>
        
  exposure: {
    total_debt_limit: string
    quoted_tokens: Array<{
      token: TokenRef
      quota_rate: number               // annual rate, proxy for demand
      quota_limit: string              // max exposure cap
      total_quoted: string             // current exposure
      oracle_methodology: OracleType   // "chainlink" | "redstone" | "hardcoded" | ...
    }>
    insurance_fund_balance: string | null  // dToken balance, null if absent

//     credit_managers: Array<{
//       cm_address: string
//       cm_name: string
//       borrowed_amount: string          // debt at risk through this CM
//       debt_limit: string               // how much more can accumulate
//       is_paused: boolean               // paused = can't liquidate existing positions
//       collateral_tokens: Array<{
//         token: TokenRef
//         liquidation_threshold: number  // 0 = no real exposure
//       }>
//     }>
  }

  // --- Exit feasibility (Q3: "Can I withdraw?") ---
  liquidity: {
    available: string                  // free liquidity now
    expected: string                   // total pool value incl. accrued interest
    total_borrowed: string
    utilization_rate: number           // > 0.9 = exits difficult
    withdrawal_fee_bps: number         // max 100
    is_borrowing_above_u2_forbidden: boolean  // if true, liquidity above U2 reserved for LPs
    irm: {
      u1: number
      u2: number
      r_base: number
      r_slope1: number
      r_slope2: number
      r_slope3: number
    }
    history_90d: Array<{
      date: string
      utilization_rate: number
      tvl: string
    }>
  }

  // --- Governance (Q4: "Who manages this?") ---
  curator_name: string
  

  // --- Change log (Q5: "What could change after I deposit?") ---
  events: Array<{
    timestamp: string
    event_type: string    // "collateral_added" | "debt_limit_changed" | "irm_updated" | ...
    description: string
    parameters: Record<string, any>
  }>
}
```

**Agent logic:**
1. **Yield check** — organic rate alone meets floor? If incentive-dependent, treat as risky. Check 90d trend for decay.
2. **Exposure chain** — trace pool → CMs → tokens. Flag: exotic tokens, single-CM concentration, paused CMs with significant borrowed amounts.
3. **Exit feasibility** — utilization < 90%? Trend stable? IRM slope above U2 steep enough to force borrower repayment?
4. **Governance** — curator on whitelist? Parameter changes frequent or stable?
5. **Decision** — go (→ Propose) or skip.

---

### Tool: `get_strategy_detail`

**When:** CA agent runs deep DD on a shortlisted strategy.

**Agent calls:**

// Strategy_key: [chain_id,cm_address,collateral_address]
//
// PROFIT
// - Research for future profits (defillama)
// - IRM, historic rate data
// - APY, incentives
// - Price impact now, futured PI
// - basic params (ltv)
// 
//
// RISK
// - Oracle type, staleness
// - Borrow rate
// - Curator
// - Liquidation premium
// - Liquidity
// - Curators timelock & restrictions
// - Risc disclosure (text
// - delayed withdrawal period

// FUTURE STATE CHANGES
// EMERGENCY


```typescript
get_strategy_detail({
  cm_address: string, 
  collateral_token?: string,       // focus DD on this specific collateral
  include_history?: boolean,       // 90d time series (default true)
  include_events?: boolean,        // parameter change log (default true)
})
```

**API returns:**
```typescript
interface StrategyDetail {
  // --- Identity ---
  cm_address: string
  strategy_name: string
  underlying_token: TokenRef

  // --- Economics (Q1: "Is the yield worth the cost?") ---
  economics: {
    collateral_yield_apy: number        // base yield of target collateral (e.g. stETH staking)
    borrow_rate: number                 // current pool borrow rate
    irm: IRMParams                      // to model cost at different utilization levels
    fee_params: {
      liquidation_fee: number
      liquidation_premium: number
    }
    per_token_quotas: Array<{
      token: TokenRef
      quota_rate: number                // annual holding cost on top of borrow rate
      quota_increase_fee: number        // one-time entry cost
    }>
    history_90d: Array<{
      date: string
      collateral_yield_apy: number
      borrow_rate: number
    }>
  }

  // --- Collateral safety (Q2: "What could cause sudden liquidation?") ---
  collateral: {
    tokens: Array<{
      token: TokenRef
      liquidation_threshold: number
      lt_ramp: {                        // null if no active ramp
        current_lt: number
        final_lt: number
        end_timestamp: string
      } | null
      is_forbidden: boolean
      oracle: {
        methodology: OracleType
        staleness_period_seconds: number
        price_main_history_90d: Array<{ date: string, price: number }>
        price_reserve_history_90d: Array<{ date: string, price: number }>
      }
      exit_feasibility: {
        price_impact_bps: number        // at a reference position size
        price_impact_history_90d: Array<{ date: string, impact_bps: number }>
      }
    }>
  }

  // --- Capacity & constraints ---
  capacity: {
    borrowable_liquidity: string
    min_debt: string
    max_debt: string
  }

  // --- Governance (Q3: "Who manages this?") ---
  governance: {
    curator: { address: string, name: string }
    is_paused: boolean
    expiration_date: string | null      // null = non-expirable
    max_debt_per_block_multiplier: number  // 0 = no new borrows
  }

  // --- Change log (Q4: "What changed recently?") ---
  events: Array<{
    timestamp: string
    event_type: string    // "lt_reduced" | "token_forbidden" | "oracle_changed" | ...
    description: string
    parameters: Record<string, any>
  }>
}
```

**Agent logic:**
1. **Economics** — compute net APY at target leverage. Check: is borrow rate > collateral yield? Is quota rate eating the spread? Model cost at +10% utilization using IRM.
2. **Collateral safety** — check LT ramp schedules. Compare oracle type vs token market structure. Check main/reserve price divergence history. Flag stale oracles.
3. **Exit feasibility** — price impact at position size < 2%? Borrowable > 0 for future leverage adjustments? Min/max debt allow iterative unwind?
4. **Governance** — curator trusted? CM expirable with sufficient time? Not paused? Max debt multiplier > 0?
5. **Decision** — go (→ Propose) or skip.

---

## Stage 3: Propose

> **Human analogy:** you've studied the pool, decided it's good — now you fill in the deposit amount, set your slippage, and hover over the button.
>
> **Agent:** formulates the exact action parameters based on Analyze results. No on-chain calls yet — just math and constraint validation.

### Tool: `prepare_deposit` (LP)

**When:** LP agent has decided to enter a pool, needs to formulate deposit parameters.

**Agent calls:**
```typescript
prepare_deposit({
  pool_address: string,
  amount: string,           // deposit amount in underlying token, wei string
})
```

**API returns:**
```typescript
interface DepositProposal {
  pool_address: string
  amount: string
  expected_shares: string            // dTokens the agent will receive
  share_price: string                // current exchange rate
  withdrawal_fee_bps: number         // for breakeven calculation
  breakeven_days: number             // given current APY and withdrawal fee
  pool_tvl_after: string             // projected TVL after deposit
  concentration_pct: number          // agent's share of pool after deposit
  is_paused: boolean                 // final gate check
  available_liquidity: string        // can the pool accept this?
}
```

**Agent logic:** Check concentration < max threshold → breakeven horizon acceptable → pool not paused → proceed to Preview.

---

### Tool: `prepare_position` (CA)

**When:** CA agent has decided to open a leveraged position, needs to formulate exact parameters.

**Agent calls:**
```typescript
prepare_position({
  cm_address: string,
  collateral_token: string,      // token address
  collateral_amount: string,     // wei string
  target_leverage: number,       // e.g. 3.0 for 3x
})
```

**API returns:**
```typescript
interface PositionProposal {
  cm_address: string
  collateral_token: TokenRef
  collateral_amount: string
  debt_amount: string                  // computed from collateral * (leverage - 1)
  target_leverage: number
  expected_hf: number                  // projected health factor after opening
  net_apy: number                      // projected net yield at this leverage
  entry_cost: {
    quota_increase_fee: string         // one-time
    estimated_swap_impact_bps: number
  }
  constraints: {
    debt_within_range: boolean         // min_debt <= debt <= max_debt
    borrowable_sufficient: boolean     // enough liquidity
    quota_available: boolean           // quota limit not reached
    is_paused: boolean
    is_expired: boolean
  }
}
```

**Agent logic:** All constraints pass → expected HF > safety threshold (e.g. 1.5) → net APY positive → entry cost acceptable → proceed to Preview.

---

## Stage 4: Preview

> **Human analogy:** you see the confirmation modal — "You will receive X shares, gas cost Y" — and decide whether to click Confirm.
>
> **Agent:** calls a simulation endpoint that dry-runs the transaction against current chain state. Compares result to Propose expectations. Any significant deviation → abort.

### Tool: `simulate_deposit` (LP)

**Agent calls:**
```typescript
simulate_deposit({
  pool_address: string,
  amount: string,
  min_shares: string,          // slippage bound from Propose
})
```

**API returns:**
```typescript
interface DepositSimulation {
  success: boolean
  shares_received: string             // simulated output
  gas_estimate: string                // in wei
  gas_estimate_usd: number
  deviation_from_expected_bps: number // vs Propose expected_shares
  warnings: string[]                  // e.g. "pool utilization will exceed 95% after deposit"
  calldata: string                    // ready-to-submit tx data
}
```

**Agent logic:** success = true → deviation < threshold → gas acceptable → no critical warnings → proceed to Execute.

---

### Tool: `simulate_position` (CA)

**Agent calls:**
```typescript
simulate_position({
  cm_address: string,
  collateral_token: string,
  collateral_amount: string,
  debt_amount: string,
  swap_route?: SwapRoute,       // optional preferred route
})
```

**API returns:**
```typescript
interface PositionSimulation {
  success: boolean
  health_factor: number                // simulated HF after open
  position_value_usd: number
  debt_total: string                   // incl. all fees
  token_balances: Array<{
    token: TokenRef
    balance: string
    value_usd: number
  }>
  actual_leverage: number
  swap_impact_bps: number              // actual slippage in simulation
  gas_estimate: string
  gas_estimate_usd: number
  deviation_from_expected: {
    hf_delta: number                   // vs Propose expected_hf
    leverage_delta: number
  }
  warnings: string[]
  multicall_data: string               // ready-to-submit multicall
}
```

**Agent logic:** success = true → simulated HF > safety threshold → swap impact < max → leverage close to target → proceed to Execute.

---

## Stage 5: Execute

> **Human analogy:** you click Confirm, MetaMask pops up, you sign, wait for the tx to land, then check the result.
>
> **Agent:** submits the transaction (using the calldata from Preview), waits for receipt, then reads the actual on-chain result and compares to simulation.

### Tool: `execute_transaction`

**Agent calls:**
```typescript
execute_transaction({
  calldata: string,          // from Preview simulation
  type: "deposit" | "open_position" | "adjust" | "close",
})
```

**API returns:**
```typescript
interface TransactionResult {
  tx_hash: string
  status: "success" | "reverted"
  block_number: number
  gas_used: string
  gas_cost_usd: number
}
```

After execution, the agent reads the actual result using the Monitor tools (below) and compares to simulation. Significant deviation triggers investigation.

---

## Stage 6: Monitor

> **Human analogy:** you check the Gearbox dashboard periodically — is yield holding? Is my HF safe? Did the curator change anything?
>
> **Agent:** polls monitoring tools on a schedule. Deviations from expectations trigger re-entry into the loop at Propose (adjust/exit) or Discover (find better opportunity).

### Tool: `get_pool_status` (LP Monitor)

**When:** LP agent periodically checks its pool position.

**Agent calls:**
```typescript
get_pool_status({
  pool_address: string,
  include_history?: boolean,       // for trend detection
  since_timestamp?: string,        // only events after this time
})
```

**API returns:**
```typescript
interface PoolStatus {
  // --- Yield tracking ---
  yield: {
    apy_total: number
    apy_organic: number
    apy_incentive: number
    history_90d: Array<{
      date: string
      apy_total: number
      apy_organic: number
      apy_incentive: number
    }>
  }

  // --- Value tracking ---
  share_price: string                  // bad debt canary — drops on loss socialization
  share_price_history_90d: Array<{ date: string, price: string }>

  // --- Pool health ---
  utilization_rate: number             // > 0.9 = exits difficult
  tvl: string
  tvl_usd: number
  insurance_fund_balance: string | null

  // --- Risk composition (organic drift + curator actions) ---
  composition: {
    per_token_quotas: Array<{
      token: TokenRef
      total_quoted: string
      quota_limit: string
      pct_of_total: number             // for composition shift detection
    }>
    credit_managers: Array<{
      cm_address: string
      cm_name: string
      borrowed_amount: string
      is_paused: boolean
    }>
  }

  // --- Events since last check ---
  events: Array<{
    timestamp: string
    event_type: string                 // "collateral_added" | "cm_added" | "debt_limit_changed" | ...
    description: string
    parameters: Record<string, any>
  }>
}
```

**Agent logic — trigger re-entry:**
| Condition                        | Action                                 |
| -------------------------------- | -------------------------------------- |
| APY drops below agent's floor    | → **Propose** exit (withdraw)          |
| Utilization trending > 90%       | → **Propose** partial/full exit        |
| Share price dropped (bad debt)   | → **Propose** exit                     |
| Composition shifted unacceptably | → **Propose** exit                     |
| New CM added / collateral added  | → re-run **Analyze**                   |
| Better pool found                | → **Discover** → **Propose** rebalance |

---

### Tool: `get_position_status` (CA Monitor)

**When:** CA agent periodically checks its leveraged position.

**Agent calls:**
```typescript
get_position_status({
  credit_account: string,
  include_history?: boolean,       // HF + value trend
  since_timestamp?: string,        // only events after this time
})
```

**API returns:**
```typescript
interface PositionStatus {
  credit_account: string

  // --- Core health ---
  health_factor: number                // THE metric. < 1 = liquidation
  total_value_usd: number
  twv_usd: number                     // total weighted value (HF numerator)
  total_debt_usd: number              // HF denominator
  leverage: number                     // current, may have drifted from target

  // --- Debt decomposition ---
  debt: {
    principal: string
    accrued_interest: string
    quota_interest: string
    fees: string
  }

  // --- Token positions ---
  tokens: Array<{
    token: TokenRef
    balance: string
    value_usd: number
    quota: string                      // how much counts toward HF
    liquidation_threshold: number
    lt_ramp: {
      current_lt: number
      final_lt: number
      end_timestamp: string
    } | null
    is_forbidden: boolean
    oracle: {
      price_main: number
      price_reserve: number
      last_update: string              // staleness check
      staleness_period_seconds: number
    }
  }>

  // --- Operational status ---
  enabled_tokens_count: number
  max_enabled_tokens: number
  is_paused: boolean
  expiration_date: string | null

  // --- Bots ---
  bots: Array<{
    address: string
    permissions: string[]              // e.g. ["PARTIAL_LIQUIDATION", "EXTERNAL_CALLS"]
  }>

  // --- History ---
  history: Array<{
    date: string
    health_factor: number
    total_value_usd: number
  }>

  // --- Events since last check ---
  events: Array<{
    timestamp: string
    event_type: string                 // "lt_reduced" | "token_forbidden" | "oracle_changed" | ...
    description: string
    parameters: Record<string, any>
  }>
}
```

**Agent logic — trigger re-entry:**
| Condition                              | Action                                               |
| -------------------------------------- | ---------------------------------------------------- |
| HF approaching threshold (e.g. < 1.3)  | → **Propose** deleverage or add collateral           |
| HF critical (e.g. < 1.1)               | → **Propose** emergency exit                         |
| Yield turned negative                  | → **Propose** exit                                   |
| LT ramp active, HF will breach         | → **Propose** scheduled deleverage                   |
| Expiration approaching                 | → **Propose** exit before deadline                   |
| Oracle stale > staleness period        | → **Propose** emergency exit                         |
| Main/reserve price diverged > 5%       | → **Propose** exit (safe pricing risk)               |
| Unknown bot with dangerous permissions | → **Propose** revoke + investigate                   |
| Curator changed LTs / forbade tokens   | → re-run **Analyze** on current position             |
| Better strategy found                  | → **Discover** new candidates, **Propose** migration |

---

## Shared Types

```typescript
interface TokenRef {
  symbol: string        // e.g. "WETH"
  address: string       // 0x...
  decimals: number
}

type OracleType =
  | "chainlink"
  | "redstone"
  | "hardcoded"
  | "bounded"
  | "composite"
  | "curve_lp"
  | "yearn"
  | string              // extensible

interface IRMParams {
  u1: number
  u2: number
  r_base: number
  r_slope1: number
  r_slope2: number
  r_slope3: number
}

interface SwapRoute {
  path: string[]        // token addresses
  adapters: string[]    // adapter addresses
}
```

---

## Tool Summary

| Stage    | Tool                  | Agent type | Purpose                          |
| -------- | --------------------- | ---------- | -------------------------------- |
| Discover | `list_pools`          | LP         | Browse pools, coarse filter      |
| Discover | `list_strategies`     | CA         | Browse strategies, coarse filter |
| Analyze  | `get_pool_detail`     | LP         | Deep DD on a pool                |
| Analyze  | `get_strategy_detail` | CA         | Deep DD on a strategy            |
| Propose  | `prepare_deposit`     | LP         | Formulate deposit parameters     |
| Propose  | `prepare_position`    | CA         | Formulate position parameters    |
| Preview  | `simulate_deposit`    | LP         | Dry-run deposit                  |
| Preview  | `simulate_position`   | CA         | Dry-run position open            |
| Execute  | `execute_transaction` | Both       | Submit tx on-chain               |
| Monitor  | `get_pool_status`     | LP         | Poll pool health + yield         |
| Monitor  | `get_position_status` | CA         | Poll position health + HF        |
