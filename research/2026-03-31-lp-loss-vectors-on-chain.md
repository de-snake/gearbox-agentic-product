# Gearbox Protocol — LP Loss Vectors: On-Chain Mechanisms

**Status:** Complete
**Date:** 2026-03-31
**Input:** Gearbox V3 contracts (core-v3), SDK v12.9.7, protocol documentation

## Overview

This document maps every LP loss vector in Gearbox Protocol V3 to its exact on-chain mechanism, contract state, events, and the data points an agent needs to monitor.

**Key Architecture**:
- **PoolV3** (ERC-4626): Holds LP deposits, lends to Credit Managers
- **CreditManagerV3**: Core accounting for credit accounts
- **CreditFacadeV3**: User-facing interface, safety circuit breaker
- **PoolQuotaKeeperV3**: Manages per-token quota exposure
- **PriceOracleV3**: Dual-feed oracle router
- **TreasurySplitter**: Insurance fund gatekeeper
- **LossPolicy**: Bad debt handling policy per market

---

## 1. BAD DEBT SOCIALIZATION

### Mechanism

When a credit account is liquidated and collateral is insufficient to cover debt, the loss flows through this waterfall:

1. **CreditManagerV3.liquidateCreditAccount()** calculates `loss` = debt - collateral_value_after_discount
2. CreditManager calls **PoolV3.repayCreditAccount(repaidAmount, profit=0, loss=X)**
3. PoolV3 handles the loss:

```solidity
// From PoolV3.repayCreditAccount():
if (loss > 0) {
    uint256 treasuryShares = balanceOf(treasury);
    uint256 sharesToBurn = loss * totalSupply() / expectedLiquidity();
    
    if (sharesToBurn <= treasuryShares) {
        // Treasury covers it fully — LP shares unaffected
        _burn(treasury, sharesToBurn);
    } else {
        // Treasury insufficient — burn what we can, rest is bad debt
        _burn(treasury, treasuryShares);
        uint256 uncoveredLoss = loss - treasuryShares * expectedLiquidity() / totalSupply();
        // This reduces the exchange rate for ALL LPs
        emit IncurUncoveredLoss(msg.sender, uncoveredLoss);
    }
}
```

4. **CreditFacadeV3** tracks cumulative loss:
```solidity
// In CreditFacadeV3 after liquidation:
lossParams.currentCumulativeLoss += uint128(reportedLoss);
if (!paused() && lossParams.currentCumulativeLoss > lossParams.maxCumulativeLoss) {
    _pause(); // Auto-pause facade to stop new borrowing
}
```

### Insurance Fund (TreasurySplitter)

- **Contract**: `TreasurySplitter` — holds dTokens (LP shares) as insurance
- **Key Address**: `pool.treasury()` returns the treasury address
- The insurance fund holds **Diesel Tokens (dTokens)** of the pool it protects
- Non-dToken balances in treasury are NOT counted as insurance

### On-Chain State to Read

| Data Point | Contract | Function |
|---|---|---|
| Treasury address | PoolV3 | `treasury()` |
| Treasury dToken balance | PoolV3 (ERC20) | `balanceOf(treasury)` |
| Insurance target amount | TreasurySplitter | `tokenInsuranceAmount(dToken)` |
| Current insurance buffer | ERC20 | `IERC20(dToken).balanceOf(treasurySplitter)` |
| Pool expected liquidity | PoolV3 | `expectedLiquidity()` |
| Total supply of dTokens | PoolV3 | `totalSupply()` |
| Cumulative loss on facade | CreditFacadeV3 | `lossParams()` → returns `(currentCumulativeLoss, maxCumulativeLoss)` |
| Exchange rate (share price) | PoolV3 | `convertToAssets(1e18)` |

### Events to Index

| Event | Contract | Significance |
|---|---|---|
| `Repay(creditManager, borrowedAmount, profit, loss)` | PoolV3 | Any loss > 0 means bad debt occurred |
| `IncurUncoveredLoss(creditManager, loss)` | PoolV3 | **CRITICAL**: Insurance exhausted, LPs took loss |
| `Paused(account)` | CreditFacadeV3 | Facade auto-paused from cumulative loss |

### Agent Monitoring Logic

