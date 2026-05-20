# Resource Change Assessment Rubric

This rubric aggregates existing per-finding R4-to-R6 reviews into a
resource-level assessment.

It answers a different question from the fresh-review judgment:

- Fresh review asks whether a specific finding deserves renewed standards or
  design attention.
- Resource assessment asks whether the resource already requires enough
  migration work that preventing one more local breaking change has reduced
  leverage.

The resource answer must not erase per-finding concerns. A resource can need a
migration program and still contain individual changes that were avoidable.

## Inputs

For each R4 resource, read:

- the resource's own `output/<Resource>.report.json`;
- behavior findings whose `affectedResources` include the resource name;
- shared `Resource` or `DomainResource` behavior findings as context only,
  unless the assessed artifact is itself `Resource` or `DomainResource`;
- R4 FMM and standards status from `viewer/r4-maturity.json`.

Inherited base-class StructureDefinition findings remain out of scope because
the per-resource reports deliberately exclude them.

## Core Output Question

Each resource receives:

- `majorMigrationAlreadyUnavoidable`: `Yes`, `Partial`, `No`, or `Unknown`.
- `compatibilityLeverage.conclusion`: the practical standards posture for
  avoiding additional breaking changes.

Use these labels:

- `migration-program-dominates`: the resource identity is removed/replaced, or
  the content model is so remodeled that instance migration is already the main
  work.
- `preserve-where-low-cost-but-expect-resource-migration`: a migration program
  is needed, but retaining deprecated fields, aliases, wider bindings, or
  transition behavior can still materially reduce cost.
- `preserve-compatibility-per-change`: the resource is mostly stable, so each
  avoidable local break still matters on its own.
- `no-special-break-avoidance-needed`: no material R4-to-R6 compatibility
  pressure was found for this resource.
- `not-enough-evidence`: the aggregate cannot be assessed confidently from the
  existing reports.

## Dimensions

### 1. Resource Identity

If the R4 resource has no same-name R6 StructureDefinition or is replaced by a
different resource family, migration almost always dominates. This does not
prove the removal was wrong; it means preserving individual old element names is
no longer the main compatibility lever.

### 2. Hard R4-to-R6 Instance Breaks

Count findings where `impact.hardInstanceBreaking` is `Yes`. Multiple hard
breaks increase the chance that every real instance must be transformed before
R6 validation.

Potential breaks count less because they usually depend on profiles,
terminology choices, server behavior, or implementation details.

### 3. Non-Mechanical Migration Shape

Give extra weight to:

- element removals, renames, moves, and replacements;
- resource splits, merges, or replacement resources;
- CodeableReference or choice-type remodels that require classification;
- removed reference targets;
- added mandatory or modifier elements;
- new error-level constraints;
- required binding changes that can reject old values.

These are more important than additive fields or reverse-only loss because they
can require human mapping policy instead of a simple validator/codegen update.

### 4. Behavior/API Surface

Operation, search, and HTTP behavior findings count when they are directly
assigned to the resource. Shared `Resource` or `DomainResource` behavior is
listed as context but not scored for every resource, to avoid duplicating the
same base issue across the whole set.

### 5. R4 Maturity and Standards Status

Use R4 maturity as stability pressure:

- Normative or FMM 5: strong pressure to preserve old compatibility when
  feasible.
- FMM 3-4: meaningful pressure, especially for common clinical, operational,
  audit, or conformance workflows.
- FMM 2: neutral.
- FMM 0-1: weak stability expectation.

Maturity does not decide impact. It changes how skeptical we should be of
breaking changes and how much justification we expect.

### 6. Less-Breaking Alternatives

If many `Revisit` findings identify modest-cost base-compatible alternatives,
then even a busy resource should not be treated as "no point preserving
compatibility." The resource-level conclusion should say that a migration
program is needed while still preserving low-cost compatibility where possible.

## Threshold Guidance

Use these thresholds as deterministic defaults, then explain the result in the
resource rationale.

- Resource identity break: `majorMigrationAlreadyUnavoidable = Yes`.
- Eight or more hard breaks, or eight or more non-mechanical breaks:
  `majorMigrationAlreadyUnavoidable = Yes` unless evidence is weak.
- Three to seven hard breaks, four or more `Revisit` findings, or several
  high-risk behavior findings: `Partial`.
- One or two isolated hard breaks with stable identity: usually `No` for major
  unavoidable migration, but still `preserve-compatibility-per-change`.
- No hard or potential breaks and no direct behavior findings:
  `no-special-break-avoidance-needed`.

For normative/FMM 5 resources, prefer
`preserve-where-low-cost-but-expect-resource-migration` over
`migration-program-dominates` unless the resource identity itself is gone or the
evidence for broad remodeling is overwhelming.

