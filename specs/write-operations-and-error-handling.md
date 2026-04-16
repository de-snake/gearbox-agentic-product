# Write Operations & Error Handling — api.gearbox.finance

**Date:** 2026-04-02
**From:** Product (Ilya S)
**To:** Backend Engineering
**Companion to:** backend-data-requirements.md (covers all READ data requirements)

---

## What this document is

This spec covers what happens when an agent EXECUTES — opens positions, swaps, deposits, closes. Specifically: what errors can occur, how they should be classified, and what data the backend needs to provide so the agent can understand what went wrong and what to do next.

The agent-demo already has a working 3-tier error translator (30+ known errors). This doc defines the product-level taxonomy and backend responsibilities to support it at scale.

---

## Error taxonomy

When an agent sends a transaction and it reverts, it needs to answer one question: **"What should I do next?"**

Not "what happened internally" — the agent doesn't need Fluid DEX's storage slot math. It needs: "swap failed at the adapter level, try smaller amount or different route."

### Three tiers

**Tier 1 — Actionable (agent can fix it)**
Known Gearbox financial errors. The agent gets a concrete corrective action and can retry autonomously.

Examples:

- "Not enough collateral" → deposit more or reduce amount
- "Pool utilization too high" → reduce borrow amount or wait
- "Token is forbidden" → swap to an allowed token first
- "CM has expired" → close and migrate to active CM

**Tier 2 — Retryable (different approach needed)**
The revert came from an external protocol (adapter), or an unknown Gearbox error. The agent knows WHAT it was doing and WHERE the error originated, but not the internal cause. It gets contextual retry guidance.

Examples:

- "Swap reverted in Curve adapter" → try smaller amount, different route, or wait
- "Operation failed in Fluid DEX adapter" → reduce size or use alternative
- "Unknown revert during multicall" → simplify the operation, try individual steps

**Tier 3 — Escalate (agent cannot fix)**
Infrastructure or permission issues. The agent should stop and report to the operator.

Examples:

- "Gas estimation failed" → RPC issue, wait and retry
- "Oracle feed stale / reverted" → cannot price collateral, wait for oracle update
- "Not the account owner" → wrong key or permissions
- "Facade is paused" → protocol-level halt, nothing the agent can do

### Error response format

Every error the agent receives should follow this structure:

```json
{
  "tier": "actionable" | "retryable" | "escalate",
  "explanation": "What happened — in financial/operational terms",
  "suggestedAction": "What the agent should do next",
  "source": "gearbox" | "adapter:<name>" | "infrastructure" | "unknown",
  "errorName": "GearboxExceptionName (if identified)"
}
```

---

## Tier 1: Known Gearbox errors

These are Gearbox protocol's own custom exceptions. Finite set, stable across versions. The agent-demo already maps ~30 of these. Backend responsibility: ensure ABI decoding is available so the MCP server can match the 4-byte selector to the error name.

### Position health

| Error | Agent decision story |
|-------|---------------------|
| NotEnoughCollateralException | "My action would make the position unsafe." → deposit more collateral, repay debt, or reduce operation amount |
| CustomHealthFactorTooLowException | "HF would drop below my custom minimum." → same corrective actions |

### Borrowing constraints

| Error | Agent decision story |
|-------|---------------------|
| BorrowAmountOutOfLimitsException | "Amount is outside [minDebt, maxDebt] range." → check pool limits, adjust so debt stays in bounds. Iterative unwind can hit this when approaching minDebt — agent must close entirely instead of repaying incrementally. |
| BorrowedBlockLimitException | "Only one debt change per block." → wait for next block and retry |
| BorrowingMoreThanU2ForbiddenException | "Pool utilization too high — no idle liquidity." → reduce amount or wait |
| CreditManagerCantBorrowException | "This CM's pool-level borrowing limit reached." → try different CM or wait |

### Token restrictions

