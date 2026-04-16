# Gearbox Protocol for Tokenized Securities

**Architecture Specification & Partner Reference Document**

## 1. Executive Summary

Gearbox is a DeFi lending protocol in which each borrower receives a
dedicated **Credit Account** --- an isolated smart contract wallet that
holds collateral and borrows against it. Unlike pooled leverage models,
each Credit Account is a separate on-chain contract with a single owner,
subject to protocol-enforced collateral rules, whitelisted interactions,
and deterministic liquidation.

This per-account isolation makes it possible to layer compliance
controls --- KYC gating, asset freezes, investor reassignment ---
**without modifying the core protocol**. Morpho, Euler, and Aave
implement compliance through token wrappers or permissioned pool
deployments --- mechanisms that add restrictions around the protocol but
do not extend to the full position. Gearbox's per-account architecture
addresses all four transfer agent obligations (UBO tracking, freeze,
reassignment, KYC gating) at the account level, covering both the
collateral and debt sides of every position.

The Securitize integration builds a compliance layer on top of Gearbox's
existing architecture. A custom KYC Factory gates account creation,
links every Credit Account to a verified investor identity in
Securitize's registry, and enforces per-account freezes at the
token-transfer level. Liquidation, collateral transfer, and borrowing
all flow through Securitize's own token-level whitelist checks, meaning
compliance enforcement is native to the asset rather than bolted onto
the protocol.

### How It Works in 90 Seconds

1.  An investor opens a Credit Account through the
    **SecuritizeKYCFactory**, which verifies eligibility, deploys an
    intermediary wallet, and registers both the wallet and Credit
    Account in Securitize's investor registry.

2.  The investor deposits RWA tokens (tokenized securities) as
    collateral. The RWA token's own transfer function enforces
    Securitize's whitelist --- only authorized addresses can hold the
    asset.

3.  The protocol's lending pool provides stablecoins to the Credit
    Account as a loan. Interest accrues automatically.

4.  If the collateral value drops below the required threshold (Health
    Factor \< 1), a liquidator repays the debt and receives collateral.
    The RWA token's transfer restrictions ensure only whitelisted
    liquidators can receive the tokens.

5.  If a court order or sanctions requirement arises, the Securitize
    admin freezes the specific Credit Account. All movement ---
    deposits, withdrawals, liquidation --- halts for that account only.

### Why this architecture matters

- **Position isolation.** Each borrower's collateral, debt, and risk
  exposure exist in a single-purpose smart contract wallet. One
  account's liquidation does not affect any other account. In Morpho,
  Euler, and Aave, positions are either pooled, grouped within shared
  markets, or separated by software-level sub-accounts. Each Gearbox
  Credit Account is a separate on-chain contract --- a single auditable
  entity with one owner, one collateral set, and one debt obligation,
  with no commingling at any level.

- **No pooled rehypothecation.** Borrowed funds flow into an isolated
  Credit Account, not into a shared vault that commingles positions.
  Collateral deposited into a Credit Account cannot be lent out or
  reused by other participants. This addresses the rehypothecation
  concern present in shared-pool lending architectures such as those
  used by Aave and Morpho, where deposited assets serve multiple
  counterparties simultaneously.

- **Compliance without protocol changes.** Securitize's KYC, freeze, and
  reassignment requirements are met through a custom integration layer.
  The core Gearbox protocol remains unmodified and retains its existing
  audit coverage (ChainSecurity).

- **Deterministic risk enforcement.** Health Factor checks, collateral
  thresholds, and liquidation triggers operate on-chain with
  transparent, verifiable logic. There is no auction mechanism,
  governance vote, or discretionary delay in the liquidation process.
  All inputs (oracle prices, discount rates, fee schedules) and outputs
  (amounts seized, distributed, retained) are independently verifiable
  on-chain --- providing a complete audit trail that does not depend on
  off-chain records or operator discretion.

## 2. Definitions

**Credit Account.** An isolated smart contract wallet deployed by
Gearbox for each borrower. Holds collateral and borrowed funds. Has a
single immutable owner recorded in the protocol's registries.

