# Fresh Review Judgment Framework

This document defines the reviewer prompt and worked examples for fresh,
FMM-informed adjudication of individual R4-to-R6 change findings.

The goal is not to re-rank entire resources. The goal is to decide whether a
specific change finding deserves renewed standards/design attention.

## Core Judgment

Each reviewed finding gets exactly one final judgment:

```ts
export type ReviewJudgment =
  | "Revisit"
  | "Unclear"
  | "Breaking but probably OK"
  | "No problem";
```

Use the labels as action judgments:

- `Revisit`: this specific change appears materially concerning. It is
  breaking or risky, and the break seems disproportionate, a plausible
  low-cost less-breaking base design exists, or the rationale is weak given
  the maturity/stability expectation.
- `Unclear`: the reviewer cannot make a defensible judgment from the supplied
  evidence. Missing evidence might involve the actual change, the R6 goal,
  prevalence, migration feasibility, FMM relevance, or whether a less-breaking
  design would work.
- `Breaking but probably OK`: there is a real compatibility break or migration
  burden, but the break appears proportionate. The R6 goal is reasonable, and
  less-breaking alternatives either fail the goal or have material tradeoffs.
- `No problem`: there is no meaningful R4-to-R6 compatibility concern for this
  specific change. This includes additive/widening changes, metadata churn,
  example-binding changes, semantic clarifications, or reverse-only concerns
  with low practical risk.

## Granularity Rule

Evaluate the specific finding/change, not the whole resource.

For element-level findings, assess only the affected path and direct downstream
behavior. Do not import the whole artifact's migration burden unless it
materially changes migration feasibility for this specific path.

Whole-resource blast radius is appropriate only when the finding itself is
about resource identity, resource removal, operation removal, search surface
removal, or another top-level behavior change.

## Fresh-Review Rule

Treat the existing JSON report as prior work, not as ground truth.

The current report may contain useful leads, evidence locations, and migration
claims worth checking. Its impact score, alternative judgment, and justification
were produced under an earlier rubric and may be wrong.

Do not copy prior impact or alternative judgments into the new review. Perform
the independent assessment first, then compare with the existing report last.

## Reviewer Prompt

