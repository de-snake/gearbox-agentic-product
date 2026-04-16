# Staged Agent Architecture — Canonical Agent Loop

**Date:** 2026-04-16
**Status:** Synced to the latest developer-doc structure
**Primary output this architecture feeds:** `../outputs/agentic-data-flow/00.introduction.md` plus the numbered stage files under `../outputs/agentic-data-flow/`
**Source basis:**

- `../raw-data/dev-docs/ga-overview.mdx`
- `../raw-data/dev-docs/ga-start.mdx`
- `../raw-data/dev-docs/ga-agent-loop.mdx`
- `../raw-data/dev-docs/ga-mcp.mdx`
- `../raw-data/dev-docs/ga-preview.mdx`
- `../raw-data/dev-docs/ga-execution.mdx`
- `../raw-data/dev-docs/ga-human-loop.mdx`
- `../raw-data/dev-docs/ga-bot-execution.mdx`
- `../raw-data/dev-docs/ga-architecture.mdx`

---

## What this document is

This document is the current synthesis of the Gearbox Agentic runtime structure.

It supersedes the older investment-firm-language draft as the canonical stage model. The public and developer-facing structure is now:

**Discover → Analyze → Propose → Preview → Execute → Monitor**

That is the structure the SDK, MCP server, preview flow, and execution modes are now organized around.

`../outputs/agentic-data-flow/00.introduction.md` is the entry point to the split output spec. The numbered stage files define what data the system needs to serve. This document defines how an agent consumes that data across stages, what each stage produces, and where loop-backs happen.

---

## Core architecture

- Agent path: agent → MCP server → Gearbox SDK
- Frontend path: frontend → Gearbox SDK

The important architecture decision is that both agents and frontends sit on top of the same SDK surface.

- Agents access the SDK through MCP tools.
- Frontends access the SDK directly.
- Both paths use the same canonical domain types.
- The SDK talks to two backends:
  - on-chain RPC for live state, transaction building, and simulation
  - backend API for history, cached metrics, and metadata

### One type, one tool, one component

The latest developer docs introduce a stronger unification principle than the earlier draft:

- one SDK type powers the API response
- the same type is exposed as an MCP tool result for agents
- the same type is renderable as a UI component for humans

This matters because the architecture is not only a backend handoff. It is also a transport and presentation model.

---

## Canonical 6-step loop

```text
Discover → Analyze → Propose → Preview → Execute → Monitor
                     ↑           ↓ fail         ↓ success
                     └──────── Monitor-triggered review ────────┘
```

There are two critical loop rules in the latest version:

1. **Preview failure loops back to Propose, not Analyze.**
   The research may still be valid. Only execution parameters need adjustment.

2. **Monitoring events loop back to Analyze, not directly to Propose.**
   When conditions change, the agent first re-evaluates the situation with fresh data before deciding what to do.

### Stage summary

| Step | Purpose | Who decides | Primary input | Primary output | Loop behavior |
|---|---|---|---|---|---|
| Discover | Scan current opportunities across chains | SDK returns data; agent filters | search criteria | shortlist | flows to Analyze |
| Analyze | Deep due diligence on shortlisted candidates | agent reasons over data | shortlist + detail tools | `AnalyzedOpportunity[]` | flows to Propose |
| Propose | Choose the optimal action or no-op | agent + router | analyzed candidates + portfolio context | proposal + `RawTx` or no-action decision | preview failure returns here |
| Preview | Verify exact on-chain feasibility now | SDK simulates | `RawTx` | `TransactionPreview` | success to Execute, failure to Propose |
| Execute | Sign and submit exact previewed bytes | user or bot signer | preview-approved `RawTx` | tx hash / receipt | flows to Monitor |
| Monitor | Watch live state and react to triggers | SDK returns live state; agent decides response | position status + alerts | review trigger or no-op | event triggers return to Analyze |

---

## Stage 1 — Discover

### Purpose

Discover is a broad market scan across pools, strategies, and chains.

The payload is intentionally lightweight. It is for filtering, not for final decision-making.

### Canonical methods

- `sdk.opportunities.search()`
- `sdk.pools.list()`
- `sdk.strategies.list()`

### MCP tools

- `list_opportunities`
- `list_pools`
- `list_strategies`

### Typical input

```typescript
{
  chainIds: ["Mainnet", "Monad"],
  types: ["pool", "strategy"],
  assets: [Asset.STABLE]
}
```

### What Discover returns

The stage returns opportunity summaries such as:

- headline APY
- TVL
- chain
- asset class
- access requirements
- paused / active status

The agent then applies its own filters:

- APY floor
- TVL minimum
- permissionless-only vs KYC-enabled
- asset preferences
- chain scope

### Output contract

The canonical output is a shortlist of candidates for deeper work.