```typescript
// Check insurance coverage ratio
const treasuryShares = await pool.read.balanceOf([treasury]);
const totalSupply = await pool.read.totalSupply();
const expectedLiq = await pool.read.expectedLiquidity();
const insuranceValueInUnderlying = treasuryShares * expectedLiq / totalSupply;

// Check against total outstanding debt
const totalBorrowed = await pool.read.totalBorrowed();
const coverageRatio = insuranceValueInUnderlying / totalBorrowed;
// If coverageRatio < some threshold (e.g. 1%), LP is at elevated risk
```

### Edge Cases / Gotchas

- Treasury shares are dTokens, so their value fluctuates with the pool's exchange rate
- If pool has zero totalSupply, sharesToBurn calculation is different
- The `IncurUncoveredLoss` event is the definitive signal that LPs lost money
- LossPolicy contract (V3.1+) can override default behavior — check `getLossPolicyState()` via MarketCompressor
- Cumulative loss tracking is per-CreditFacade, NOT per-pool — need to check all facades

---

## 2. ZOMBIE POSITIONS (Paused CM with Existing Positions)

### Mechanism

When a CreditFacade is paused:
- **New borrowing is blocked** (openCreditAccount reverts)
- **Existing positions remain open** with accruing interest
- **Liquidations still work** via `EMERGENCY_LIQUIDATOR` role

```solidity
// CreditFacadeV3 liquidation modifier:
modifier whenNotPausedOrEmergency() {
    require(
        !paused() || canLiquidateWhilePaused[msg.sender],
        "Pausable: paused"
    );
    _;
}
```

- When paused, ONLY addresses with `canLiquidateWhilePaused[addr] == true` (emergency liquidators) can liquidate
- Regular liquidators are blocked → positions may go deeper underwater
- If emergency liquidators don't act → bad debt accumulates

### On-Chain State to Read

| Data Point | Contract | Function |
|---|---|---|
| Facade paused status | CreditFacadeV3 | `paused()` |
| Emergency liquidator whitelist | CreditFacadeV3 | `canLiquidateWhilePaused(address)` |
| Number of open accounts | CreditManagerV3 | `creditAccountsLen()` |
| All open account addresses | CreditManagerV3 | `creditAccounts()` |
| Account health factor | CreditManagerV3 | `isLiquidatable(creditAccount, 10000)` |
| Account debt + collateral | CreditManagerV3 | `calcDebtAndCollateral(ca, DEBT_COLLATERAL)` |
| CM's pool address | CreditManagerV3 | `pool()` |
| CM borrowed from pool | PoolV3 | `creditManagerBorrowed(cmAddress)` |
| Cumulative loss state | CreditFacadeV3 | `lossParams()` |
| Max debt per block multiplier | CreditFacadeV3 | Check if set to 0 (forbids borrowing) |

### Events to Index

| Event | Contract | Significance |
|---|---|---|
| `Paused(account)` | CreditFacadeV3 | Facade was paused |
| `Unpause(account)` | CreditFacadeV3 | Facade was unpaused |

### Agent Monitoring Logic

```typescript
// For each CM attached to a pool:
const facade = await cm.read.creditFacade();
const isPaused = await facade.read.paused();
const openAccounts = await cm.read.creditAccountsLen();

if (isPaused && openAccounts > 0n) {
    // ZOMBIE RISK — check each account's health
    const accounts = await cm.read.creditAccounts();
    for (const ca of accounts) {
        const isLiq = await cm.read.isLiquidatable([ca, 10000]);
        if (isLiq) {
            // Underwater zombie position!
            const debt = await cm.read.calcDebtAndCollateral([ca, 1]);
            // Alert: paused CM has liquidatable position worth X
        }
    }
}
```

### Edge Cases / Gotchas

- **Pool pause vs Facade pause**: Pool pause blocks deposits/withdrawals but NOT borrowing/repayment. Facade pause blocks new CAs but NOT liquidation (via emergency liquidators)
- Even if facade is unpaused, `maxDebtPerBlockMultiplier == 0` effectively blocks new borrowing
- Interest keeps accruing on zombie positions — debt grows while collateral may deteriorate
- A paused facade with open accounts and no active emergency liquidators = maximum risk

