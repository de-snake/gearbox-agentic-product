# Apr 3 Call — Analysis & Action Items

**Source:** 2026-04-03-product-call-transcript.md (transcript), 2026-04-03-team-updated-spec.md (their updated spec)
**Compared against:** ../specs/backend-data-requirements.md (our spec)

---

## 1. What their doc has that ours doesn't

### A. Propose / Preview / Execute stages (their stages 3–5)
Our spec says "deployment is execution, doesn't need additional info." Their doc disagrees — they spec'd four tools:

- `prepare_deposit` (LP) — computes expected shares, breakeven days, concentration %, withdrawal fee impact
- `prepare_position` (CA) — computes debt amount from leverage, projected HF, net APY, entry costs (quota fee + swap impact), constraint checks
- `simulate_deposit` / `simulate_position` — dry-run against real chain state, return deviation from proposal, calldata
- `execute_transaction` — submit + receipt

**Assessment:** These stages are real and needed. The "proposal" math (breakeven calculation, concentration check, constraint validation) isn't covered by our Evaluate fields. The preview/simulation is a separate concern from data — it's execution infrastructure. But the *data fields* in prepare_deposit and prepare_position surface information our spec should acknowledge.

**Fields to add to our spec:**
- Breakeven days (given APY + withdrawal fee) — LP Evaluate or separate Propose section
- Concentration % after deposit — LP risk consideration
- Entry cost decomposition (quota increase fee + estimated swap impact) — CA, partially covered but not as a combined "entry cost" concept
- Constraint validation bundle (debt in range, borrowable sufficient, quota available, not paused, not expired) — CA pre-flight checklist

### B. Standalone `get_curator` tool
Their doc has curator as its own endpoint with: address, name, bad_debt history, url, socials.

Our spec mentions curator_name and curator_address inline in Evaluate. Their approach is better — curator data is shared across pools/CMs, so a standalone endpoint avoids duplication and lets the agent build a curator trust model.

