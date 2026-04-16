# Gearbox Agentic Product

This repository is organized into three layers:

- `raw-data/` — lowest-level source material
- `synthesis/` — derived understanding built from raw data
- `outputs/` — final deliverables

This structure is meant to be easy to navigate for both people and agents.

## Fast navigation

### If you want the final answer

Start with:

- `outputs/agentic-data-flow/00.introduction.md`

This is the entry point to the main deliverable folder.

### If you want to understand why the final answer looks this way

Then read:

- `synthesis/loss-vectors-summary.md`
- `synthesis/project-discovery.md`
- `synthesis/staged-agent-architecture.md`
- `synthesis/memo-standard.md`
- `synthesis/backend-datatype-stage-mapping.md`
- `synthesis/call-analysis-and-action-items.md`

### If you want the original evidence

Go to:

- `raw-data/call-transcripts/`
- `raw-data/specific-research/`
- `raw-data/source-docs/`
- `raw-data/dev-docs/`

## How to think about the folders

### `raw-data/`

This is the lowest-level material in the repo.

It includes:

- call transcripts,
- focused research documents,
- source product docs from the team,
- draft developer docs.

Nothing in `raw-data/` is the final framing. It is evidence, input, or direct source material.

### Raw-data subfolders

- `call-transcripts/`
  - direct product conversations and requirement discovery
- `specific-research/`
  - focused research on LP risk, Credit Account risk, due diligence, and tokenized securities
- `source-docs/`
  - source product documents that informed the design
- `dev-docs/`
  - developer-facing draft docs for MCP, SDK, architecture, preview, execution, and onboarding

### `synthesis/`

This layer compresses the raw data into reusable understanding.

These files answer questions like:

- what matters,
- why it matters,
- how the agent lifecycle should be structured,
- how evidence should be compressed before decision-making.

In other words:

- `raw-data/` is evidence,
- `synthesis/` is interpretation with references,
- `outputs/` is the final deliverable.

### `outputs/`

This layer contains the final documents that someone should review or implement against.

Right now the main output is the split folder:

- `outputs/agentic-data-flow/00.introduction.md`
- plus the numbered stage and appendix files beside it

## Recommended reading order

### For a human reviewer

1. `outputs/agentic-data-flow/00.introduction.md`
2. `synthesis/loss-vectors-summary.md`
3. `synthesis/staged-agent-architecture.md`
4. dive into `raw-data/` only where needed

### For an agent

1. load `outputs/agentic-data-flow/00.introduction.md`
2. use `synthesis/` to recover the decision logic behind the structure
3. use `raw-data/` only when primary evidence is needed

## Why the repository is structured this way

The repo is not organized as a generic document dump.

It is organized as a reasoning stack:

- raw evidence,
- compressed understanding,
- final output.

That makes it easier to answer both of these questions:

- "What is the final answer?"
- "Where did that answer come from?"