---

## 3. MULTIPLE CMs SHARING ONE POOL — AGGREGATE RISK

### Mechanism

One PoolV3 can serve multiple CreditManagers. The relationship:

```
PoolV3 ──┬── CreditManagerV3 (Tier 1 USDC) ── CreditFacadeV3
          ├── CreditManagerV3 (Tier 2 USDC) ── CreditFacadeV3
          ├── CreditManagerV3 (Farm sUSDe)  ── CreditFacadeV3
          └── CreditManagerV3 (Convex)      ── CreditFacadeV3
```

**Debt tracking is dual-layered**:
```solidity
// PoolV3 state:
DebtParams internal _totalDebt;                              // Aggregate across ALL CMs
mapping(address => DebtParams) internal _creditManagerDebt;  // Per-CM tracking
```

Each DebtParams has:
```solidity
struct DebtParams {
    uint128 borrowed;  // Current principal outstanding
    uint128 limit;     // Max allowed
}
```

### On-Chain State to Read

| Data Point | Contract | Function |
|---|---|---|
| List of all CMs for pool | PoolV3 | `creditManagers()` → address[] |
| Total debt (all CMs) | PoolV3 | `totalBorrowed()` |
| Total debt limit | PoolV3 | `totalDebtLimit()` |
| Per-CM borrowed | PoolV3 | `creditManagerBorrowed(cm)` |
| Per-CM debt limit | PoolV3 | `creditManagerDebtLimit(cm)` |
| Borrowable per CM | PoolV3 | `creditManagerBorrowable(cm)` |
| Pool's available liquidity | PoolV3 | `availableLiquidity()` |
| Pool's expected liquidity | PoolV3 | `expectedLiquidity()` |
| Insurance fund balance | ERC20(pool) | `balanceOf(treasury)` |

### Events to Index

| Event | Contract | Significance |
|---|---|---|
| `AddCreditManager(creditManager)` | PoolV3 | New CM connected |
| `SetCreditManagerDebtLimit(cm, newLimit)` | PoolV3 | Limit changed |
| `SetTotalDebtLimit(limit)` | PoolV3 | Global limit changed |
| `Borrow(cm, ca, amount)` | PoolV3 | Debt increased |
| `Repay(cm, amount, profit, loss)` | PoolV3 | Debt decreased |

### Agent Monitoring Logic

```typescript
// Get all CMs for a pool
const cms = await pool.read.creditManagers();
let totalBadDebtRisk = 0n;

for (const cm of cms) {
    const borrowed = await pool.read.creditManagerBorrowed([cm]);
    const limit = await pool.read.creditManagerDebtLimit([cm]);
    
    // Check each CM's accounts for underwater positions
    const numAccounts = await creditManager.read.creditAccountsLen();
    // ... iterate and check health factors
    
    totalBadDebtRisk += estimatedBadDebt;
}

const insuranceBalance = await pool.read.balanceOf([treasury]);
const insuranceValue = insuranceBalance * expectedLiq / totalSupply;

if (totalBadDebtRisk > insuranceValue) {
    // CRITICAL: aggregate risk exceeds insurance
}
```

### Edge Cases / Gotchas

- **Debt limits are BOTH per-CM AND per-pool**: `min(cmLimit, totalDebtLimit - totalBorrowed)` is the effective constraint
- One CM's bad debt burns treasury shares that protect ALL CMs' LPs (same pool = same dToken)
- A single pool failure from one risky CM affects conservative LPs in the same pool
- The `creditManagerBorrowable(cm)` function already accounts for both limits
- When total debt limit = `type(uint256).max`, there's effectively no global limit

---

## 4. FUNDAMENTAL VS MARKET ORACLE DIVERGENCE

### Mechanism

Gearbox V3 uses a **Dual-Oracle System** per token:

1. **Main Feed**: Used for health factor checks / liquidation decisions
2. **Reserve Feed**: Used for "safe pricing" after risky operations (adapter calls)

```solidity
// PriceOracleV3:
function getPrice(token) → uses main feed
function getSafePrice(token) → min(mainFeed, reserveFeed)
function getReservePrice(token) → uses reserve feed only
```

### Pricing Methodologies

