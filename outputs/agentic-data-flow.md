# Agentic Data Flow — api.gearbox.finance

## What this document is

This is the final merged product-driven specification of what `api.gearbox.finance` needs to serve to third-party agents through MCP and SDK interfaces.

It combines the original backend data requirements document with the RWA / KYC extension into one continuous **agentic data flow**. Every data requirement traces back to a specific question that an agent asks at a specific step in the lifecycle.

The document is structured as: **agent step → user question → data needed**. If someone asks "why do we need field X?", the answer is always: "because at step Y, the agent asks Z, and cannot answer it without X."

The governing principle is financial relevance. This is not a generic field dump. A field belongs here only if it helps the agent answer a decision-relevant question or avoid a specific loss vector at a specific stage.

Each field is marked as one of:

- **snapshot** — current value, needed for an immediate decision ("can I exit now?", "is my position safe?")
- **history** — time series, needed for trend analysis and sustainability assessment ("is utilization trending toward 100%?", "has yield been stable over 90 days?")
- **event log** — discrete change records, needed for attribution and governance tracking ("what changed since I last checked?", "why did my HF drop?")

Some fields appear in both snapshot and history — the agent needs the current value for decisions AND the historical series for trend assessment.

---

## Architecture overview

Two access paths matter:

- Agent path: agent → MCP server → Gearbox SDK → on-chain RPC
- Frontend path: frontend → Gearbox SDK → backend API

The current canonical runtime structure is the same one used in the latest developer docs and the updated staged-agent architecture.

Canonical loop: Discover → Analyze → Propose → Preview → Execute → Monitor.

- If Preview fails, the loop returns to Propose.
- If monitoring identifies a meaningful change, the loop returns to Analyze.

Six information stages: **Discover → Analyze → Propose → Preview → Execute → Monitor**.

This backend handoff follows that loop.

- Agents access the system through MCP tools.
- Frontends use the same SDK directly.
- Both paths consume the same underlying domain types.
- On-chain RPC provides live state, transaction building, and simulation.
- Backend API provides history, cached metrics, and metadata.

A useful design principle from the latest docs is: **one type, one tool, one component**.

- one SDK type powers the integration surface
- the same type can be exposed as an MCP tool result
- the same type can be rendered for humans in UI

This document covers the **API data requirements** needed to support that loop. The handoff contracts included below show why each field matters at a system level, not only at a single decision point.

**API surfaces:**

- `/assets` — list of all assets with properties
- `/curators` — list of curators with trust-relevant metadata (see Curator Profile below)

### Curator Profile (standalone endpoint)

Curator data is shared across pools and CMs. A standalone endpoint avoids duplication and lets the agent build a trust model once.

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|---------------------|----------------------|-----------|--------|
| Curator identity | "Who manages this opportunity, and how do I look them up?" | missing — needs `CuratorProfile.address`, `CuratorProfile.name`, `CuratorProfile.url`, and `CuratorProfile.socials` | snapshot | ? |
| Curator loss track record | "Has this curator's pools ever taken losses?" — cumulative bad debt across all managed pools. Zero means a clean track record. Non-zero means the agent investigates which pool and when. | missing — needs `CuratorProfile.badDebtHistory` | snapshot | ? |
| Curator operating breadth | "How much Gearbox operating history does this curator have?" | missing — needs `CuratorProfile.poolsManaged` and `CuratorProfile.strategiesManaged` | snapshot | ? |

---

## Stage 1: Discover — Opportunities

**What happens:** Discover returns a unified opportunity surface. The backend no longer splits the first pass into separate LP and leveraged-strategy product lanes. The agent scans `Opportunity` objects, then filters, ranks, and narrows the set for analysis.

### Primary backend objects

This stage relies on three backend object families:

- `Opportunity` — the shared opportunity envelope used for first-pass scanning.
- `PoolOpportunity` — the pool-specific extension for lending opportunities.
- `StrategyOpportunity` — the strategy-specific extension for leveraged opportunities.

Exact technical field references live in `../synthesis/backend-datatype-stage-mapping.md` and `../raw-data/dev-docs/types_.ts`.

### Common discover query dimensions

The latest developer docs imply a discover query surface such as:

- `chainIds`
- `types`
- `assets`
- access filters such as permissionless-only

The response surface is unified even when the agent later chooses to focus only on pools or only on strategies.

The tables below use human-readable data-group names in the first column. Exact technical references are grouped separately so the product doc stays readable while still mapping cleanly to `types_.ts`.

Convention for the `Tech name references` column:

- `present — ...` = explicitly represented in the current backend draft
- `partial — ...` = some grounding exists, but the full type or richer structure is still missing
- `missing — ...` = not explicitly drafted yet and should be added

### Base `Opportunity` data groups

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|---------------------|----------------------|-----------|--------|
| Opportunity identity | "What is this opportunity, and how do I refer to it later?" | present — `Opportunity.id`, `Opportunity.type`, `Opportunity.title` | snapshot | ? |
| Routing context | "Which chain and base asset is this on?" | present — `Opportunity.chainId`, `Opportunity.underlyingToken: TokenRef` | snapshot | ? |
| Curator reference | "Whose opportunity is this?" | present — `Opportunity.curatorId` | snapshot | ? |
| Access parameters | "Do I need to do anything before I can use this opportunity?" | present — `Opportunity.access.permissionless`, `Opportunity.access.kycRequired`, `Opportunity.access.kycUrl` | snapshot | ? |
| Discovery risk hints | "Is there anything I should notice before I analyze this?" | present — `Opportunity.risk.summary`, `Opportunity.risk.warnings` | snapshot | ? |

### `PoolOpportunity` extension data groups

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|---------------------|----------------------|-----------|--------|
| Pool identifier | "Which pool is this exactly?" | present — `PoolOpportunity.poolAddress` | snapshot | ? |
| Pool headline yield | "What does this pool currently pay?" | present — `PoolOpportunity.yield: YieldBreakdown` | snapshot (computed) | ? |
| Pool size and liquidity snapshot | "How large is the pool, and how much liquidity is immediately available?" | present — `PoolOpportunity.supplied`, `PoolOpportunity.borrowed`, `PoolOpportunity.utilization`, `PoolOpportunity.tvl`, `PoolOpportunity.tvlUsd`, `PoolOpportunity.availableLiquidity` | snapshot | ? |
| Pool collateral surface | "What first-pass collateral exposure am I inheriting by lending here?" | present — `PoolOpportunity.collaterals: PoolCollateral[]` | snapshot | ? |

### `StrategyOpportunity` extension data groups

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|---------------------|----------------------|-----------|--------|
| Strategy sizing bounds | "Can I enter at the size I want?" | present — `StrategyOpportunity.minDebt`, `StrategyOpportunity.maxDebt` | snapshot | ? |
| Strategy capacity and leverage | "How much room is left, and how much leverage is available?" | present — `StrategyOpportunity.borrowableLiquidity`, `StrategyOpportunity.maxLeverage`, `StrategyOpportunity.borrowApy` | snapshot | ? |
| Strategy headline economics | "What is the best visible leveraged outcome here?" | present — `StrategyOpportunity.maxLeverageYield: LeveragedYieldBreakdown`, `StrategyOpportunity.bestBaseYield: YieldBreakdown` | snapshot (computed) | ? |
| Strategy collateral surface | "Which collateral paths and quota constraints exist?" | present — `StrategyOpportunity.collaterals: StrategyCollateral[]` | snapshot | ? |
| Strategy operating flags | "Is the strategy currently usable, and does it involve non-atomic settlement?" | present — `StrategyOpportunity.isPaused`, `StrategyOpportunity.hasDelayedWithdrawal` | snapshot | ? |

### Handoff: Discover → Analyze (shortlisted opportunities)

The agent takes the returned opportunity feed, applies filters and ranking, and carries a narrowed subset into Analyze. The narrowing logic is agent-side, but the backend objects for the discover surface remain `Opportunity`, `PoolOpportunity`, and `StrategyOpportunity`. Exact field-level mappings now live in `../synthesis/backend-datatype-stage-mapping.md`.

---

## Stage 2a: Analyze — LP Due Diligence

**What happens:** LP agent has narrowed to 1–3 candidate pools. Deep analysis before depositing.

The LP has no health factor, no liquidation risk, and no leverage. Their risks are yield decay, exit liquidity drying up, bad debt socialization, and silent exposure changes by curators.

### Primary backend inputs

- `PoolOpportunity`
- `YieldBreakdown`
- `PoolCollateral`
- `TokenRef`

