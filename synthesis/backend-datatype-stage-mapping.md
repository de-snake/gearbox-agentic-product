# Backend Datatype Stage Mapping

**Sources:**
- `../outputs/agentic-data-flow/00.introduction.md`
- numbered stage and appendix files under `../outputs/agentic-data-flow/`
- `../raw-data/dev-docs/types_.ts`

This document maps the split files under `../outputs/agentic-data-flow/` back to exact technical references from `types_.ts`, while keeping the main output readable for non-developers.

Its purpose is to answer three questions:

1. what data is used at each stage,
2. what agent question that data answers,
3. which stage-critical backend types are still missing from `types_.ts`.

---

## How to read this file

| Column | Meaning |
|---|---|
| Human-readable data name | The label that should stay readable in the split `agentic-data-flow/` files. |
| Agent story | The concrete question the agent is trying to answer. |
| Tech name references | Exact field or type references tied to that data group. |
| Coverage in `types_.ts` | Whether the current backend draft already covers it, partially covers it, or does not cover it yet. |

Interpretation rule: if a row has no usable `types_.ts` reference, that is a real backend gap, not just a naming issue.

---

## High-level coverage summary

| Stage | Strong coverage already present | Largest missing pieces |
|---|---|---|
| Discover | `Opportunity`, `PoolOpportunity`, `StrategyOpportunity`, `TokenRef`, `YieldBreakdown`, `LeveragedYieldBreakdown`, collateral types | discover-query input type |
| Analyze | first-pass opportunity, yield, collateral, and token primitives | `CuratorProfile`, history series, governance/event feed, oracle metadata, RWA asset/compliance profiles |
| Propose | no canonical backend types yet | `RawTx`, proposed-action envelope, route result |
| Preview | no canonical backend types yet | `TransactionPreview`, decoded actions, balance changes, route detail, exit info |
| Execute | no canonical backend types yet | execution mode, reviewer payload, bot permission state |
| Monitor | `UserPoolPosition`, `UserStrategyPosition`, `UserCollateral`, `YieldBreakdown<ClaimableIncentive>`, `PnlBreakdown` | alerts, Health Factor attribution, delayed-withdrawal state, oracle freshness, emergency state |

---

## Stage 1 — Discover

| Human-readable data name | Agent story | Tech name references | Coverage in `types_.ts` |
|---|---|---|---|
| Opportunity identity | "What is this opportunity, and how do I refer to it later?" | `Opportunity.id`, `Opportunity.type`, `Opportunity.title` | Covered |
| Routing context | "Which chain and base asset is this on?" | `Opportunity.chainId`, `Opportunity.underlyingToken: TokenRef` | Covered |
| Curator reference | "Whose opportunity is this?" | `Opportunity.curatorId` | Partially covered — reference exists, but `CuratorProfile` does not |
| Access parameters | "Do I need to do anything before I can use this opportunity?" | `Opportunity.access.permissionless`, `Opportunity.access.kycRequired`, `Opportunity.access.kycUrl` | Covered |
| Discovery risk hints | "Is there anything I should notice before I analyze this?" | `Opportunity.risk.summary`, `Opportunity.risk.warnings` | Covered |
| Pool headline snapshot | "What does this pool pay, how large is it, and how liquid is it?" | `PoolOpportunity.yield`, `PoolOpportunity.supplied`, `PoolOpportunity.borrowed`, `PoolOpportunity.utilization`, `PoolOpportunity.tvl`, `PoolOpportunity.tvlUsd`, `PoolOpportunity.availableLiquidity` | Covered |
| Pool collateral surface | "What collateral exposure am I inheriting by lending here?" | `PoolOpportunity.collaterals: PoolCollateral[]` | Covered |
| Strategy sizing bounds | "Can I enter at the size I want?" | `StrategyOpportunity.minDebt`, `StrategyOpportunity.maxDebt` | Covered |
| Strategy capacity and leverage | "How much room is left, and how much leverage is available?" | `StrategyOpportunity.borrowableLiquidity`, `StrategyOpportunity.maxLeverage`, `StrategyOpportunity.borrowApy` | Covered |
| Strategy headline economics | "What is the best visible leveraged outcome here?" | `StrategyOpportunity.maxLeverageYield: LeveragedYieldBreakdown`, `StrategyOpportunity.bestBaseYield: YieldBreakdown` | Covered |
| Strategy collateral and operating flags | "Which collateral paths exist, and is the strategy currently usable?" | `StrategyOpportunity.collaterals: StrategyCollateral[]`, `StrategyOpportunity.isPaused`, `StrategyOpportunity.hasDelayedWithdrawal` | Covered |
| Discover query surface | "How do I ask the backend for the subset I want to scan?" | implied query fields such as `chainIds`, `types`, `assets`, access filters | Missing — no discover-query input type is drafted yet |

