# Backend Data Requirements — RWA / KYC Extension

**Date:** 2026-04-07
**From:** Product (Ilya S)
**To:** Backend Engineering
**Depends on:** backend-data-requirements.md (base document)
**Action needed:** Same as base doc — for each field, confirm: (A) already available, (B) can add, (C) hard/expensive

---

## What this document is

An addendum to the base data-read-spec covering data requirements specific to RWA (tokenized securities) pools and Securitize KYC-gated credit managers. Every field traces to a loss vector that only exists when RWA tokens or KYC gating are involved.

Reference architecture: ../references/gearbox-tokenized-securities.md (Securitize integration spec).

---

## Stage 1: Discovery — KYC gating filter

Both LP and CA agents hit the same gating question before any DD happens. This is a hard binary filter — if the agent can't pass KYC, everything downstream is irrelevant.

### LP Discovery (extends Stage 1a)

| Field | Agent decision story | Data type | Status |
|-------|---------------------|-----------|--------|
| KYC required | "Do I need to be KYC'd to deposit?" — if the pool's underlying token is a KYC-wrapped asset (DefaultKYCUnderlying or OnDemandKYCUnderlying), the agent must be whitelisted in Securitize's registry to hold dTokens. If not KYC'd, skip. | snapshot | ? |
| KYC provider | "Who runs the KYC?" — identifies the compliance gatekeeper (e.g., Securitize). The agent checks if it has a relationship with this provider. Different providers = different onboarding flows. | snapshot | ? |

### CA Discovery (extends Stage 1b)

| Field | Agent decision story | Data type | Status |
|-------|---------------------|-----------|--------|
| KYC required | "Do I need KYC to open a Credit Account?" — if the CM uses a SecuritizeKYCFactory, the agent must be registered in Securitize's investor registry. Standard CMs use the regular DegenNFT gate. If KYC is required and the agent isn't registered, skip entirely. | snapshot | ? |
| KYC provider | Same as LP — identifies the compliance gatekeeper. | snapshot | ? |
| Factory address | "Where do I go to open an account?" — KYC-gated CMs route through a specific factory contract, not the standard CreditFacade. The agent needs to know the entry point. | snapshot | ? |

---

## Stage 2a: Evaluate — LP Due Diligence (RWA extensions)

### Q2-LP extension: "What RWA-specific risks am I exposed to?"

The LP's existing exposure chain analysis (pool → CMs → tokens) covers generic collateral risk. But RWA collateral introduces three new loss vectors that don't exist with standard DeFi tokens:

1. **Frozen account bad debt** — Securitize can freeze individual Credit Accounts. A frozen account can't be liquidated even when HF < 1. Bad debt accumulates silently and eventually socializes to the pool.
2. **Liquidator scarcity** — only Securitize-whitelisted liquidators can receive RWA tokens. Smaller liquidator pool = slower liquidation = more bad debt.
3. **Off-chain asset risk** — the RWA token's value depends on an off-chain asset managed by a third party. The on-chain system can't mitigate off-chain credit events.

#### Per CM (nested under pool, extends Q2-LP per-CM table)

| Field | Agent decision story | Data type | Status |
|-------|---------------------|-----------|--------|
| Has RWA collateral | "Does this CM allow tokenized securities?" — binary flag. If yes, the LP needs to assess the three RWA-specific loss vectors below. If no, standard DD is sufficient. | snapshot | ? |
| Frozen accounts count | "How many accounts in this CM are currently frozen?" — frozen accounts can't be liquidated. Each one is a potential bad debt source. Zero = no freeze risk right now. Non-zero = the LP checks: what's the total debt in frozen accounts vs the pool's insurance fund? | snapshot | ? |
| Frozen accounts total debt | "How much debt is locked in frozen positions?" — the actual exposure. If this exceeds the insurance fund, the LP bears the excess as potential socialized loss. | snapshot | ? |
| Whitelisted liquidator count | "How many liquidators can actually liquidate RWA positions?" — proxy for liquidation speed. Standard DeFi tokens: anyone can liquidate. RWA tokens: only whitelisted addresses. If the count is low (e.g., < 5), liquidation may be slow, increasing bad debt risk. | snapshot | ? |
| Transfer restriction type | "What compliance standard governs the RWA tokens in this CM?" — e.g., DS Token Protocol (Securitize), ERC-3643, or custom. Tells the LP which compliance framework applies and how restrictive transfers are. | snapshot | ? |