### Q1-LP: "Where does pool yield come from? Is it sustainable?"

LP yield has two components: organic (supply rate from borrower interest + quota revenue) and incentive (external rewards). The LP doesn't need to decompose organic rate into IRM vs quota — they see it as one number. But they need history on both to assess sustainability.

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Supply rate (organic) | "What do I earn from the pool itself?" — if organic rate is low, yield depends on incentives which can disappear. The agent prefers pools where organic rate alone meets the floor. | present — `YieldBreakdown.base` | snapshot + history (90d daily) | ? |
| Incentive yield (Merkl campaigns) | "What extra rewards am I getting?" — Merkl campaigns are straightforward, historical rates available from backend. The agent checks if incentives have been stable or declining. | partial — generic incentives exist via `YieldBreakdown.incentives[]`; Merkl-specific source tagging is missing | snapshot + history (90d daily) | ? |
| Incentive yield (protocol-specific campaigns) | Some pools have non-standard reward programs (e.g., apple farm) with tricky distribution. Only approximate rates / projections possible. The agent treats these as unreliable upside, not base case. | partial — generic incentives exist via `YieldBreakdown.incentives[]`; protocol-specific campaign typing is missing | snapshot (approximate) | ? |
| Total APY (composite) | "What's the total yield?" — combined organic + incentive. The agent compares this to its target return and checks if historical composite has been stable. | present — `YieldBreakdown.totalApy` | snapshot + history (90d daily) | ? |

### Q2-LP: "What could blow up my pool?" (Exposure chain)

The LP's real risk is indirect: borrowers hold risky collateral, collateral depegs or crashes, positions get liquidated with bad debt, and the pool's insurance fund takes the loss. The LP needs to trace the full exposure chain.

**Exposure chain:** Pool (aggregate) → CMs (per risk envelope) → tokens within each CM. The data splits into two levels: pool-level (total exposure, insurance, quotas, oracle) and per-CM (what each risk envelope allows). The agent needs both to assess whether the pool's risk is concentrated or diversified.

#### Pool level

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Total debt limit | "What's the governance-set cap?" — rarely a binding constraint in practice (usually comparable to or larger than pool TVL), but the agent notes it as a ceiling. | missing — needs a pool-level debt limit field | snapshot | ? |
| Quoted tokens list | "What collateral exists in the system?" — signals the pool's risk surface. More exotic tokens = less predictable risk. | present — `PoolOpportunity.collaterals[].token` | snapshot | ? |
| Per-token quota rate | "Which tokens are in high borrowing demand?" — quota rate is an additional borrow cost for those who use a specific collateral. Higher rate = more demand to borrow against that token. The agent reads this as a proxy for how actively a collateral type is used. | present — `PoolCollateral.quotaRate` / `StrategyCollateral.quotaRate` / `UserCollateral.quota` | snapshot | ? |
| Per-token quota limit | "What's the cap on each token's exposure?" — the agent checks how close total quoted is to the limit. Near-cap = exposure can't grow further, which can be reassuring. | present — `PoolCollateral.quotaLimit` / `StrategyCollateral.quotaLimit` | snapshot | ? |
| Per-token total quoted | "How much exposure exists right now per token?" — the agent compares this to the quota limit. | present — `PoolCollateral.quotaUsed` | snapshot | ? |
| Insurance fund (treasury dToken balance) | "Is there a bad debt buffer?" — if large, gives additional conviction. If small or absent, that's normal in DeFi and not a dealbreaker — insurance funds are uncommon across the industry. The agent treats this as upside signal, not a requirement. | missing — needs an insurance fund snapshot type | snapshot | ? |
| Oracle methodology per token | "How is each collateral token priced?" — pool-level (PriceOracle is shared across CMs). There is no universally "good" or "bad" oracle type. Market oracle on a liquid token works well, but on a thin market = manipulation risk. Hardcoded oracle protects against manipulation, but if real price diverges significantly, positions can't be liquidated. The right type depends on the asset's fundamental properties and available reference markets. The agent needs the methodology to compare against what it knows about the token. | missing — needs oracle metadata fields | snapshot | ? |

#### Per credit manager (nested under pool)

Each CM is a separate risk envelope with its own collateral rules. A pool may have multiple CMs — the LP is exposed to all of them.

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| CM name / address | Identification — the agent needs to distinguish CMs to assess risk concentration. | missing — needs a Credit Manager descriptor type | snapshot | ? |
| Liquidation threshold per token | Implicitly gives the collateral token list. Non-zero LT = real exposure; zero LT = no risk from this token. Higher LT = more leverage allowed = more bad debt risk for the LP. | present — `StrategyCollateral.liquidationThreshold` | snapshot | ? |
| Borrowed amount | "How much debt is at risk through this CM right now?" — the agent checks if one CM dominates the pool's total debt (concentration risk). | missing — needs a per-Credit-Manager borrowed amount field | snapshot | ? |
| Debt limit | "How much MORE debt could accumulate through this CM?" — high remaining capacity = exposure can grow. | missing — needs a per-Credit-Manager debt limit field | snapshot | ? |
| Is paused (facade) | "Is this CM operational?" — paused CM can't take new positions (exposure shrinks), but existing underwater positions can't be liquidated either. This creates a second-level risk: bad debt can accumulate in paused CMs because the normal liquidation mechanism is disabled. The agent checks: is the CM paused AND does it have significant borrowed amount? | present — `StrategyOpportunity.isPaused` | snapshot | ? |

### Q2-LP extension: "What RWA-specific risks am I exposed to?"

The LP's existing exposure chain analysis (pool → CMs → tokens) covers generic collateral risk. But RWA collateral introduces three new loss vectors that don't exist with standard DeFi tokens:

1. **Frozen account bad debt** — Securitize can freeze individual Credit Accounts. A frozen account can't be liquidated even when HF < 1. Bad debt accumulates silently and eventually socializes to the pool.
2. **Liquidator scarcity** — only Securitize-whitelisted liquidators can receive RWA tokens. Smaller liquidator pool = slower liquidation = more bad debt.
3. **Off-chain asset risk** — the RWA token's value depends on an off-chain asset managed by a third party. The on-chain system can't mitigate off-chain credit events.

#### Per CM (nested under pool, extends Q2-LP per-CM table)

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Has RWA collateral | "Does this CM allow tokenized securities?" — binary flag. If yes, the LP needs to assess the three RWA-specific loss vectors below. If no, standard analysis is sufficient. | missing — needs an RWA collateral flag on the Credit Manager risk surface | snapshot | ? |
| Frozen accounts count | "How many accounts in this CM are currently frozen?" — frozen accounts can't be liquidated. Each one is a potential bad debt source. Zero = no freeze risk right now. Non-zero = the LP checks: what's the total debt in frozen accounts vs the pool's insurance fund? | missing — needs an RWA freeze-state monitor type | snapshot | ? |
| Frozen accounts total debt | "How much debt is locked in frozen positions?" — the actual exposure. If this exceeds the insurance fund, the LP bears the excess as potential socialized loss. | missing — needs an RWA freeze-debt field | snapshot | ? |
| Whitelisted liquidator count | "How many liquidators can actually liquidate RWA positions?" — proxy for liquidation speed. Standard DeFi tokens: anyone can liquidate. RWA tokens: only whitelisted addresses. If the count is low (e.g., < 5), liquidation may be slow, increasing bad debt risk. | missing — needs `RwaComplianceProfile.whitelistedLiquidatorCount` | snapshot | ? |
| Transfer restriction type | "What compliance standard governs the RWA tokens in this CM?" — e.g., DS Token Protocol (Securitize), ERC-3643, or custom. Tells the LP which compliance framework applies and how restrictive transfers are. | missing — needs `RwaComplianceProfile.transferRestrictionType` | snapshot | ? |

#### Off-chain asset properties (per RWA token, extends Q2-LP pool-level)

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Underlying off-chain asset type | "What real-world asset backs this token?" — e.g., US Treasury bills, corporate credit, real estate. Determines the credit risk model: Treasuries ≈ sovereign risk, corporate credit = default risk, real estate = valuation risk. | missing — needs `RwaAssetProfile.assetType` | snapshot | ? |
| Issuer / fund manager | "Who manages the off-chain asset?" — counterparty risk. The agent may check the issuer against known entities or credit ratings. | missing — needs `RwaAssetProfile.issuer` / `RwaAssetProfile.fundManager` | snapshot | ? |
| Redemption mechanism | "How does the token convert back to cash?" — on-demand redemption, periodic windows (e.g., monthly), or secondary market only. Affects the LP's indirect exit risk: if borrowers can't redeem RWA quickly, liquidation proceeds may be delayed. | missing — needs `RwaAssetProfile.redemptionMechanism` | snapshot | ? |
| Redemption delay | "How long does it take to get cash out?" — in hours or days. Longer delay = more price risk during liquidation. | missing — needs `RwaAssetProfile.redemptionDelay` | snapshot | ? |
| NAV update frequency | "How often is the off-chain asset revalued?" — daily, weekly, monthly. Infrequent NAV updates mean the oracle price may be stale relative to the real asset value. | missing — needs `RwaAssetProfile.navUpdateFrequency` | snapshot | ? |