Note: `OpportunityKind` includes `"market"`, but the current output flow only uses `pool` and `strategy`. That is an unused branch, not a missing type.

---

## Stage 2a — Analyze (pool path)

| Human-readable data name | Agent story | Tech name references | Coverage in `types_.ts` |
|---|---|---|---|
| Yield sustainability view | "Where does pool yield come from, and has it been stable enough to trust?" | `PoolOpportunity.yield: YieldBreakdown`, plus historical supply-rate / incentive-rate / total-APY series referenced by the output doc | Partial — `YieldBreakdown` exists, but historical metric series do not |
| Pool exposure surface | "What could create bad debt in this pool?" | `PoolOpportunity.collaterals: PoolCollateral[]`, `PoolCollateral.token`, `PoolCollateral.quotaLimit`, `PoolCollateral.quotaUsed`, `PoolCollateral.quotaRate` | Partial — first-pass collateral data exists, but per-CM risk-envelope types do not |
| Liquidity and exit surface | "Can I get out when I need to?" | `PoolOpportunity.availableLiquidity`, `PoolOpportunity.utilization`, `PoolOpportunity.supplied`, `PoolOpportunity.borrowed`, `PoolOpportunity.tvl`, plus IRM / withdrawal-fee / utilization-history fields referenced by the output doc | Partial — liquidity snapshot exists, but IRM type and history series do not |
| Shared curator profile | "Who is the operator behind this pool, and what is their trust history?" | `Opportunity.curatorId`, shared `/curators` profile fields | Missing — needs `CuratorProfile` |
| Pool-specific governance context | "What could this curator change after I deposit?" | pool parameter-change log, pending governance changes | Missing — needs `GovernanceChange`, `EventFeedItem` |
| Oracle and insurance context | "How is risk priced, and what buffer exists if things go wrong?" | oracle methodology, reserve pricing, insurance-fund snapshot | Missing — no oracle metadata or insurance snapshot types are drafted |
| RWA-specific pool exposure | "Does this pool have RWA-specific liquidation or compliance risk?" | frozen-account counts, frozen-account debt, whitelisted-liquidator count, transfer-restriction type, off-chain asset profile fields | Missing — needs `RwaAssetProfile` / `RwaComplianceProfile` plus RWA pool-risk types |

---

## Stage 2b — Analyze (strategy path)