**Health Factor.** The ratio of a Credit Account's weighted collateral
value to its outstanding debt. When it drops below 1, the account
becomes eligible for liquidation.

**RWA (Real-World Asset).** A tokenized representation of an off-chain
financial asset (e.g., treasury bills, corporate credit). The token
exists on-chain; the underlying asset and its performance are off-chain.

**Adapter.** A whitelisted wrapper contract that allows a Credit Account
to interact with a specific external protocol. Registered by the market
curator.

**DS Token Protocol.** Securitize's token standard for tokenized
securities. Enforces transfer restrictions --- only addresses authorized
in the Securitize registry can send or receive the token.

**SecuritizeKYCFactory.** The custom gateway contract through which all
investor operations are routed. Deploys intermediary wallets, opens
Credit Accounts, registers identities, and enforces freezes.

**SecuritizeWallet.** An intermediary smart contract wallet that owns
the Credit Account on behalf of the investor. Routes all operations from
the factory to the CreditFacade.

**DefaultKYCUnderlying.** A wrapped stablecoin token (ERC-4626 vault)
that checks the KYC Factory on every transfer. If either party is a
frozen Credit Account, the transfer reverts.

**Market Curator.** The entity responsible for configuring a Gearbox
lending market's parameters --- collateral types, thresholds, adapters,
oracle sources, and interest rate models.

**VaultRegistrar.** Securitize's interface for registering and
unregistering vault addresses (Credit Accounts and wallets) against
investor identities.

## 3. Actors & Responsibilities

In many DeFi lending protocols, the boundaries between infrastructure
operation, compliance enforcement, and risk management are not clearly
delineated --- creating ambiguity around liability and regulatory
accountability. Gearbox's architecture separates these functions by
design. Gearbox provides lending infrastructure and does not participate
in compliance decisions. Securitize enforces transfer agent obligations
and does not operate the lending protocol. The Market Curator configures
risk parameters and cannot override compliance controls. Each party's
scope of responsibility --- and the limits of that scope --- is defined
at the smart contract level.

  -----------------------------------------------------------------------------------
  **Actor**         **Role**      **Does**                  **Does not**
  ----------------- ------------- ------------------------- -------------------------
  **Gearbox         Infra         Deploys and manages       Custody assets. Perform
  Protocol**        provider      Credit Accounts. Enforces KYC. Issue or redeem
                                  collateral thresholds,    tokenized securities. Set
                                  Health Factor reqs, and   compliance rules.
                                  deterministic             
                                  liquidation. Provides     
                                  adapter framework for     
                                  whitelisted protocol      
                                  interactions.             

  **Securitize**    Transfer      Issues tokenized          Operate the lending
                    agent & RWA   securities with built-in  protocol. Set collateral
                    issuer        transfer restrictions (DS or leverage parameters.
                                  Token protocol).          Execute liquidations.
                                  Maintains investor        
                                  registry. Enforces        
                                  KYC/AML. Triggers         
                                  per-account freezes.      
                                  Reassigns investor        
                                  ownership.                

  **Market          Market config Configures lending market Override Securitize
  Curator**         authority     parameters (collateral    compliance controls.
                                  types, LTV ratios,        Manage individual Credit
                                  interest rate models).    Accounts.
                                  Registers adapters. Can   
                                  trigger market-wide       
                                  pause.                    

  **End Users       Capital       Deposit stablecoins into  Bypass Securitize
  (Investors)**     suppliers &   lending pools to earn     whitelist. Execute
                    borrowers     interest. Open Credit     operations leading to
                                  Accounts through the KYC  undercollateralization.
                                  Factory to borrow against 
                                  RWA collateral. Must      
                                  maintain Health Factor    
                                  \>= 1 on borrowed         
                                  positions.                

  **Liquidators**   Third-party   Monitor Credit Account    Choose liquidation terms
                    resolution    health. Repay borrower    --- the protocol
                    agents        debt and receive          calculates amounts
                                  collateral at a discount  deterministically.
                                  when Health Factor \< 1.  
                                  Must be                   
                                  Securitize-whitelisted.   
  -----------------------------------------------------------------------------------