---

### Q3-LP: "Can I withdraw when I need to?"

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Available liquidity | "How much can I withdraw right now?" — if less than the agent's position, it can only partially exit. | present — `PoolOpportunity.availableLiquidity` | snapshot | ? |
| Expected liquidity | Total pool value including accrued interest — context for available liquidity as a percentage. | missing — needs a projected liquidity field | snapshot | ? |
| Total borrowed | "How much is lent out and unavailable?" — the agent computes: available / expected = how liquid the pool actually is. | present — `PoolOpportunity.borrowed` | snapshot | ? |
| Utilization rate | "Is liquidity tight?" — primary exit risk signal. Above 90% = withdrawals may be difficult or delayed. | present — `PoolOpportunity.utilization` | snapshot | ? |
| Withdrawal fee | "What does exit cost?" — max 100 bps. The agent factors this into net return calculation. | missing — needs a withdrawal fee field | snapshot | ? |
| IRM parameters (U1, U2, Rbase, Rslope1-3) | "If utilization spikes, will borrow cost push borrowers to repay?" — steep slope above U2 = borrowers repay faster, freeing liquidity. Flat slope = liquidity stays locked. | missing — needs an interest-rate-model parameter type | snapshot | ? |
| Is borrowing above U2 forbidden | "Is there a safety net for LP exits?" — if true, liquidity above U2 is reserved for LP withdrawals. The agent knows exit is protected even at high utilization. | missing — needs a borrow-above-U2 policy flag | snapshot | ? |
| Utilization per pool (90d daily) | "Is utilization trending toward 100%?" — steady rise = exit getting harder. The agent checks if the current snapshot is normal or an outlier. | missing — needs a utilization history series | history | ? |
| TVL per pool (90d daily) | "Is capital leaving?" — declining TVL = other LPs are exiting first, which can accelerate the problem. | missing — needs a TVL history series | history | ? |

### Q4-LP: "Who manages this pool?"

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Curator/controller address | "Who can change pool and CM parameters?" — the agent may check this address against a whitelist or look at on-chain history. | present — `Opportunity.curatorId` | snapshot | ? |
| Curator name | Human-readable identity for the agent's trust assessment. | missing — needs `CuratorProfile.name` | snapshot | ? |

### Q5-LP: "What could change after I deposit?"

The LP cares about changes that widen their risk surface: new risky collateral added, debt limits raised, insurance thresholds modified.

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Parameter change log (pool-level) | "Has the curator been active?" — recent collateral additions, debt limit increases, or IRM changes signal an evolving risk profile. No changes in months = stable. Frequent changes = the agent monitors more actively. | missing — needs `EventFeedItem` / `GovernanceChange` coverage | event log | ? |
| Pending governance changes | "What's about to change?" — queued transactions in Safe TX queue or timelock. The backend should return a structured list with description, expected execution time, and affected parameters. Example: "BASE_INTEREST_RATE: 4% → 6%, executes in 48h." The agent assesses: does this change my risk profile? Should I wait before depositing? | missing — needs `GovernanceChange[]` | snapshot | ? |

---

## Stage 2b: Analyze — CA Due Diligence

**What happens:** CA agent has narrowed to 1–3 candidate strategies. Deep analysis before opening a leveraged position.

Each field includes the agent's decision story: what question is being answered, what action follows from the answer.

### Primary backend inputs

- `StrategyOpportunity`
- `LeveragedYieldBreakdown`
- `YieldBreakdown`
- `StrategyCollateral`
- `TokenRef`

### Q1-CA: "What will this position cost me, and is the yield worth it?"

The agent is computing: (collateral yield x leverage) - borrow cost - quota fees - protocol fees = net yield. It needs each component to model the position economics, and it needs history to assess whether those economics are stable.

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Collateral token yield (base APY) | "What does my target collateral earn on its own?" — e.g., stETH earns staking yield. If this yield is lower than borrow cost, the position is unprofitable regardless of leverage. | present — `StrategyCollateral.yield.base` | snapshot + history (90d daily) | ? |
| Borrow rate | "What do I pay to borrow the underlying?" — the agent subtracts this from collateral yield. If borrow rate > collateral yield, more leverage = more loss. | present — `StrategyOpportunity.borrowApy` / `UserStrategyPosition.borrowApy` | snapshot + history (30d daily) | ? |
| IRM parameters (U1, U2, Rbase, Rslope1-3) | "If more people borrow, how fast does my cost spike?" — the agent models: at current utilization I pay X, at +10% utilization I pay Y. Steep slope = fragile economics. | missing — needs an interest-rate-model parameter type | snapshot | ? |
| Per-token quota rate | "What's the annual holding cost for my collateral in the quota system?" — this is an additional cost on top of borrow rate. High quota rate on my target token = position bleeds even when prices are flat. | present — `PoolCollateral.quotaRate` / `StrategyCollateral.quotaRate` / `UserCollateral.quota` | snapshot | ? |
| Per-token quota increase fee | "What's the one-time entry cost?" — the agent adds this to position setup cost. | missing — needs a quota-increase-fee field | snapshot | ? |
| Fee parameters (liquidation fee, premium) | "If I get liquidated, how much do I lose beyond the position value?" — the agent factors this into worst-case modeling. Higher fees = more severe liquidation penalty. | missing — needs liquidation-fee and premium fields | snapshot | ? |
| Entry swap cost estimate (at position size) | "How much do I lose just getting in?" — swapping underlying→collateral (e.g., USDC→USDe) has a cost. At moderate positions, this can be $100-200. If strategy earns 3-4% APY, that's 2-3 weeks of profit before breakeven on entry alone. The agent uses this to filter out strategies where entry friction eats the yield. | missing — needs a router quote / route result type | snapshot (computed, from router) | ? |
| Breakeven period | "How long until entry cost is recovered?" — `entry_cost / daily_net_yield`. If breakeven > agent's time horizon, the strategy is uneconomical regardless of headline APY. | missing — needs a computed breakeven field | snapshot (computed) | ? |

### Q2-CA: "How safe is my collateral? What could cause sudden liquidation?"

The agent needs to understand WHAT it's taking exposure to (the asset itself) and HOW Gearbox configures risk around it (LT, oracle, quotas). These are separate concerns: the asset has inherent properties (who issued it, how liquid it is, withdrawal delays), while the Gearbox parameters are governance configuration on top.

#### Asset properties (per collateral token)

The agent is deciding whether to hold a specific asset inside a leveraged position. Before looking at Gearbox-specific parameters like LT and oracle config, it needs to understand the asset itself.

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Issuer | "Who issued this token?" — for tokenized/RWA assets, issuer identity is the primary counterparty risk. For native tokens (WETH), irrelevant. For LSTs (stETH, cbETH), the issuer is the staking protocol — the agent assesses its track record. | missing — needs richer asset metadata such as `RwaAssetProfile.issuer` | snapshot | ? |
| Asset type | "What kind of asset is this?" — native, wrapped, LST, LP token, RWA, stablecoin, synthetic. Determines the risk model: stablecoins have depeg risk, LSTs have validator risk, LP tokens have impermanent loss, RWA has issuer/legal risk. | partial — `AssetRef.type` exists, but the richer collateral taxonomy described here is missing | snapshot | ? |
| Native lock-up / withdrawal queue | "Does this token inherently have delays?" — background context about the asset itself, independent of Gearbox. E.g., stETH has a native unstaking queue (~1-5 days), RWA tokens may have redemption windows. The agent uses this to understand the asset's fundamental liquidity properties. Whether Gearbox supports this withdrawal path is a separate, strategy-specific question (see Per-token Gearbox parameters below). | missing — needs an asset lock-up / withdrawal metadata field | snapshot | ? |
| Underlying yield source | "What does this asset earn and why?" — stETH earns staking yield, Curve LP earns trading fees, RWA earns off-chain returns. The agent needs to know the yield mechanism to assess sustainability: on-chain yield (observable) vs off-chain yield (trust-based). | missing — needs an asset yield-source field | snapshot | ? |
| Historical volatility (90d daily) | "How much does this asset's price move?" — high volatility + high leverage = HF swings. The agent sizes positions based on expected price range. | missing — needs a volatility history series | history | ? |