#### Off-chain asset properties (per RWA token, extends Q2-LP pool-level)

| Field | Agent decision story | Data type | Status |
|-------|---------------------|-----------|--------|
| Underlying off-chain asset type | "What real-world asset backs this token?" — e.g., US Treasury bills, corporate credit, real estate. Determines the credit risk model: Treasuries ≈ sovereign risk, corporate credit = default risk, real estate = valuation risk. | snapshot | ? |
| Issuer / fund manager | "Who manages the off-chain asset?" — counterparty risk. The agent may check the issuer against known entities or credit ratings. | snapshot | ? |
| Redemption mechanism | "How does the token convert back to cash?" — on-demand redemption, periodic windows (e.g., monthly), or secondary market only. Affects the LP's indirect exit risk: if borrowers can't redeem RWA quickly, liquidation proceeds may be delayed. | snapshot | ? |
| Redemption delay | "How long does it take to get cash out?" — in hours or days. Longer delay = more price risk during liquidation. | snapshot | ? |
| NAV update frequency | "How often is the off-chain asset revalued?" — daily, weekly, monthly. Infrequent NAV updates mean the oracle price may be stale relative to the real asset value. | snapshot | ? |

---

## Stage 2b: Evaluate — CA Due Diligence (RWA extensions)

### Q2-CA extension: "What RWA-specific risks does my collateral have?"

The existing Q2-CA covers generic collateral safety (LT, oracle, exit feasibility). RWA collateral adds compliance-layer risks that can immobilize or devalue the position independent of market conditions.

#### Compliance risk (per RWA token in the CM)

| Field | Agent decision story | Data type | Status |
|-------|---------------------|-----------|--------|
| Transfer restriction type | "Who controls whether I can move this token?" — DS Token Protocol means Securitize's registry is the gatekeeper. Every transfer (deposit, withdrawal, liquidation) must pass the whitelist check. The agent understands: this isn't just price risk — there's a compliance layer that can block transactions. | snapshot | ? |
| Freeze capability | "Can someone freeze my specific account?" — if the CM uses SecuritizeKYCFactory, the Securitize admin can call setFrozenStatus() on the agent's Credit Account. When frozen: no deposits, no withdrawals, no borrowing, no repaying, no liquidation. Total immobilization. The agent factors this into its risk model: there exists an external actor who can lock the position regardless of HF. | snapshot | ? |
| Freeze authority | "Who has the power to freeze me?" — the specific admin address or entity. The agent may assess: is this a multisig? A single EOA? A regulated entity with legal obligations? | snapshot | ? |
| Investor reassignment risk | "Can someone transfer ownership of my position?" — Securitize admin can call setInvestor() to reassign the Credit Account to a different investor. The agent understands this is for estate settlement / lost keys, but it means an external party can change position ownership. | snapshot | ? |

#### Exit constraints (extends Q2-CA exit feasibility)

| Field | Agent decision story | Data type | Status |
|-------|---------------------|-----------|--------|
| Whitelisted liquidator count | "If I get liquidated, who can actually execute it?" — same field as LP DD but from the CA perspective. Few liquidators = the agent may sit in a liquidatable state longer, accumulating more bad debt (worse remaining funds after liquidation). | snapshot | ? |
| Redemption windows | "When can I actually redeem the underlying asset for cash?" — some RWA tokens only allow redemption during specific windows (e.g., month-end). Outside the window, the only exit is secondary market (if any). The agent plans position exits around these windows. | snapshot | ? |
| Secondary market liquidity | "Can I sell this token without redemption?" — some RWA tokens trade on DEXes or OTC. If secondary market exists, exit is possible anytime (with price impact). If no secondary market, the agent is locked to redemption windows. | snapshot | ? |

### Q3-CA extension: "What are the operational constraints of a KYC-gated CM?"

| Field | Agent decision story | Data type | Status |
|-------|---------------------|-----------|--------|
| Operation routing | "How do I interact with this CM?" — KYC-gated CMs route all operations through the SecuritizeKYCFactory → SecuritizeWallet → CreditFacade chain. The agent can't call CreditFacade directly. This affects how the agent constructs transactions. | snapshot | ? |
| Bot permissions blocked | "Can I use automated bots?" — SecuritizeWallet explicitly blocks bot permissions. No third-party automation without going through the factory. The agent knows: position management must go through the KYC factory, not via bot adapters. | snapshot | ? |