```text
You are performing an independent holistic review of one specific FHIR
R4-to-R6 change finding.

You will receive:
- the current finding JSON and narrative;
- R4/R6 evidence or evidence pointers;
- current FMM / standards-status context for the affected artifact or content.

Treat the current finding as prior work, not as ground truth. Its impact score,
alternative judgment, and justification may be wrong or biased by an older
rubric.

Your task is to produce a fresh, path-level adjudication.

Core rule: evaluate the specific change, not the whole resource, unless the
finding itself is a resource/operation/search/API identity removal.

1. Reconstruct the change

Start from evidence. Identify what actually changed between R4 and R6:
- path/name;
- cardinality;
- type or choice shape;
- reference targets;
- binding strength or value set;
- invariant/constraint severity;
- modifier/summary flags;
- semantic/conformance text;
- operation/search/API behavior.

Use the existing JSON only as a map to possible evidence. Do not assume its
conclusions.

2. Build a concrete use case

Describe one plausible implementation or data exchange that would encounter
this change.

Prefer concrete scenarios:
- a validator accepting/rejecting an instance;
- a generated SDK changing property names or choice types;
- a server route/search/operation disappearing;
- a clinical/business workflow losing meaning;
- a mapper needing human judgment;
- a warning-as-error pipeline failing.

Avoid abstract claims like "this is breaking" without showing how.

3. Identify the compatibility mechanism

Classify the strongest real mechanism:
- old-valid/new-invalid instance break;
- runtime/API/codegen/search/operation break;
- warning-level conformance pressure;
- semantic/documentation-only change;
- metadata/tooling churn only.

Keep these distinct. A change can be concerning without an instance validation
break, but the runtime, operational, or safety mechanism must be explained.

4. Apply FMM / standards-status as stability pressure

FMM is not the impact score. It changes the expected burden of compatibility.
For R4→R6 analysis, use the R4 artifact's FMM and standards status as the
baseline. R6 maturity can explain the target design's future stability, but it
does not increase the compatibility burden for breaking R4 consumers.

- Normative or FMM 5: strong stability expectation. Direct hard breaks and
  safety-significant runtime changes require strong justification.
- FMM 3-4: mature trial-use. Compatibility matters, especially for central or
  common workflows.
- FMM 2: neutral. Let mechanism and blast radius dominate.
- FMM 0-1: weak stability claim. Do not infer broad real-world impact from the
  mere existence of a break.

Low-FMM caution:

For FMM 0-1 content, do not assign `Revisit` merely because a change is
breaking. A low-FMM change deserves `Revisit` only when there is specific
evidence or strong domain reason that:
- the path is central to the artifact's actual use;
- production exchange is known or strongly plausible;
- the content is safety-, regulatory-, billing-, public-health-, or
  audit-relevant;
- generated APIs/validators for an implemented workflow are affected; or
- migration is lossy or requires expert judgment.

Low FMM can soften stability expectations, but it does not erase real safety or
business impact.

5. Independently search for less-breaking base designs

Do not rely on the existing alternative judgment.

Ask whether R6 could plausibly meet the same core goal while preserving most
R4-valid instances in the base model.

Consider:
- optional addition instead of replacement;
- deprecation instead of deletion;
- retaining old wire names as aliases;
- widening choice types, target lists, or code systems;
- keeping old required-bound codes while adding new ones;
- warning-level invariant instead of error invariant;
- profile/IG requirement instead of base requirement;
- preserving resource identity while updating definitions;
- transitional legacy target/resource only when the finding itself is
  top-level.

Reject alternatives that are only:
- migration tooling;
- ConceptMaps/StructureMaps alone;
- extensions/backports for R4;
- local implementation policy; or
- after-the-fact transforms.

Those may be good mitigation, but they are not less-breaking base R6 designs.

6. Stress-test alternatives

For each plausible base-design alternative, ask:
- Would it preserve most R4-valid instances as base R6?
- Would it still meet the R6 goal?
- Would it create duplicate same-resource representations?
- Would old and new fields conflict?
- Would validators need difficult precedence rules?
- Would it weaken safety or computability?
- Would it force support for obsolete models indefinitely?
- Would it increase server/search/API/codegen burden?

7. Make the final judgment

Use this decision flow:

- If there is no meaningful compatibility problem, choose `No problem`.
- If missing evidence prevents a defensible judgment, choose `Unclear`.
- If the change deserves renewed standards/design attention, choose `Revisit`.
- Otherwise, if there is real migration work but the change appears
  proportionate, choose `Breaking but probably OK`.

Use `Revisit` when:
- mature/normative content breaks without strong rationale;
- a plausible modest-cost base-compatible design exists;
- migration is lossy or expert-dependent;
- safety/business/public-health impact is credible; or
- low-FMM content is nevertheless central or likely used in production.

Use `Breaking but probably OK` when implementers have real migration work, but
the R6 goal is reasonable and alternatives have meaningful costs.

Use `No problem` when the concern is only additive, semantic, metadata-only, or
reverse-conversion with low practical risk.

8. Compare with existing report last

Only after the independent review, compare your result with the current JSON:
- agree;
- partially agree;
- disagree.

Explain any disagreement briefly.
```

## Output Shape

```ts
export type ReviewJudgment =
  | "Revisit"
  | "Unclear"
  | "Breaking but probably OK"
  | "No problem";

export type CompatibilityMechanism =
  | "old-valid-new-invalid"
  | "runtime-api-codegen"
  | "warning-level-conformance"
  | "semantic-or-documentation"
  | "metadata-tooling"
  | "none"
  | "unknown";

export type AlternativeJudgment =
  | "Yes"
  | "Partial"
  | "No"
  | "Not applicable"
  | "Unknown";

export interface FreshReviewDecision {
  findingId: string;

  judgment: ReviewJudgment;

  narrativeMd: string;

  reconstructedChange: {
    summary: string;
    evidenceChecked: string[];
    confidence: "High" | "Medium" | "Low";
  };

  realWorldScenario: {
    scenario: string;
    failureMode: string;
  };

  fmmEffect: {
    fmm?: number;
    standardsStatus?: string;
    effect:
      | "Raises burden of justification"
      | "Neutral"
      | "Softens stability concern"
      | "Unknown";
    rationale: string;
  };

  compatibilityMechanism: {
    primary: CompatibilityMechanism;
    summary: string;
  };

  lessBreakingAlternative: {
    judgment: AlternativeJudgment;
    candidateDesign?: string;
    tradeoffsOrReason?: string;
  };

  comparisonToExisting?: {
    existingImpact?: string;
    existingAlternativeJudgment?: string;
    agreement: "Agree" | "Partially agree" | "Disagree" | "Not assessed";
    note?: string;
  };
}
```

