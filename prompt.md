Below is a stronger replacement for the **output contract** section of the agent prompt. It keeps the report mergeable, but gives agents explicit room to write useful Markdown reasoning.

```text
Required output:
Return one JSON object conforming to the TypeScript interface below.

Important:
- The output object must be valid JSON, not TypeScript.
- Markdown-bearing fields should contain GitHub-flavored Markdown strings.
- Use the structured fields for scoring, filtering, aggregation, and de-duplication.
- Use the Markdown fields for expert judgement, nuance, evidence interpretation, migration reasoning, and “why this matters.”
- Do not put all useful reasoning only in the Markdown fields. The key classification, impact, confidence, and direction fields must still be populated structurally.
- Do not put large raw StructureDefinition excerpts in Markdown. Quote or summarize only the minimal evidence needed.
```

## TypeScript output contract

```ts
/**
 * Report produced by one agent for one FHIR resource or datatype.
 *
 * The report is intentionally hybrid:
 * - structured fields support downstream merging and dashboards;
 * - Markdown narrative fields preserve expert judgement and migration reasoning.
 */
export interface FhirBreakingChangeAssessmentReport {
  schemaVersion: "fhir-r4-r6-breaking-change-assessment/v1";

  artifactName: string;

  artifactKind: "resource" | "datatype" | "unknown";

  scope: AssessmentScope;

  oldArtifact: ArtifactIdentity;

  newArtifact: ArtifactIdentity;

  /**
   * A human-readable, standalone Markdown report.
   *
   * This should be good enough for a reviewer to read without inspecting
   * the structured fields. It may summarize and link to the detailed findings
   * by findingId.
   */
  narrativeReportMd: string;

  /**
   * Short summary fields intended for dashboards, reducers, and triage.
   */
  summary: AssessmentSummary;

  /**
   * Main finding list.
   *
   * Include hard breaking changes, likely breaking changes, runtime risks,
   * round-trip risks, semantic risks, and notable non-breaking changes.
   */
  findings: BreakingChangeFinding[];

  /**
   * Areas the agent explicitly checked and found to have no material change.
   * Useful because absence of findings is otherwise ambiguous.
   */
  checkedNoMaterialChange: CheckedArea[];

  /**
   * Notable changes that are probably not breaking but are still useful for
   * migration planning.
   */
  nonBreakingNotableChanges: NotableChange[];

  /**
   * Related artifacts or analyses that should be delegated to another agent.
   */
  followUpDependencies: FollowUpDependency[];

  /**
   * Warnings about limitations in the analysis.
   */
  analysisLimitations: AnalysisLimitation[];

  /**
   * Optional reducer hints for combining this report with reports from other agents.
   */
  reducerHints?: ReducerHints;
}

export interface AssessmentScope {
  /**
   * Exactly what was assigned to this agent.
   */
  assignedArtifact: string;

  /**
   * What the agent actually analyzed.
   */
  analyzedArtifact: string;

  /**
   * Version labels supplied to the agent, for example:
   * "FHIR R4 4.0.1" and "FHIR R6 6.0.0-ballot4".
   */
  oldVersionLabel: string;
  newVersionLabel: string;

  /**
   * Inputs available to the agent.
   */
  inputsUsed: AssessmentInput[];

  /**
   * Inputs that would have improved confidence but were absent.
   */
  missingInputs: MissingInput[];

  /**
   * Boundaries of this report.
   *
   * This should be Markdown because scope decisions are often subtle.
   */
  scopeNotesMd: string;

  /**
   * Explicitly out-of-scope topics, such as search parameters, operations,
   * profiles, IG rules, recursively referenced datatypes not supplied, or
   * inherited/base-artifact changes that will be assessed on the base
   * artifact itself.
   */
  outOfScope: string[];
}

export interface AssessmentInput {
  kind:
    | "oldStructureDefinition"
    | "newStructureDefinition"
    | "officialDiff"
    | "valueSet"
    | "codeSystem"
    | "terminologyExpansion"
    | "conceptMap"
    | "narrativeSpecPage"
    | "changeNote"
    | "jira"
    | "dependencyStructureDefinition"
    | "other";

  label: string;

  /**
   * Canonical URL, package coordinate, file name, or other identifier when known.
   */
  sourceRef?: string;

  version?: string;

  reliability: "primary" | "supporting" | "uncertain";
}

export interface MissingInput {
  kind:
    | "valueSet"
    | "codeSystem"
    | "terminologyExpansion"
    | "conceptMap"
    | "narrativeSpecPage"
    | "dependencyStructureDefinition"
    | "officialDiff"
    | "other";

  description: string;

  expectedImpactOnConfidence: "High" | "Medium" | "Low";
}

export interface ArtifactIdentity {
  url?: string;
  id?: string;
  name?: string;
  title?: string;
  version?: string;
  fhirVersion?: string;
  packageName?: string;
  packageVersion?: string;
  status?: string;
  kind?: string;
  type?: string;
  derivation?: string;
  baseDefinition?: string;
  abstract?: boolean;

  /**
   * Markdown note for identity concerns, such as possible rename, split,
   * merge, base-definition shift, maturity change, or unclear correspondence.
   */
  identityNotesMd?: string;
}

export interface AssessmentSummary {
  overallAssessment:
    | "No material breaking changes found"
    | "Breaking changes found"
    | "Potential breaking changes found"
    | "Mostly runtime or migration risks"
    | "Inconclusive";

  overallImpact: ImpactLevel;

  overallConfidence: ConfidenceLevel;

  hardInstanceBreakingCount: number;

  potentialHardInstanceBreakingCount: number;

  criticalOrHighRuntimeRiskCount: number;

  criticalOrHighR6ToR4RiskCount: number;

  requiresHumanReviewCount: number;

  localFindingCount: number;

  /**
   * Inherited/base-artifact findings should normally be excluded from
   * per-artifact reports and counted as 0. Use a non-zero value only if the
   * assignment explicitly asks for inherited findings.
   */
  inheritedFindingCount: number;

  /**
   * Short Markdown summary for humans.
   *
   * Recommended shape:
   * - one-sentence conclusion;
   * - top 3 migration concerns;
   * - top uncertainty.
   */
  executiveSummaryMd: string;

  /**
   * Markdown explanation of the main migration themes.
   */
  migrationThemesMd: string;

  /**
   * Markdown explanation of confidence.
   *
   * Include why confidence is high/medium/low and what evidence would change it.
   */
  confidenceSummaryMd: string;
}

export interface BreakingChangeFinding {
  /**
   * Stable, deterministic identifier.
   *
   * Suggested format:
   * <artifactName>:<category>:<oldPath-or-newPath-or-root>:<shortHash>
   */
  findingId: string;

  title: string;

  category: ChangeCategory;

  /**
   * Required when category is OTHER.
   */
  otherCategoryExplanation?: string;

  affectedLocation: AffectedLocation;

  inheritedOrLocal: "local" | "inherited" | "unknown";

  changeNature:
    | "added"
    | "removed"
    | "renamed"
    | "moved"
    | "split"
    | "merged"
    | "narrowed"
    | "widened"
    | "strengthened"
    | "weakened"
    | "semantic-change"
    | "representation-change"
    | "constraint-change"
    | "terminology-change"
    | "modifier-change"
    | "unknown"
    | "other";

  oldState: StateDescription;

  newState: StateDescription;

  structuredDelta: StructuredDelta;

  /**
   * Core machine-readable impact assessment.
   */
  impact: ImpactAssessment;

  /**
   * Core machine-readable judgement on whether the change appears justified
   * and whether a backward-compatible alternative was available.
   */
  justification: JustificationAssessment;

  /**
   * Evidence used for the finding.
   */
  evidence: EvidenceItem[];

  /**
   * Concrete examples, where useful.
   */
  examples: ExampleSet;

  /**
   * Human-facing narrative.
   *
   * Agents should lean into this field. Explain what changed, why it matters,
   * how an implementer would experience it, and any ambiguity.
   */
  narrativeMd: string;

  /**
   * Markdown explanation of the validation effect.
   *
   * This should distinguish:
   * - old-valid/new-invalid;
   * - still-valid-but-behaviorally-different;
   * - R6-valid/not-R4-representable.
   */
  validationAndCompatibilityMd: string;

  /**
   * Markdown migration guidance.
   *
   * Include likely remediation steps, transform notes, testing advice,
   * and whether a ConceptMap, cross-version extension, profile, or manual
   * review is likely needed.
   */
  migrationGuidanceMd: string;

  /**
   * Markdown explanation of the backward-compatible alternative analysis.
   *
   * This is where the agent should reason about whether the same goal could
   * have been achieved less disruptively.
   */
  backwardCompatibilityAnalysisMd: string;

  /**
   * Markdown notes for reviewers.
   *
   * Use this for ambiguities, terminology-expansion caveats, suspected renames,
   * safety concerns, or places where human judgement is especially important.
   */
  reviewerNotesMd?: string;

  requiresHumanReview: boolean;
}

export type ChangeCategory =
  | "ARTIFACT_IDENTITY"
  | "ELEMENT_PRESENCE_OR_IDENTITY"
  | "CARDINALITY"
  | "TYPE_DOMAIN"
  | "REFERENCE_TARGET"
  | "TERMINOLOGY_BINDING"
  | "VALUE_CONSTRAINT"
  | "FLAGS_AND_MODIFIERS"
  | "SLICING_AND_CONTENT_MODEL"
  | "SEMANTIC_OR_CONFORMANCE_TEXT"
  | "SERIALIZATION_OR_CODEGEN"
  | "CONVERSION_OR_MAPPING"
  | "OTHER";

export interface AffectedLocation {
  oldPath?: string;
  newPath?: string;

  /**
   * ElementDefinition.id values when known.
   */
  oldElementId?: string;
  newElementId?: string;

  /**
   * Parent path, useful for moved/renamed elements and slices.
   */
  parentPath?: string;

  /**
   * For choice elements such as value[x], onset[x], asOf[x].
   */
  choiceBasePath?: string;

  /**
   * Slice name if relevant.
   */
  oldSliceName?: string;
  newSliceName?: string;

  /**
   * Root-level artifact finding rather than element-level finding.
   */
  isRootLevelFinding?: boolean;
}

export interface StateDescription {
  /**
   * Short structured summary.
   */
  summary: string;

  cardinality?: Cardinality;

  types?: TypeRef[];

  binding?: BindingRef;

  constraints?: ConstraintRef[];

  flags?: ElementFlags;

  slicing?: SlicingRef;

  fixedOrPattern?: FixedOrPatternRef;

  valueLimits?: ValueLimitRef;

  semanticText?: SemanticTextRef;

  /**
   * Markdown prose describing the old or new state.
   */
  narrativeMd?: string;
}

export interface Cardinality {
  min?: number;
  max?: string; // "1", "*", "0", etc.
}

export interface TypeRef {
  code: string;
  profiles?: string[];
  targetProfiles?: string[];
  aggregation?: string[];
  versioning?: string;
}

export interface BindingRef {
  strength?: "required" | "extensible" | "preferred" | "example" | string;
  valueSet?: string;
  description?: string;

  /**
   * Summary of terminology comparison, if available.
   */
  terminologyComparison?: TerminologyComparison;
}

export interface TerminologyComparison {
  expansionCompared: boolean;

  removedCodes?: CodeRef[];

  addedCodes?: CodeRef[];

  changedCodes?: ChangedCodeRef[];

  /**
   * Markdown explanation because terminology impact often needs nuance.
   */
  terminologyNotesMd?: string;
}

export interface CodeRef {
  system?: string;
  code: string;
  display?: string;
}

export interface ChangedCodeRef {
  code: CodeRef;
  oldMeaning?: string;
  newMeaning?: string;
  changeSummary: string;
}

export interface ConstraintRef {
  key?: string;
  severity?: "error" | "warning" | string;
  expression?: string;
  human?: string;
  source?: string;
}

export interface ElementFlags {
  mustSupport?: boolean;
  isModifier?: boolean;
  isModifierReason?: string;
  isSummary?: boolean;
}

export interface SlicingRef {
  sliceName?: string;
  discriminator?: unknown;
  ordered?: boolean;
  rules?: string;
  description?: string;
}

export interface FixedOrPatternRef {
  kind: "fixed" | "pattern" | "defaultValue";
  typeName?: string;
  valueSummary: string;
}

export interface ValueLimitRef {
  minValue?: string;
  maxValue?: string;
  maxLength?: number;
  regex?: string;
}

export interface SemanticTextRef {
  short?: string;
  definition?: string;
  comment?: string;
  requirements?: string;
  meaningWhenMissing?: string;
  alias?: string[];
}

export interface StructuredDelta {
  /**
   * Highly structured delta type for filtering.
   */
  deltaKind:
    | "artifact-identity-changed"
    | "element-added"
    | "element-removed"
    | "element-renamed"
    | "element-moved"
    | "cardinality-min-increased"
    | "cardinality-min-decreased"
    | "cardinality-max-increased"
    | "cardinality-max-decreased"
    | "type-added"
    | "type-removed"
    | "type-replaced"
    | "reference-target-added"
    | "reference-target-removed"
    | "reference-target-replaced"
    | "binding-strength-increased"
    | "binding-strength-decreased"
    | "value-set-changed"
    | "code-added"
    | "code-removed"
    | "constraint-added"
    | "constraint-removed"
    | "constraint-changed"
    | "fixed-or-pattern-added"
    | "fixed-or-pattern-removed"
    | "fixed-or-pattern-changed"
    | "modifier-flag-changed"
    | "summary-flag-changed"
    | "slicing-changed"
    | "semantic-text-changed"
    | "serialization-changed"
    | "r6-not-representable-in-r4"
    | "other";

  /**
   * Compact structured facts about what changed.
   */
  facts: DeltaFact[];

  /**
   * For uncertain rename/move/split/merge detection.
   */
  matchConfidence?: ConfidenceLevel;

  /**
   * Markdown explanation of how the old and new elements were matched.
   */
  matchingRationaleMd?: string;
}

export interface DeltaFact {
  field: string;
  oldValue?: unknown;
  newValue?: unknown;
  note?: string;
}

export interface ImpactAssessment {
  hardInstanceBreaking: "Yes" | "No" | "Potential" | "Unknown";

  runtimeBreakingRisk: ImpactLevel;

  r6ToR4RepresentabilityRisk:
    | ImpactLevel
    | "Not applicable";

  overallImpact: ImpactLevel;

  affectedDirection:
    | "R4-to-R6"
    | "R6-to-R4"
    | "Both"
    | "Runtime only"
    | "Unknown";

  confidence: ConfidenceLevel;

  /**
   * Why this impact score was chosen.
   *
   * Use Markdown because the rationale may involve validation, semantics,
   * terminology, and implementation behavior.
   */
  impactRationaleMd: string;

  /**
   * Whether common real-world instances are likely affected.
   */
  expectedPrevalence:
    | "Common"
    | "Occasional"
    | "Rare"
    | "Unknown"
    | "Not applicable";

  /**
   * Safety or clinical/business risk, if relevant.
   */
  safetyOrBusinessRisk:
    | "Critical"
    | "High"
    | "Medium"
    | "Low"
    | "None identified"
    | "Unknown";

  safetyOrBusinessRiskMd?: string;
}

export type ImpactLevel =
  | "Critical"
  | "High"
  | "Medium"
  | "Low"
  | "Info";

export type ConfidenceLevel =
  | "High"
  | "Medium"
  | "Low"
  | "Unknown";

export interface JustificationAssessment {
  justificationVerdict:
    | "Justified"
    | "Probably justified"
    | "Not clearly justified"
    | "Probably avoidable"
    | "Cannot assess";

  backwardCompatibleAlternativeAvailable:
    | "Yes"
    | "No"
    | "Partial"
    | "Not applicable"
    | "Unknown";

  /**
   * The likely goal of the change, inferred from available evidence.
   */
  inferredGoal?: string;

  /**
   * Short structured summary of the best alternative.
   */
  backwardCompatibleAlternativeSummary?: string;

  /**
   * Markdown explanation of whether the change seems justified.
   */
  justificationRationaleMd: string;

  /**
   * Markdown explanation of the best backward-compatible alternative,
   * including tradeoffs.
   */
  backwardCompatibleAlternativeMd?: string;

  /**
   * Tradeoff summary for dashboards.
   */
  alternativeTradeoffSummary?: string;
}

export interface EvidenceItem {
  source:
    | "oldStructureDefinition"
    | "newStructureDefinition"
    | "officialDiff"
    | "terminology"
    | "narrative"
    | "dependencyStructureDefinition"
    | "inferred"
    | "other";

  sourceRef?: string;

  /**
   * ElementDefinition path, JSON pointer, section label, or other locator.
   */
  locator?: string;

  /**
   * Short evidence summary.
   */
  detail: string;

  /**
   * Optional small quoted value. Avoid long excerpts.
   */
  quote?: string;

  confidence: ConfidenceLevel;
}

export interface ExampleSet {
  /**
   * Example of an R4 instance fragment that was valid in R4 but would be
   * invalid or problematic in R6.
   */
  oldValidNewInvalidJson?: unknown;

  /**
   * Example of an R6 instance fragment that is not cleanly representable in R4.
   */
  r6NotRepresentableInR4Json?: unknown;

  /**
   * Example migration or transform fragment.
   */
  migrationExampleJson?: unknown;

  /**
   * Markdown explanation of examples, especially if they are illustrative
   * rather than formally validated.
   */
  examplesMd?: string;
}

export interface CheckedArea {
  area:
    | "artifactIdentity"
    | "elementPresence"
    | "cardinality"
    | "types"
    | "referenceTargets"
    | "bindings"
    | "constraints"
    | "fixedPatternDefault"
    | "valueLimits"
    | "modifierFlags"
    | "summaryFlags"
    | "slicing"
    | "semanticText"
    | "serialization"
    | "r6ToR4Representability"
    | "other";

  result: "No material change found" | "Checked with limitations";

  confidence: ConfidenceLevel;

  notesMd?: string;
}

export interface NotableChange {
  changeId: string;

  category: ChangeCategory;

  path?: string;

  title: string;

  whyNotBreakingMd: string;

  migrationAwarenessMd?: string;

  confidence: ConfidenceLevel;
}

export interface FollowUpDependency {
  dependencyId: string;

  kind:
    | "datatype"
    | "resource"
    | "ValueSet"
    | "CodeSystem"
    | "ConceptMap"
    | "SearchParameter"
    | "OperationDefinition"
    | "CapabilityStatement"
    | "profile"
    | "implementationGuide"
    | "other";

  nameOrUrl: string;

  reasonMd: string;

  priority: "High" | "Medium" | "Low";
}

export interface AnalysisLimitation {
  limitationId: string;

  severity: "High" | "Medium" | "Low";

  descriptionMd: string;

  affectedFindings?: string[];

  whatWouldResolveItMd?: string;
}

export interface ReducerHints {
  /**
   * Legacy escape hatch only. Per-artifact agents should not emit findings
   * for base Element/Resource/DomainResource/DataType/BackboneElement changes;
   * those changes should be handled by the agent assigned to the base artifact.
   */
  possibleDuplicateBaseFindings?: PossibleDuplicateBaseFinding[];

  /**
   * Suggested grouping labels for final migration backlog.
   */
  suggestedMigrationBacklogGroups?: string[];

  /**
   * Paths or categories that deserve cross-artifact comparison.
   */
  crossArtifactPatternsToCheck?: string[];
}

export interface PossibleDuplicateBaseFinding {
  findingId: string;
  suspectedBaseArtifact:
    | "Element"
    | "BackboneElement"
    | "Resource"
    | "DomainResource"
    | "BackboneType"
    | "DataType"
    | string;

  rationaleMd: string;
}
```