| Human-readable data name | Agent story | Tech name references | Coverage in `types_.ts` |
|---|---|---|---|
| Strategy economics snapshot | "What does this position cost, and is the yield worth it?" | `StrategyOpportunity.borrowApy`, `StrategyOpportunity.maxLeverageYield`, `StrategyOpportunity.bestBaseYield`, `StrategyOpportunity.collaterals[].yield` | Partial — headline economics exist, but historical series and entry-cost types do not |
| Collateral risk envelope | "How safe is the collateral, and what leverage or LT constraints apply?" | `StrategyOpportunity.collaterals: StrategyCollateral[]`, `StrategyCollateral.token`, `StrategyCollateral.liquidationThreshold`, `StrategyCollateral.quotaLimit`, `StrategyCollateral.quotaUsed`, `StrategyCollateral.quotaRate` | Partial — LT and quota surface exist, but forbidden-token and LT-ramp types do not |
| Exit feasibility and delayed withdrawals | "If I need to unwind, what paths are actually available?" | `StrategyOpportunity.minDebt`, `StrategyOpportunity.maxDebt`, `StrategyOpportunity.borrowableLiquidity`, `StrategyOpportunity.hasDelayedWithdrawal`, `UserCollateral.expectedWithdrawalTimestamp` | Partial — there is an early delayed-withdrawal signal, but no full delayed-withdrawal state |
| Shared curator profile | "Who is the operator behind this strategy, and what is their trust history?" | `Opportunity.curatorId`, shared `/curators` profile fields | Missing — needs `CuratorProfile` |
| Strategy operating and governance constraints | "Is this CM usable now, and what could this curator change next?" | `StrategyOpportunity.isPaused`, CM expiration, max-debt-per-block, CM-level change log, pending governance changes | Partial — `StrategyOpportunity.isPaused` exists, but the remaining constraint and governance types do not |
| Oracle and pricing context | "How is this collateral priced, and can that pricing fail in practice?" | oracle methodology, main/reserve oracle history, staleness windows | Missing — no oracle metadata types are drafted |
| RWA asset and compliance context | "What off-chain or compliance constraints does this collateral bring into the position?" | issuer, asset type, redemption mechanics, NAV update frequency, transfer restriction, KYC/access properties | Missing — needs `RwaAssetProfile` / `RwaComplianceProfile` |
| Analyze handoff compression | "What compact result should Analyze pass into Propose?" | `AnalyzedOpportunity` in the split output spec | Missing — stage-local synthesis type is not drafted in `types_.ts` |

---

## Stage 3 — Propose

| Human-readable data name | Agent story | Tech name references | Coverage in `types_.ts` |
|---|---|---|---|
| Proposed action set | "What should I do next: deposit, open, rebalance, reduce, close, or do nothing?" | `ProposedAction` from the split `outputs/agentic-data-flow/` spec | Missing — no proposed-action type is drafted yet |
| Transaction bytes | "What exact transaction do I want Preview to simulate?" | `RawTx` from the split `outputs/agentic-data-flow/` spec | Missing |
| Route-building result | "Which route did I choose, and what economics did it imply?" | router output used when building strategy actions | Missing — no route result type is drafted yet |

---

## Stage 4 — Preview

| Human-readable data name | Agent story | Tech name references | Coverage in `types_.ts` |
|---|---|---|---|
| Preview verdict | "If I simulate these exact bytes right now, is the action still acceptable?" | `sdk.previewTransaction(rawTx)` return surface described in the split output spec | Missing — needs `TransactionPreview` |
| Decoded action list | "What will this transaction actually do?" | decoded preview actions | Missing — needs `PreviewAction` |
| Balance changes | "Which tokens will move, and by how much?" | preview balance deltas | Missing — needs `BalanceChange` |
| Route and price-impact detail | "Is the route still economically acceptable at current state?" | route detail and price-impact output from Preview | Missing — needs `PreviewRoute` |
| Exit and settlement flags | "Will this create delayed withdrawals, forced holds, or other non-atomic exit states?" | preview exit / settlement fields | Missing — needs `ExitInfo` |
| Preview-to-execute handoff | "What exact payload should Execute trust after Preview passes?" | `ExecutionReadyAction` from the split output spec | Missing |

Preview is the clearest mismatch today: the runtime docs make it central, but `types_.ts` does not draft any preview-return type yet.

---

## Stage 5 — Execute