## Batch Execution

The fresh-review pass runs per artifact report but emits one decision per
finding. This keeps Copilot job count manageable while preserving path-level
judgments.

Smoke run:

```bash
CONCURRENCY=1 JOB_TIMEOUT=4h scripts/run_fresh_review_agents.sh --sample 2
node scripts/audit_fresh_review.mjs \
  --review-dir batch/fresh-review/reviews \
  --report-dir output \
  --sample
```

Full run:

```bash
CONCURRENCY=12 JOB_TIMEOUT=4h MODEL=gpt-5.5 REASONING_EFFORT=xhigh \
  scripts/run_fresh_review_agents.sh --all

node scripts/audit_fresh_review.mjs \
  --review-dir batch/fresh-review/reviews \
  --report-dir output \
  --fail-on-missing
```

The viewer data build merges review decisions without rewriting
`output/*.report.json`:

```bash
cd viewer
bun run build:data
```

Use `REVIEW_DIR=/path/to/reviews` when previewing a staged review directory.

After the review agent batch is complete, materialize the fresh review decisions
back into the current report JSON with an in-place merge:

```bash
node scripts/merge_fresh_reviews.mjs --in-place
```

The merge is idempotent: reruns only rewrite files whose embedded
`finding.freshReview` content has changed. This keeps the checked-in output
shape as one current report file per artifact.

While review agents are still reading `output/*.report.json`, avoid mutating
those files in place. If a self-contained preview is needed mid-run, write it to
ignored batch scratch:

```bash
node scripts/merge_fresh_reviews.mjs --output-dir batch/fresh-review/merged-preview
```

That preview directory also receives copied behavior report files so the viewer
can use one data root:

```bash
cd viewer
DATA_DIR=../batch/fresh-review/merged-preview REVIEW_DIR=none bun run build:data
```

## Worked Examples

These examples are not intended to bless the current JSON. They illustrate how
the new process should reason from a specific finding.

### Revisit: Account.partOf Renamed To Account.parent

Source finding: `Account:ELEMENT_PRESENCE_OR_IDENTITY:Account.partOf:7a6a56`
in `output/Account.report.json`.

Change:

R4 `Account.partOf` was replaced by R6 `Account.parent`. The type, target, and
role appear substantially similar: a relationship from a child account to a
parent account.

FMM/status:

Account is trial-use, FMM 2. That is not a normative stability guarantee, but
it is not the very low FMM 0-1 case either. The review should mostly follow the
actual mechanism and tradeoff.

Compatibility mechanism:

This is an old-valid/new-invalid wire-format break. An R4 instance using
`partOf` has a property not defined by the R6 Account StructureDefinition.
Generated model properties, FHIRPath rules, database columns, and billing
roll-up logic may also refer to the old path.

Concrete use case:

A billing system stores account hierarchies for a guarantor account and
sub-accounts. During R6 migration, `partOf` does not deserialize into the R6
model, so roll-up calculations can lose the parent-child relationship unless a
transform is applied.

Less-breaking base design:

R6 could have retained `partOf` and clarified the definition to say "parent
Account." If `parent` was strongly preferred, R6 could have kept `partOf` as a
deprecated alias for one release. The alias version has duplicate-field risk,
but simply keeping the old name has modest long-term cost.

Judgment:

`Revisit`.

Rationale:

This looks primarily like a naming cleanup with a direct wire-format break.
Given FMM 2 and a plausible low-cost alternative, the change deserves renewed
review even if the practical migration is straightforward.

### Unclear: Bundle.entry.resource Parameters Context Text

Source finding:
`Bundle:SEMANTIC_OR_CONFORMANCE_TEXT:Bundle.entry.resource:parameters-context`
in `output/Bundle.report.json`.

Change:

R6 prose says a `Parameters` resource may appear in `Bundle.entry.resource` if
and only if it is referenced by something else within the Bundle. The computable
type did not change.

FMM/status:

Bundle is normative/FMM 5. Stability expectations are high, but the change is
prose rather than a clear invariant or type restriction.

Compatibility mechanism:

Potential semantic/conformance break. A validator that enforces the prose could
reject standalone `Parameters` entries, but ordinary structural validation may
not.

Concrete use case:

A workflow Bundle includes a standalone `Parameters` entry carrying operation
inputs or configuration. It may remain structurally valid but fail a stricter
R6 conformance review if the entry is not referenced by another Bundle entry.

Less-breaking base design:

Softer guidance, a warning-level invariant, or profile-specific rules could
discourage context-free `Parameters` entries without making the base prose
sound absolute. But without more evidence, it is hard to know whether R6 meant
this as enforceable conformance or explanatory guidance.

Judgment:

`Unclear`.

Rationale:

The affected artifact is mature, so the prose change deserves attention. But
the actual enforcement mechanism and intended R6 goal are ambiguous. The right
next step is to seek official rationale or validator behavior, not to assert
that this is definitely a design problem.

### Breaking But Probably OK: Observation.focus Becomes A Modifier

Source finding:
`Observation:FLAGS_AND_MODIFIERS:Observation.focus:9d13cc` in
`output/Observation.report.json`.

Change:

`Observation.focus` keeps its wire shape but becomes a modifier element.

FMM/status:

Observation is normative/FMM 5. Runtime behavior changes on this resource carry
a high burden of justification.

Compatibility mechanism:

Runtime and safety-significant behavior change. Existing instances are not
invalid solely because the flag changed, but R6 consumers must not safely ignore
`focus`.

Concrete use case:

A fetal Observation uses `subject` for the mother and `focus` for the fetus.
A client that ignores `focus` can incorrectly interpret the result as being
about the mother.

Less-breaking base design:

R6 could have added stronger prose or examples without setting the modifier
flag. That would be less disruptive, but it would not make the element
computably non-ignorable for generic clients.

Judgment:

`Breaking but probably OK`.

Rationale:

This is a real runtime break on normative content, but the safety goal is
strong and the less-breaking options do not meet the same computable goal.

### Breaking But Probably OK: MedicationRequest.medication Uses CodeableReference

Source finding:
`MedicationRequest:SERIALIZATION_OR_CODEGEN:MedicationRequest.medication:2f4a8c`
in `output/MedicationRequest.report.json`.

Change:

R4 `medicationCodeableConcept` and `medicationReference` are replaced by an R6
`medication` `CodeableReference`.

FMM/status:

MedicationRequest is trial-use/FMM 3. The artifact is mature enough that
compatibility matters, and medication identity is central to prescribing.

Compatibility mechanism:

Old-valid/new-invalid wire-format break plus generated-model break. R4 property
names are not the R6 shape. In reverse, an R6 `CodeableReference` may contain
both concept and reference, which R4 cannot represent as a single choice without
policy.

Concrete use case:

A prescribing client emits `medicationReference`. An R6 parser expecting
`medication.reference` rejects the payload until it is transformed.

Less-breaking base design:

R6 could have retained the old choice properties as deprecated aliases while
adding CodeableReference support. That would preserve many R4 instances, but it
creates duplicate central medication representations and conflict/precedence
rules when both old and new forms are populated.

Judgment:

`Breaking but probably OK`.

Rationale:

This is high migration burden on important content, but the R6 goal is coherent
and the alias alternative has material same-resource duplication risk.

### Breaking But Probably OK: ServiceRequest.asNeeded Split

Source finding: `ServiceRequest:ELEMENT_PRESENCE:asNeeded:6a411c` in
`output/ServiceRequest.report.json`.