| Asset Type | Typical Main Feed | Typical Reserve Feed |
|---|---|---|
| WETH, WBTC, USDC | Chainlink market price | Same or different Chainlink |
| wstETH | **Fundamental**: stETH rate × ETH/USD | **Market**: Chainlink wstETH/USD or bounded |
| sUSDe | **Fundamental**: convertToAssets() × USDC/USD | **Market**: bounded feed |
| ERC4626 vaults | convertToAssets() × underlying price | Bounded or market feed |
| Curve LPs | Virtual price calculation | Bounded feed |
| Pendle PTs | TWAP of PT/SY from Pendle market | Bounded |

**Bounded Feeds**: Cap or floor a price (e.g., stablecoin capped at $1.00, LST capped at backing ratio)

### Safe Price Usage

After adapter calls (external protocol interactions), collateral is valued using `SafePrice = min(MainFeed, ReserveFeed)`. This protects LPs from oracle manipulation but can cause unexpected liquidations if market price diverges from fundamental.

### Loss Policy (V3.1+)

When liquidation would create bad debt:
1. Normal: Liquidate at market price
2. If loss: LossPolicy can reprice collateral using an "aliased" (fundamental) price
3. This prevents cascading liquidations but may delay loss recognition

### On-Chain State to Read

| Data Point | Contract | Function |
|---|---|---|
| Main feed for token | PriceOracleV3 | `priceFeedParams(token)` → (priceFeed, stalenessPeriod, skipCheck, useReserve) |
| Reserve feed for token | PriceOracleV3 | `reservePriceFeedParams(token)` |
| Main price | PriceOracleV3 | `getPrice(token)` |
| Safe price (min of both) | PriceOracleV3 | `getSafePrice(token)` |
| Reserve price | PriceOracleV3 | `getReservePrice(token)` |
| All priced tokens | PriceOracleV3 | `pricedTokens()` |
| Price oracle address | CreditManagerV3 | `priceOracle()` |
| Loss policy state | MarketCompressor | `getLossPolicyState(lossPolicy)` |

### Events to Index

| Event | Contract | Significance |
|---|---|---|
| `SetPriceFeed(token, priceFeed, stalenessPeriod, skipCheck)` | PriceOracleV3 | Main feed changed |
| `SetReservePriceFeed(token, priceFeed, stalenessPeriod, skipCheck)` | PriceOracleV3 | Reserve feed changed |

### Agent Divergence Detection

```typescript
// For LSTs like wstETH:
const mainPrice = await oracle.read.getPrice([wstETH]);
const reservePrice = await oracle.read.getReservePrice([wstETH]);
const safePrice = await oracle.read.getSafePrice([wstETH]);

// Compare to external market price (e.g., from DEX TWAP or CEX)
const marketPrice = await getExternalPrice(wstETH); // your own data source

const divergenceBps = Math.abs(Number(mainPrice - marketPrice)) * 10000 / Number(mainPrice);
if (divergenceBps > 250) { // > 2.5% divergence
    // Alert: oracle divergence may trigger unexpected liquidations
    // or allow borrowers to extract value
}

// Check staleness
const params = await oracle.read.priceFeedParams([wstETH]);
const feedContract = params.priceFeed;
const [, , , updatedAt, ] = await chainlinkFeed.read.latestRoundData();
const age = BigInt(Math.floor(Date.now() / 1000)) - updatedAt;
if (age > params.stalenessPeriod) {
    // STALE PRICE — oracle will revert on next use
}
```

### Edge Cases / Gotchas

- **Fundamental feeds won't trigger liquidation during de-pegs** — wstETH priced at ETH backing ratio won't drop even if market sells off
- Reserve feed acts as an upper bound during Safe Price calculation — prevents value extraction via adapter calls
- **Pyth feeds require push updates** — on Anvil forks, these are unavailable (set `ignoreUpdateablePrices: true` in SDK)
- `skipCheck = true` on a price feed means staleness is not validated — higher risk
- Circuit breaker: No native circuit breaker in PriceOracleV3, but CreditFacade auto-pauses on cumulative loss (`maxCumulativeLoss`)

---

## 5. QUOTED TOKENS AND EXPOSURE CHAIN