### Responsibility Matrix

  -----------------------------------------------------------------------------------------
  **Function**   **Gearbox**   **Securitize**   **Curator**   **End       **Liquidators**
                                                              Users**     
  -------------- ------------- ---------------- ------------- ----------- -----------------
  Credit Account Executes      ---              ---           Initiates   ---
  deployment                                                  (via        
                                                              Factory)    

  KYC / identity ---           Owns             ---           Subject to  ---
  verification                                                            

  Position       Enforces      ---              Sets          Must        Monitors
  solvency                                                    satisfy     
  enforcement                                                             

  Liquidation    Engine        Token-level      ---           Subject to  Executes
  executionе                   whitelist                                  

  Per-account    ---           Triggers         ---           Subject to  Blocked
  freeze                                                                  

  Market-wide    Engine        ---              Triggers      Subject to  Subject to
  pause                                                                   (except
                                                                          emergency)

  Investor       ---           Executes         ---           Subject to  ---
  reassign.                                                               

  Capital        Pool mgmt     ---              ---           Supply &    ---
  provision                                                   borrow      
  -----------------------------------------------------------------------------------------

## 4. Securitize Requirements

  -----------------------------------------------------------------------
  **Requirement**     **What the transfer agent must do**
  ------------------- ---------------------------------------------------
  **Know Your Holder  Always know the beneficial owner of every security.
  (UBO)**             Every holding address must be linked to a verified
                      investor.

  **Liquidations**    When a borrower defaults, ensure the lender
                      receives collateral or equivalent value --- while
                      still enforcing transfer restrictions.

  **Burn & Reissue**  Handle lost keys, estate settlements, and
                      re-registration by reassigning or destroying
                      positions.

  **Freezes**         Comply with court orders and sanctions by freezing
                      assets so nothing moves in or out.
  -----------------------------------------------------------------------

## 5. How Gearbox Works (Relevant Mechanics)

### Credit Account = An isolated wallet per borrower

Each Credit Account is a separate smart contract deployed on-chain. It
has a single owner (the borrower) and can only interact with
pre-approved protocols.

No Credit Account can access another account's collateral. No pooling or
rehypothecation occurs between accounts. The lending pool's exposure to
any single borrower is limited to the amount lent to that borrower's
Credit Account.

### Opening an account

In the Securitize integration, account creation flows through the
**SecuritizeKYCFactory** --- a custom gateway that wraps Gearbox's
standard process with compliance controls:

1.  Investor calls the KYC Factory to open an account.

2.  The factory deploys an intermediary **SecuritizeWallet** --- a smart
    contract that will own the Credit Account on behalf of the investor.
    This wallet is created deterministically (via CREATE2) so its
    address is predictable.

3.  The wallet automatically opens a Credit Account through Gearbox's
    standard CreditFacade.

4.  The factory registers both the Credit Account address and the wallet
    address in Securitize's investor registry (via the VaultRegistrar
    interface), linking them to the investor's identity.

5.  Initial operations (deposit collateral, borrow) execute atomically
    in the same transaction.

**Why a wallet intermediary?** The investor never interacts with Gearbox
directly. All operations go through: Investor → KYC Factory →
SecuritizeWallet → CreditFacade. This gives the factory full control
over every action --- it can enforce freeze checks, block unauthorized
operations, and ensure every transaction is compliant before it reaches
Gearbox.

**Gated access:** A custom NFT (SecuritizeDegenNFT) gates who can open
accounts. Only the KYC Factory can mint this NFT, so no one can bypass
the factory to create accounts directly.

### Collateral management

- **Deposit:** Investor sends RWA tokens from their personal wallet to
  the Credit Account. The RWA token's own transfer function checks
  Securitize's whitelist --- Gearbox does not need to duplicate this
  check.

