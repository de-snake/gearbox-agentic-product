# Gearbox Agent SDK API — Shareable Doc Pack

This repository is a curated, shareable extraction of the main documentation from:

`projects/gearbox/agent-sdk-api`

Goal: give colleagues a clean repo with readable filenames, the main backend data spec, and the supporting research/architecture context that explains where the spec came from.

## Start here

1. `specs/backend-data-requirements.md` — primary document; the main backend read-data handoff spec.
2. `specs/backend-data-requirements-rwa-kyc-extension.md` — companion RWA / KYC extension.
3. `status-report.md` — high-level project status and what is already built vs. still blocked on backend.

## Repo structure

- `specs/` — backend read/write requirements.
- `architecture/` — the staged handoff model and memo format referenced by the main spec.
- `research/` — discovery notes, loss-vector research, call transcripts, and analysis that informed the spec.
- `references/` — external reference docs pulled in because the included specs depend on them.
- `SOURCE-MAP.md` — exact mapping from original workspace paths to the filenames used here.

## Included files

### Core specs
- `specs/backend-data-requirements.md`
- `specs/backend-data-requirements-rwa-kyc-extension.md`
- `specs/write-operations-and-error-handling.md`
- `status-report.md`

### Supporting architecture
- `architecture/staged-agent-architecture.md`
- `architecture/memo-standard.md`

### Supporting research
- `research/2026-03-31-project-discovery.md`
- `research/2026-03-31-defi-due-diligence-research.md`
- `research/2026-03-31-loss-vectors-summary.md`
- `research/2026-03-31-lp-loss-vectors-on-chain.md`
- `research/2026-03-31-credit-account-loss-vectors-on-chain.md`
- `research/2026-03-31-strategy-and-agent-management-call-transcript.md`
- `research/2026-04-03-product-call-transcript.md`
- `research/2026-04-03-team-updated-spec.md`
- `research/2026-04-03-call-analysis-and-action-items.md`
- `research/2026-04-07-transaction-preview-and-sdk-call.md`

### Reference
- `references/gearbox-tokenized-securities.md`

## Not included

I excluded the internal shaping/planning docs (`plans/`, `breadboard.md`, `shaping.md`, `flow-mapping.md`, `information-architecture.md`) to keep the share repo focused on the backend handoff and the research that supports it. If needed, those can be added later.
