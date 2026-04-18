# Gearbox Protocol V3 — Credit Account Loss Vectors: Complete On-Chain Reference

**Status:** Complete
**Date:** 2026-03-31
**Input:** Gearbox V3 contracts (core-v3), SDK v12.9.7, protocol documentation

## 1. LIQUIDATION MECHANICS

### Full Liquidation Formula

**Contracts:** `CreditFacadeV3.sol`, `CreditManagerV3.sol`, `CreditLogic.sol`

**Entry point:**

```solidity
// CreditFacadeV3
function liquidateCreditAccount(
    address creditAccount,
    address to,
    MultiCall[] calldata calls,
    bytes calldata lossPolicyData
) external;
```

**Core math (CreditLogic.calcLiquidationPayments):**

```
totalFunds = totalValue * liquidationDiscount / PERCENTAGE_FACTOR
liabilities = totalDebt (principal + interest + quotaFees) + DAO_liquidation_fee

// Solvent liquidation: totalFunds > liabilities
//   Pool gets: full debt repaid
//   DAO gets: feeLiquidation (% of totalValue)
//   Borrower gets: totalFunds - liabilities (remainingFunds)
//   Liquidator gets: all collateral assets minus underlying sent to pool/DAO/borrower

// Insolvent (bad debt): totalFunds < liabilities
//   Pool gets: totalFunds (partial repayment)
//   DAO: unclaimed fees burned to cover deficit
//   If deficit remains: IncurUncoveredLoss event, borrowing halted
//   Borrower gets: 0
```

**Fee parameters (all in bps, read via `creditManager.fees()`):**

| Parameter | Description |
|-----------|-------------|
| `feeLiquidation` | DAO fee on liquidated value (e.g., 200 = 2%) |
| `liquidationPremium` | Liquidator reward (e.g., 500 = 5%) |
| `liquidationDiscount` | = 10000 - liquidationPremium = debt coverage % |
| `feeLiquidationExpired` | Lower DAO fee for expired accounts |
| `liquidationPremiumExpired` | Lower liquidator premium for expired |

**Constraint:** `feeLiquidation + liquidationPremium` must remain constant when changed. Expired fees/premiums must be <= non-expired values.

### Partial Liquidation (Deleverage) — V3

**Entry point:**

```solidity
// CreditFacadeV3
function partiallyLiquidateCreditAccount(
    address creditAccount,
    address token,          // collateral token to seize
    uint256 repaidAmount,   // underlying amount liquidator provides
    uint256 minSeizedAmount,// min collateral to receive
    address to,
    PriceUpdate[] calldata priceUpdates
) external returns (uint256 seizedAmount);
```

**When triggered:** A bot (with special permissions from DAO) executes when HF drops below `minHF` (configurable, e.g., 1.05) but is typically still > 1. This is a "soft" liquidation — the account stays open.

**Configuration (in PartialLiquidationBotV3):**

| Parameter | Description |
|-----------|-------------|
| `minHF` | Threshold to trigger partial liquidation (e.g., 10500 = 1.05) |
| `maxHF` | Target HF after deleverage |
| `PremiumScale` | % of full liquidation premium charged (e.g., 50%) |

**Math:**

```solidity
function _calcPartialLiquidationPayments(
    uint256 amount,   // repaid amount in underlying
    address token,    // seized token
    bool isExpired
) returns (repaidAmount, feeAmount, seizedAmount)
```

- Liquidator provides underlying → repays debt
- Protocol seizes equivalent collateral + scaled premium + fee
- Post-liquidation: account must pass collateral check (HF >= 1)
- Cannot leave dust debt below `minDebt`
- Cannot seize underlying token

### Expiration-Based Liquidation

**State:** `CreditFacadeV3.expirationDate()` — `uint40` timestamp.
**Check:** `_isExpired()` returns true if `expirable && block.timestamp >= expirationDate`.

**Differences from standard liquidation:**