- **Withdrawal:** Investor withdraws RWA to another address. The RWA
  token enforces that the recipient is whitelisted by Securitize.

No Gearbox-side whitelisting is needed for RWA transfers ---
Securitize's token-level restrictions (via the DS Token protocol) are
the single source of truth.

### Borrowing, repayment, and exit

- **Borrow:** The protocol's lending pool transfers stablecoins to the
  Credit Account. Interest accrues automatically based on the market's
  interest rate model. The borrower's Health Factor is recalculated
  after each action.

- **Repay:** The Credit Account sends stablecoins back to the pool.
  Partial or full repayment supported.

- **Exit:** Investor repays all outstanding debt, withdraws remaining
  collateral to another Securitize-whitelisted address..

There is no automatic rebalancing --- position management is the
borrower's responsibility.

### RWA purchasing via adapters

Gearbox uses **adapters** --- whitelisted wrapper contracts --- to let
Credit Accounts interact with external protocols. A Credit Account
cannot send tokens to an arbitrary address, call an unapproved contract,
or execute operations outside its permitted set. In pooled or
market-based lending protocols such as Aave, Morpho, and Euler, borrowed
assets are not subject to protocol-level interaction restrictions once
disbursed. In Gearbox, a Credit Account holding tokenized securities can
only interact with pre-approved contracts, reducing the risk of security
tokens entering uncontrolled or non-compliant environments. To enable RWA purchases
(e.g., mint tokenized securities with stablecoins), a custom adapter
wrapping Securitize's minting contract would be registered. The Credit
Account sends stablecoins through the adapter and receives RWA tokens
--- all subject to Securitize's own compliance checks.

### Liquidation

When an investor's collateral value drops below the required threshold
(Health Factor \< 1):

1.  A liquidator triggers liquidation via the protocol.

2.  The protocol calculates deterministically how much debt must be
    repaid and how much collateral the liquidator receives (based on
    oracle prices, a liquidation discount, and protocol fees). There is
    no auction, no discretionary delay, and no governance intervention
    required.

3.  The liquidator provides stablecoins to repay the debt.

4.  Collateral (RWA tokens) is transferred from the Credit Account to
    the liquidator --- **through the RWA token's own transfer()
    function**, so the liquidator must be Securitize-whitelisted to
    receive the tokens.

5.  The investor retains the Credit Account and any residual assets.

6.  If the Credit Account is frozen, liquidation is blocked entirely
    (see Freezes below).

### Market-wide pause (existing Gearbox feature)

A market curator can pause the entire lending market, blocking all
operations. During a pause, only designated emergency liquidators can
act. This is a blunt instrument --- it affects every account in the
market, not individual positions.

## 6. How Gearbox Meets Securitize's Requirements

### Know Your Holder (UBO)

**Problem:** Securitize must know who beneficially owns every security
at all times.

**Solution:** The KYC Factory registers each new account in Securitize's
investor registry at the moment of creation. Both the Credit Account
address and its intermediary wallet are registered via the
VaultRegistrar interface, linking them to the investor's verified
identity.

The chain of beneficial ownership is always transparent: every Credit
Account maps to exactly one SecuritizeWallet, which maps to exactly one
investor address, which maps to a KYC'd identity in Securitize's
registry.

If the investor changes (see Burn & Reissue below), all registry entries
are updated atomically --- the old investor is unregistered and the new
one is registered for all tokens held in the position.

### Liquidations

**Problem:** Defaulting borrowers must lose collateral to protect
lenders, but RWA transfers must still comply with whitelist rules.

**Solution:** Gearbox's standard liquidation engine handles the
economics (debt repayment, collateral seizure, fee distribution). The
compliance layer is the RWA token itself --- its transfer() function
enforces Securitize's whitelist, so only KYC'd liquidators can receive
the tokens. No protocol modification needed; it works because Credit
Accounts are normal wallets and RWA transfers flow through the token
contract.

**Frozen accounts:** A frozen Credit Account cannot be liquidated. This
is intentional --- a court-ordered freeze should prevent all movement,
including liquidation.