### Mechanism

The **Quota System** manages per-token exposure in Gearbox V3:

```
PoolV3 ← PoolQuotaKeeperV3 ← GaugeV3 or TumblerV3 (rate keeper)
```

**Key concepts**:
- A **quota** is the max underlying-denominated value a credit account claims is backed by a specific token
- Quotas are per-account AND aggregated per-pool (via `totalQuoted`)
- Each token has a **quota rate** (extra APR on top of base rate)
- Each token has a **quota limit** (max aggregate quota across all accounts)
- **Liquidation Threshold (LT)** is set per-token per-CreditManager (not per-pool)

### On-Chain State to Read

| Data Point | Contract | Function |
|---|---|---|
| Quota keeper address | PoolV3 | `poolQuotaKeeper()` |
| Token quota params | PoolQuotaKeeperV3 | `getTokenQuotaParams(token)` → (rate, cumulativeIndex, quotaIncreaseFee, totalQuoted, limit, isActive) |
| All quoted tokens | PoolQuotaKeeperV3 | `quotedTokens()` → address[] |
| Rate keeper (gauge/tumbler) | PoolQuotaKeeperV3 | `rateKeeper()` |
| Account's quota for token | PoolQuotaKeeperV3 | `getQuota(creditAccount, token)` → (quota, cumulativeIndex) |
| Token's LT in a CM | CreditManagerV3 | `liquidationThresholds(token)` |
| Quoted tokens mask in CM | CreditManagerV3 | `quotedTokensMask()` |
| Token by mask | CreditManagerV3 | `getTokenByMask(mask)` |
| All collateral tokens | CreditManagerV3 | `collateralTokens(i)` for i in 0..collateralTokensCount |

### Events to Index

| Event | Contract | Significance |
|---|---|---|
| `UpdateQuota(creditAccount, token, quotaChange)` | PoolQuotaKeeperV3 | Individual quota changed |
| `UpdateTokenQuotaRate(token, rate)` | PoolQuotaKeeperV3 | Rate changed (epoch update) |
| `SetTokenLimit(token, limit)` | PoolQuotaKeeperV3 | Quota limit changed |
| `AddQuotaToken(token)` | PoolQuotaKeeperV3 | New token added to quota system |

### Exposure Chain Analysis

An agent must trace the full chain to assess real risk:

```typescript
// Step 1: Get all quoted tokens for the pool
const quotaKeeper = await pool.read.poolQuotaKeeper();
const quotedTokens = await quotaKeeper.read.quotedTokens();

for (const token of quotedTokens) {
    // Step 2: Check quota params
    const params = await quotaKeeper.read.getTokenQuotaParams([token]);
    const { rate, totalQuoted, limit, isActive } = params;
    
    // Step 3: Check LT across ALL CMs attached to this pool
    const cms = await pool.read.creditManagers();
    let hasNonZeroLT = false;
let totalDebtWithToken = 0n;
    
    for (const cm of cms) {
        const lt = await creditManager.read.liquidationThresholds([token]);
        if (lt > 0) hasNonZeroLT = true;
        
        // Check CM's debt limit
        const cmLimit = await pool.read.creditManagerDebtLimit([cm]);
        if (cmLimit > 0 && lt > 0) {
            // This token carries real risk via this CM
        }
    }
    
    // Step 4: Edge case checks
    if (rate > 0 && !hasNonZeroLT) {
        // Token has quota rate but zero LT in ALL CMs
        // = LPs earn quota interest but take zero collateral risk
        // (unless LT ramp is scheduled)
    }
    
    if (hasNonZeroLT && limit == 0) {
        // Token has LT but zero quota limit
        // = no new exposure can be created, but existing may remain
    }
}
```

### Can token have non-zero quota rate but zero LT?

**YES** — if the token is quoted in the PoolQuotaKeeper (has a rate) but has LT = 0 in all CMs. This means borrowers pay interest for quota but the token has zero collateral value. Effectively zero risk for LPs from that token.

### Can token have non-zero LT but zero debt limit?

**YES** — a CM with `creditManagerDebtLimit = 0` means no new borrowing, but existing positions may still hold the token. The LT only matters for existing accounts.

### Edge Cases / Gotchas