| Error | Agent decision story |
|-------|---------------------|
| TokenNotAllowedException | "Token not on this CM's collateral list." → use only allowed tokens |
| ForbiddenTokensException | "Transaction would leave forbidden tokens enabled." → swap forbidden tokens first |
| ForbiddenTokenBalanceIncreasedException | "Can't increase balance of a forbidden token." → swap to allowed token |
| TokenIsNotQuotedException | "Token needs quota but none is set." → usually SDK handles this automatically |
| TooManyEnabledTokensException | "Too many different tokens on the account." → disable or swap some holdings to free token slots |

### Account lifecycle

| Error | Agent decision story |
|-------|---------------------|
| CreditAccountDoesNotExistException | "Account closed or liquidated." → verify address, open new position if needed |
| CreditAccountIsInUseException | "Account locked by concurrent operation." → wait and retry |
| CallerNotCreditAccountOwnerException | "Wrong key or permissions." → ESCALATE. Agent cannot fix this. |
| CloseAccountWithNonZeroDebtException | "Can't close — debt remains." → repay all debt first |
| CloseAccountWithEnabledTokensException | "Can't close while non-underlying tokens enabled." → swap everything to underlying first |
| DebtToZeroWithActiveQuotasException | "Can't fully repay while quotas active." → remove quotas before repaying |

### Routing / swaps

| Error | Agent decision story |
|-------|---------------------|
| PathNotFoundException | "No swap route found." → try intermediate token (A→WETH→B), or verify both tokens are on this CM |
| InsufficientAmountOutException | "Slippage exceeds tolerance." → smaller amount or wait for better liquidity |
| BalanceLessThanExpectedException | "Price impact too high." → reduce trade size |

### Quotas

| Error | Agent decision story |
|-------|---------------------|
| QuotaIsOutOfBoundsException | "Quota change outside allowed bounds." → check quota limits |
| UpdateQuotaOnZeroDebtAccountException | "Can't set quotas with zero debt." → borrow first |

### Expiration

| Error | Agent decision story |
|-------|---------------------|
| NotAllowedAfterExpirationException | "CM has expired." → close position and migrate to active CM |

### Pool operations

| Error | Agent decision story |
|-------|---------------------|
| InsufficientLiquidity | "Pool utilization above critical threshold." → reduce withdrawal amount or wait |

---

## Tier 2: Adapter / external protocol errors

These errors originate from external protocols integrated via adapters (Curve, Uniswap, Fluid DEX, Balancer, Aave, etc.). The agent doesn't need to understand the internal failure — it needs to know:

1. **Which adapter** the error came from
2. **What operation** was being attempted
3. **Generic retry guidance** for that type of operation

### Backend responsibility

The backend / MCP server needs to:

- Decode the revert reason using the adapter's ABI (adapters are registered on-chain, their ABIs are known)
- Identify the adapter name from the target contract address (`CreditManagerV3.adapterToContract(adapter)`)
- Return: `source: "adapter:FluidDEX"` (or whichever protocol)
- NOT attempt to explain the internal cause — just attribute it to the correct protocol

### Agent response pattern

When the agent gets a Tier 2 error, it follows a generic retry strategy:

| Operation type | Retry guidance |
|----------------|---------------|
| Swap | Try smaller amount, different intermediate token, or wait |
| Deposit to external protocol | Check if protocol is accepting deposits, try smaller amount |
| Withdrawal from external protocol | Try partial withdrawal, check protocol-specific delays |
| Claim rewards | Retry later — may be timing-dependent |

### Discussion point for backend team

From the dev call (Mar 31): two approaches were discussed.

**Option A — Static ABI registry**: For each integrated protocol, store the ABI and decode errors against it. Finite set of integrations, manageable. Already have the contract addresses via `allowedAdapters()`.

**Option B — Dynamic decoding via Etherscan ABI**: For verified contracts, fetch the ABI at runtime. Covers new integrations automatically but depends on external service.

Recommendation: start with Option A for the top 10 most-used adapters. Expand later if needed.

---

## Tier 3: Infrastructure errors

These are NOT protocol errors — they're infrastructure failures that the agent cannot resolve. The agent should stop operating and alert the operator.