### Burn & Reissue (Lost Keys, Estate Settlement)

**Problem:** If an investor loses access to their keys, dies, or needs
re-registration, the transfer agent must be able to reassign the
position.

**Solution:** The KYC Factory gives the Securitize admin (the factory's
owner) the ability to **reassign an investor** for any Credit Account.
When called:

1.  The old investor is unregistered from Securitize's registry for all
    tokens held in the position.

2.  The new investor is registered for the same tokens.

3.  The Credit Account and all its assets remain untouched --- only the
    ownership record changes.

This happens in a single transaction. No tokens are burned, minted, or
moved.

### Freezes (Court Orders, Sanctions)

**Problem:** A court order or sanctions list requires freezing all
assets in a position --- no transfers in, out, or liquidation.

**Solution:** Two-layer enforcement:

1.  **Securitize admin calls setFrozenStatus(account, true)** on the KYC
    Factory --- marks that specific Credit Account as frozen.

2.  **The wrapped underlying token (DefaultKYCUnderlying)** checks the
    factory on every transfer. If either the sender or receiver is a
    frozen Credit Account, the transfer reverts.

Since key Gearbox operations (borrow, repay, liquidate) requires moving
the underlying token, a frozen underlying wrapper effectively
immobilizes the entire position. Additionally, the KYC Factory itself
blocks all investor-initiated operations on frozen accounts. This is
per-account --- other accounts in the same market are unaffected.

In Morpho, Euler, and Aave, freeze mechanisms operate at the
token-wrapper or asset level --- either restricting only the collateral
side of a position, or applying to all holders of a given asset
simultaneously. Gearbox's per-account freeze covers both collateral and
debt operations for a specific investor without affecting other
participants in the same market.

  -------------------------------------------------------------------------
                    **Market-wide pause          **Per-account freeze
                    (existing)**                 (custom)**
  ----------------- ---------------------------- --------------------------
  **Scope**         All accounts in the market   Single account

  **Who triggers**  Market curator               Securitize admin

  **Liquidation**   Blocked (except emergency    Blocked entirely
                    liquidators)                 

  **Use case**      Protocol emergency           Legal/regulatory hold
  -------------------------------------------------------------------------

## 7. Risk Model & Safeguards

  ------------------------------------------------------------------------
  **Risk Source**   **Control Mechanism**      **Residual Risk**
  ----------------- -------------------------- ---------------------------
  **Smart contract  Audited by ChainSecurity.  Undiscovered
  risk (Gearbox     EIP-1167 clone pattern.    vulnerabilities in audited
  core)**           Market-wide pause          code. Upgrade or governance
                    capability.                risk.

  **Smart contract  Code review; custom        Newer code with less
  risk (integration contracts in periphery-v3  production history than
  layer)**          PR #40. Integration-level  Gearbox core. Requires
                    testing.                   independent audit
                                               confirmation.

  **Oracle          Gearbox supports           Oracle manipulation, stale
  dependency**      configurable oracle        prices, or downtime could
                    sources. Market curator    cause incorrect Health
                    selects oracle provider.   Factor calculations,
                                               leading to premature or
                                               delayed liquidation.

  **RWA             Securitize's role as       Default, fraud, or
  counterparty      transfer agent provides    regulatory action affecting
  risk**            regulatory oversight.      the underlying off-chain
                    Token-level restrictions   asset. The on-chain system
                    enforce authorized holder  cannot mitigate off-chain
                    requirements.              credit events.

  **Leverage        Health Factor enforcement  Rapid collateral
  amplification**   prevents over-leverage.    devaluation could outpace
                    Deterministic liquidation  liquidation, resulting in
                    triggers at HF \< 1.       bad debt to the lending
                    Collateral thresholds set  pool. RWA token liquidity
                    by market curator.         constraints may slow
                                               liquidation.

  **Liquidity       Interest rate models       In extreme scenarios, LPs
  mismatch**        adjust rates based on pool may face delays in
                    utilization to incentivize withdrawing capital if
                    repayment.                 utilization is at 100%.

  **Liquidator      Liquidation discount       If liquidators are
  availability**    incentivizes               unavailable or RWA token
                    participation. Emergency   liquidity is thin,
                    liquidator designation     undercollateralized
                    during market pause.       positions may persist,
                                               creating bad debt.

  **Regulatory /    Per-account freeze         Regulatory changes could
  legal risk**      capability. Investor       make the structure
                    reassignment. Securitize   non-compliant. Freeze
                    as regulated transfer      mechanics block
                    agent.                     liquidation, potentially
                                               locking bad debt.
  ------------------------------------------------------------------------