- Uses `feeLiquidationExpired` and `liquidationPremiumExpired` (lower premiums)
- Any account can be liquidated after expiration regardless of HF
- No new accounts can be opened after expiration
- `NotAllowedAfterExpirationException` thrown if trying to open/increase debt after expiry

### Liquidation State Check

**On-chain reads to determine if liquidatable:**

```solidity
// Option 1: Direct check
bool liquidatable = creditManager.isLiquidatable(creditAccount, 10000); // 10000 = 100% HF

// Option 2: Full data
CollateralDebtData memory cdd = creditManager.calcDebtAndCollateral(
    creditAccount,
    CollateralCalcTask.DEBT_COLLATERAL
);
uint256 hf = (cdd.twvUSD * 10000) / cdd.totalDebtUSD;
bool isLiquidatable = hf < 10000;

// Option 3: Check expiration
bool isExpired = creditFacade.expirationDate() > 0
    && block.timestamp >= creditFacade.expirationDate();
```

**Events to index:**

- `LiquidateCreditAccount(address indexed creditAccount, address indexed liquidator)`
- `PartiallyLiquidateCreditAccount(address indexed creditAccount, address indexed token, uint256 repaidAmount, uint256 seizedAmount)`
- `IncurUncoveredLoss(address indexed pool, uint256 loss)` — bad debt event

---

## 2. ORACLE SYSTEM

### PriceOracle Contract Structure

**Contract:** `PriceOracleV3.sol`
**Interface:** `IPriceOracleV3.sol`

**Key functions:**

```solidity
interface IPriceOracleV3 {
    function getPrice(address token) external view returns (uint256);
    function getReservePrice(address token) external view returns (uint256);
    function convertToUSD(uint256 amount, address token) external view returns (uint256);
    function convertFromUSD(uint256 amount, address token) external view returns (uint256);
    function convert(uint256 amount, address tokenFrom, address tokenTo) external view returns (uint256);
    function safeConvertToUSD(uint256 amount, address token) external view returns (uint256);
    function priceFeedParams(address token) external view returns (PriceFeedParams memory);
    function priceFeeds(address token) external view returns (address);
}
```

**Dual-feed architecture:**

- **Main feed**: Used for account value calculation during liquidation checks
- **Reserve feed**: Used for "safe price" = `min(mainFeedPrice, reserveFeedPrice)`
- Safe prices kick in when multicall includes collateral withdrawal or external adapter calls

**PriceFeedParams struct:**

```solidity
struct PriceFeedParams {
    address priceFeed;        // Price feed contract address
    uint32 stalenessPeriod;   // Max age of price data in seconds
    bool skipCheck;           // Whether to skip staleness check
    uint8 tokenDecimals;      // Token decimals for price scaling
}
```

### Composite Oracles

**Example: wstETH/USD = wstETH/stETH * stETH/ETH * ETH/USD**

Gearbox uses modular feed contracts:

- **Composite feed**: Multiplies 2 feeds (e.g., Feed1 * Feed2)
  - Deploy with Feed1 = wstETH/ETH exchange rate, Feed2 = ETH/USD Chainlink
- **Bounded feed**: Applies min/max bounds to prevent manipulation
- **ERC4626 feed**: Fetches share/underlying rate from vault, multiplies by underlying/USD
- **Curve LP feed**: Uses Curve pool math for LP token pricing
- **Pendle PT feed**: Uses TWAP from Pendle market + underlying price

### CAPO (Capped Oracle / Bounded Price Feed)

CAPO = applying upper bounds to oracle prices to protect against price manipulation.

**How it works:**

- Bounded price feed wraps an underlying feed
- Sets min/max bounds on the reported price
- If underlying feed reports price above bound, bounded feed caps it
- Protects LPs from price manipulation (attacker inflates collateral value)
- Protects borrowers from unfair liquidations (price spikes)

**Configuration per feed in Price Feed Store (PFS):**