**Action:** Add `/curators` endpoint description to our spec (we already have it in Architecture overview but never spec'd the fields).

### C. Strategy-level fields we're missing
- `point_line: string` — which point program applies (their discover stage)
- `availability: "Permissionless" | "KYC'd"` — access requirements (their discover stage)
- `strategy_key: [chain_id, cm_address, collateral_address]` — canonical identifier (from transcript)

### D. Agent task / intent formalization
Their doc has:
```typescript
interface AgentTask {
    task: "Any" | "LP" | "Strategy",
    assets: "BTC" | "ETH" | "USD",
    amount: number,
}
```
Our spec has Intent as prose. Their formalization is useful for the API contract.

---

## 2. Ideas from the transcript to add/alter in our spec

### E. APY harmonization problem
Multiple backend services compute APY differently. The team acknowledged this is a mess. Our spec assumes a clean `apy_total` but doesn't address the computation source.

**Action:** Add a note in our spec about APY source requirements — single source of truth, not frontend-computed.

### F. Entry/exit cost as first-class concept
Transcript discussion (line ~120): swap slippage + price impact can eat weeks of yield on low-APY strategies. Someone pointed out that swapping USDC↔USDT costs ~$100-200 on a moderate position, and if the strategy earns 3-4%, that's weeks of profit gone.

**Action:** Our spec has `price_impact_via_router` in Exit feasibility. We should add a symmetric "Entry cost" section for CA Evaluate: estimated swap cost to enter the strategy at position size.

### G. Future state changes (pending governance)
Transcript (lines ~72-76): both agreed that pending governance transactions (queued in timelock) should be visible in Analyze AND Monitor. The team discussed parsing Safe TX queue to show "what changes are coming."

**Action:** Add to our spec:
- In Evaluate (both LP and CA): `pending_changes: Array<{ description, expected_execution_date, parameters }>` — from governance queue
- In Monitor: same, filtered by `since_timestamp`

### H. Emergency state information
Transcript mentions: pause status, forbidden tokens, emergency actions. Our spec has `facade_paused` but doesn't bundle emergency info.

**Action:** Consider grouping pause + forbidden tokens + loss policy into an "emergency state" block in Monitor.

### I. Liquidation ecosystem health
Transcript (line ~146): Dima's idea — number of active liquidators, whether liquidation market is competitive vs single-liquidator. More liquidators = safer for both LP and CA.

**Assessment:** Interesting but hard to serve. Would require indexing liquidation events and extracting unique liquidator addresses. Mark as P2/future.

### J. Risk disclosure text
Transcript discusses a `risk_disclosure: string` field — a text block explaining "in case of bad debt, all liquidations are forbidden" or similar structural risks.

**Action:** Add to CA Evaluate Q2 or as a standalone field. Simple text, low effort, high value for agent reasoning.

### K. Borrow rate as risk, not just cost
Transcript debate (lines ~124-135): borrow rate volatility can cause liquidation (not just reduce profit). Historical borrow rate spikes have wiped months of yield in days.

**Assessment:** Our spec already has borrow rate in Q1-CA as cost. The risk framing means we should also reference borrow rate history in Q2-CA (collateral safety) with a note that extreme rate spikes can cause liquidation via interest accrual.

### L. Points — minimal display
Transcript consensus: show project name + multiplier only, don't try to compute economic value.

**Action:** Our spec doesn't mention points at all. Add to CA Discover: `points: Array<{ program_name, multiplier }>` — informational only, no economic valuation.

---

## 3. What our spec has that theirs doesn't

These are strengths to preserve — don't lose them in any merge.

| Our spec advantage | Why it matters |
|---|---|
| Asset properties section (issuer, asset type, native lockup, yield source, historical volatility) | Fundamental risk assessment theirs skips entirely |
| Delayed withdrawals / phantom tokens (Stage 3b) | Critical for CA monitoring, theirs doesn't cover |
| Per-field "agent decision story" rationale | Every field justified; theirs has logic sections but not per-field |
| Appendix A: Historical series summary | Implementation planning for backend |
| Appendix B: 34 event types with priority | Backend indexing roadmap |
| Appendix C: Computed data list | Clear backend vs on-chain boundary |
| Per-CM nested exposure data for LP | Their doc comments out the CM-level detail |
| Oracle staleness + main/reserve divergence in Monitor | Their doc has it in Analyze but not Monitor |
| Data type annotations (snapshot/history/event log) | Clear caching/storage implications |
| Status column (A/B/C) for backend team | Actionable review format |

---

## 4. Action items

### Must do (before next review with team)

| # | Action | Where | Effort |
|---|--------|-------|--------|
| 1 | Add `/curators` endpoint fields (address, name, bad_debt, url, socials) | data-read-spec §Architecture | S |
| 2 | Add `strategy_key: [chain_id, cm_address, collateral_address]` as canonical ID | data-read-spec §1b | S |
| 3 | Add `availability: "Permissionless" \| "KYC'd"` to CA Discover | data-read-spec §1b | S |
| 4 | Add `points: Array<{ program_name, multiplier }>` to CA Discover | data-read-spec §1b | S |
| 5 | Add entry cost section to CA Evaluate (swap cost at position size) | data-read-spec §2b Q1 | M |
| 6 | Add pending governance changes to Evaluate + Monitor | data-read-spec §2a/2b Q5 + §3a/3b | M |
| 7 | Add risk_disclosure text field to CA Evaluate | data-read-spec §2b Q2 | S |
| 8 | Add `AgentTask` interface to Intent section | data-read-spec §0 | S |
| 9 | Note on borrow rate as liquidation risk (not just cost) | data-read-spec §2b Q2 | S |

### Should do (next iteration)

| # | Action | Where | Effort |
|---|--------|-------|--------|
| 10 | Decide on Propose/Preview stages — do we spec the data fields for breakeven, concentration, constraint bundle? | New section or fold into Evaluate | M |
| 11 | APY source harmonization note | data-read-spec §1a + Architecture | S |
| 12 | Emergency state grouping (pause + forbidden + loss policy) | data-read-spec §3b | S |

### Backlog

| # | Action | Effort |
|---|--------|--------|
| 13 | Liquidation ecosystem health metric | L — needs event indexing |
| 14 | Curator action history (what changes they've made historically) | M — needs event aggregation per curator |

---

## 5. Proposed next steps

1. Apply items 1–9 to ../specs/backend-data-requirements.md (I can do this now)
2. Discuss item 10 (Propose/Preview) with you — this is a structural question: does our spec stay as "data requirements only" or expand to cover execution-stage data needs?
3. Send updated spec to Gregory's team for A/B/C review
4. Use their doc (2026-04-03-team-updated-spec.md) as the reference for MCP tool signatures — it's the tool-shape companion to our data-shape spec