- Quota limits are **per-pool** (global), LTs are **per-CreditManager** (local)
- A token can have different LTs in different CMs sharing the same pool
- `quotedTokensMask` in CreditManager defines which tokens require quotas
- Token with `isActive = false` in QuotaKeeper = no new quotas allowed
- Quota interest is **additive/linear** (not compounding like base interest)
- The `quotaIncreaseFee` is a one-time fee charged when increasing quota

---

## 6. UTILIZATION AND EXIT LIQUIDITY

### Mechanism

**Utilization** = Total Borrowed / (Total Borrowed + Available Liquidity)

```solidity
// In PoolV3:
function availableLiquidity() public view returns (uint256) {
    return IERC20(asset()).safeBalanceOf(address(this));
}

function expectedLiquidity() public view returns (uint256) {
    return _expectedLiquidityLU + _calcBaseInterestAccrued() + _calcQuotaRevenueAccrued();
}

// Utilization = 1 - (availableLiquidity / expectedLiquidity)
// Or: (expectedLiquidity - availableLiquidity) / expectedLiquidity
```

### Interest Rate Model (IRM)

**LinearInterestRateModelV3** — Two-kink piecewise linear model:

```
Region        Range       Slope       Behavior
─────────────────────────────────────────────────────
Obtuse        0 → U₁     R_slope1    Low rates, gradual increase
Intermediate  U₁ → U₂    R_slope2    Normal operation zone
Steep         U₂ → 100%  R_slope3    Emergency — rates spike
```

**Critical**: If `isBorrowingMoreU2Forbidden() == true`, borrowing that pushes utilization above U₂ is BLOCKED. This reserves (1 - U₂) of pool liquidity for LP withdrawals.

### On-Chain State to Read

| Data Point | Contract | Function |
|---|---|---|
| Available liquidity | PoolV3 | `availableLiquidity()` |
| Expected liquidity | PoolV3 | `expectedLiquidity()` |
| Total borrowed | PoolV3 | `totalBorrowed()` |
| Base interest rate | PoolV3 | `baseInterestRate()` — RAY scaled (1e27) |
| Supply rate (LP APY) | PoolV3 | `supplyRate()` — RAY scaled |
| IRM address | PoolV3 | `interestRateModel()` |
| IRM parameters | LinearIRM | `getModelParameters()` → (U1, U2, Rbase, Rslope1, Rslope2, Rslope3) in bps |
| Borrowing above U2 forbidden? | LinearIRM | `isBorrowingMoreU2Forbidden()` |
| Current borrow rate | LinearIRM | `calcBorrowRate(expectedLiq, availableLiq, false)` |
| Withdrawal fee | PoolV3 | `withdrawFee()` — in bps |

### Events to Index

| Event | Contract | Significance |
|---|---|---|
| `Borrow(cm, ca, amount)` | PoolV3 | Utilization increased |
| `Repay(cm, amount, profit, loss)` | PoolV3 | Utilization decreased |
| `Deposit/Transfer events` | PoolV3 (ERC4626) | LP deposits change available liquidity |
| `Withdraw events` | PoolV3 (ERC4626) | LP withdrawals change available liquidity |
| `SetInterestRateModel(newIRM)` | PoolV3 | IRM changed |

### Agent Monitoring Logic

```typescript
const available = await pool.read.availableLiquidity();
const expected = await pool.read.expectedLiquidity();
const totalBorrowed = await pool.read.totalBorrowed();

const utilization = Number((expected - available) * 10000n / expected) / 100;

// Get IRM params
const irm = await pool.read.interestRateModel();
const [U1, U2, Rbase, Rslope1, Rslope2, Rslope3] = await irmContract.read.getModelParameters();
const u2Forbidden = await irmContract.read.isBorrowingMoreU2Forbidden();

// Check exit liquidity
const poolTotalSupply = await pool.read.totalSupply();
const shareValue = await pool.read.convertToAssets([parseUnits("1", 18)]);
const maxWithdrawableUnderlying = available; // bounded by pool cash

if (utilization > Number(U2) / 100) {
    // In steep zone — LP withdrawals may face high slippage or be limited
}

if (available < someThreshold) {
    // LOW EXIT LIQUIDITY WARNING
}
```