## Revised prompt section for the agent

```text
Output requirements:

Return a single JSON object conforming to the TypeScript interface
`FhirBreakingChangeAssessmentReport`.

The output should be hybrid: structured enough to merge across many agents, but rich enough for human review.

Scope rule for inherited/base-artifact changes:
- Analyze the assigned artifact's own StructureDefinition and local element changes.
- Do not create `findings[]` entries for changes inherited only from base artifacts such as `Element`, `BackboneElement`, `DataType`, `BackboneType`, `Resource`, or `DomainResource`.
- Do not treat a base-definition/class hierarchy change as a local finding for derived resources or datatypes. Global class hierarchy shifts, such as datatype roots moving through `DataType`, belong in the relevant base/infrastructure artifact report.
- Put inherited/base-artifact changes in `scope.outOfScope` and, if they materially affect interpretation of the assigned artifact, add a brief `followUpDependencies[]` item pointing to the base artifact report.
- Set `summary.inheritedFindingCount` to `0` unless the assignment explicitly asks for inherited findings.
- Avoid using `reducerHints.possibleDuplicateBaseFindings` for normal reports; it is only a fallback for unusual cases where a duplicate was discovered after analysis.

Use structured fields for:
- finding identity
- category
- paths
- old state
- new state
- delta kind
- hard instance-breaking status
- runtime risk
- R6-to-R4 representability risk
- impact
- confidence
- justification verdict
- backward-compatible alternative availability
- human-review flag

Use Markdown narrative fields for:
- explaining what changed in human terms
- explaining why the change matters
- describing edge cases and ambiguity
- explaining semantic/conformance implications
- explaining migration strategy
- judging whether the change was justified
- describing backward-compatible alternatives and their tradeoffs
- noting uncertainty or missing evidence

Justification and backward-compatible alternative calibration:
- Treat `justificationVerdict` as the combined assessment of whether the inferred R6 goal is reasonable and whether it was reasonable to accomplish that goal with this level of breakage.
- Use `backwardCompatibleAlternativeAvailable` as a compact judgment about whether the same goal could have been met with a less-breaking base R6 design:
  - `Yes`: a plausible less-breaking design would preserve most or all R4-valid instances while still meeting the core R6 goal with low or moderate long-term tradeoff.
  - `Partial`: a less-breaking design exists but is incomplete, only covers common cases, or has material tradeoffs such as duplicate same-resource representations, validation ambiguity, safety risk, implementation burden, or interoperability cost.
  - `No`: no plausible less-breaking base design was identified.
  - `Not applicable`: the finding is not a breaking R4-to-R6 base-design issue, such as additive optional R6 content, target/type widening that preserves R4 instances, or a pure R6-to-R4 down-conversion concern.
  - `Unknown`: evidence is insufficient.
- Do not count ordinary migration guidance, conversion tooling, or an R6-to-R4 extension/backport workaround as `Yes`; those are mitigations, not base-design alternatives.
- Living with a nonoptimal R4 name can be a legitimate way to avoid breakage. If retaining the old name/shape plus clearer definitions, broader targets/types, or profile guidance meets the R6 goal, treat that as a serious alternative.
- Duplication is not forbidden, but it must be weighed. If the less-breaking design keeps an old same-resource field and adds a new same-resource field/choice/backbone for the same fact, explain the risk that deprecated representations may never disappear and may accumulate indefinitely.
- Put the quality and tradeoffs of the alternative in `backwardCompatibleAlternativeSummary`, `alternativeTradeoffSummary`, and `backwardCompatibleAlternativeMd`; do not invent extra structured fields.
- If `backwardCompatibleAlternativeAvailable` is `Yes`, `justificationVerdict` should usually be `Not clearly justified` or `Probably avoidable` unless the rationale explains why the less-breaking design would fail the goal.
- If `backwardCompatibleAlternativeAvailable` is `Partial`, `Probably justified` may be appropriate only when the tradeoffs are material and clearly explained.
- A `Justified` verdict with a `Yes` or `Partial` alternative should be rare and must explicitly explain why the breaking design was still necessary.

Required Markdown fields:
- `narrativeReportMd`
- `scope.scopeNotesMd`
- `summary.executiveSummaryMd`
- `summary.migrationThemesMd`
- `summary.confidenceSummaryMd`
- `findings[].narrativeMd`
- `findings[].validationAndCompatibilityMd`
- `findings[].migrationGuidanceMd`
- `findings[].backwardCompatibilityAnalysisMd`
- `findings[].impact.impactRationaleMd`
- `findings[].justification.justificationRationaleMd`

Recommended shape for `narrativeReportMd`:

# <artifactName> R4→R6 breaking-change assessment

## Bottom line
A concise judgement of whether this artifact has hard breaking changes, mostly runtime risks, mostly round-trip risks, or no material issues.

## Scope
Explain exactly what was analyzed and what was not.

## Main migration themes
Summarize the most important patterns across findings.

## Highest-impact findings
Summarize Critical and High findings first.

## Findings requiring human review
Explain where confidence is limited and why.

## Backward-compatible design observations
Summarize whether the breaking changes appear justified or avoidable.

## Follow-up analysis
List related artifacts, terminology, profiles, or operations that should be analyzed separately.

Finding-level Markdown guidance:

For every `findings[]` item, write `narrativeMd` as a short but substantive explanation, not just a restatement of fields.

A good `narrativeMd` answers:
- What changed?
- What old implementation or instance pattern is affected?
- Is this a validation break, runtime break, semantic break, round-trip problem, or only a migration note?
- Why might this surprise implementers?
- What is the practical consequence?

A good `validationAndCompatibilityMd` answers:
- Can an R4-valid instance become invalid in R6?
- Can valid R6 content be represented in R4?
- Does the change affect strict parsers, generated classes, schemas, FHIRPath, enum switches, or business rules?
- Is the risk common, rare, or unknown?

A good `migrationGuidanceMd` answers:
- What should implementers change?
- Is a transform needed?
- Is the transform lossless?
- Should systems use extensions, ConceptMaps, profile-specific rules, or manual review?
- What should be tested?

A good `backwardCompatibilityAnalysisMd` answers:
- Was the breaking change probably necessary?
- What goal was it trying to achieve?
- Could the same goal have been achieved by adding an optional element, deprecating an old element, preserving an old code, adding a choice type, using a profile, using a warning invariant, or using a cross-version extension?
- What are the tradeoffs of that alternative?

Do not leave Markdown fields empty unless the field is optional.
Do not use vague phrases like “may be breaking” without explaining the mechanism.
Do not overstate confidence when terminology expansions, narrative text, or dependency StructureDefinitions are missing.
```

