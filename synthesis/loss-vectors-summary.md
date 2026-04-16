# Gearbox CIS — Loss Vector Research

**Date:** 2026-03-31
**Purpose:** Systematic identification of all ways LP and CA agents can lose money. Feeds into Phase 3 entity definitions.
**Detail:** This is a summary. For on-chain mechanisms, contract calls, code examples, and monitoring logic, see ../raw-data/specific-research/2026-03-31-lp-loss-vectors-on-chain.md (LP) and ../raw-data/specific-research/2026-03-31-credit-account-loss-vectors-on-chain.md (CA).

---

## LP Loss Vectors (35+ vectors, 10 categories)

### Category 1: Direct Losses (Principal Impairment)
1.1 **Bad debt socialization** — borrower liquidated, collateral insufficient, loss distributed to all LPs via reduced exchange rate. Examples: Aave ~$2M bad debt, Venus $52M.
1.2 **Smart contract exploit** — code vulnerability drained. Examples: Euler $197M, Cream $130M.
1.3 **Flash loan enabled attacks** — atomic manipulation. Examples: Euler, Harvest $34M.
1.4 **ERC-4626 vault inflation/donation attacks** — share price manipulation. Example: sDOLA/Llamalend $240K.
1.5 **Proxy/upgrade exploits** — malicious implementation deployed. $350M+ total across DeFi.

### Category 2: Oracle and Price Feed Risks
2.1 **Oracle manipulation** — price feed manipulated via low liquidity. Examples: Mango Markets $115M, Cream $130M.
2.2 **Oracle misconfiguration** — CAPO/rate agent wrong params. Example: Aave March 2026 wstETH, $27M wrongful liquidations.
2.3 **Oracle latency/staleness** — lag during crashes. Example: MakerDAO Black Thursday $4.5M.
2.4 **Cross-chain oracle propagation** — bad price crosses chains.

### Category 3: Liquidity and Exit Risks
3.1 **Utilization lock** — 100% utilized, can't withdraw.
3.2 **Extended withdrawal delays** — queue during stress.
3.3 **Liquidity crunch during bad debt** — first-exit advantage, bank run dynamic.
3.4 **Protocol-level fund freezing** — admin pause or inter-protocol dispute. Example: Iron Bank froze $80M.

### Category 4: Parameter and Governance Risks
4.1 **Governance attacks** — treasury raids via token manipulation. Examples: Compound $24M, Beanstalk $182M.
4.2 **Adverse parameter changes** — LTV/LT changes increase risk post-deposit.
4.3 **Debt ceiling allocation changes** (Gearbox) — curator increases debt to riskier CMs.
4.4 **Allowed list changes** — new risky tokens whitelisted.

### Category 5: Concentration Risks
5.1 **Single borrower concentration** — whale position exceeds liquidation liquidity. Example: Egorov's $176M CRV on Aave.
5.2 **Collateral asset correlation** — "diversified" collateral actually correlated (all LSTs).
5.3 **Liquidator concentration** — too few liquidators. Example: MakerDAO Black Thursday zero-bid auctions.
5.4 **Multiple CMs sharing one pool** (Gearbox) — aggregate stress exceeds insurance.

### Category 6: Contagion and Cascade Risks
6.1 **Liquidation cascades** — self-reinforcing liquidation → sell → price drop loop.
6.2 **Cross-protocol contagion** — failure cascades via shared tokens. Example: Euler hack → 20+ protocols.
6.3 **Stablecoin depeg contagion** — stablecoin fails, all protocols using it affected.
6.4 **Issuer asset freezing** — Circle/Tether can freeze addresses. Example: Tornado Cash.

### Category 7: Indirect/Economic Losses
7.1 **Yield compression / opportunity cost** — earning less than alternatives.
7.2 **Interest rate curve manipulation** — exploitation of PID-controlled curves.
7.3 **Token incentive dilution** — reward token price drops, real yield negative.
7.4 **Gas cost erosion** — tx costs exceed returns for small positions.
7.5 **MEV extraction** — sandwich attacks on deposit/withdraw.

### Category 8: Protocol-Specific Edge Cases
8.1 **Zombie positions with bad collateral** — paused markets but existing underwater positions remain, accumulating bad debt.
8.2 **Insurance fund inadequacy** (Gearbox) — fund exhausted, excess socialized.
8.3 **Adapter/integration risk** (Gearbox) — exploited adapter, LP funds lost through CA.
8.4 **Quota/collateral limit gaming** — correlated positions exceed intended exposure.
8.5 **Fundamental vs market price divergence** (Gearbox) — fundamental oracle reports higher price than market. LPs bear gap cost.

### Category 9: Regulatory/Counterparty
9.1 **Sanctions/OFAC compliance** — sanctioned funds enter protocol.
9.2 **Regulatory action against protocol** — enforcement, shutdown.
9.3 **Key person/team risk** — team arrested, project abandoned.
9.4 **Bridge/cross-chain risk** — bridge exploit.

### Category 10: Second/Third-Order Effects
10.1 **Yield dilution from new depositors** — TVL influx without matching borrow demand.
10.2 **Recursive leverage unwind** — deposit-borrow-deposit loops cascade on unwind.
10.3 **Market regime shift** — bear market TVL collapse.
10.4 **Governance fragmentation** — inability to respond to risks.
10.5 **LP token de-peg** — LP share trades at discount on secondary markets.