| Human-readable data name | Agent story | Tech name references | Coverage in `types_.ts` |
|---|---|---|---|
| Execution mode | "Am I asking a human to approve this, or can an automated bot execute it?" | human-in-the-loop vs bot execution path | Missing — needs execution mode enum |
| Reviewer payload | "What exactly does the human reviewer need to see before signing?" | reviewable preview payload / verifier payload | Missing |
| Bot permissions and guardrails | "What is this bot allowed to do on this account, and within what bounds?" | bot permission state, allowed action scopes, thresholds | Missing |

---

## Stage 6 — Monitor

| Human-readable data name | Agent story | Tech name references | Coverage in `types_.ts` |
|---|---|---|---|
| Pool position performance | "How is my pool position performing right now?" | `UserPoolPosition.depositSize`, `UserPoolPosition.depositSizeUsd`, `UserPoolPosition.yield`, `UserPoolPosition.pnl` | Covered |
| Strategy position safety and performance | "How is my leveraged position performing, and how close am I to trouble?" | `UserStrategyPosition.leverage`, `UserStrategyPosition.borrowApy`, `UserStrategyPosition.netApy`, `UserStrategyPosition.debt`, `UserStrategyPosition.debtUsd`, `UserStrategyPosition.healthFactor`, `UserStrategyPosition.pnl`, `UserStrategyPosition.collaterals` | Covered |
| Per-collateral monitor surface | "Which collateral sleeve is changing, yielding, or waiting to settle?" | `UserCollateral.weight`, `UserCollateral.balance`, `UserCollateral.quota`, `UserCollateral.yield`, `UserCollateral.expectedWithdrawalTimestamp` | Partial — useful starting point, but not a full settlement-state model |
| Alert and explanation layer | "Why did something change, and do I need to act now?" | monitor alerts, trigger reasons, structured explanations | Missing — needs `MonitorAlert` and explanation types |
| Health Factor attribution | "Why did my Health Factor move?" | HF movement decomposition | Missing — needs `HealthFactorAttribution` |
| Oracle and emergency state | "Did market structure or protocol state change in a way that makes my position unsafe?" | oracle freshness, reserve-price state, paused / forbidden / emergency signals | Missing |
| Governance and bot-state monitoring | "Did governance or bot permissions change since the last check?" | governance/event feed, bot permission snapshot | Missing |

---

## Cross-stage types that are already doing real work

| Type | Why it matters across stages |
|---|---|
| `TokenRef` | Provides the shared token identity layer across discovery, analysis, and monitoring. |
| `YieldBreakdown` | Gives one common structure for opportunity yield, collateral yield, and position yield. |
| `LeveragedYieldBreakdown` | Gives a canonical headline-economics shape for leveraged strategies. |
| `PoolCollateral` / `StrategyCollateral` | Reuse a common collateral surface across discovery and analysis. |
| `UserCollateral` | Already hints at settlement tracking through `expectedWithdrawalTimestamp`, even though the full state is still missing. |
| `PnlBreakdown` | Gives a reusable monetary performance format for monitoring. |

---

## Missing-type inventory to consider next

### Highest priority

- `CuratorProfile`
- discover-query input type
- `HistoricalMetricPoint` / `MetricSeries<T>`
- `GovernanceChange`
- `EventFeedItem`
- `RawTx`
- `ProposedAction`
- `TransactionPreview`
- `PreviewAction`
- `BalanceChange`
- `PreviewRoute`
- `ExecutionReadyAction`
- `MonitorAlert`

### Next layer

- `RwaAssetProfile`
- `RwaComplianceProfile`
- oracle / pricing metadata types
- insurance snapshot type
- `HealthFactorAttribution`
- `DelayedWithdrawalState`
- `ClaimableWithdrawal`
- `BotPermissionState`

---

## Bottom line

`types_.ts` is already good enough to anchor:

- unified opportunity discovery,
- first-pass pool and strategy economics,
- collateral surfaces,
- user-position monitoring.

The main missing layer is not basic opportunity data. It is the control layer around that data:

- curator and governance context,
- preview and execution contracts,
- alerting and explanation datatypes,
- RWA-specific compliance and settlement datatypes.
