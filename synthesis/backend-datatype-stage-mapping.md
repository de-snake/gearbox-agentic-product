# Backend Datatype Stage Mapping

**Sources:**
- `../outputs/agentic-data-flow.md`
- `../raw-data/dev-docs/types_.ts`

This document maps the backend datatypes drafted in `types_.ts` to the stages in `../outputs/agentic-data-flow.md`.

Its purpose is to answer three questions:

1. which backend datatype is used at which stage,
2. what decision that datatype supports,
3. what stage-critical data is still missing from `types_.ts`.

---

## High-level coverage summary

| Stage | Backend datatypes already present in `types_.ts` | Primary use | Main gaps in `types_.ts` |
|---|---|---|---|
| Discover | `Opportunity`, `PoolOpportunity`, `StrategyOpportunity`, `TokenRef`, `YieldBreakdown`, `LeveragedYieldBreakdown`, `PoolCollateral`, `StrategyCollateral` | unified opportunity scan and first-pass filtering | explicit discover query type, curator profile type |
| Analyze — pool path | `PoolOpportunity`, `YieldBreakdown`, `PoolCollateral`, `TokenRef` | pool yield, liquidity, collateral exposure | curator profile, historical metric points, governance / event feed, oracle metadata, insurance snapshot |
| Analyze — strategy path | `StrategyOpportunity`, `LeveragedYieldBreakdown`, `YieldBreakdown`, `StrategyCollateral`, `TokenRef` | strategy economics, leverage bounds, collateral surface | curator profile, event feed, oracle metadata, route-specific detail, RWA compliance detail |
| Propose | no dedicated backend type yet; consumes analyzed data | choose action or no-op, build transaction intent | `RawTx`, proposed-action type, route result type |
| Preview | no dedicated backend type yet | simulate exact transaction and validate outcomes | `TransactionPreview`, `BalanceChange`, `PreviewAction`, `PreviewRoute`, `ExitInfo`, execution-ready type |
| Execute | no dedicated backend type yet | sign / submit exact previewed bytes | execution mode type, verifier payload type, bot permission surface |
| Monitor — pool path | `UserPoolPosition`, `YieldBreakdown<ClaimableIncentive>`, `PnlBreakdown` | pool-position state, claimables, P&L | alerts, governance diff, insurance change, utilization history envelope |
| Monitor — strategy path | `UserStrategyPosition`, `UserCollateral`, `YieldBreakdown<ClaimableIncentive>`, `PnlBreakdown` | position state, debt, Health Factor, claimables, collateral state | Health Factor attribution, delayed-withdrawal state, oracle freshness, emergency-state bundle, bot-state type |

---

## Stage-by-stage mapping

## Stage 1 — Discover

### Types already drafted

| Type | Used for in the stage |
|---|---|
| `Opportunity` | shared envelope for any discoverable item |
| `PoolOpportunity` | lending-pool opportunity surface |
| `StrategyOpportunity` | leveraged-strategy opportunity surface |
| `TokenRef` | underlying token identity |
| `YieldBreakdown` | pool or base-yield summary |
| `LeveragedYieldBreakdown` | leveraged strategy headline economics |
| `PoolCollateral` | first-pass pool exposure surface |
| `StrategyCollateral` | first-pass strategy collateral surface |

### How the stage uses them

- `Opportunity` is the base discover object.
- `PoolOpportunity` and `StrategyOpportunity` are the two concrete variants currently used in the data flow.
- Discovery no longer branches into separate LP and leverage product lanes before the scan.
- The agent receives a unified opportunity feed, then narrows it agent-side.

### Missing in `types_.ts`

| Missing datatype | Why it matters |
|---|---|
| `CuratorProfile` | discovery already carries `curatorId`, but the follow-up profile type is not defined |
| discover-query input type | the docs imply filters like `chainIds`, `types`, `assets`, and access filters, but `types_.ts` does not formalize that request shape |

### Note

`OpportunityKind` includes `"market"`, but the current data-flow document only uses `pool` and `strategy`. That is not a missing type. It is an unused branch in the current output design.

---

## Stage 2 — Analyze

### Pool analysis path

| Type | Used for in the stage |
|---|---|
| `PoolOpportunity` | reused as the main pool snapshot |
| `YieldBreakdown` | yield decomposition and incentive framing |
| `PoolCollateral` | collateral and quota exposure surface |
| `TokenRef` | token identity and pricing context |

### Strategy analysis path

| Type | Used for in the stage |
|---|---|
| `StrategyOpportunity` | reused as the main strategy snapshot |
| `LeveragedYieldBreakdown` | net leveraged yield framing |
| `YieldBreakdown` | best base yield and collateral-level yield components |
| `StrategyCollateral` | leverage constraints, LT surface, collateral yield |
| `TokenRef` | underlying and collateral identity |

### Missing in `types_.ts`

