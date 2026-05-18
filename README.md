# FHIR R4 to R6 Breaking Changes

This repository contains an experimental review of potential breaking changes
from FHIR R4 4.0.1 to the R6 6.0.0-ballot4 package, plus a static web viewer
for exploring the findings.

Published site: https://joshuamandel.com/fhir-r6-changes/

The review is intended to help answer practical migration questions:

- Does an R4 instance, client, server, validator, search, operation, or API
  workflow break when moving to R6?
- Is the likely R6 design goal reasonable?
- Could the same goal have been reached with a less-breaking base design?
- Which findings deserve renewed standards or implementation attention?

This is not an HL7 publication and is not affiliated with HL7. Use it alongside
the official FHIR specification, packages, and ballot materials.

## What Is Reviewed

The checked-in reports cover two complementary surfaces:

- StructureDefinition findings for R4 resources, datatypes, and supporting
  artifacts in `output/*.report.json`.
- Behavior/API findings for operations, search, and REST/HTTP semantics in:
  - `output/OperationDefinitions.report.json`
  - `output/SearchParameters.report.json`
  - `output/HttpRestBehavior.report.json`

Each finding includes structured evidence, impact analysis, a less-breaking
alternative assessment, migration guidance, and an overall review judgment:

- `Revisit`: materially concerning; likely worth renewed design review.
- `Unclear`: not enough evidence for a confident judgment.
- `Breaking but probably OK`: real compatibility cost, but likely justified.
- `No problem`: no meaningful R4-to-R6 compatibility concern.

The current review intentionally focuses on R4-to-R6 compatibility. Reverse
R6-to-R4 downgrade loss is noted only when it helps explain the migration
tradeoff.

## Repository Layout

- `output/`: report JSON consumed by the published viewer.
- `prompt.md`: main StructureDefinition analysis prompt and output schema.
- `agent-inputs/`: prompts and contracts for operation/search/REST behavior
  review batches.
- `docs/fresh-review-judgment-framework.md`: the FMM-aware review rubric.
- `docs/behavior-batch-plan.md`: pipeline plan for non-StructureDefinition
  behavior reviews.
- `scripts/`: batch runners, source preparation, merge/reduce scripts, and
  audit checks.
- `viewer/`: React/Bun static viewer with separate entrypoints for structure,
  operations, and a Pages/API umbrella for non-operation behavior reports.

Large local batch logs, downloaded FHIR packages, downloaded spec pages, and
intermediate operation-shard outputs are intentionally not required for the
published site.

## Local Development

Install viewer dependencies:

```bash
cd viewer
bun install
```

Run the local dev server:

```bash
bun run dev --port 3000
```

Useful local URLs:

- http://localhost:3000/
- http://localhost:3000/operations
- http://localhost:3000/pages

Build the static site:

```bash
bun run build
```

The build regenerates `viewer/data-bundle.ts` from checked-in JSON under
`output/` and writes the static site to `viewer/dist/`.

To build exactly like GitHub Pages, ignoring any local sidecar review files:

```bash
cd viewer
REVIEW_DIR=none bun run build
```

## Audits

Before publishing, run the embedded fresh-review coverage audit:

```bash
node scripts/audit_embedded_fresh_review.mjs \
  --report-dir output \
  --fail-on-missing \
  --expected-reviewed-reports 203 \
  --expected-reviewed-findings 1217
```

This verifies that every expected structure finding has embedded review data
and that the review judgments conform to the current rubric.

## Deployment

GitHub Actions builds the viewer from checked-in source data and deploys
`viewer/dist` to GitHub Pages on every push to `main`.

The workflow does not download FHIR packages or rerun review agents. The
published site is fully determined by the committed viewer code and the report
JSON files in `output/`.