Change:

R4 `asNeededBoolean` and `asNeededCodeableConcept` are split into R6
`asNeeded` and repeatable `asNeededFor`.

FMM/status:

ServiceRequest is trial-use/FMM 2. This is a neutral maturity context: neither
normative stability nor very-low-FMM flexibility should dominate.

Compatibility mechanism:

Old R4 property names break. Forward migration is usually mechanical, but
reverse migration can be lossy if R6 has multiple `asNeededFor` criteria.

Concrete use case:

A lab order says the service should be performed as needed for a coded
condition. Migration must move the code to `asNeededFor` and decide whether to
set the Boolean `asNeeded`.

Less-breaking base design:

R6 could have retained `asNeeded[x]` while adding the new fields. That would
help compatibility, but it duplicates Boolean/reason semantics and requires
rules when old and new fields disagree.

Judgment:

`Breaking but probably OK`.

Rationale:

This is a real path-level break, but it is narrow, mostly mechanically
migratable, and the R6 split improves the model enough that the duplicate-field
alternative has meaningful cost.

### No Problem: Observation.performer Warning-Level SHOULD

Source finding:
`Observation:SEMANTIC_OR_CONFORMANCE_TEXT:Observation.performer:fd8702` in
`output/Observation.report.json`.

Change:

R6 adds a warning-level expectation that Observations should have a performer.
The element remains optional.

FMM/status:

Observation is normative/FMM 5. This raises the need to look carefully, because
historical Observations without performer are likely common.

Compatibility mechanism:

Warning-level conformance pressure. Base instances remain valid, but
warning-as-error pipelines may fail.

Concrete use case:

A historical lab repository has many Observations without performer. An R6
quality gate configured to reject warnings blocks migration until provenance is
backfilled or the policy is changed.

Less-breaking base design:

R6 could have used prose-only guidance, but the warning is already the
compatibility-preserving alternative to raising cardinality. The base model
does not reject old instances.

Judgment:

`No problem`.

Rationale:

This is useful migration awareness and may affect local validation policy, but
it is not a base R4-to-R6 breaking design issue. Systems can choose how to
treat warnings.

### No Problem: Address.country ISO 3166 Clarification

Source finding:
`Address:SEMANTIC_OR_CONFORMANCE_TEXT:Address.country:iso3166:ab4d12` in
`output/Address.report.json`.

Change:

R6 explicitly permits ISO 3166 two- or three-letter country codes. The element
remains an unconstrained string.

FMM/status:

Address is normative. Maturity means the review should not dismiss text changes
automatically, but the actual compatibility mechanism still matters.

Compatibility mechanism:

Semantic clarification/local business-rule risk only. No base validator should
reject R4 country strings because of this change.

Concrete use case:

A UI validator that allowed only three-letter country codes receives `US` from
an R6 system. That is a local validation policy issue, not a base FHIR
old-valid/new-invalid break.

Less-breaking base design:

A formal required binding would improve consistency but would be more breaking,
not less. Keeping the string and clarifying text is already compatibility
preserving.

Judgment:

`No problem`.

Rationale:

Normative status does not turn a non-computable clarification into a material
breaking change.

### No Problem: OperationOutcome.issue.details Example Binding Canonical

Source finding:
`OperationOutcome:TERMINOLOGY_BINDING:OperationOutcome.issue.details:7ac1d1`
in `output/OperationOutcome.report.json`.

Change:

The example ValueSet canonical changes while `issue.details` remains an
optional `CodeableConcept` with example binding strength.

FMM/status:

OperationOutcome is normative/FMM 5.

Compatibility mechanism:

Metadata/tooling churn only for conformant systems. Example bindings do not
make base instances invalid.

Concrete use case:

A documentation generator or terminology metadata cache points to the old
example ValueSet URL and needs an update.

Less-breaking base design:

Keeping an alias for the old ValueSet canonical could reduce tooling churn, but
no R4-valid instance pattern needs preservation.

Judgment:

`No problem`.

Rationale:

Maturity alone does not raise metadata churn to a compatibility concern.