#### Per-token Gearbox parameters

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Liquidation threshold per token | "What's my max leverage on this collateral?" — LT directly determines HF. LT of 85% = max ~6.5x leverage before liquidation. The agent sizes its position based on this. | present — `StrategyCollateral.liquidationThreshold` | snapshot | ? |
| Max leverage (computed from LT) | "How much leverage can I take?" — `1 / (1 - LT)`. Backend should serve this as a pre-computed field so agents don't need to calculate. LT 85% = 6.67x, LT 90% = 10x. The agent compares this to its target leverage. | present — `StrategyOpportunity.maxLeverage` | snapshot (computed) | ? |
| LT ramp schedule | "Is my LT about to decrease?" — if a ramp is active, the agent knows its HF will drop on a schedule even with no price movement. It must plan to deleverage or exit before the ramp reaches a dangerous level. | missing — needs an LT-ramp schedule type | snapshot | ? |
| Forbidden tokens mask | "Can I enter this collateral, or am I forced to exit?" — if the agent's target token is forbidden, it cannot open the position. If forbidden after opening, it must exit. | missing — needs a forbidden-token state field | snapshot | ? |
| Delayed withdrawal support | "Can I use this token's native exit path from this CM?" — not all CMs have adapters for a token's withdrawal mechanism. A token may have a native 7-day unstaking queue, but if this CM lacks the adapter, that path is unavailable — the agent can only swap via allowed routes. Source: `WithdrawalCompressor.getWithdrawableAssets(creditManager)` — returns tokens with withdrawal adapters and `withdrawalLength` (seconds). Empty = no delayed withdrawal support. See Stage 3b "Delayed withdrawals" for monitoring in-flight state. | partial — `StrategyOpportunity.hasDelayedWithdrawal` exists, but per-token support details are missing | snapshot | ? |
| Adapter-accessible liquidity | "How much liquidity can I actually reach?" — the agent can only route through adapters allowed in this CM, not all on-chain liquidity. A token may have deep liquidity on Uniswap, but if the CM only has a Curve adapter, the agent is limited to Curve pools. The price impact field (Exit feasibility) reflects this constraint — it's router liquidity through allowed paths, not total market depth. | missing — needs adapter-scoped route liquidity fields | snapshot | ? |

#### Oracle risk (per token)

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Oracle methodology | "How is my collateral priced, and does that match the asset?" — no oracle type is inherently good or bad. Market oracle on a liquid token = fine. Market oracle on a thin market = manipulation risk (someone inflates price, borrows against it, leaves bad debt). Hardcoded oracle = safe from manipulation, but if real price drops below the hardcoded value, the position can't be liquidated and losses grow silently. The agent compares the oracle type to what it knows about the token's market structure. | missing — needs oracle metadata fields | snapshot | ? |
| Historical main oracle price (90d daily) | "Has the oracle been stable, or has it had glitches/deviations?" — past oracle instability = future liquidation risk. The agent checks for price spikes, stale periods, or gaps. | missing — needs a main-oracle price history series | history | ? |
| Historical reserve oracle price (90d daily) | "Has the backup oracle tracked the main one?" — large historical divergence between main and reserve means safe pricing will kick in unpredictably, dropping HF. | missing — needs a reserve-oracle price history series | history | ? |
| Oracle staleness period | "How long can the oracle be stale before the system notices?" — longer staleness tolerance = larger window where the agent is flying blind. The agent prefers tokens with short staleness periods. | missing — needs an oracle staleness field | snapshot | ? |

#### Structural risk disclosure

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| risk_disclosure | Structural risk description for this collateral in this CM — e.g., "In case of bad debt exceeding insurance fund, losses are socialized across all LPs" or "This collateral has a 7-day withdrawal queue; forced exit may take longer." Not an assessment or rating — a factual statement about the risk structure that the agent factors into its model. | missing — needs a structural risk disclosure field | snapshot | ? |

**Cross-reference: borrow rate as liquidation risk.** Borrow rate history (Q1-CA) also serves as a risk signal here. Extreme rate spikes can cause liquidation via rapid interest accrual, not just reduced profit. Historical episodes exist where high utilization drove borrow rates to 80%+, wiping months of yield in days AND triggering liquidation. The agent uses borrow rate history from Q1 in both cost and risk assessment.

#### Exit feasibility

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Price impact via router (at position size) | "If I need to exit, how much do I lose to slippage?" — the agent simulates selling its full position through allowed adapters only (not total on-chain liquidity). If price impact at its size is >2%, the effective liquidation threshold is lower than the nominal LT. Needs both current AND historical to assess: is today's liquidity normal or thin? | missing — needs route-preview / price-impact fields | snapshot + history (90d daily) | ? |
| Borrowable liquidity (remaining in CM) | "Can I adjust leverage later?" — if borrowable is near zero, the agent can't increase leverage or refinance. It must decide now if the current leverage is sufficient. | present — `StrategyOpportunity.borrowableLiquidity` | snapshot | ? |
| Min/max debt | "Can I iteratively unwind?" — if the agent partially exits and remaining debt approaches minDebt, it can't repay any more incrementally. It must either close the entire remaining position in one transaction or leave it. The agent plans its exit strategy around these boundaries. | present — `StrategyOpportunity.minDebt`, `StrategyOpportunity.maxDebt` | snapshot | ? |

### Q2-CA extension: "What RWA-specific risks does my collateral have?"

The existing Q2-CA covers generic collateral safety (LT, oracle, exit feasibility). RWA collateral adds compliance-layer risks that can immobilize or devalue the position independent of market conditions.

#### Compliance risk (per RWA token in the CM)

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Transfer restriction type | "Who controls whether I can move this token?" — DS Token Protocol means Securitize's registry is the gatekeeper. Every transfer (deposit, withdrawal, liquidation) must pass the whitelist check. The agent understands: this isn't just price risk — there's a compliance layer that can block transactions. | missing — needs `RwaComplianceProfile.transferRestrictionType` | snapshot | ? |
| Freeze capability | "Can someone freeze my specific account?" — if the CM uses SecuritizeKYCFactory, the Securitize admin can call setFrozenStatus() on the agent's Credit Account. When frozen: no deposits, no withdrawals, no borrowing, no repaying, no liquidation. Total immobilization. The agent factors this into its risk model: there exists an external actor who can lock the position regardless of HF. | missing — needs `RwaComplianceProfile.freezeCapability` | snapshot | ? |
| Freeze authority | "Who has the power to freeze me?" — the specific admin address or entity. The agent may assess: is this a multisig? A single EOA? A regulated entity with legal obligations? | missing — needs `RwaComplianceProfile.freezeAuthority` | snapshot | ? |
| Investor reassignment risk | "Can someone transfer ownership of my position?" — Securitize admin can call setInvestor() to reassign the Credit Account to a different investor. The agent understands this is for estate settlement / lost keys, but it means an external party can change position ownership. | missing — needs `RwaComplianceProfile.investorReassignmentRisk` | snapshot | ? |

#### Exit constraints (extends Q2-CA exit feasibility)

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Whitelisted liquidator count | "If I get liquidated, who can actually execute it?" — same field as LP analysis, but from the CA perspective. Few liquidators = the agent may sit in a liquidatable state longer, accumulating more bad debt (worse remaining funds after liquidation). | missing — needs `RwaComplianceProfile.whitelistedLiquidatorCount` | snapshot | ? |
| Redemption windows | "When can I actually redeem the underlying asset for cash?" — some RWA tokens only allow redemption during specific windows (e.g., month-end). Outside the window, the only exit is secondary market (if any). The agent plans position exits around these windows. | missing — needs `RwaAssetProfile.redemptionWindows` | snapshot | ? |
| Secondary market liquidity | "Can I sell this token without redemption?" — some RWA tokens trade on DEXes or OTC. If secondary market exists, exit is possible anytime (with price impact). If no secondary market, the agent is locked to redemption windows. | missing — needs a secondary-market-liquidity field | snapshot | ? |