- `bound`: Maximum allowed price relative to some reference
- Updated periodically by governance

### Oracle Freshness/Staleness Check

**Agent check:**

```solidity
PriceFeedParams memory params = oracle.priceFeedParams(token);
uint32 stalenessPeriod = params.stalenessPeriod;
// Typical: 86520 (24h + 2min for Chainlink), shorter for faster chains

// Read underlying Chainlink feed
(, int256 answer, , uint256 updatedAt, ) = AggregatorV3Interface(params.priceFeed).latestRoundData();
bool isStale = block.timestamp - updatedAt > stalenessPeriod;
```

**When `skipCheck = true`:** Feed implements its own safety checks (e.g., Redstone pull, Pyth).

### Oracle Revert Behavior

- If a price feed reverts, `convertToUSD()` reverts → the entire collateral check reverts
- This means: if any enabled token's oracle is broken, the account CANNOT be liquidated, closed, or have its multicall complete
- **Critical edge case:** An enabled token with a broken oracle can strand an account
- **Mitigation:** `disableToken` during multicall to remove the problematic token from the enabled mask
- `StalePriceException` is thrown when staleness check fails

**Events:** No oracle-specific events in PriceOracle (it's read-only). Monitor Chainlink's `AnswerUpdated` events.

---

## 3. QUOTA SYSTEM

### How Quotas Work

**Contract:** `PoolQuotaKeeperV3.sol`
**Interface:** `IPoolQuotaKeeperV3.sol`

Quotas = per-token exposure limits denominated in underlying. Every non-underlying collateral token in V3 is "quoted."

**Per-account quota:** The maximum underlying-equivalent of a quoted asset that counts toward collateral.

```solidity
// In HF calculation:
weightedValueUSD = Math.min(
    balance * price * LT / PERCENTAGE_FACTOR,  // LT-weighted value
    quotaUSD                                     // quota cap in USD
);
```

### Key State Variables

```solidity
// Global (per pool per token)
function getTokenQuotaParams(address token) returns (
    bool isActive,
    uint96 limit,          // max totalQuoted for this token across all CAs
    uint96 totalQuoted,    // current total quota usage
    uint16 rate,           // annual interest rate in bps
    uint192 cumulativeIndex,
    uint16 quotaIncreaseFee
);

// Per credit account
function getQuotaAndOutstandingInterest(address creditAccount, address token) returns (
    uint96 quoted,             // this CA's quota for this token
    uint128 outstandingInterest // accrued interest not yet added to debt
);
```

### Quota Rates (Gauge Votes)

**GaugeV3 (voting model):**

```
quotaRate = (minRate * VotesDOWN + maxRate * VotesUP) / VotesTOTAL
```

- GEAR stakers vote UP (higher rate) or DOWN (lower rate)
- New epochs start every Monday 12:00 UTC (7-day epochs)
- Rates only take effect when `updateRates()` is called

**TumblerV3 (curator model):**

- Curator directly sets rates via `setRate(address token, uint16 rate)`
- Epoch-based to prevent frequent manipulation

### Quota Limit Reached

When `totalQuoted >= limit`:

- `QuotaIsOutOfBoundsException` is thrown for any transaction increasing that quota
- Existing positions are NOT affected (no forced reduction)
- Users cannot increase their quota for that token
- Available quota: `limit - totalQuoted`

### Quota Interest Accrual

- **Additive (linear)**, unlike base debt which compounds
- `quotaInterest = quota * (cumulativeIndexNow - cumulativeIndexAtLastUpdate) / RAY`
- Quota increase fee: one-time fee charged when quota is increased (bps of increase)
- Interest is tracked per-account in `cumulativeQuotaInterest` field

### Events to Index

- `SetTokenLimit(address indexed token, uint96 limit)`
- `UpdateRates()` (on gauge/tumbler)
- `UpdateQuota(address indexed creditAccount, address indexed token, int96 quotaChange)`

---

## 4. ADAPTER SYSTEM

### Adapter Structure

**Base contract:** `AbstractAdapter.sol`

Every adapter has:

- `creditManager` — the CM it's registered with (immutable)
- `targetContract` — the external protocol contract (e.g., Uniswap Router)
- `creditFacadeOnly` modifier — ensures calls only during multicall
- `_creditAccount()` — returns active CA address during multicall
- `_execute(bytes calldata)` — calls target from CA via CM

**Adapter ↔ CM connection:**

```solidity
// CreditManagerV3
function contractToAdapter(address targetContract) returns (address adapter);
function adapterToContract(address adapter) returns (address targetContract);
```

### Finding Adapters for a CM

```solidity
// Via CreditConfiguratorV3
address[] memory adapters = creditConfigurator.allowedAdapters();

// Via CreditManagerV3 (lookup specific target)
address adapter = creditManager.contractToAdapter(UNISWAP_V3_ROUTER);
```

**SDK:** `cm.state.adapters` array contains adapter state objects.

### Forbidding an Adapter

```solidity
// CreditConfiguratorV3
function forbidAdapter(address adapter) external;
```

**What happens:**

- Adapter AND its target contract are removed from the allowed list
- `ForbidAdapter(targetContract, adapter)` event emitted
- Tokens already held via that adapter remain on the CA
- **Stranded tokens risk:** If the only way to convert/exit a token was via the forbidden adapter, that token may be stuck
- Tokens can still be disabled (reducing gas costs) but the value may be unrecoverable via normal operations

### Adapters and Allowed Tokens

- Adapters return `tokensToEnable` / `tokensToDisable` masks after execution
- Only tokens registered as collateral in the CM can be enabled
- If an adapter tries to receive a non-collateral token → it won't count toward HF
- Forbidden tokens (via `forbidToken`) can still be held but trigger restrictions

### Events

- `AllowAdapter(address indexed targetContract, address indexed adapter)`
- `ForbidAdapter(address indexed targetContract, address indexed adapter)`

---

## 5. PARAMETER CHANGES (LT, Debt Limits, Forbidden Tokens)

### LT Changes and Ramping

**Contract:** `CreditConfiguratorV3.sol`, `CreditManagerV3.sol`

**Immediate change:**

```solidity
function setLiquidationThreshold(address token, uint16 liquidationThreshold) external;
```

**Gradual ramping:**

```solidity
function rampLiquidationThreshold(
    address token,
    uint16 liquidationThresholdFinal,  // target LT in bps
    uint40 rampStart,                   // start timestamp
    uint24 rampDuration                 // duration in seconds
) external;
```

**On-chain state (CollateralTokenData struct in CM):**

```solidity
struct CollateralTokenData {
    address token;
    uint16 ltInitial;              // Starting LT
    uint16 ltFinal;                // Target LT
    uint40 timestampRampStart;     // When ramping begins
    uint24 rampDuration;           // Duration in seconds
}
```

**During ramping:** LT changes linearly from `ltInitial` to `ltFinal` over `rampDuration` seconds. This directly affects HF of all accounts holding that token.

**Constraints:** Any token's LT must be <= underlying token's LT.

### forbidToken Mechanism

```solidity
// CreditConfiguratorV3
function forbidToken(address token) external;
function allowToken(address token) external;  // reverses forbid
```

**Effects of forbidding a token:**

- Token gets added to `forbiddenTokensMask` in CreditManagerV3
- Accounts with enabled forbidden tokens face restrictions:
  - `ForbiddenTokensException` thrown if trying to increase debt
  - `ForbiddenTokenQuotaIncreasedException` if trying to increase quota for forbidden token
  - `ForbiddenTokenBalanceIncreasedException` if balance increases
  - Safe prices used for collateral check (= min of main + reserve oracle)
- Token CAN still be disabled/sold to remove it

### Debt Limit Changes

```solidity
// CreditConfiguratorV3
function setDebtLimits(uint128 newMinDebt, uint128 newMaxDebt) external;
```

**State variables (in CreditFacadeV3):**

```solidity
DebtLimits public debtLimits;  // { minDebt, maxDebt }
uint8 public maxDebtPerBlockMultiplier;  // max new debt per block = maxDebt * multiplier
```

**Pool-level:**

```solidity
// PoolV3
function creditManagerDebtParams(address cm) returns (uint128 borrowed, uint128 limit);
// totalDebtLimit enforced per CM at pool level
```

**Validation:** minDebt <= maxDebt. After any debt change, account debt must be 0 or in [minDebt, maxDebt].

### Events for Parameter Changes

```solidity
event SetLiquidationThreshold(address indexed token, uint16 liquidationThreshold);
event ScheduleTokenLiquidationThresholdRamp(
    address indexed token, uint16 liquidationThresholdInitial,
    uint16 liquidationThresholdFinal, uint40 timestampRampStart, uint40 timestampRampEnd
);
event AddCollateralToken(address indexed token);
event ForbidToken(address indexed token);
event AllowToken(address indexed token);
event UpdateFees(uint16 feeLiquidation, uint16 liquidationPremium,
    uint16 feeLiquidationExpired, uint16 liquidationPremiumExpired);
event SetDebtLimits(uint128 minDebt, uint128 maxDebt);
event SetMaxDebtPerBlockMultiplier(uint8 maxDebtPerBlockMultiplier);
event ForbidBorrowing();
event SetLossPolicy(address indexed newLossPolicy);
```

### Timelocks

- Parameter changes go through `CreditConfiguratorV3` which has `configuratorOnly` modifier
- The configurator is set by governance (typically a timelock/multisig)
- LT ramping has built-in time delay via `rampStart` and `rampDuration`
- `IncorrectLiquidationThresholdRampException` thrown if ramp duration too short
- No protocol-level minimum timelock — depends on governance setup

---

## 6. HEALTH FACTOR CALCULATION

### Exact HF Formula

```
HF = TWV_USD / totalDebt_USD

Where:
  TWV_USD = SUM over all enabled tokens i of:
    min(balance_i * price_i * LT_i / 10000, quota_i_USD)

  totalDebt_USD = (debt_principal + accruedInterest + accruedFees) * underlyingPrice
```

In code (basis points, 10000 = 100%):

```solidity
uint256 healthFactor = (cdd.twvUSD * 10000) / cdd.totalDebtUSD;
// HF >= 10000 means healthy, < 10000 means liquidatable
```

### Weighted Collateral Value Calculation

For each enabled token:

```solidity
// CollateralLogic.calcOneTokenCollateral
function calcOneTokenCollateral(
    address token,
    uint16 liquidationThreshold,
    uint256 quotaUSD
) returns (uint256 valueUSD, uint256 weightedValueUSD) {
    if (balance != 0) {
        valueUSD = convertToUSD(priceOracle, balance, token);
        weightedValueUSD = Math.min(
            valueUSD * liquidationThreshold / PERCENTAGE_FACTOR,
            quotaUSD
        );
    }
}
```

**Key points:**

- `valueUSD`: Full USD value (8 decimals)
- `weightedValueUSD`: After LT discount AND quota cap
- Underlying token: always enabled (mask=1), uses `ltUnderlying`, NO quota cap
- Non-underlying tokens: must be quoted, quota cap applies

### Role of LT Per Token

- Each token has its own LT in basis points (e.g., WETH=9000, stablecoins=9500)
- LT represents max expected price drop during liquidation window
- Higher LT = token contributes more to HF = more borrowing power
- LT can be ramped (see section 5)

### Role of Quotas in HF

- For quoted tokens: `weightedValue = min(balance * price * LT, quotaInUnderlying * underlyingPrice)`
- If quota < actual value: quota caps the contribution
- Quota = 0 means the token contributes NOTHING to HF even if balance > 0
- Quota interest adds to total debt, reducing HF

### What Causes HF to Change

| Factor | Effect on HF | Direction |
|--------|-------------|-----------|
| Collateral price drops | TWV decreases | HF ↓ |
| Collateral price rises | TWV increases | HF ↑ |
| LT decreased (or ramping down) | TWV decreases | HF ↓ |
| Interest accrues | totalDebt increases | HF ↓ |
| Quota interest accrues | totalDebt increases | HF ↓ |
| Quota reduced | TWV cap tightens | HF ↓ |
| Debt repaid | totalDebt decreases | HF ↑ |
| Collateral added | TWV increases | HF ↑ |
| Token forbidden | Safe prices used (lower) | HF ↓ |
| Oracle stale/reverts | Collateral check reverts | ⚠️ |

### On-Chain State to Read

```solidity
// Primary source
CollateralDebtData memory cdd = creditManager.calcDebtAndCollateral(
    creditAccount,
    CollateralCalcTask.DEBT_COLLATERAL
);
// Fields: debt, accruedInterest, accruedFees, totalDebtUSD, totalValue, totalValueUSD, twvUSD

// Direct HF check
bool isLiquidatable = creditManager.isLiquidatable(creditAccount, 10000);
```

**SDK (from agent-demo):**

```typescript
const data = await caService.getCreditAccountData(caAddress);
// data.healthFactor, data.totalValueUSD, data.totalDebtUSD, data.twvUSD
```

---

## 7. BOT / SAFETY SYSTEM

### Bot List Contract

**Contract:** `BotListV3.sol`

**Key state:**

```solidity
struct BotInfo {
    bool forbidden;
    mapping(address => mapping(address => uint192)) permissions;
    // creditManager => creditAccount => permissions bitmask
}

// Read functions
function botPermissions(address bot, address creditAccount) returns (uint192);
function getBotStatus(address bot, address creditAccount) returns (uint192 permissions, bool forbidden);
function botForbiddenStatus(address bot) returns (bool);
function activeBots(address creditAccount) returns (address[] memory);
```

**Permission bits:**

```solidity
ADD_COLLATERAL_PERMISSION    = 1;
INCREASE_DEBT_PERMISSION     = 1 << 1;
DECREASE_DEBT_PERMISSION     = 1 << 2;
ENABLE_TOKEN_PERMISSION     = 1 << 3;
DISABLE_TOKEN_PERMISSION    = 1 << 4;
WITHDRAW_COLLATERAL_PERMISSION = 1 << 5;
UPDATE_QUOTA_PERMISSION      = 1 << 6;
REVOKE_ALLOWANCES_PERMISSION = 1 << 7;
EXTERNAL_CALLS_PERMISSION    = 1 << 16;
```

**Special bot states:**

1. **Forbidden:** DAO calls `forbidBot(address)` → bot cannot call `botMulticall` for ANY account
2. **Special permissions:** DAO gives a bot permissions for ALL CAs in a CM (e.g., partial liquidation bot)

**Events:**

- `ForbidBot(address indexed bot)`
- `SetBotPermissions(address indexed bot, address indexed creditAccount, uint192 permissions)`

### maxCumulativeLoss

**In CreditFacadeV3:**

```solidity
// State variables
uint128 public cumulativeLoss;      // running total of losses from liquidations
uint128 public maxCumulativeLoss;   // threshold — if exceeded, borrowing is halted

// Set by configurator
function setCumulativeLossParams(uint128 _maxCumulativeLoss, bool resetCumulativeLoss) external;
```

**Mechanism:**

- Every liquidation that incurs a loss (bad debt) adds to `cumulativeLoss`
- When `cumulativeLoss >= maxCumulativeLoss` → new borrowing is automatically forbidden
- This is an emergency brake to prevent cascading losses
- Can be reset by configurator (governance) via `resetCumulativeLoss = true`

### Loss Policy Contract

**Interface:**

```solidity
function setLossPolicy(address newLossPolicy) external; // on CreditConfiguratorV3
```

**Purpose:** Determines which liquidations with bad debt are allowed to proceed. If a liquidation would incur loss and the loss policy rejects it, `CreditAccountNotLiquidatableWithLossException` is thrown.

**Loss policy integration:**

- Called during liquidation flow
- Receives `lossPolicyData` bytes parameter from liquidator
- Can implement custom logic (e.g., only allow losses up to X, require approval)

### Pool-Level Loss Handling

```solidity
// PoolV3 — when CM reports a loss
// 1. Burns treasury shares to cover deficit
// 2. If treasury empty: emit IncurUncoveredLoss(pool, loss)
// 3. Triggers emergency borrowing halt
```

**Events:**

- `IncurUncoveredLoss(address indexed pool, uint256 loss)`
- `SetCumulativeLossParams(uint128 maxCumulativeLoss, bool resetCumulativeLoss)`

---

## 8. CREDIT MANAGER / FACADE EXPIRATION

### How Expiration Works

**State:** `CreditFacadeV3.expirationDate()` — `uint40` timestamp
**Flag:** `CreditFacadeV3.expirable()` — immutable bool set at deployment

```solidity
function setExpirationDate(uint40 newExpirationDate) external; // configuratorOnly
```

**On-chain check:**

```solidity
function _isExpired() internal view returns (bool) {
    if (!expirable) return false;
    uint40 _expirationDate = expirationDate;
    return _expirationDate != 0 && block.timestamp >= _expirationDate;
}
```

### Effects of Expiration

**After expiration:**

1. **All accounts are liquidatable** regardless of HF — using expired fee parameters
2. **Cannot open new accounts** — `NotAllowedAfterExpirationException`
3. **Cannot increase debt** — `NotAllowedAfterExpirationException`
4. **CAN still:** decrease debt, add collateral, close account, withdraw (with restrictions)

**Typical use case:** Fixed-term lending products (e.g., Pendle PT strategies). Expiration set before PT maturity to ensure pool gets repaid.

### Governance Can Extend

- DAO can call `setExpirationDate(newDate)` to push expiration forward
- New date must be > current date
- Emits `SetExpirationDate(uint40 expirationDate)` event

**Events:**

- `SetExpirationDate(uint40 expirationDate)`

---

## 9. maxEnabledTokens LIMIT

### What It Is

**Constant:** `MAX_SANE_ENABLED_TOKENS = 20` (in Constants.sol)
**Per-CM setting:** `CreditManagerV3.maxEnabledTokens()` — immutable, set at deployment

This limits how many different collateral tokens can be simultaneously enabled on a single credit account.

### Where It's Enforced

**In `CreditManagerV3.fullCollateralCheck()`:**

```solidity
// After computing all collateral values, check token count
uint256 enabledTokensCount = BitMask.calcEnabledTokens(enabledTokensMask);
if (enabledTokensCount > maxEnabledTokens) {
    revert TooManyEnabledTokensException();
}
```

**Also checked after every multicall** — if any operation enables too many tokens, the entire multicall reverts.

### Token Enabling / Disabling

**Enabling:** Happens automatically when:

- Adapter returns token in `tokensToEnable` mask
- Quota is set for a token (`updateQuota` with positive change)
- Token received during operations

**Disabling:** Happens when:

- Adapter returns token in `tokensToDisable` mask
- Token balance drops to 0 or 1 (dust threshold)
- User explicitly disables via `disableToken(address token)` in multicall
- `fullCollateralCheck` auto-disables tokens with zero balance

**Bitmask operations:**

```solidity
// Each token has a unique mask = 2^index
uint256 enabledTokensMask = account.enabledTokensMask;
bool isEnabled = (enabledTokensMask & tokenMask) != 0;

// Enable
enabledTokensMask |= tokenMask;
// Disable
enabledTokensMask &= ~tokenMask;
```

**Underlying token (mask=1) is ALWAYS enabled** and cannot be disabled.

### Edge Cases / Gotchas

- If a user has 20 tokens enabled and tries a swap that enables a 21st → **entire multicall reverts**
- Solution: disable unused tokens before enabling new ones in the same multicall
- Gas cost scales with number of enabled tokens (each needs price oracle call)
- `collateralHints` parameter in `fullCollateralCheck` optimizes gas by checking likely-sufficient tokens first
- Dust balances (1 wei) are auto-cleaned during collateral check

**Events:** No specific events for token enable/disable — it's reflected in `enabledTokensMask` state changes.

---

## APPENDIX: SDK Methods & Agent Demo Reference

### SDK Key Methods

```typescript
// Attach SDK
const sdk = await GearboxSDK.attach({ rpcURLs: [...], ignoreUpdateablePrices: true });

// Market discovery
sdk.marketRegister.creditManagers        // All CMs
sdk.marketRegister.findCreditManager(addr)  // Find specific CM
sdk.marketRegister.findByCreditManager(addr) // Find market suite

// Credit account data
const caService = createCreditAccountService(sdk, 310);
const data = await caService.getCreditAccountData(caAddress);
// Returns: healthFactor, totalValueUSD, totalDebtUSD, debt, accruedInterest, tokens[], etc.

// Router for pathfinding
const router = sdk.routerFor(cmObject);
await router.findOpenStrategyPath({ target, ... });
await router.findBestClosePath({ creditAccount, ... });
```

### Agent Demo Safety Layer (from safety.ts)

```typescript
// Constants
PERCENTAGE_FACTOR = 10_000n;
MIN_SAFE_HF = 10_500n; // 1.05 — 5% safety buffer
MIN_HF_LIMITED = 10_000n; // 1.0 — liquidation threshold

// HF calculation (mirrors on-chain logic)
function calcHealthFactor(ctx: SafetyContext): number {
  // For each asset: min(quotaMoney, balance * price * LT)
  // HF = assetMoney * PERCENTAGE_FACTOR / borrowedMoney
}

// Pre-execution checks
checkBorrow(ctx, amount, underlyingLT)    // Project HF after borrow
checkWithdraw(ctx, token, amount)          // Project HF after withdraw
checkSwap(ctx, tokenIn, tokenOut, amountIn, minAmountOut) // Project HF after swap
calcMaxDebtIncrease(hf, debt, underlyingLT, minHf) // Max safe borrow
calculateMaxWithdrawalAmount(ctx, token, targetHF)  // Max safe withdraw
```

### Key Contract Addresses (read from SDK)

```typescript
// Per market/CM
const cm = sdk.marketRegister.findCreditManager(cmAddr);
const facade = cm.creditFacade.address;
const configurator = cm.creditConfigurator?.address;
const pool = cm.pool.pool.address;
const priceOracle = cm.creditManager.priceOracle;
const quotaKeeper = cm.pool.quotaKeeper?.address;
```

---

## SUMMARY: Agent Monitoring Checklist

For each Credit Account, an agent should periodically check:

1. **HF via `calcDebtAndCollateral(DEBT_COLLATERAL)`** — primary health metric
2. **`expirationDate()`** — is the facade about to expire?
3. **`enabledTokensMask`** — how many tokens enabled? Near limit?
4. **Oracle freshness** — `priceFeedParams().stalenessPeriod` vs actual `updatedAt`
5. **Quota utilization** — `getTokenQuotaParams().totalQuoted` vs `limit`
6. **`cumulativeLoss`** vs `maxCumulativeLoss` — approaching emergency brake?
7. **Forbidden tokens** — `forbiddenTokensMask` overlap with `enabledTokensMask`?
8. **LT ramping** — any tokens with active `rampDuration`?
9. **Bot permissions** — any forbidden bots that were previously authorized?
10. **Pool liquidity** — can the account still increase debt if needed?