| Missing datatype | Why it matters |
|---|---|
| `CuratorProfile` | analyze depends on track record, bad debt history, and curator metadata |
| historical metric point / series types | analyze uses APY, TVL, utilization, and borrow-rate history |
| event feed / governance change type | analyze depends on parameter changes and pending governance |
| oracle / pricing metadata type | analyze needs oracle methodology, staleness, and reserve-price context |
| RWA compliance / off-chain asset profile | analyze includes issuer, redemption mechanics, NAV frequency, transfer restriction type, and KYC gating |

### Stage-local synthesis type

The current output document defines `AnalyzedOpportunity` as a stage-local compressed result. This is not yet a backend draft type in `types_.ts`.

---

## Stage 3 — Propose

### Types already drafted

No dedicated backend-return type exists yet in `types_.ts`.

This stage primarily consumes analyzed data and router results, then produces a proposed action.

### Missing in `types_.ts`

| Missing datatype | Why it matters |
|---|---|
| `RawTx` | the canonical unsigned transaction shape used by Preview |
| proposed-action type | the stage needs a typed output for deposit / open / rebalance / do-nothing decisions |
| route result type | the stage depends on route-building output when constructing strategy actions |

---

## Stage 4 — Preview

### Types already drafted

No dedicated preview-return type exists yet in `types_.ts`.

### Missing in `types_.ts`

| Missing datatype | Why it matters |
|---|---|
| `TransactionPreview` | universal preview result for exact transaction simulation |
| `PreviewAction` | human-readable decoded action list |
| `BalanceChange` | net token movements |
| `PreviewRoute` | route details and price impact |
| `ExitInfo` | delayed-withdrawal / zero-slippage exit flags |
| execution-ready type | Preview passes a go / no-go result into Execute |

### Note

Preview is one of the clearest gaps between the current output design and the current backend type draft.

---

## Stage 5 — Execute

### Types already drafted

No dedicated execution type is present in `types_.ts`.

### Missing in `types_.ts`

| Missing datatype | Why it matters |
|---|---|
| execution mode enum | current docs distinguish `human_in_the_loop` and `bot_execution` |
| verifier payload type | human review flow depends on a shareable preview payload |
| bot permission state type | bot execution depends on bounded per-account permissions |

---

## Stage 6 — Monitor

### Pool-position monitoring

| Type | Used for in the stage |
|---|---|
| `UserPoolPosition` | canonical pool-position envelope |
| `YieldBreakdown<ClaimableIncentive>` | active yield + claimables |
| `PnlBreakdown` | interest, rewards, points, total P&L |

### Strategy-position monitoring

| Type | Used for in the stage |
|---|---|
| `UserStrategyPosition` | canonical strategy-position envelope |
| `UserCollateral` | per-collateral balances, quotas, claimable yield |
| `YieldBreakdown<ClaimableIncentive>` | claimable incentives |
| `PnlBreakdown` | monetary P&L |

### Missing in `types_.ts`

| Missing datatype | Why it matters |
|---|---|
| monitor alert type | the stage is driven by triggers and alerts |
| Health Factor attribution type | the stage needs structured explanation for HF changes |
| delayed-withdrawal state | pending withdrawals, claimable withdrawals, and phantom-token positions are not yet represented |
| oracle freshness / reserve-price state | monitor uses these continuously |
| emergency-state bundle | paused status, forbidden tokens, loss policy, emergency liquidator |
| bot-state / permission snapshot | monitor needs to know which bots can act on a position |

---

## Draft types that are already useful across multiple stages

| Type | Cross-stage relevance |
|---|---|
| `TokenRef` | discovery, analysis, preview explanation, monitoring |
| `YieldBreakdown` | discovery, analysis, monitoring |
| `LeveragedYieldBreakdown` | discovery and analysis for strategies |
| `PnlBreakdown` | monitoring, potentially analysis backfill |
| `ClaimableIncentive` | monitoring and user-position reporting |

---

## Missing-type inventory to consider next

This is the shortest practical list of missing datatypes implied by the current output design.

### High priority

- `CuratorProfile`
- `HistoricalMetricPoint` / `MetricSeries<T>`
- `GovernanceChange`
- `EventFeedItem`
- `RawTx`
- `TransactionPreview`
- `PreviewAction`
- `BalanceChange`
- `PreviewRoute`
- `ExecutionReadyAction`
- `MonitorAlert`

### Medium priority

- `RwaAssetProfile`
- `RwaComplianceProfile`
- `HealthFactorAttribution`
- `DelayedWithdrawalState`
- `ClaimableWithdrawal`
- `PhantomPosition`
- `BotPermissionState`

---

## Bottom line

`types_.ts` already gives a strong starting point for:

- unified opportunity discovery,
- strategy and pool yield representation,
- collateral representation,
- user-position and P&L monitoring.

The largest remaining gaps are in:

- curator and governance data,
- preview / execution datatypes,
- alerting and explanation datatypes,
- RWA-specific compliance and redemption datatypes.