### Edge Cases / Gotchas

- Pool pause blocks deposits AND withdrawals (but not borrowing/repayment)
- Withdrawal fee reduces what LP receives: `assetsToUser = assets * (10000 - withdrawFee) / 10000`
- At 100% utilization, **LPs cannot withdraw** — must wait for borrowers to repay
- `supplyRate()` includes both base interest and quota revenue, scaled by utilization
- The IRM `calcBorrowRate` takes `expectedLiquidity` and `availableLiquidity` — not utilization directly

---

## 7. POOL PARAMETERS AND GOVERNANCE

### Governance Structure

Gearbox V3.1+ uses a **Market Configurator** pattern:

1. **Administrator** (Governance): Full control, subject to **24-hour timelock**
2. **Emergency Admin**: Can pause, set limits to 0, forbid tokens — **no timelock** (can only reduce risk)
3. **Controller**: Can adjust parameters within constrained ranges
4. **Configurator**: On-chain contract that executes parameter changes

### Parameters Affecting LPs

| Parameter | Changed By | Contract | Function | Impact on LPs |
|---|---|---|---|---|
| Total debt limit | Configurator | PoolV3 | `setTotalDebtLimit(uint256)` | Max exposure |
| Per-CM debt limit | Configurator | PoolV3 | `setCreditManagerDebtLimit(cm, limit)` | Per-strategy exposure |
| Interest rate model | Configurator | PoolV3 | `setInterestRateModel(address)` | Yield curve |
| Pool quota keeper | Configurator | PoolV3 | `setPoolQuotaKeeper(address)` | Quota system |
| Withdrawal fee | Configurator | PoolV3 | `setWithdrawFee(uint256)` | Exit cost (max 100 bps = 1%) |
| Token quota rate | GaugeV3/TumblerV3 | QuotaKeeper | `updateRates()` | Quota revenue |
| Token quota limit | Configurator | QuotaKeeper | `setTokenLimit(token, limit)` | Per-token exposure |
| Liquidation threshold | Configurator | CreditManager | via CreditConfigurator | Liquidation risk |
| Max cumulative loss | Configurator | CreditFacadeV3 | `setCumulativeLossParams()` | Auto-pause threshold |
| Price feeds | Configurator | PriceOracleV3 | `setPriceFeed()` / `setReservePriceFeed()` | Collateral valuation |
| Forbidden tokens mask | Configurator | CreditFacadeV3 | Set via configurator | Risk exposure |
| Pool pause | Pausable Admin | PoolV3 | `pause()` / `unpause()` | LP access |
| Facade pause | Pausable Admin | CreditFacadeV3 | `pause()` / `unpause()` | New borrowing |

### Timelock

- Administrator actions pass through a **Timelock contract** (min 24 hours)
- Emergency Admin can bypass timelock but ONLY for risk-reducing actions
- The Timelock has a **Veto Admin** (3/10 multisig) that can cancel queued transactions

### Events to Index

| Event | Contract | Significance |
|---|---|---|
| `SetInterestRateModel(newIRM)` | PoolV3 | IRM changed |
| `SetPoolQuotaKeeper(newKeeper)` | PoolV3 | Quota system changed |
| `SetTotalDebtLimit(limit)` | PoolV3 | Global debt limit changed |
| `SetCreditManagerDebtLimit(cm, limit)` | PoolV3 | Per-CM limit changed |
| `SetWithdrawFee(fee)` | PoolV3 | Exit cost changed |
| `SetPriceFeed(token, feed, staleness, skip)` | PriceOracleV3 | Oracle changed |
| `SetReservePriceFeed(token, feed, staleness, skip)` | PriceOracleV3 | Reserve oracle changed |
| `UpdateTokenQuotaRate(token, rate)` | PoolQuotaKeeperV3 | Quota rate changed |
| `SetTokenLimit(token, limit)` | PoolQuotaKeeperV3 | Quota limit changed |
| `AddCreditManager(cm)` | PoolV3 | New CM connected |
| `Paused(account)` / `Unpaused(account)` | PoolV3, CreditFacadeV3 | Emergency action |
| `SetCreditConfigurator(newConfigurator)` | CreditManagerV3 | Configurator upgrade |