---

## CA (Leverage) Loss Vectors (50+ vectors, 12 categories)

### Category 1: Liquidation Risks
1A **Market price liquidation** — HF < 1, standard liquidation.
1B **Partial liquidation (deleverage)** — Gearbox V3 minHF bot sells some collateral.
1C **Expiration-based liquidation** — CM expires, all positions liquidatable regardless of HF.
1D **Full liquidation overpayment** — premium + fee on total value, not just debt.
1E **Flash crash liquidation** — brief price wick, position gone despite recovery.

### Category 2: Oracle Risks
2A **Oracle staleness** — stale price causes delayed or wrongful liquidation.
2B **Oracle deviation / CAPO misconfiguration** — wrong parameters undervalue collateral. Example: Aave March 2026 $27M.
2C **Oracle manipulation** — flash loan attack manipulates price feed. Examples: Mango $115M.
2D **Composite oracle failure** — multi-feed chain breaks at one link.
2E **Oracle revert / feed deprecation** — feed stops, positions stuck.
2F **Fundamental vs market price divergence** — LST market price below fundamental oracle.

### Category 3: Borrowing Cost Risks
3A **Interest rate spike from utilization** — utilization above kink, APR spikes 50%+.
3B **Negative carry / spread inversion** — borrow cost exceeds strategy yield.
3C **Quota rate increases** (Gearbox) — GEAR gauge votes raise quota costs.
3D **Compounding debt erosion** — slow HF decline from accruing interest.

### Category 4: Collateral/Asset Risks
4A **Stablecoin depeg** — collateral stablecoin loses peg.
4B **LST/LRT depeg** — staking derivative discount. Examples: stETH -6.5%, ezETH $60M cascade.
4C **Underlying protocol exploit** — collateral token's protocol hacked, token worthless.
4D **Token freeze/blacklist** — USDC/USDT issuer freezes Credit Account tokens.
4E **Collateral illiquidity** — thin DEX liquidity, large price impact on liquidation.
4F **Slashing risk** — validators backing LST get slashed.

### Category 5: Protocol/Governance Parameter Risks
5A **LT reduction/ramping** — governance reduces LT, healthy positions become liquidatable. Example: Aave V2 deprecation.
5B **Token forbidden** — token marked forbidden, operational restrictions.
5C **Adapter removal/forbidding** — can't exit through removed adapter, tokens stranded.
5D **Quota limit reached** — can't increase position or rebalance.
5E **Credit Manager pause** — all operations blocked.
5F **Debt limit changes** — minDebt/maxDebt changes restrict position management.
5G **Fee parameter changes** — higher liquidation fees.
5H **MaxCumulativeLoss trigger** — system auto-pauses.
5I **Loss policy changes** — affects which liquidations are allowed.

### Category 6: Execution Risks
6A **Sandwich attack (MEV)** — front-run/back-run on swaps. Example: $50.4M USDT swap, $44M extracted.
6B **Slippage on open/close** — large position, poor execution.
6C **Failed transaction during emergency** — gas spike, tx stuck, liquidated.
6D **Front-running of liquidation** — liquidated at first possible block.
6E **Slippage check bypass in multicall** — misconfigured balance checks.

### Category 7: Cascade/Contagion Risks
7A **Liquidation cascade** — self-reinforcing price-liquidation loop.
7B **Cross-protocol contagion** — failure cascades via shared tokens.
7C **Liquidity death spiral** — mass selling drains DEX pools.
7D **ETH exit queue contagion** — exit queue → LST discount → liquidation. Example: 42-day queue.

### Category 8: Smart Contract/Adapter Risks
8A **Lending protocol bug** — core protocol vulnerability.
8B **Integrated protocol bug** — adapter target exploited.
8C **Upgradeable contract risk** — proxy upgrade introduces bugs.
8D **Reentrancy / flash loan attack** — protocol state manipulation.
8E **ERC-4626 vault share price manipulation** — donation attack on vault collateral.

### Category 9: Exit/Position Management Risks
9A **Can't close due to adapter removal** — tokens stranded, no swap route.
9B **Pool liquidity drained** — can't borrow more to refinance.
9C **Staking/unstaking queue delays** — 42+ day exit queue.
9D **Token transfer restrictions** — blacklist/whitelist/pause on token.
9E **maxEnabledTokens limit** — can't enable new tokens for rebalancing.
9F **Interface unavailability** — UI down, must use smart contracts directly.
9G **Forbidden token operational restrictions** — stricter checks, limited operations.

### Category 10: Strategy-Specific Risks
10A **Basis trade dilution** — yield spread compresses as more participants enter.
10B **Delta-neutral divergence** — correlation breaks between legs.
10C **Circular lending amplification** — tiny margin for error in loops.
10D **Impermanent loss in LP collateral** — LP token value loss from price divergence.
10E **Yield source failure** — farm ends, reward token dumps.

### Category 11: Infrastructure Risks
11A **Blockchain congestion** — can't manage position.
11B **L2 sequencer down** — all transactions halted.
11C **RPC/node failure** — can't submit transactions.

### Category 12: Governance Attack Risks
12A **Flash loan governance attack** — acquire governance tokens, vote, extract value.
12B **Curator/controller misbehavior** (Gearbox) — compromised controller sets bad params.
12C **Governance timelock exploitation** — harmful change executes while borrower not monitoring.
