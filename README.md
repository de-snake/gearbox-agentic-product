# Gearbox Agentic Product — Navigation Guide

This repository is organized around one final output:

`agentic-data-flow.md`

That document is the merged backend handoff. It combines the original backend data requirements with the RWA / KYC extension into a single agentic data flow.

## Start here

1. `agentic-data-flow.md` — the main deliverable. This is the document to review first.
2. `status-report.md` — the project-level status: what is already built, and what is still blocked on backend work.
3. `architecture/` — the handoff model that explains how agent stages consume and compress information.
4. `raw-data/` — the source material that explains how the final document was constructed.

## Repo map

- `agentic-data-flow.md`
  - Final merged backend handoff document.
  - Organized by agent stage: Discover → Evaluate → Propose → Preview → Execute → Monitor.
  - Includes the RWA / KYC branch inside the same document rather than as a separate addendum.

- `architecture/`
- `architecture/staged-agent-architecture.md` — defines what each stage receives and passes forward.
- `architecture/memo-standard.md` — defines the due diligence compression format between analysis and decision.

- `raw-data/call-transcripts/`
  - Product and design calls.
  - These are the closest source to real user questions, backend expectations, and product constraints.

- `raw-data/specific-research/`
  - Focused domain research that directly shaped the data model.
  - Includes LP loss vectors, Credit Account loss vectors, DeFi due diligence research, and the loss-vector summary.

- `raw-data/working-notes/`
  - Intermediate notes used to reconcile transcripts, compare documents, and turn discovery into a concrete backend handoff.

- `raw-data/dev-docs/`
  - Developer-facing draft docs for the same product surface.
  - Covers overview, MCP setup, agent loop, architecture, preview, execution, and first-agent onboarding.

- `references/`
  - External reference documents used where the final output depends on partner-protocol or compliance-specific architecture.

## How the final document was constructed

The repo is intentionally shaped as an information flow, not just a file dump.

### Step 1 — start from real user questions

The call transcripts capture what users and product stakeholders actually need to decide.

Examples:
- what data is needed to evaluate a pool or strategy,
- what makes a position unsafe,
- what must be visible before execution,
- what changes have to be monitored after entry.

### Step 2 — frame the problem through loss vectors

We did not want a generic API schema with every available field.

We wanted only the data that is financially meaningful to the user at a specific step.

That is why the research is framed through loss vectors: the cleanest way to decide whether a field belongs in the system is to ask which loss, failure, or decision error it helps prevent.

### Step 3 — ground the loss vectors in focused research

The focused research in `raw-data/specific-research/` provides the evidence base:
- LP loss vectors,
- Credit Account loss vectors,
- broader DeFi due diligence patterns,
- and a summary that connects those findings to the data model.

### Step 4 — map questions to agent stages

The architecture docs define the agent pipeline and the compression points between stages.

This matters because the final output is not only a list of fields. It is a stage-by-stage handoff document showing what the agent needs to know when discovering, evaluating, proposing, previewing, executing, and monitoring.

### Step 5 — synthesize into the final output

`agentic-data-flow.md` is the synthesis layer.

It takes:
- real user questions from transcripts,
- loss-vector framing from research,
- handoff design from architecture,
- and RWA / KYC-specific constraints from the tokenized securities reference,

and turns them into one backend handoff document.

## Why the loss-vector framing matters

This repository follows one core rule:

A field belongs in the final system only if it helps the agent answer a user-relevant question or avoid a financially meaningful mistake.

That is why the output is not organized as "all available pool fields" or "all contract state." It is organized around decision stages and loss vectors.

## Current scope

Included:
- the merged final handoff document,
- the architecture docs that explain the stage model,
- the raw source material that explains why the document looks the way it does,
- the developer-facing draft docs in `raw-data/dev-docs/`.

Excluded for now:
- write operations and error-handling spec,
- internal shaping/planning artifacts that are not necessary for an external reviewer.