### Q3-CA extension: "What are the operational constraints of a KYC-gated CM?"

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Operation routing | "How do I interact with this CM?" — KYC-gated CMs route all operations through the SecuritizeKYCFactory → SecuritizeWallet → CreditFacade chain. The agent can't call CreditFacade directly. This affects how the agent constructs transactions. | missing — needs a KYC-operation-routing field | snapshot | ? |
| Bot permissions blocked | "Can I use automated bots?" — SecuritizeWallet explicitly blocks bot permissions. No third-party automation without going through the factory. The agent knows: position management must go through the KYC factory, not via bot adapters. | missing — needs `BotPermissionState` and KYC execution constraints | snapshot | ? |

---

### Q3-CA: "Who manages this strategy, and what are the hard constraints?"

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Curator/controller address + name | "Who can change my position's parameters?" — the agent may have a whitelist of trusted curators, or may check on-chain history of this address. Unknown curator = higher risk premium. | partial — `Opportunity.curatorId` exists, but standalone curator profile fields are missing | snapshot | ? |
| Facade paused status | "Can I actually open/close positions right now?" — if paused, the agent cannot enter. It waits or skips. | present — `StrategyOpportunity.isPaused` | snapshot | ? |
| CM expiration date | "When am I forced to exit?" — expirable strategies have a deadline. The agent must factor in: is the remaining time long enough for the strategy to be profitable after entry costs? | missing — needs a Credit Manager expiration field | snapshot | ? |
| Max debt per block multiplier | "Is borrowing actually enabled?" — 0 means no new borrows allowed. The agent skips this strategy entirely. | missing — needs a max-debt-per-block field | snapshot | ? |

### Q4-CA: "What has changed recently, and what might change next?"

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Parameter change log (CM-level) | "Has the curator been active?" — recent LT reductions = the agent's HF could drop again. Recent token forbids = exit routes may shrink. No changes in 6 months = stable. Frequent changes = the agent must monitor more actively. | missing — needs `EventFeedItem` / `GovernanceChange` coverage | event log | ? |
| Pending governance changes | "What's about to change for my strategy?" — same as LP Q5: queued Safe TX / timelock transactions. The backend should return a structured list with description, expected execution time, and affected parameters. The agent checks: is an LT reduction coming? A token forbid? An IRM change that would spike borrow costs? | missing — needs `GovernanceChange[]` | snapshot | ? |

### Handoff: Analyze → Propose (analyzed shortlist)

The Analyze stage produces a ranked analyzed shortlist. `../synthesis/memo-standard.md` remains the detailed reference for how this compression can be serialized, but the canonical handoff content is now aligned to the latest agent-loop structure.

In plain language, each analyzed handoff item should contain:

- opportunity identifier,
- opportunity category,
- final score,
- adjusted return estimate,
- overall risk score,
- profitability summary,
- risk breakdown across collateral, curator, smart-contract, market, and exit risks,
- evidence-backed reasoning notes.

Every compressed field must still be evidence-backed. The API serves raw facts from this document; the agent performs the reasoning and ranking.

---

## Stage 3: Propose — Action selection and transaction construction

**What happens:** The agent chooses the optimal action — or decides to do nothing. This stage consumes analyzed candidates, existing position context, and route-building logic to construct a proposed action.

**Input:** ranked analyzed opportunities, plus portfolio constraints and any existing positions if the action is a rebalance.

**Output → Preview:**

The proposal output should contain, for each recommended action:

- the candidate reference,
- the chosen action type,
- the rationale,
- optional amount sizing,
- optional target leverage,
- optional collateral choice,
- the exact unsigned transaction package when execution is required.

This stage is not only transaction building. It also answers:

- is the current position already acceptable,
- would rebalance cost exceed expected gain,
- should the agent choose a different route,
- should the agent explicitly do nothing right now.

No new backend data requirements are introduced here. The stage works from Analyze outputs plus live SDK and router reads. Cross-pool correlation and portfolio concentration remain agent-side concerns.

---

## Stage 4: Preview — Universal transaction validation

**What happens:** Preview simulates the exact transaction package against current chain state. It is the universal security gate between Propose and Execute.

**Agent question:** "Will this exact transaction do what I expect right now, or have conditions changed?"

**Core rule:** the same transaction package previewed is the one executed.

If preview fails, the loop returns to **Propose**, not Analyze. The underlying analysis can still be valid even when the execution parameters need adjustment.

### LP preview-specific fields

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Expected shares at deposit amount | "How many dTokens will I receive?" — the agent compares to its model. Large deviation = pool state changed since analysis. | missing — needs `TransactionPreview.expectedShares` | snapshot (computed, via ERC-4626 previewDeposit) | ? |
| Share price (exchange rate) | "Has the share price moved since analysis?" — a drop could indicate bad debt event between analysis and execution. | missing — needs a preview or monitor share-price field | snapshot | ? |
| Pool TVL after deposit (projected) | "What's my concentration?" — if the agent would become >10% of the pool, it may want to reduce. | missing — needs `TransactionPreview.projectedPoolTvl` | snapshot (computed) | ? |
| Concentration percentage | "What share of the pool will I be?" — the agent's deposit divided by projected post-deposit pool TVL. High concentration means the agent becomes part of the pool's liquidity risk. | missing — needs `TransactionPreview.concentrationPct` | snapshot (computed) | ? |
| Deviation from proposal | "Has anything shifted since the action was proposed?" — the preview compares current snapshot to the data the proposal was based on. Flags: APY changed >10%, utilization changed >5pp, TVL changed >20%. | missing — needs `TransactionPreview.deviationFromProposal` | snapshot (computed) | ? |
| Gas estimate (USD) | "What does execution cost?" — at small positions, gas can be material. | missing — needs `TransactionPreview.gasEstimateUsd` | snapshot (computed) | ? |
| Warnings | "Is there anything unusual?" — array of strings. Example: "pool utilization will exceed 95% after deposit", "share price dropped 0.5% since analysis." | missing — needs `TransactionPreview.warnings[]` | snapshot (computed) | ? |
| Calldata | Ready-to-submit transaction data. | missing — needs `RawTx.calldata` | snapshot (computed) | ? |

### CA preview-specific fields

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Simulated health factor after open | "What's my HF right after opening?" — if lower than expected, the agent may reduce leverage or abort. | missing — needs `TransactionPreview.healthFactorAfterOpen` | snapshot (computed, via SDK router simulation) | ? |
| Position value USD | "Does the position size match the proposal?" — sanity check. | missing — needs `TransactionPreview.positionValueUsd` | snapshot (computed) | ? |
| Actual leverage | "Is my real leverage what I asked for?" — may differ from target due to swap impact. If actual is 5.2x and target was 5x, acceptable. If 6.1x, concerning. | missing — needs `TransactionPreview.actualLeverage` | snapshot (computed) | ? |
| Swap impact (bps) | "How much did I lose to slippage on the entry swap?" — compared to the entry cost estimate from Analyze. If significantly worse, abort. | missing — needs `PreviewRoute.priceImpactBps` | snapshot (computed) | ? |
| Token balances after open | "What will I actually hold?" — full breakdown of the position's token composition post-open. | missing — needs `TransactionPreview.tokenBalancesAfterOpen` | snapshot (computed) | ? |
| Deviation from proposal | Same as LP — flags significant changes since the action was proposed. | missing — needs `TransactionPreview.deviationFromProposal` | snapshot (computed) | ? |
| Gas estimate (USD) | Execution cost. | missing — needs `TransactionPreview.gasEstimateUsd` | snapshot (computed) | ? |
| Warnings | Array of strings — for example: "borrowable liquidity dropped 40% since analysis", "HF 1.08, below 1.1 threshold." | missing — needs `TransactionPreview.warnings[]` | snapshot (computed) | ? |
| Multicall data | Ready-to-submit multicall transaction. | missing — needs `RawTx` / multicall payload support | snapshot (computed) | ? |

### Handoff: Preview → Execute (execution-ready decision)

The Preview-to-Execute handoff should contain:

- the candidate reference,
- go / no-go status,
- rejection reason if the action is blocked,
- the exact transaction package approved by Preview,
- gas estimate in USD,
- expected outcome summary, such as shares received, resulting Health Factor, or resulting leverage,
- execution mode, either human-in-the-loop or bot execution.

`no_go` actions loop back to Propose for parameter adjustment or alternative selection.

---

## Stage 5: Execute — Approval and submission

**What happens:** Execution signs and submits the exact bytes that passed Preview.

There are two execution modes:

- **Human-in-the-Loop** — the agent encodes the preview into a verifier flow and a human signs.
- **Bot Execution** — a bot signer executes within bounded on-chain permissions.