## 8. Legal & Structural Clarity

**What the system does:**

- Gearbox Protocol provides infrastructure for isolated, collateralized lending. It enforces collateral requirements, Health Factor thresholds, and liquidation logic through immutable smart contract logic.
- Securitize provides the compliance layer: identity verification, transfer restrictions, freeze capability, and investor reassignment. Securitize acts as the transfer agent for the tokenized securities.
- The integration layer (KYC Factory, intermediary wallets, wrapped underlying tokens) connects these two systems without modifying either core protocol.

**What the system does not guarantee:**

- The on-chain system does not guarantee the value or performance of the underlying RWA. If the off-chain asset loses value, that loss is transmitted to on-chain token holders.
- The system does not guarantee liquidation will be timely or complete. Liquidation depends on third-party liquidators and RWA token liquidity.
- The system does not guarantee regulatory compliance in all jurisdictions. Compliance is a function of Securitize's transfer agent obligations and applicable law, not of the smart contract architecture alone.

**Separation of roles:**

- Gearbox provides protocol tooling (lending, liquidation, account management). It does not issue, manage, or make representations about the tokenized securities.
- Securitize provides asset issuance and regulatory compliance. It does not operate the lending protocol or set financial parameters.
- Neither party acts as an investment manager, fiduciary, or financial advisor. The system is infrastructure, not a managed fund.

## 9. Custom Components (Built)

  -----------------------------------------------------------------------------
  **Component**               **Purpose**      **Key behavior**
  --------------------------- ---------------- --------------------------------
  **SecuritizeKYCFactory**    Custom account   On account creation: deploys
                              gateway          intermediary wallet, opens
                                               Credit Account, registers both
                                               in Securitize registry. Exposes
                                               setFrozenStatus(), setInvestor()
                                               callable only by Securitize
                                               admin. All investor operations
                                               route through this contract.

  **SecuritizeWallet**        Intermediary     Owns the Credit Account on
                              wallet per       behalf of the investor. Routes
                              account          multicall instructions from
                                               factory to CreditFacade.
                                               Explicitly blocks bot
                                               permissions (no third-party
                                               automation without going through
                                               the factory).

  **DefaultKYCUnderlying**    Wrapped          Wraps the real stablecoin (e.g.,
                              underlying token USDC). Checks the factory on
                              (ERC-4626 vault) every transfer --- reverts if
                                               either party is a frozen Credit
                                               Account. All pool
                                               lending/borrowing flows through
                                               this token.

  **SecuritizeDegenNFT**      Account creation Only the KYC Factory can mint
                              gate             this NFT. CreditFacade requires
                                               it to open an account,
                                               preventing anyone from bypassing
                                               the factory.

  **OnDemandKYCUnderlying**   Wrapped          Same freeze enforcement as
  (variant)                   underlying with  above, plus automatic liquidity
                              automatic        provision --- a designated
                              liquidity        liquidity provider is notified
                                               on every borrow/repay so capital
                                               can be supplied just-in-time.
  -----------------------------------------------------------------------------

## 10. Open Questions & Assumptions

### Open Questions

1.  **Curator pause + freeze interaction** --- If both are active
    simultaneously, is there any conflict? (Likely not --- freeze is
    strictly more restrictive.)

2.  **Oracle configuration for RWA tokens** --- What oracle source
    provides price feeds for tokenized securities? How are stale or
    manipulated prices handled? *Requires confirmation.*
