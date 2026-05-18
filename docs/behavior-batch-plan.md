# Auxiliary Behavior Review Batch Plan

This review covers R4-to-R6 changes outside the per-resource/datatype
StructureDefinition pass: operations, search behavior, REST/HTTP/capability
behavior, and narrative pages that define cross-cutting runtime semantics.

## Source Inputs

Use the existing package directories as the computable source of truth:

- R4: `/home/jmandel/hobby/r6breaks/fhir-definitions/r4-4.0.1/package`
- R6: `/home/jmandel/hobby/r6breaks/fhir-definitions/r6-6.0.0-ballot4/package`

Use rendered HTML pages as the narrative source of truth:

- Preferred R4 full-spec ZIP: `http://hl7.org/fhir/R4/fhir-spec.zip`
- R6 ballot page root: `https://hl7.org/fhir/6.0.0-ballot4/`
- Current finding: `https://hl7.org/fhir/6.0.0-ballot4/fhir-spec.zip`
  returns 404, so for R6 ballot4 the practical reproducible source is a local
  page cache of the relevant static HTML pages.

The page seed list is `agent-inputs/behavior-page-manifest.tsv`. It should be
broader than the first three behavior prompts so agents can catch semantics
that moved into narrative pages such as `versions.html`, `references.html`,
`formats.html`, `parameters.html`, `bundle.html`, `subscription*.html`, and
module pages.

## Batch Shape

1. Prepare local rendered page inputs.
   - Run `scripts/prepare_behavior_sources.sh`.
   - This downloads the seeded narrative pages into `fhir-specs/`.
   - If operation fanout manifests already exist, it also downloads
     operation-specific pages.

2. Generate deterministic fanout manifests.
   - Run `node scripts/generate_behavior_manifests.mjs`.
   - This writes `batch/behavior/operation-fanout.tsv` and
     `batch/behavior/operation-pages.tsv`.

3. Generate maturity/status context.
   - Run `node scripts/generate_behavior_context.mjs`.
   - This writes `batch/behavior/fmm-context.json`.
   - Agents use this as stability context only. FMM is not the impact score.

4. Run a smoke pass.
   - Start with `CONCURRENCY=1 scripts/run_behavior_agents.sh --operations --sample 2`.
   - Inspect two operation-shard outputs for schema validity, evidence quality,
     fresh-review judgment quality, and whether the prompt is over-reporting
     data-model issues.

5. Run core reports.
   - `scripts/run_behavior_agents.sh --core` runs the three existing broad
     prompts: `OperationDefinitions`, `SearchParameters`, and
     `HttpRestBehavior`.
   - These are useful as overview reports but should not be the only operation
     review because one monolithic agent is likely to miss operation-specific
     details.

6. Run operation fanout.
   - `CONCURRENCY=12 JOB_TIMEOUT=4h scripts/run_behavior_agents.sh --operations --missing`
   - Each row owns one common, removed, added, or likely-replacement operation
     group.

7. Reduce before publishing.
   - Operation shard reports should be merged into
     `output/OperationDefinitions.report.json` before the UI treats them as a
     single behavior report.
   - Run `node scripts/reduce_operation_behavior_reports.mjs`.
   - Keep shard outputs under `output/behavior/operations/` for auditability.

## Operation Fanout

The operation fanout should be deterministic and high-sensitivity:

- Match by canonical URL first.
- Then match unmatched operations by resource + code when unique.
- Then match by code only when both sides have no resource context.
- Leave ambiguous removed/addition cases as separate shard rows with candidate
  replacements noted for the agent to evaluate.

Expected current scale from local packages:

- 47 R4 OperationDefinitions
- 42 R6 OperationDefinitions
- roughly 50-60 operation shard rows after matching

At 12-way parallelism, a full operation pass should be workable. The hard part
is not throughput; it is avoiding duplicate findings between operation,
HTTP/capability, search, and data-model reports.

## Full Command Sequence

```sh
node scripts/generate_behavior_manifests.mjs
node scripts/generate_behavior_context.mjs
scripts/prepare_behavior_sources.sh

CONCURRENCY=1 scripts/run_behavior_agents.sh --operations --sample 2

CONCURRENCY=12 JOB_TIMEOUT=4h scripts/run_behavior_agents.sh --operations --missing
node scripts/reduce_operation_behavior_reports.mjs

CONCURRENCY=3 JOB_TIMEOUT=4h scripts/run_behavior_agents.sh --core --missing
```

## Duplication Rules

- Operation shard reports own operation-specific parameter, invocation,
  affectsState, output `Parameters`, and operation page behavior.
- `HttpRestBehavior` owns generic REST mechanics and CapabilityStatement
  advertisement changes. It may cross-reference operation shards, but should
  not repeat every operation parameter delta.
- `SearchParameters` owns search parameter and query behavior. It should
  cross-reference resource/datatype changes when expressions moved because
  fields moved.
- Resource/datatype reports own StructureDefinition instance shape changes.
  Behavior reports should mention those only as dependencies.

## Alignment With Main Prompt

Agents should answer the same practical questions as the main prompt, but
using the behavior contract's compact `freshReview` field instead of a separate
post-hoc review pass:

- What breaks for R4 clients, R4 servers, generated code, validators, or
  conformance tests?
- Is the R6 goal reasonable?
- Could the goal have been met with a less-breaking base R6 design?
- If yes or partial, what would that design have looked like and what tradeoff
  would it carry?

Use `runtimeMechanismMd`, `impact.impactRationaleMd`,
`backwardCompatibilityAnalysisMd`, and `migrationGuidanceMd` for that reasoning.
Do not create duplicate data-model findings to express the same point.

## FMM-Guided Fresh Review

`docs/fresh-review-judgment-framework.md` is the judgment rubric for this
round. The key rule is that FMM and standards status are stability pressure,
not impact.

Each material behavior finding must populate `freshReview`:

- `judgment`: `Revisit`, `Unclear`, `Breaking but probably OK`, or
  `No problem`.
- `compatibilityMechanism`: the strongest concrete mechanism, such as
  runtime/API/codegen break, old-valid/new-invalid behavior,
  warning-level pressure, semantic/documentation only, metadata/tooling only,
  none, or unknown.
- `fmmContext`: R4 FMM/standards-status evidence and how it changes the burden
  of justification for preserving R4 compatibility. R6 FMM/status is not the
  burden baseline for R4→R6 analysis.
- `realWorldScenarioMd`: one plausible implementation scenario that encounters
  the change.
- `lessBreakingAlternative`: whether a less-breaking base R6 design is
  plausible, including what it would look like and its tradeoff.

Judgment calibration:

- Normative or FMM 5: strong stability expectation. Direct hard breaks and
  safety-significant runtime changes need strong justification.
- FMM 3-4: compatibility matters, especially for central/common workflows.
- FMM 2: neutral; mechanism and blast radius dominate.
- FMM 0-1: do not infer broad impact from the break alone. Use `Revisit` only
  if there is a concrete production, safety, regulatory, billing,
  public-health, audit, generated-code, or expert-lossy migration concern.

Behavior-specific examples:

- A removed normative terminology operation with common server/client support
  is a likely `Revisit` unless a replacement is directly compatible or strongly
  justified.
- A low-FMM operation rename can still be `Revisit` when the same goal could
  have been met by keeping the old operation code or accepting both old and new
  parameter names with low cost.
- A new optional operation or search parameter is usually `No problem` unless
  it changes expectations for existing clients or conformance.
- A narrative clarification on a normative page is not automatically breaking;
  the agent must identify whether validators, routes, query results, or
  conformance tests would actually behave differently.
