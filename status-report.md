# Gearbox Agent SDK — Status Report

**Date:** 2026-04-01
**Lead:** Ilya S

---

## Why this matters

AI agents are becoming a real user segment in DeFi. They need structured data and clear mechanics to evaluate opportunities, manage positions, and assess risk — the same due diligence a human analyst performs, but programmatically. Gearbox has no agent-facing interface today. This project builds one.

The goal: any third-party AI agent can connect to Gearbox, understand what it's looking at, and operate the full protocol lifecycle — from evaluating a pool to managing a leveraged position to exiting safely.

---

## What exists today

A working MCP (Model Context Protocol) server — the standard interface AI agents use to interact with external systems. It exposes 15 tools covering two user types:

- **Credit Account agents** — full lifecycle: discover strategies, open positions, manage collateral (deposit, withdraw, borrow, repay, swap), claim rewards, close. 12 tools, all operational on mainnet fork.
- **LP agents** — deposit into lending pools, withdraw, and simulate operations before committing. 3 tools, added this cycle.

Beyond execution, the server includes a progressive documentation system — agents learn Gearbox concepts as they query, without needing a pre-loaded knowledge base. Four layers from lightweight (inline hints on every response) to deep (on-demand concept documents covering health factor mechanics, utilization curves, yield decomposition, risk layers, quotas, and curator roles).

Safety guardrails are built in: the server blocks operations that would drop a position's health factor below 1.05, and translates raw protocol errors into domain-level explanations with corrective actions.

---

## How we got here

### Phase 1: Working demo (late March)

Built the CA agent foundation — SDK integration, Anvil fork management, full Credit Account lifecycle through an MCP server. Proved that an AI agent can discover strategies, open leveraged positions, manage them, and close them using Gearbox SDK v12.9.7.

### Phase 2: Product discovery (March 31 – April 1)

Eight research documents totaling ~275K characters. Established:

- **Two user types** (LP and CA agents) with distinct decision flows
- **Five due diligence questions** every agent must answer before deploying capital: yield sustainability, risk exposure, exit liquidity, counterparty chain, parameter change risk
- **Seven protocol entities** with 80+ data properties, each traced to a specific loss vector — no generic field dumps
- **85 loss vectors** (35 LP, 50 CA) across 22 categories, researched to contract-level causal chains
- **Backend data requirements** — handoff specification for the backend team defining exactly what data the agent server needs

### Phase 3: Architectural shaping (April 1)

Evaluated four architectural approaches against nine requirements. The core question: how much should the server pre-compose data for agents vs. letting agents compose their own queries?

**Selected: "Lean Composable" (C+)** — entity-level tools (one per protocol concept) where agents compose queries freely, plus two targeted computation tools for operations impossible agent-side (position simulation via SDK router, health factor attribution via backend).

Rejected the alternative of pre-assembled "smart" endpoints that bundle data per use case. Rationale: this system serves third-party agents whose query patterns we cannot predict. Pre-composed endpoints lock agents into flows we designed. Entity-level tools let them combine data in ways we did not anticipate. The cost is ~5 extra API calls per evaluation — acceptable given due diligence happens on minute-to-hour timescales.

### Phase 4: Track A implementation (April 1)

Four releases extending the demo with LP operations and the documentation system:
- LP deposit, withdraw, and simulation tools
- Inline domain context on every tool response (agents learn Gearbox by querying)
- Six deep-dive concept documents as on-demand MCP resources

This completes everything achievable with the SDK alone.

---

## What's next: backend dependency

The remaining tools require backend API endpoints that do not yet exist. The handoff specification is ready and awaiting backend team review.

**What the backend unlocks:**

| Capability | What agents gain |
|------------|-----------------|
| Pool intelligence | TVL, real-time utilization, rate curves, free liquidity, insurance fund status, full exposure chain |
| Strategy detail | Per-CM collateral analysis: tokens, liquidation thresholds, oracle types, adapters, quota state, curator identity |
| Position monitoring | Parameter change diffs, health factor attribution ("why did my HF change?") |
| Collateral health | Oracle staleness, peg status, price feed divergence |
| P&L tracking | "Am I making money?" — entry cost, current value, yield earned, fees, net return |

**Review process:** Each data requirement is classified A (already available) / B (can add) / C (expensive). The responses determine scope and sequencing for the next implementation phase.

---

## Design principles

1. **Facts, not decisions.** The system shows "utilization: 92%" — never "danger" or "critical." Agents apply their own judgment and risk thresholds.
2. **Progressive documentation.** No pre-loaded knowledge base. Agents learn Gearbox mechanics incrementally as they query — from inline hints to deep concept documents, loaded only when needed.
3. **Loss-vector-grounded data model.** Every data property in the system traces to a specific way an agent can lose money. If a field does not help an agent avoid a loss, it is not in the system.
4. **Agent-first, UI-second.** The same data model serves both. Agent consumption drives the design; UI adaptation is a follow-on concern.