This stage does not introduce new backend data requirements. It consumes the preview-approved transaction and signer context.

The key guarantee remains:

- same transaction package previewed
- same transaction package executed

---

## Stage 6a: Monitor — LP

**What happens:** LP agent periodically checks that yield is holding, exit remains possible, and the pool's risk composition hasn't changed in ways the agent didn't anticipate.

**Agent questions:** "Is yield holding?", "Can I still get out?", and "Has the pool changed since I entered?"

### Primary backend inputs

- `UserPoolPosition`
- `YieldBreakdown<ClaimableIncentive>`
- `PnlBreakdown`

### Yield and value tracking

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| APY with breakdown (organic / incentive) | "Is yield holding, and where is it coming from?" — a single historical series with breakdown tells the full story. If organic is steady but incentive is declining, the agent knows total yield will drop. If everything is consistently positive, the position is healthy. | present — `UserPoolPosition.yield: YieldBreakdown<ClaimableIncentive>` | history (90d daily) with current snapshot | ? |
| Share price (exchange rate) | "Has bad debt been realized?" — share price drops when the pool socializes a loss. A steady or growing share price = no bad debt events. A sudden drop = bad debt was absorbed. The agent uses this as a canary for pool health. | missing — needs a preview or monitor share-price field | snapshot + history (90d daily) | ? |

### Pool health and exit readiness

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Pool utilization (current) | "Can I still withdraw?" — above 90% = withdrawals may be difficult. | present — `PoolOpportunity.utilization` | snapshot | ? |
| Pool TVL (current) | "Is capital leaving?" — declining TVL = other LPs are exiting, which can accelerate utilization increase. | present — `PoolOpportunity.tvl`, `PoolOpportunity.tvlUsd` | snapshot | ? |
| Insurance fund balance change | "Is the buffer I relied on shrinking?" — only relevant if the agent entered partly because of a large insurance fund. If it's shrinking, the conviction that justified entry is weakening. | missing — needs an insurance fund change feed | snapshot (delta from prior) | ? |

### Risk composition changes

Not only curator parameter changes matter — organic borrower behavior can shift pool composition without any governance action. Example: borrowers exit from one collateral (yield dropped) and migrate to another (higher yield), changing what the LP is actually exposed to. The agent may find the new composition unacceptable even though no parameters changed.

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Parameter changes (curator actions) | "Did the curator add new collateral, change debt limits, modify IRM?" — explicit governance changes to the pool's risk profile. | missing — needs `EventFeedItem` / `GovernanceChange` coverage | event log | ? |
| Per-token quota composition shift | "Has borrower behavior changed what I'm exposed to?" — even without parameter changes, the mix of collateral held by borrowers can shift organically. Token A was 60% of exposure, now token B is 70%. The agent compares current composition to what it was at entry. | partial — current quota snapshot exists via `PoolOpportunity.collaterals[]`; explicit delta tracking is missing | snapshot (current vs entry baseline) | ? |
| New CMs added to pool | "Is there a new risk envelope drawing from my pool?" — a new CM means a new set of collateral rules and a new source of potential bad debt. | missing — needs a pool-composition change feed | event log | ? |
| Pending governance changes | "What's about to change?" — same field as Analyze Q5, checked every monitoring cycle. Queued Safe TX / timelock transactions affecting this pool. | missing — needs `GovernanceChange[]` | snapshot | ? |

---

### Freeze and compliance monitoring

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Frozen accounts delta | "Are more accounts getting frozen?" — if the count is increasing, the LP's bad debt exposure is growing. Trend matters more than the absolute number. | missing — needs an RWA freeze-state change feed | snapshot (delta from prior check) | ? |
| Frozen debt delta | "Is frozen debt growing?" — same logic. If frozen debt is approaching the insurance fund, the LP should consider exiting. | missing — needs an RWA freeze-debt change feed | snapshot (delta from prior check) | ? |
| Whitelist changes (liquidators added/removed) | "Is the liquidator pool growing or shrinking?" — fewer liquidators = slower liquidation = more risk. | missing — needs an RWA whitelist event feed | event log | ? |

---

## Stage 6b: Monitor — CA

**What happens:** CA agent periodically checks position health. The core metric is health factor (HF), but the agent also needs to understand WHY HF changed to decide whether to act (deleverage, exit) or wait (temporary volatility). The backend provides raw facts — the agent does the reasoning.

**Agent questions:** "Is my position safe?", "What's causing HF to move?", and "Am I making money?"

### Primary backend inputs

- `UserStrategyPosition`
- `UserCollateral`
- `YieldBreakdown<ClaimableIncentive>`
- `PnlBreakdown`

### Position state

