import { Address } from "viem";
// import { TokenRef } from "./assets";

export type OpportunityKind = "pool" | "strategy" | "market";
export type YieldType = "organic" | "incentivized" | "mixed";

export interface AssetRef {
  type: "stable" | "base" | "yield";
  ticker: string;
  price: number;
}

export interface TokenRef extends AssetRef {
  chainId: number;
  address: Address;
  symbol: string;
  decimals: number;
  // isPhantom: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Rewards & Incentives
// ═══════════════════════════════════════════════════════════════

export interface TokenReward {
  type: "tokens";
  rewardToken: TokenRef;
  apy: number;
}

export interface PointsReward {
  type: "points";
  name: string;
  multiplier: number;
  condition: "deposit" | "cross-chain-deposit" | "holding";
}

interface IncentiveBase {
  description: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
}

export interface TokenIncentive extends IncentiveBase {
  type: "tokens";
  reward: TokenReward;
}

export interface PointsIncentive extends IncentiveBase {
  type: "points";
  reward: PointsReward;
}

export type Incentive = TokenIncentive | PointsIncentive;

export interface ClaimableTokenIncentive extends TokenIncentive {
  claimable: number;
  claimableUsd: number;
  claimed: number;
  claimedUsd: number;
}

export interface ClaimablePointsIncentive extends PointsIncentive {
  earned: number;
}

export type ClaimableIncentive =
  | ClaimableTokenIncentive
  | ClaimablePointsIncentive;

// ═══════════════════════════════════════════════════════════════
// Yield Breakdown
// ═══════════════════════════════════════════════════════════════

/** Breakdown of all yield sources for an opportunity or position */
export interface YieldBreakdown<I extends Incentive = Incentive> {
  /** Organic yield from the protocol (supply rate, farming, etc.) */
  base: number;
  /** All active incentive programs (token rewards + points) */
  incentives: I[];
  /** base + sum of active token incentives' APY */
  totalApy: number;
}

export interface CollateralYield {
  token: TokenRef;
  /**
   * Collateral value denominated in the underlying (borrow) token,
   * divided by total position value in the same token.
   * All weights sum to 1.
   */
  weight: number;
  yield: YieldBreakdown;
}

/**
 * Yield breakdown for a leveraged strategy opportunity.
 *
 * weightedApy = sum(collateral[i].weight × collateral[i].yield.totalApy)
 * netApy = weightedApy × leverage − borrowApy × (leverage − 1)
 */
export interface LeveragedYieldBreakdown {
  leverage: number;
  collaterals: CollateralYield[];
  /** Pool borrow rate (positive number, represents cost) */
  borrowApy: number;
  /** Net APY after leverage and borrow costs */
  netApy: number;
}

// ═══════════════════════════════════════════════════════════════
// PnL Breakdown
// ═══════════════════════════════════════════════════════════════

export interface PointsPnl {
  name: string;
  earned: number;
}

export interface PnlBreakdown {
  /** PnL from organic yield (interest earned or farming) */
  interest: number;
  interestUsd: number;
  /** PnL from token reward incentives (claimed + claimable) */
  rewards: number;
  rewardsUsd: number;
  /** Points earned per program */
  points: PointsPnl[];
  /** interest + rewards (points excluded — not monetary) */
  total: number;
  totalUsd: number;
}

// ═══════════════════════════════════════════════════════════════
// Collaterals
// ═══════════════════════════════════════════════════════════════

export interface PoolCollateral {
  token: TokenRef;
  quotaLimit: number;
  quotaUsed: number;
  quotaRate: number;
  // price feeds
}

export interface StrategyCollateral extends PoolCollateral {
  liquidationThreshold: number;
  yield: YieldBreakdown;
  // maxCollateral: number; quotaLimit - quotaUsed / collateralPriceInUnderlying

  // expectedWithdrawalTime: number;
  // isWithdrawalGuaranteed: boolean;
}

export interface UserCollateral extends Omit<StrategyCollateral, "yield"> {
  /**
   * Collateral value denominated in the underlying (borrow) token,
   * divided by total position value in the same token.
   * All weights sum to 1.
   */
  weight: number;
  balance: number;
  quota: number;
  yield: YieldBreakdown<ClaimableIncentive>;
  expectedWithdrawalTimestamp?: number;
}

// ═══════════════════════════════════════════════════════════════
// Opportunities
// ═══════════════════════════════════════════════════════════════

export interface Opportunity {
  id: string;
  chainId: number;
  type: "pool" | "strategy";
  title: string;
  curatorId: string;
  underlyingToken: TokenRef;
  access: {
    permissionless: boolean;
    kycRequired: boolean;
    kycUrl?: string | null;
  };
  risk: {
    summary?: string | null;
    warnings: string[];
  };
}

export interface PoolOpportunity extends Opportunity {
  type: "pool";
  poolAddress: Address;

  yield: YieldBreakdown;

  supplied: number;
  borrowed: number;
  utilization: number;

  tvl: string;
  tvlUsd: number;

  availableLiquidity: string;
  // isPaused: boolean;

  // irm info - how suplied liquidity change supply apy?

  collaterals: PoolCollateral[];
}

// PoolOpportunityEnriched
// supplyApy7d: number;
// avgSupplyApy30D: number;
// incentives7d: Incentive[];

////////

export interface StrategyOpportunity extends Opportunity {
  type: "strategy";

  minDebt: string;
  maxDebt: string;
  borrowableLiquidity: string;
  maxLeverage: number;

  borrowApy: number;

  /** Headline: best yield achievable at max leverage on best collateral */
  maxLeverageYield: LeveragedYieldBreakdown;
  /** Best collateral base yield without leverage */
  bestBaseYield: YieldBreakdown;

  collaterals: StrategyCollateral[];

  isPaused?: boolean;
  hasDelayedWithdrawal: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Positions
// ═══════════════════════════════════════════════════════════════

export interface UserPoolPosition {
  chainId: number;
  poolAddress: Address;

  depositSize: number;
  depositSizeUsd: number;

  yield: YieldBreakdown<ClaimableIncentive>;

  pnl: PnlBreakdown;
}

/**
 * weightedApy = sum(collateral[i].weight × collateral[i].yield.totalApy)
 * netApy = weightedApy × leverage − borrowApy × (leverage − 1)
 */
export interface UserStrategyPosition {
  chainId: number;
  poolAddress: Address;
  creditManagerAddress: Address;
  creditAccountAddress: Address;

  leverage: number;
  borrowApy: number;
  netApy: number;

  debt: number;
  debtUsd: number;
  healthFactor: number;

  pnl: PnlBreakdown;

  collaterals: UserCollateral[];
}