| Pattern | Agent decision story |
|---------|---------------------|
| Gas estimation failed / out of gas | RPC or network issue. Wait and retry, or alert operator. |
| Nonce too low / already used | Transaction ordering problem. Usually resolves on retry. |
| Oracle feed reverted | A collateral token's price feed is broken. The ENTIRE collateral check reverts — position is stuck. Agent cannot close, cannot be liquidated. Wait for oracle recovery or disable the problematic token. |
| Oracle staleness | Price data too old. Similar to reverted oracle but may self-resolve when feed updates. |
| Facade paused | Protocol emergency pause. Agent cannot open, close, or modify positions. Wait for unpause. |
| Connection timeout / RPC error | Network issue. Retry with exponential backoff. |

---

## Pre-execution checks

From the dev call (Mar 31): before sending a transaction, the agent can check whether the operation will succeed. This is cheaper than reverting on-chain.

### What the agent can check locally (SDK-side)

| Check | How | Prevents |
|-------|-----|----------|
| HF after action | SDK's `calcDebtAndCollateral` simulation | NotEnoughCollateralException |
| Debt within limits | Compare current debt + amount vs [minDebt, maxDebt] | BorrowAmountOutOfLimitsException |
| Token is allowed | Check `forbiddenTokensMask` and collateral list | TokenNotAllowedException, ForbiddenTokensException |
| Enough liquidity | Compare borrow amount vs `borrowable` | BorrowingMoreThanU2ForbiddenException |
| Token count | Count enabled tokens vs `maxEnabledTokens` | TooManyEnabledTokensException |
| CM not paused | Check facade paused status | Wasted gas on paused facade |
| CM not expired | Check expiration date | NotAllowedAfterExpirationException |

### What needs backend / on-chain check

| Check | Why can't do locally |
|-------|---------------------|
| Pool-level CM debt limit | Shared state, changes with other users' actions |
| Block-level borrow limit | Per-block tracking |
| Oracle freshness | Requires reading Chainlink feed's `updatedAt` |
| Quota availability | `totalQuoted` vs `limit` — shared state |

---

## RWA / Compliance gate (future)

From the product architecture (drawio): restricted/tokenized assets require a compliance check before the agent can hold them.

```text
canThisAddressBuyTheToken(address)
  → YES → proceed (or SECURITIZE.factory for tokenized)
  → NO  → KYC required → Web2 redirect

getBuyOptions() → { amount, timeToTransact }
```

This is a pre-execution gate, not an error. The agent calls `canThisAddressBuyTheToken` before attempting to buy. If NO, it's not an error — it's a compliance requirement that the agent's operator must handle off-chain.

| Field | Agent decision story |
|-------|---------------------|
| canThisAddressBuyTheToken(address) | "Am I allowed to hold this asset?" → if NO, alert operator that KYC is needed |
| getBuyOptions() | "What are my purchase constraints?" → amount limits and execution timing for restricted assets |
| Asset issuer | Counterparty identification for RWA assets |
| Asset type | Determines which compliance path applies |
| phantom_token flag | Whether the token is a receipt/wrapper |

---

## Summary

| Category | Count |
|----------|-------|
| Tier 1: Known Gearbox errors | ~30 (stable, all mapped) |
| Tier 2: Adapter attribution | Per-adapter (10+ protocols) |
| Tier 3: Infrastructure patterns | ~6 patterns |
| Pre-execution checks (local) | 7 checks |
| Pre-execution checks (backend) | 4 checks |
| RWA compliance gate | 5 fields |

**Backend action items:**

- Confirm: ABI decoding for Gearbox errors is available via existing compressor or needs new endpoint
- Confirm: adapter-to-protocol name mapping is available (from `allowedAdapters()` + registry)
- Decide: Option A (static ABI registry) or Option B (dynamic Etherscan) for adapter error decoding
- Provide: pre-execution check endpoints for shared-state checks (pool-level limits, quota availability)
- Provide: RWA compliance check functions when Securitize integration is ready
