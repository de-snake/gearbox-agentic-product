# Status

Updated: 2026-04-16

## Current state

This share repo is now organized around a single final deliverable: `agentic-data-flow.md`.

## Changes in this revision

- Merged the original backend data requirements and the RWA / KYC extension into one final document.
- Removed the separate write-operations share artifact for now.
- Replaced `research/` with `raw-data/`.
- Split `raw-data/` into:
  - `call-transcripts/`
  - `specific-research/`
  - `working-notes/`
- Added `raw-data/dev-docs/` as tracked developer-facing draft documentation.
- Rewrote the root README to explain navigation and the information flow that produced the final output.

## Review path

1. Read `agentic-data-flow.md`.
2. Read `README.md` for construction logic and repo navigation.
3. Use `raw-data/` to trace where the final document came from.
4. Use `architecture/` when reviewing how stage-to-stage compression is intended to work.