The agent reads the full position snapshot and compares it to the previous check. HF change can be caused by: collateral price movement, LT ramping, interest accrual, quota interest, token being forbidden (safe pricing kicks in), or oracle staleness. The agent needs the raw components to attribute the change itself.

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Health factor | THE metric. Below 1 = liquidation. The agent compares to its own threshold (e.g., 1.3) and decides: comfortable / approaching danger / act now. | present — `UserStrategyPosition.healthFactor` | snapshot | ? |
| Total value USD | Position value in dollar terms — the agent compares to previous check. | missing — needs `UserStrategyPosition.totalValueUsd` | snapshot | ? |
| TWV USD (total weighted value) | Numerator of HF. If TWV dropped but total value didn't, the cause is LT change or quota cap — not price. The agent uses this to attribute HF changes. | missing — needs `UserStrategyPosition.totalWeightedValueUsd` | snapshot | ? |
| Total debt USD | Denominator of HF. If debt grew without the agent borrowing more, the cause is interest accrual. | present — `UserStrategyPosition.debtUsd` | snapshot | ? |
| Debt breakdown (principal + interest + quota interest + fees) | Cost decomposition. The agent sees how much of debt growth is base interest vs quota interest vs fees. High quota interest = agent may want to reduce quota or switch collateral. | missing — needs a detailed debt-breakdown type | snapshot | ? |
| Per-token balances + per-token value USD | What the agent holds and what each token is worth. If a specific token's value dropped, the agent knows which collateral is causing HF decline. | partial — `UserStrategyPosition.collaterals[].balance` exists; per-token USD value is missing | snapshot | ? |
| Per-token quota (this CA's quota per token) | How much of the token's value counts toward HF. If quota < actual value, the agent is "over-collateralized" on that token — excess doesn't help. | present — `UserCollateral.quota` | snapshot | ? |
| Leverage (current) | "Am I more leveraged than intended?" — leverage = total value / (total value - debt). Drift from target leverage signals the position is getting riskier. | present — `UserStrategyPosition.leverage` | snapshot | ? |
| HF history (lifetime) | "Is HF steadily declining or was this a spike?" — trend detection. Steady decline = structural (interest accrual, LT ramp). Spike = price event, likely recoverable. | missing — needs a Health Factor history series | history (per-tx or daily) | ? |
| Total value history (lifetime) | "Is the position growing or decaying?" — P&L trend over time. | missing — needs a total-value history series | history (per-tx or daily) | ? |

### Delayed withdrawals

Some collateral tokens require a waiting period to exit (e.g., unstaking from Convex, redeeming from Midas, unwinding from Infinifi). The agent needs to track in-flight withdrawals and know when to claim. Data source: `WithdrawalCompressor` (periphery-v3) + `IPhantomToken` (core-v3).

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Pending withdrawals (per token: expected amount, claimableAt timestamp) | "Do I have withdrawals in flight, and when can I claim?" — if claimableAt is approaching, the agent schedules a claim transaction. If multiple withdrawals are pending, the agent prioritizes by size and urgency. Unclaimed mature withdrawals tie up collateral value unnecessarily. | missing — needs `DelayedWithdrawalState.pending[]` | snapshot | ? |
| Claimable withdrawals (per token: amount, claim calldata) | "Can I claim right now?" — the withdrawal compressor returns ready-to-execute MultiCall calldata. The agent checks this each monitoring cycle and claims when available. No claim = collateral stays locked in the withdrawal phantom token instead of returning to the credit account as the underlying. | missing — needs `ClaimableWithdrawal[]` | snapshot | ? |
| Phantom token positions (per token: target protocol, deposited token) | "Which of my collateral is a non-transferable position wrapper?" — phantom tokens (staked Convex LP, Infrared vault, Midas redemption, etc.) can't be transferred directly. On exit, the system auto-withdraws via adapter (`IPhantomTokenWithdrawer.withdrawPhantomToken`). The agent needs to know: (1) which holdings are phantom vs transferable, to plan exit routing, and (2) the deposited token identity, to estimate actual exit value. | missing — needs a phantom-position type | snapshot | ? |

### Oracle and collateral health

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Oracle freshness per token (last update timestamp) | "Are my oracles still updating?" — if a token's oracle hasn't updated in > staleness period, the next price update could trigger immediate liquidation. The agent checks: staleness period vs time since last update. | missing — needs oracle freshness fields | snapshot | ? |
| Main vs reserve price per token | "Is safe pricing about to kick in?" — during multicalls (including close), the system uses min(main, reserve). Large divergence = the agent's HF during exit will be lower than what the snapshot shows. | missing — needs paired main/reserve oracle price fields | snapshot | ? |
| Forbidden tokens overlap | "Is any of my collateral forbidden?" — if the agent holds a forbidden token, safe pricing is used (min of main and reserve oracle) AND it can't increase debt or quota for that token. The agent decides how to react: exit the token, hold and accept the lower HF from safe pricing, or rebalance into allowed collateral. | missing — needs a forbidden-token overlap field | snapshot | ? |
| LT ramp status per token | "Is my LT actively decreasing?" — if a ramp is in progress, HF will drop every block even with no price movement. The agent needs to know: current LT, final LT, and time remaining. | missing — needs an LT-ramp status field | snapshot | ? |
| Enabled tokens count vs max | "Am I near the token limit?" — if at the limit, the agent can't swap into new tokens without first disabling old ones. Constrains rebalancing options. | missing — needs enabled-token count and max-token fields | snapshot | ? |

### Expiration and operational status

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Expiration date | "Am I approaching forced exit?" — after expiration, the position is liquidatable regardless of HF, with reduced premiums. The agent plans exit before expiration. | missing — needs a Credit Manager expiration field | snapshot | ? |
| Facade paused status | "Is my CM still operational?" — if paused after the agent entered, it can't close normally. Must wait for unpause. | present — `StrategyOpportunity.isPaused` | snapshot | ? |

### External changes

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Parameter changes since last check | "Did the curator change LTs, forbid tokens, change oracles?" — the agent correlates parameter changes with HF movement. LT reduction explains HF drop without price movement. New forbidden token explains why safe pricing applied. | missing — needs `EventFeedItem` / `GovernanceChange` coverage | event log (filtered by timestamp) | ? |
| Pending governance changes | "What's about to change for my strategy?" — queued Safe TX / timelock. Checked every monitoring cycle. | missing — needs `GovernanceChange[]` | snapshot | ? |

### Emergency state

Grouped fields the agent checks as a unit to assess whether the CM is in an abnormal state:

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Facade paused status | "Is my CM still operational?" — if paused after entry, can't close normally. | present — `StrategyOpportunity.isPaused` | snapshot | ? |
| Forbidden tokens affecting my position | "Is any of my collateral newly forbidden?" — cross-referenced against agent's holdings. | missing — needs a position-level forbidden-token state | snapshot | ? |
| Loss policy status | "How would bad debt be handled right now?" — if loss policy changed since entry, the agent reassesses. | missing — needs a loss-policy state field | snapshot | ? |
| Emergency liquidator active | "Is the system in emergency mode?" — if emergency liquidators are active while the facade is paused, something serious is happening. | missing — needs an emergency-liquidator state field | snapshot | ? |

### Automation

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Active bots + permissions | "Who else can modify my position?" — the agent checks if any bots have been granted or revoked permissions. A partial liquidation bot with permissions is expected. An unknown bot with EXTERNAL_CALLS_PERMISSION is a concern. | missing — needs `BotPermissionState` | snapshot | ? |

---

### Own account compliance state

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Own frozen status | "Am I frozen?" — THE critical check. If frozen, the agent can do nothing — no exit, no rebalance, no repay. It must wait for the freeze to be lifted. The agent checks this every monitoring cycle. | missing — needs an account-level freeze status field | snapshot | ? |
| Investor registry status | "Am I still registered as the beneficial owner?" — if the agent's investor record was changed (via setInvestor), its operations will fail. This is an integrity check. | missing — needs an investor-registry state field | snapshot | ? |
| KYC validity | "Is my KYC still valid?" — Securitize KYC may expire or be revoked. If the agent's whitelist status is revoked, it can't receive RWA tokens back during withdrawal or closing. The agent checks proactively. | missing — needs a KYC-validity field | snapshot | ? |

### Upcoming redemption events

| Human-readable data name | Agent story | Tech name references | Data type | Status |
|-------|-------------|----------------------|-----------|--------|
| Next redemption window | "When is the next opportunity to redeem?" — for RWA tokens with periodic redemption. The agent plans exits around this. If HF is declining and the next window is far away, the agent may need to find secondary market exit instead. | missing — needs `RwaAssetProfile.nextRedemptionWindow` | snapshot | ? |
| Redemption notice deadline | "When do I need to submit a redemption request?" — some RWA tokens require advance notice (e.g., 5 days before the window). The agent must act before this deadline or wait for the next window. | missing — needs `RwaAssetProfile.redemptionNoticeDeadline` | snapshot | ? |

---

## Appendix A: Historical Series Summary

Collected from stages above. All history fields in one place for implementation planning.

| # | Series | Tech name references | Answers | Granularity | Retention | Priority |
|---|--------|----------------------|---------|-------------|-----------|----------|
| H1 | APY per pool | present — `YieldBreakdown.base`, `YieldBreakdown.totalApy`, `YieldBreakdown.incentives[]` | Q1: yield stability | Daily | 90 days | P0 |
| H2 | Utilization per pool | present — `PoolOpportunity.utilization` | Q3: exit liquidity trend | Daily | 90 days | P0 |
| H3 | TVL per pool | present — `PoolOpportunity.tvl`, `PoolOpportunity.tvlUsd` | Q3: capital flight | Daily | 90 days | P0 |
| H4 | Supply/borrow rates per pool | partial — `YieldBreakdown.base` and `StrategyOpportunity.borrowApy` exist; dedicated time-series types are missing | Q1: cost trend | Daily | 30 days | P1 |
| H5 | Price of underlying per pool | present — `TokenRef.price` | Q2: volatility | Daily | 90 days | P1 |
| H6 | HF per credit account | present — `UserStrategyPosition.healthFactor` | Stage 6: trend detection | Per-tx or daily | Lifetime | P1 |
| H7 | Total value per credit account | missing — needs `UserStrategyPosition.totalValueUsd` | Stage 6: P&L baseline | Per-tx or daily | Lifetime | P1 |

Notes:

- Daily granularity is sufficient for analysis (Stage 2). Per-tx is nice-to-have for CA position tracking.
- 90 days is the ideal analysis window. 30 days is the minimum useful range.

---

## Appendix B: Event Log

These are on-chain events needed for the parameter change log and Stage 6 monitoring. Organized by what they tell the agent.

### "The rules changed" (parameter governance)

| # | Event | Tech name references | Agent impact | Priority |
|---|-------|----------------------|-------------|----------|
| B1 | `SetTokenLiquidationThreshold(token, lt)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | CA: HF changed | P0 |
| B2 | `ScheduleTokenLiquidationThresholdRamp(...)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | CA: HF will change over time | P0 |
| B3 | `ForbidToken(token)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | CA: can't use this collateral anymore | P0 |
| B4 | `ForbidAdapter(target, adapter)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | CA: lost a DeFi route | P0 |
| B5 | `SetPriceFeed(token, feed, staleness, skip)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | All: valuations may shift | P0 |
| B6 | `Paused / Unpaused` (Pool or Facade) | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | All: access change | P0 |

### "Risk exposure changed"

| # | Event | Tech name references | Agent impact | Priority |
|---|-------|----------------------|-------------|----------|
| B8 | `AddCollateralToken(token)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | LP: new risk source | P1 |
| B9 | `AllowToken(token)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | LP: existing token re-enabled | P1 |
| B10 | `AllowAdapter(target, adapter)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | LP: new integration risk | P1 |
| B11 | `AddCreditManager(cm)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | LP: new risk envelope on pool | P1 |
| B12 | `SetCreditManagerDebtLimit(cm, limit)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | LP: exposure cap changed | P1 |
| B13 | `SetTotalDebtLimit(limit)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | LP: total exposure cap changed | P1 |
| B14 | `SetTokenLimit(token, limit)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | Both: quota limit changed | P1 |
| B15 | `AddQuotaToken(token)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | Both: new token in quota system | P1 |

### "Costs changed"

| # | Event | Tech name references | Agent impact | Priority |
|---|-------|----------------------|-------------|----------|
| B16 | `SetInterestRateModel(newIRM)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | Both: yield curve changed | P1 |
| B17 | `UpdateTokenQuotaRate(token, rate)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | CA: cost changed; LP: revenue changed | P1 |
| B18 | `SetBorrowingLimits(minDebt, maxDebt)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | CA: position size constraints changed | P1 |
| B19 | `SetWithdrawFee(fee)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | LP: exit cost changed | P2 |
| B20 | `UpdateFees(...)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | CA: liquidation costs changed | P2 |
| B21 | `SetExpirationDate(date)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | CA: lifecycle constraint | P1 |

### "Something happened" (operational)

| # | Event | Tech name references | Agent impact | Priority |
|---|-------|----------------------|-------------|----------|
| B23 | `Borrow(cm, ca, amount)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | Utilization changed | P0 |
| B24 | `Repay(cm, amount, profit, loss)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | Utilization changed; loss > 0 = bad debt | P0 |
| B25 | `IncurUncoveredLoss(cm, loss)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | LP: took loss | P0 |
| B26 | `LiquidateCreditAccount(ca, liquidator, to, remainingFunds)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | CA: position liquidated | P0 |
| B27 | `PartiallyLiquidateCreditAccount(...)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | CA: partial deleverage | P0 |
| B28 | `Deposit/Withdraw (ERC-4626)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | Pool size changed | P1 |
| B29 | `SetReservePriceFeed(token, feed, ...)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | Backup pricing changed | P1 |
| B30 | `UpdateQuota(ca, token, quotaChange)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | Quota usage changed | P2 |
| B31 | `SetMaxDebtPerBlockMultiplier(mult)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | Borrowing rate limit changed | P2 |
| B32 | `SetLossPolicy(newPolicy)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | Bad debt handling changed | P2 |
| B33 | `ForbidBot(bot)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | Bot access revoked | P2 |
| B34 | `SetBotPermissions(bot, cm, ca, permissions)` | missing — needs indexed `EventFeedItem` / `GovernanceChange` wrappers in `types_.ts` | Bot permissions changed | P2 |

---

## Appendix C: Computed Data (backend computes, not raw on-chain reads)

| # | Computation | Tech name references | Serves stage | Priority |
|---|-------------|----------------------|-------------|----------|
| C1 | Total APY (supply_rate + Merkl + protocol yield) | present — `YieldBreakdown.totalApy` | Stage 1: discovery filter | P0 |
| C2 | Exposure chain per pool (tokens → LTs → debt limits → positions) | partial — `PoolOpportunity.collaterals[]` exists; a full exposure-chain type is missing | Stage 2: Q2 risk | P0 |
| C3 | P&L per LP (deposit events + current share price) | present — `UserPoolPosition.pnl` | Stage 6: LP monitoring | P1 |
| C4 | P&L per CA (position open + mutations + current state) | present — `UserStrategyPosition.pnl` | Stage 6: CA monitoring | P1 |
| C5 | HF attribution (price deltas + LT changes + interest accrual) | missing — needs `HealthFactorAttribution` | Stage 6: CA monitoring | P1 |
| C6 | Curator identity mapping (controller address → name) | partial — `Opportunity.curatorId` exists; `CuratorProfile` mapping is missing | Stage 2: Q4 trust | P2 |
| C7 | Insurance coverage ratio (treasury balance vs total debt) | missing — needs insurance-fund and total-debt fields | Stage 2: Q2 risk | P1 |

---

## Appendix D: RWA / KYC-specific Loss Vector Summary

These are the loss vectors specific to RWA/KYC that don't exist with standard DeFi tokens. Each field in this document traces to one or more of these.

| # | Loss vector | Tech name references | Affects | Severity | Fields that address it |
|---|------------|----------------------|---------|----------|----------------------|
| R1 | Frozen account bad debt — frozen CA can't be liquidated, debt accumulates | missing — needs RWA freeze-state and own-freeze-status types | LP | High | Frozen accounts count/debt, own frozen status |
| R2 | Liquidator scarcity — restricted liquidator pool slows liquidation | missing — needs `RwaComplianceProfile.whitelistedLiquidatorCount` | LP, CA | Medium | Whitelisted liquidator count |
| R3 | Off-chain asset default — underlying RWA loses value due to off-chain event | missing — needs `RwaAssetProfile.assetType`, `RwaAssetProfile.issuer`, and `RwaAssetProfile.navUpdateFrequency` | LP, CA | High | Off-chain asset type, issuer, NAV frequency |
| R4 | Redemption lockout — can't convert RWA to cash outside windows | missing — needs `RwaAssetProfile.redemptionWindows`, `RwaAssetProfile.redemptionNoticeDeadline`, and `RwaAssetProfile.redemptionMechanism` | CA | Medium | Redemption windows, notice deadline, mechanism |
| R5 | Compliance-layer immobilization — freeze/revocation blocks all operations | missing — needs `RwaComplianceProfile.freezeCapability`, account freeze status, and KYC validity | CA | High | Freeze capability, own frozen status, KYC validity |
| R6 | Investor reassignment — external party changes position ownership | missing — needs `RwaComplianceProfile.investorReassignmentRisk` | CA | Low | Investor reassignment risk |
| R7 | Operational restriction — can't use bots or direct facade calls | missing — needs KYC operation routing and `BotPermissionState` | CA | Low | Operation routing, bot permissions blocked |
| R8 | KYC expiry — whitelist revocation blocks token transfers | missing — needs KYC validity and investor registry status | CA | Medium | KYC validity, investor registry status |

---

## Summary

| Category | Tech name references | Count |
|----------|----------------------|-------|
| Curator profile fields (standalone) | missing — needs `CuratorProfile` | 7 |
| Opportunity base fields (Stage 1) | present — `Opportunity` | 11 |
| PoolOpportunity discovery extension fields | present — `PoolOpportunity` | 9 |
| StrategyOpportunity discovery extension fields | present — `StrategyOpportunity` | 10 |
| LP analyze fields (Stage 2a) | partial —  `YieldBreakdown` / `PoolCollateral` exist; many analytics fields are still missing | ~23 (+1: pending governance) |
| CA analyze fields (Stage 2b) | partial —  `StrategyOpportunity` / `StrategyCollateral` exist; many analytics fields are still missing | ~24 (+5: entry cost, breakeven, risk_disclosure, pending gov, borrow rate xref) |
| LP preview fields (Stage 4) | missing — needs `TransactionPreview` | 8 (new) |
| CA preview fields (Stage 4) | missing — needs `TransactionPreview`, `PreviewRoute`, and `RawTx` | 9 (new) |
| LP monitoring fields (Stage 6a) | partial —  `UserPoolPosition` exists; pool-monitor delta fields are still missing | ~13 (+1: pending governance) |
| CA monitoring fields (Stage 6b) | partial —  `UserStrategyPosition` / `UserCollateral` exist; monitor attribution fields are still missing | ~22 (+5: pending gov, emergency state bundle) |
| RWA / KYC-specific extension fields | missing — needs `RwaAssetProfile` / `RwaComplianceProfile` | 32 |
| Historical series | missing — needs history series types | 7 |
| Event types to index | missing — needs `EventFeedItem` / `GovernanceChange` | 34 |
| Computed aggregations | partial —  `YieldBreakdown.totalApy` / `PnlBreakdown` exist; several computed types are still missing | 7 |

**Data types breakdown:**

- snapshot (current state): ~100 fields — real-time reads, cached with reasonable staleness
- snapshot (computed): ~17 fields — backend computes from on-chain state (preview stage, entry cost, breakeven)
- history (time series): 7 series — backend stores daily/per-tx snapshots
- event log (change records): 34 event types — backend indexes on-chain events
- merged RWA / KYC extension: 32 additional stage-specific fields, primarily snapshot fields with one dedicated event-log stream for whitelist changes

**Handoff contracts defined:** opportunity feed → analyzed shortlist → proposed action plus transaction package → execution-ready action. See ../synthesis/staged-agent-architecture.md and ../synthesis/memo-standard.md for full definitions.

**Stage numbering:** The current canonical sequence is Discover → Analyze → Propose → Preview → Execute → Monitor. Execute is Stage 5. Monitoring is Stage 6.

**Next step:** Review each table and mark the Status column as A / B / C. The stage structure shows exactly why each field is needed — every field traces to an agent question at a specific step. The RWA / KYC-specific fields are integrated directly into the stage sections above and summarized in Appendix D.