## Small example of the desired style

```json
{
  "findingId": "ExampleResource:CARDINALITY:ExampleResource.foo:9d31ab",
  "title": "ExampleResource.foo minimum cardinality increased from 0 to 1",
  "category": "CARDINALITY",
  "affectedLocation": {
    "oldPath": "ExampleResource.foo",
    "newPath": "ExampleResource.foo",
    "oldElementId": "ExampleResource.foo",
    "newElementId": "ExampleResource.foo"
  },
  "inheritedOrLocal": "local",
  "changeNature": "strengthened",
  "oldState": {
    "summary": "Element was optional.",
    "cardinality": {
      "min": 0,
      "max": "1"
    },
    "narrativeMd": "`ExampleResource.foo` could be omitted in R4."
  },
  "newState": {
    "summary": "Element is now mandatory.",
    "cardinality": {
      "min": 1,
      "max": "1"
    },
    "narrativeMd": "`ExampleResource.foo` must be present in R6."
  },
  "structuredDelta": {
    "deltaKind": "cardinality-min-increased",
    "facts": [
      {
        "field": "min",
        "oldValue": 0,
        "newValue": 1
      }
    ]
  },
  "impact": {
    "hardInstanceBreaking": "Yes",
    "runtimeBreakingRisk": "High",
    "r6ToR4RepresentabilityRisk": "Info",
    "overallImpact": "High",
    "affectedDirection": "R4-to-R6",
    "confidence": "High",
    "impactRationaleMd": "This is a direct validation break: an R4 instance that omits `foo` can be valid in R4 but invalid in R6. Runtime impact is also high for systems that generated optional fields in R4 and must now populate or validate the field.",
    "expectedPrevalence": "Unknown",
    "safetyOrBusinessRisk": "Unknown"
  },
  "justification": {
    "justificationVerdict": "Cannot assess",
    "backwardCompatibleAlternativeAvailable": "Partial",
    "inferredGoal": "Require data that the R6 model treats as essential.",
    "backwardCompatibleAlternativeSummary": "Keep the base element optional and enforce requiredness in an R6 profile.",
    "justificationRationaleMd": "The computable definitions show the cardinality change, but the supplied inputs do not explain why the base resource needed a stronger requirement.",
    "backwardCompatibleAlternativeMd": "A less-breaking alternative would be to keep `foo` optional in the base artifact and introduce a profile or best-practice invariant requiring it where needed. The tradeoff is weaker uniformity across all R6 implementations."
  },
  "evidence": [
    {
      "source": "oldStructureDefinition",
      "locator": "snapshot.element[id=ExampleResource.foo].min",
      "detail": "R4 min cardinality is 0.",
      "confidence": "High"
    },
    {
      "source": "newStructureDefinition",
      "locator": "snapshot.element[id=ExampleResource.foo].min",
      "detail": "R6 min cardinality is 1.",
      "confidence": "High"
    }
  ],
  "examples": {
    "oldValidNewInvalidJson": {
      "resourceType": "ExampleResource"
    },
    "examplesMd": "The example is illustrative: it shows the relevant omission, not a complete valid resource."
  },
  "narrativeMd": "`ExampleResource.foo` changed from optional to mandatory. This is one of the clearest hard breaking patterns because existing R4 data may simply not contain the element. Implementers need either a deterministic way to populate it during migration or a policy for rejecting incomplete historical records.",
  "validationAndCompatibilityMd": "An R4 instance without `foo` can become invalid in R6. This primarily affects R4→R6 validation and migration. It does not create a major R6→R4 representability problem because R4 can still carry the element if present.",
  "migrationGuidanceMd": "Migration should identify records missing `foo`, determine whether the value can be derived, and decide whether to backfill, quarantine, or map through a profile-specific exception. Test fixtures should include omitted, present-valid, and present-invalid cases.",
  "backwardCompatibilityAnalysisMd": "This could have been made less disruptive by keeping the base cardinality at `0..1` and requiring the element in a profile, implementation guide, or best-practice warning. That alternative preserves old data but weakens the guarantee that all base R6 instances contain the field.",
  "requiresHumanReview": true
}
```