---

## Stage 3a: Monitor — LP (RWA extensions)

### Freeze and compliance monitoring

| Field | Agent decision story | Data type | Status |
|-------|---------------------|-----------|--------|
| Frozen accounts delta | "Are more accounts getting frozen?" — if the count is increasing, the LP's bad debt exposure is growing. Trend matters more than the absolute number. | snapshot (delta from prior check) | ? |
| Frozen debt delta | "Is frozen debt growing?" — same logic. If frozen debt is approaching the insurance fund, the LP should consider exiting. | snapshot (delta from prior check) | ? |
| Whitelist changes (liquidators added/removed) | "Is the liquidator pool growing or shrinking?" — fewer liquidators = slower liquidation = more risk. | event log | ? |

---

## Stage 3b: Monitor — CA (RWA extensions)

### Own account compliance state

| Field | Agent decision story | Data type | Status |
|-------|---------------------|-----------|--------|
| Own frozen status | "Am I frozen?" — THE critical check. If frozen, the agent can do nothing — no exit, no rebalance, no repay. It must wait for the freeze to be lifted. The agent checks this every monitoring cycle. | snapshot | ? |
| Investor registry status | "Am I still registered as the beneficial owner?" — if the agent's investor record was changed (via setInvestor), its operations will fail. This is an integrity check. | snapshot | ? |
| KYC validity | "Is my KYC still valid?" — Securitize KYC may expire or be revoked. If the agent's whitelist status is revoked, it can't receive RWA tokens back during withdrawal or closing. The agent checks proactively. | snapshot | ? |

### Upcoming redemption events

| Field | Agent decision story | Data type | Status |
|-------|---------------------|-----------|--------|
| Next redemption window | "When is the next opportunity to redeem?" — for RWA tokens with periodic redemption. The agent plans exits around this. If HF is declining and the next window is far away, the agent may need to find secondary market exit instead. | snapshot | ? |
| Redemption notice deadline | "When do I need to submit a redemption request?" — some RWA tokens require advance notice (e.g., 5 days before the window). The agent must act before this deadline or wait for the next window. | snapshot | ? |

---

## Appendix: RWA Loss Vectors Summary

These are the loss vectors specific to RWA/KYC that don't exist with standard DeFi tokens. Each field in this document traces to one or more of these.

| # | Loss vector | Affects | Severity | Fields that address it |
|---|------------|---------|----------|----------------------|
| R1 | Frozen account bad debt — frozen CA can't be liquidated, debt accumulates | LP | High | Frozen accounts count/debt, own frozen status |
| R2 | Liquidator scarcity — restricted liquidator pool slows liquidation | LP, CA | Medium | Whitelisted liquidator count |
| R3 | Off-chain asset default — underlying RWA loses value due to off-chain event | LP, CA | High | Off-chain asset type, issuer, NAV frequency |
| R4 | Redemption lockout — can't convert RWA to cash outside windows | CA | Medium | Redemption windows, notice deadline, mechanism |
| R5 | Compliance-layer immobilization — freeze/revocation blocks all operations | CA | High | Freeze capability, own frozen status, KYC validity |
| R6 | Investor reassignment — external party changes position ownership | CA | Low | Investor reassignment risk |
| R7 | Operational restriction — can't use bots or direct facade calls | CA | Low | Operation routing, bot permissions blocked |
| R8 | KYC expiry — whitelist revocation blocks token transfers | CA | Medium | KYC validity, investor registry status |

---

## Summary

| Category | New fields |
|----------|-----------|
| Discovery (KYC gating) | 5 (2 LP + 3 CA) |
| LP DD (RWA exposure) | 10 (5 per-CM + 5 off-chain asset) |
| CA DD (compliance + exit) | 9 (4 compliance + 3 exit + 2 operational) |
| LP monitoring | 3 |
| CA monitoring | 5 (3 compliance + 2 redemption) |
| **Total new fields** | **32** |

All 32 fields trace to the 8 RWA-specific loss vectors in the appendix. None duplicate fields from the base spec — they extend the same stages with RWA-specific data the agent can't get from the existing fields.