```typescript
interface OpportunityShortlistItem {
  id: string
  type: "pool" | "strategy"
  chainId: string
  headlineApy: number
  tvlUsd: number
  access: "Permissionless" | "KYC'd"
}
```

---

## Stage 2 — Analyze

### Purpose

Analyze is the due-diligence stage.

This is where the agent inspects the shortlisted candidates in depth and produces a structured view of profitability, risk, and operational constraints.

### Canonical methods

- `sdk.pools.getDetail()`
- `sdk.strategies.getDetail()`
- `sdk.history.getMetric()`
- `sdk.events.getFeed()`
- `sdk.curators.getProfile()`
- `sdk.tokens.getProfiles()`
- `sdk.tokens.getMarketData()`

### MCP tools

- `get_pool_detail`
- `get_strategy_detail`
- `get_metric_history`
- `get_events`
- `get_curator`
- `get_token_info`
- `get_token_liquidity`

### Latest analysis structure from dev docs

The latest developer docs make this stage more explicit than the older draft. Analyze is now framed as a bundle of specialized research passes:

| Research pass | What it evaluates |
|---|---|
| Curator research | governance quality, track record, bad debt history |
| Token research | collateral liquidity, oracle reliability, risk classification |
| Profitability forecast | APY sustainability, yield type, trend |
| Risk scoring | collateral, curator, smart contract, market, exit |
| Final ranking | combined opportunity score |

The dev-doc formula is intentionally simple:

`finalScore = adjustedApy * (1 - overallRisk)`

### Output contract

The canonical output is a ranked `AnalyzedOpportunity[]` set.

```typescript
interface AnalyzedOpportunity {
  id: string
  type: "pool" | "strategy"
  finalScore: number
  adjustedApy: number
  overallRisk: number
  profitabilitySummary: string
  riskBreakdown: {
    collateral: number
    curator: number
    smartContract: number
    market: number
    exit: number
  }
  reasoning: string[]
}
```

### Relation to `agentic-data-flow`

`../outputs/agentic-data-flow/00.introduction.md` is the entry point, but the numbered files under `../outputs/agentic-data-flow/` should be read as the fact base for each stage.

- Discover explains what to scan.
- Analyze explains what to inspect.
- This architecture document explains how those detailed facts are consumed and compressed into a ranked candidate set.

---

## Stage 3 — Propose

### Purpose

Propose is not just “build a transaction.”

The latest developer docs define it as the stage that chooses the optimal action — or decides that no action should be taken.

That means Propose is a decision layer plus a transaction-building layer.

### Questions Propose answers

- Is the current position already good enough?
- Would rebalance cost exceed expected gain?
- What route should be used for the chosen action?
- Should the agent do nothing right now?

### Canonical methods

- `sdk.positions.prepareDeposit()`
- `sdk.positions.prepareOpen()`
- router methods such as `sdk.router.findOpenStrategyPath()`

### MCP tools

- `prepare_deposit`
- `prepare_position`

### Output contract

The canonical output is either a no-op decision or a concrete unsigned transaction.

```typescript
interface ProposedAction {
  action: "deposit" | "open_position" | "rebalance" | "do_nothing"
  rationale: string
  rawTx?: RawTx
}

interface RawTx {
  to: Address
  calldata: Hex
  value?: bigint
}
```

### Important boundary

Propose is where execution parameters are chosen.

That is why a failed preview loops back here. The agent may need to:

- reduce size
- change slippage tolerance
- switch route
- move to the next-ranked candidate from Analyze

But it does not need to repeat the entire due-diligence stage unless monitoring has established that the underlying thesis changed.

---

## Stage 4 — Preview

### Purpose

Preview is the universal security gate.

The latest developer docs are explicit: one method previews any Gearbox transaction, and it previews the exact unsigned bytes that would go on-chain.

### Canonical method

- `sdk.previewTransaction(rawTx)`

### Core rule

**Same bytes previewed = same bytes executed.**

This is the central trust boundary of the system.

### Preview output

```typescript
interface TransactionPreview {
  success: boolean
  warnings: string[]
  healthFactor?: number
  gasEstimate?: string
  actions: Array<{
    title: string
    description: string
    protocol?: string
  }>
  balanceChanges: Array<{
    token: TokenRef
    delta: string
    direction: "in" | "out"
  }>
  routes?: Array<{
    tokenIn: TokenRef
    tokenOut: TokenRef
    amountIn: string
    expectedOut: string
    priceImpactBps?: number
    dex?: string
  }>
  exitInfo?: {
    hasDelayedWithdrawal: boolean
    zeroSlippageAvailable: boolean
  }
}
```

### Validation checks

Before moving to Execute, the agent validates:

- simulation success
- projected Health Factor
- warnings
- balance changes
- action list
- route quality and price impact
- exit characteristics such as delayed withdrawal

### Loop-back rule