### Agent Monitoring Logic

```typescript
// Monitor pending timelock transactions
// Check MarketConfigurator.activeProposals() for queued changes

// Monitor all parameter-change events on pool and related contracts
const poolEvents = await pool.getEvents.SetTotalDebtLimit();
const cmLimitEvents = await pool.getEvents.SetCreditManagerDebtLimit();
const irmEvents = await pool.getEvents.SetInterestRateModel();
const feeEvents = await pool.getEvents.SetWithdrawFee();
const oracleEvents = await oracle.getEvents.SetPriceFeed();

// Alert on: 
// - Debt limit increases (more exposure)
// - LT increases (more risk per token)
// - IRM changes (yield impact)
// - Oracle feed changes (valuation impact)
// - Quota limit increases (more per-token exposure)
// - Withdrawal fee increases (higher exit cost)
```

### Edge Cases / Gotchas

- **Emergency admin** can set debt limit to 0 (blocking new borrowing) WITHOUT timelock
- TreasurySplitter's `tokenInsuranceAmount` can be checked — lowering it is a risk signal
- Pool quota keeper change replaces the ENTIRE quota system — very impactful
- IRM change affects ALL existing borrowers immediately (not just new ones)
- Withdrawal fee max is 100 bps (1%) — hardcoded in contract
- `configuratorOnly` modifier means only the CreditConfigurator contract can call these functions, not governance directly

---

## SDK Methods Reference

### GearboxSDK (v12.9.7+)

```typescript
// Attach to network
const sdk = await GearboxSDK.attach({
    rpcURLs: ["https://eth-mainnet.g.alchemy.com/..."],
    ignoreUpdateablePrices: true, // for forks
});

// Market data
sdk.marketRegister.creditManagers  // All market objects
sdk.marketRegister.pools           // All pool objects
sdk.marketRegister.findCreditManager(address)
sdk.marketRegister.findByCreditManager(address)

// Each market object has:
market.pool.pool.totalBorrowed
market.pool.pool.availableLiquidity
market.pool.pool.creditManagerDebtParams  // Map<address, {borrowed, limit, available}>
market.creditFacade.isPaused
market.creditFacade.lossParams
market.creditManager.liquidationThresholds  // Map<address, uint16>
market.creditManager.collateralTokens
```

### MarketCompressor (on-chain)

```typescript
// Read all market data in one call
const marketData = await compressor.read.getMarketData([poolAddress, configuratorAddress]);
// Returns: MarketData with pool, quotaKeeper, creditManagers[], priceOracle, lossPolicy, tokens
```

### DataCompressorV3 (legacy, still available)

```typescript
const poolData = await compressor.read.getPoolData([poolAddress]);
// Returns: PoolData with totalBorrowed, totalDebtLimit, creditManagerDebtParams[], etc.

const cmData = await compressor.read.getCreditManagerData([cmAddress]);
// Returns: CreditManagerData with totalDebt, totalDebtLimit, quotas[], etc.
```

---

## Summary: Key Monitoring Priorities for LP Safety Agent

| Priority | Vector | Key Signal | Data Source |
|---|---|---|---|
| P0 | Bad Debt | `IncurUncoveredLoss` event | PoolV3 |
| P0 | Bad Debt | `lossParams.currentCumulativeLoss` increasing | CreditFacadeV3 |
| P1 | Zombie | Paused facade + open liquidatable accounts | CreditFacadeV3 + CreditManagerV3 |
| P1 | Aggregate | Sum of CM debts vs insurance fund | PoolV3 + treasury balance |
| P1 | Utilization | Available liquidity < threshold | PoolV3.availableLiquidity() |
| P2 | Oracle | Main vs reserve price divergence > 2.5% | PriceOracleV3 |
| P2 | Oracle | Feed staleness approaching limit | PriceOracleV3 + Chainlink |
| P2 | Quotas | Token totalQuoted approaching limit | PoolQuotaKeeperV3 |
| P3 | Governance | Debt limit increase events | PoolV3 events |
| P3 | Governance | IRM or oracle feed changes | PoolV3, PriceOracleV3 events |
| P3 | Governance | Withdrawal fee changes | PoolV3 events |