If preview fails, the loop is:

`Preview → Propose → Preview`

It is not:

`Preview → Analyze`

That distinction is now canonical.

---

## Stage 5 — Execute

### Purpose

Execute signs and submits the exact transaction that was previewed.

The SDK builds transactions, but never signs them.

That is the core security boundary.

### Two execution modes

| Mode | Signer | Best for |
|---|---|---|
| Human-in-the-Loop | human wallet / Safe signer | high-value positions, institutional controls, initial trust building |
| Bot Execution | bot signer with bounded permissions | automated rebalancing, liquidation protection, routine management |

### Human-in-the-Loop flow

1. agent builds `RawTx`
2. agent previews `RawTx`
3. agent encodes preview URL for `verify.gearbox.finance`
4. human reviews decoded calldata, balance changes, swap routes, projected Health Factor, and warnings
5. human signs exact previewed bytes

### Bot Execution flow

Bot execution remains permission-bounded.

The bot operates under explicit per-account permissions such as:

- `ADD_COLLATERAL`
- `INCREASE_DEBT`
- `DECREASE_DEBT`
- `WITHDRAW_COLLATERAL`
- `UPDATE_QUOTA`
- `EXTERNAL_CALLS`

The protocol still enforces solvency and permission boundaries.

### Architectural implication

Execution mode changes who signs, not what gets built or previewed.

Both modes sit on top of the same Propose and Preview stages.

---

## Stage 6 — Monitor

### Purpose

Monitor watches live state and determines when the loop should restart.

This stage is not passive reporting. It is the trigger system for renewed analysis.

### Canonical methods

- `sdk.accounts.getStatus()`
- `sdk.monitor.getAlerts()`
- `sdk.pools.getStatus()`

### MCP tools

- `get_position_status`
- `get_pool_status`

### Typical triggers

| Trigger | Urgency | Response |
|---|---|---|
| scheduled check | normal | Analyze → Propose |
| collateral price drop | elevated | quick Analyze → Propose |
| critical event | immediate | Analyze → emergency Propose |
| better opportunity detected | normal | Analyze alternatives → Propose migration |
| Health Factor approaching liquidation | urgent | Analyze → propose top-up or debt reduction |

### Canonical loop-back rule

Monitoring events return to **Analyze**, not directly to Propose.

The system first confirms what changed and how severe it is, then decides what action to take.

This is another major point clarified by the latest developer docs.

---

## MCP tool map by stage

The latest MCP mapping is now straightforward and externally visible.

| Stage | MCP tools |
|---|---|
| Discover | `list_opportunities`, `list_pools`, `list_strategies` |
| Analyze | `get_pool_detail`, `get_strategy_detail`, `get_metric_history`, `get_events`, `get_curator`, `get_token_info`, `get_token_liquidity` |
| Propose | `prepare_deposit`, `prepare_position` |
| Preview | `simulate_deposit`, `simulate_position` plus universal `sdk.previewTransaction()` at SDK level |
| Execute | `execute_transaction` |
| Monitor | `get_pool_status`, `get_position_status` |

### Runtime modes

The MCP server inherits SDK runtime modes:

- **Core-only mode** — on-chain access works, backend unavailable; history and metadata degrade
- **Enriched mode** — chain plus backend available; full history, metadata, and human-readable enrichment available

All tool responses should carry freshness metadata so the agent can reason about data quality.

---

## What changed vs the earlier draft

The older draft used an investment-firm framing such as scout, analyst, committee, and execution desk.

That framing was useful for shaping, but it is no longer the canonical external structure.

The current canonical structure from the latest developer docs is:

1. simpler
2. closer to SDK and MCP surfaces
3. explicit about loop-backs
4. explicit about preview as a universal security gate
5. explicit about execution modes
6. explicit about MCP-tool-to-stage mapping

The most important updates are:

- **Evaluate** is now **Analyze**
- **Preview failure returns to Propose**
- **Monitor events return to Analyze**
- **Preview is defined around one universal `sdk.previewTransaction()` method**
- **Execution is defined by signer mode, not by separate transaction-building logic**
- **The SDK, MCP, and frontend all sit on the same canonical type system**

---

## Practical reading order

When using this repo:

1. read `../outputs/agentic-data-flow/00.introduction.md`, then the numbered stage files, for required data surfaces
2. read this document for loop structure and stage contracts
3. read `memo-standard.md` for how Analyze compresses evidence
4. use `../raw-data/dev-docs/` as the primary evidence for the latest structure

---

## Bottom line

The current Gearbox Agentic architecture is not just a sequence of agent prompts.

It is a typed runtime loop with:

- a canonical 6-stage structure,
- one shared SDK across agents and frontends,
- a universal preview gate,
- explicit execution modes,
- and clear loop-back semantics.

That is the structure this repo should now treat as authoritative.
