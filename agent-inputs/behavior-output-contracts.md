# Auxiliary Behavior Output Contracts

These contracts are for reports that analyze FHIR behavior outside the resource
and datatype data model itself. They intentionally do not reuse
`FhirBreakingChangeAssessmentReport` from `prompt.md`.

Each auxiliary report must return exactly one valid JSON object. Markdown-bearing
fields may contain GitHub-flavored Markdown strings.

## Shared Types

```ts
export type ImpactLevel = "Critical" | "High" | "Medium" | "Low" | "Info";
export type ConfidenceLevel = "High" | "Medium" | "Low" | "Unknown";

export type BehaviorReviewJudgment =
  | "Revisit"
  | "Unclear"
  | "Breaking but probably OK"
  | "No problem";

export type BehaviorCompatibilityMechanism =
  | "old-valid-new-invalid"
  | "runtime-api-codegen"
  | "warning-level-conformance"
  | "semantic-or-documentation"
  | "metadata-tooling"
  | "none"
  | "unknown";

export type BehaviorAlternativeJudgment =
  | "Yes"
  | "Partial"
  | "No"
  | "Not applicable"
  | "Unknown";

export interface PublishedPageRef {
  label: string;
  r4Url: string;
  r6Url: string;
  whyReview: string;
  priority: "High" | "Medium" | "Low";
}

export interface LocalInputRef {
  kind:
    | "SearchParameter"
    | "OperationDefinition"
    | "CapabilityStatement"
    | "StructureDefinition"
    | "ValueSet"
    | "CodeSystem"
    | "ConceptMap"
    | "packageMetadata"
    | "packageIndex"
    | "other";
  pathOrGlob: string;
  purpose: string;
}

export interface BehaviorReportScope {
  assignedBehavior: string;
  oldVersionLabel: "FHIR R4 4.0.1";
  newVersionLabel: "FHIR R6 6.0.0-ballot4";
  localInputsUsed: LocalInputRef[];
  publishedPagesReviewed: PublishedPageRef[];
  scopeNotesMd: string;
  outOfScope: string[];
}

export interface BehaviorSummary {
  overallAssessment:
    | "No material behavior changes found"
    | "Breaking behavior changes found"
    | "Potential breaking behavior changes found"
    | "Mostly runtime or conformance risks"
    | "Mostly additive behavior"
    | "Inconclusive";
  overallImpact: ImpactLevel;
  overallConfidence: ConfidenceLevel;
  breakingChangeCount: number;
  potentialBreakingChangeCount: number;
  runtimeRiskCount: number;
  conformanceRiskCount: number;
  requiresHumanReviewCount: number;
  executiveSummaryMd: string;
  migrationThemesMd: string;
  confidenceSummaryMd: string;
}

export interface BehaviorEvidence {
  source:
    | "r4Package"
    | "r6Package"
    | "r4PublishedPage"
    | "r6PublishedPage"
    | "computedInventory"
    | "inferred"
    | "other";
  locator: string;
  detail: string;
  quote?: string;
  confidence: ConfidenceLevel;
}

export interface BehaviorImpact {
  runtimeBreakingRisk: ImpactLevel;
  conformanceRisk: ImpactLevel;
  /**
   * Deprecated for this R4→R6 behavior round. Always set to
   * "Not applicable"; do not use reverse R6→R4 loss to justify a finding.
   */
  r6ToR4RepresentabilityRisk: ImpactLevel | "Not applicable";
  affectedDirection: "R4-to-R6" | "Runtime only" | "Unknown";
  expectedPrevalence: "Common" | "Occasional" | "Rare" | "Unknown" | "Not applicable";
  confidence: ConfidenceLevel;
  impactRationaleMd: string;
}

export interface BehaviorFreshReview {
  /**
   * Final action judgment for this specific behavior finding.
   *
   * This is intentionally not a restatement of overallImpact. For R4→R6
   * analysis, FMM and standards status mean the R4 baseline artifact being
   * changed or removed. R6 maturity may be mentioned in prose as future-version
   * context, but it must not raise the compatibility burden for R4 consumers.
   */
  judgment: BehaviorReviewJudgment;

  compatibilityMechanism: BehaviorCompatibilityMechanism;

  fmmContext: {
    /**
     * R4 baseline FMM/status for the artifact whose R4 behavior is changed.
     * If there is no R4 predecessor, omit these values and explain that there
     * is no R4 maturity baseline for compatibility pressure.
     */
    fmm?: number;
    standardsStatus?: string;
    source: string;
    effect:
      | "Raises burden of justification"
      | "Neutral"
      | "Softens stability concern"
      | "Unknown";
    rationaleMd: string;
  };

  /**
   * One concrete implementation or exchange scenario that would encounter
   * this behavior change. Keep it short and specific.
   */
  realWorldScenarioMd: string;

  lessBreakingAlternative: {
    judgment: BehaviorAlternativeJudgment;
    candidateDesignMd?: string;
    tradeoffsOrReasonMd?: string;
  };

  /**
   * Concise rationale for the final judgment after considering actual
   * behavior, FMM/status, prevalence, and alternative designs.
   */
  rationaleMd: string;
}

export interface BehaviorLimitation {
  limitationId: string;
  severity: "High" | "Medium" | "Low";
  descriptionMd: string;
  whatWouldResolveItMd?: string;
}

export interface BehaviorFollowUp {
  dependencyId: string;
  kind:
    | "resource"
    | "datatype"
    | "SearchParameter"
    | "OperationDefinition"
    | "CapabilityStatement"
    | "ValueSet"
    | "CodeSystem"
    | "ConceptMap"
    | "narrativePage"
    | "other";
  nameOrUrl: string;
  reasonMd: string;
  priority: "High" | "Medium" | "Low";
}

export interface CheckedBehaviorArea {
  area: string;
  result: "No material change found" | "Checked with limitations";
  confidence: ConfidenceLevel;
  notesMd?: string;
}
```

## Search Behavior Report

```ts
export interface FhirSearchBehaviorReport {
  schemaVersion: "fhir-r4-r6-search-behavior/v1";
  behaviorName: "SearchParameters";
  scope: BehaviorReportScope;
  narrativeReportMd: string;
  summary: BehaviorSummary;
  inventorySummary: SearchInventorySummary;
  findings: SearchBehaviorFinding[];
  checkedNoMaterialChange: CheckedBehaviorArea[];
  nonBreakingNotableChanges: SearchNotableChange[];
  followUpDependencies: BehaviorFollowUp[];
  analysisLimitations: BehaviorLimitation[];
}

export interface SearchInventorySummary {
  r4SearchParameterCount: number;
  r6SearchParameterCount: number;
  matchMethodCounts: Record<string, number>;
  removedCount: number;
  addedCount: number;
  changedCount: number;
  likelyRenameOrReplacementCount: number;
  inventoryNotesMd: string;
}

export interface SearchBehaviorFinding {
  findingId: string;
  title: string;
  behaviorCategory:
    | "search-parameter-removed"
    | "search-parameter-added"
    | "search-parameter-renamed"
    | "search-parameter-replaced"
    | "base-scope-changed"
    | "expression-changed"
    | "type-changed"
    | "target-changed"
    | "comparator-changed"
    | "modifier-changed"
    | "chain-changed"
    | "composite-component-changed"
    | "multiple-and-or-changed"
    | "processing-mode-changed"
    | "semantic-text-changed"
    | "other";
  oldSearchParameter?: SearchParameterIdentity;
  newSearchParameter?: SearchParameterIdentity;
  affectedResources: string[];
  changedFields: SearchFieldDelta[];
  matchRationaleMd: string;
  impact: BehaviorImpact;
  freshReview: BehaviorFreshReview;
  evidence: BehaviorEvidence[];
  runtimeMechanismMd: string;
  migrationGuidanceMd: string;
  backwardCompatibilityAnalysisMd: string;
  requiresHumanReview: boolean;
}

export interface SearchParameterIdentity {
  id?: string;
  url?: string;
  code?: string;
  base?: string[];
  type?: string;
  sourceFile?: string;
}

export interface SearchFieldDelta {
  field: string;
  oldValue?: unknown;
  newValue?: unknown;
  note?: string;
}

export interface SearchNotableChange {
  changeId: string;
  title: string;
  searchParameter?: SearchParameterIdentity;
  whyNotBreakingMd: string;
  migrationAwarenessMd?: string;
  confidence: ConfidenceLevel;
}
```

## Operation Behavior Report

```ts
export interface FhirOperationBehaviorReport {
  schemaVersion: "fhir-r4-r6-operation-behavior/v1";
  behaviorName: "OperationDefinitions";
  scope: BehaviorReportScope;
  narrativeReportMd: string;
  summary: BehaviorSummary;
  inventorySummary: OperationInventorySummary;
  findings: OperationBehaviorFinding[];
  checkedNoMaterialChange: CheckedBehaviorArea[];
  nonBreakingNotableChanges: OperationNotableChange[];
  followUpDependencies: BehaviorFollowUp[];
  analysisLimitations: BehaviorLimitation[];
}

export interface OperationInventorySummary {
  r4OperationDefinitionCount: number;
  r6OperationDefinitionCount: number;
  matchMethodCounts: Record<string, number>;
  removedCount: number;
  addedCount: number;
  changedCount: number;
  likelyRenameOrReplacementCount: number;
  inventoryNotesMd: string;
}

export interface OperationBehaviorFinding {
  findingId: string;
  title: string;
  behaviorCategory:
    | "operation-removed"
    | "operation-added"
    | "operation-renamed"
    | "operation-replaced"
    | "invocation-context-changed"
    | "affects-state-changed"
    | "input-parameter-requiredness-changed"
    | "input-parameter-type-changed"
    | "output-parameter-shape-changed"
    | "parameter-binding-changed"
    | "parameter-profile-changed"
    | "capability-advertisement-changed"
    | "semantic-text-changed"
    | "other";
  oldOperation?: OperationIdentity;
  newOperation?: OperationIdentity;
  affectedResources: string[];
  changedFields: OperationFieldDelta[];
  parameterDeltas: OperationParameterDelta[];
  matchRationaleMd: string;
  impact: BehaviorImpact;
  freshReview: BehaviorFreshReview;
  evidence: BehaviorEvidence[];
  runtimeMechanismMd: string;
  migrationGuidanceMd: string;
  backwardCompatibilityAnalysisMd: string;
  requiresHumanReview: boolean;
}

export interface OperationIdentity {
  id?: string;
  url?: string;
  code?: string;
  name?: string;
  system?: boolean;
  type?: boolean;
  instance?: boolean;
  sourceFile?: string;
}

export interface OperationFieldDelta {
  field: string;
  oldValue?: unknown;
  newValue?: unknown;
  note?: string;
}

export interface OperationParameterDelta {
  name: string;
  use?: "in" | "out";
  path?: string;
  changeKind:
    | "added"
    | "removed"
    | "requiredness-changed"
    | "cardinality-changed"
    | "type-changed"
    | "target-profile-changed"
    | "binding-changed"
    | "part-shape-changed"
    | "documentation-changed"
    | "other";
  oldValue?: unknown;
  newValue?: unknown;
  impactMd: string;
}

export interface OperationNotableChange {
  changeId: string;
  title: string;
  operation?: OperationIdentity;
  whyNotBreakingMd: string;
  migrationAwarenessMd?: string;
  confidence: ConfidenceLevel;
}
```

## HTTP/REST Behavior Report

```ts
export interface FhirHttpRestBehaviorReport {
  schemaVersion: "fhir-r4-r6-http-rest-behavior/v1";
  behaviorName: "HttpRestBehavior";
  scope: BehaviorReportScope;
  narrativeReportMd: string;
  summary: BehaviorSummary;
  inventorySummary: HttpRestInventorySummary;
  findings: HttpRestBehaviorFinding[];
  checkedNoMaterialChange: CheckedBehaviorArea[];
  nonBreakingNotableChanges: HttpRestNotableChange[];
  followUpDependencies: BehaviorFollowUp[];
  analysisLimitations: BehaviorLimitation[];
}

export interface HttpRestInventorySummary {
  r4CapabilityStatementCount: number;
  r6CapabilityStatementCount: number;
  r4BaseResourceCountAdvertised?: number;
  r6BaseResourceCountAdvertised?: number;
  comparedCapabilityStatements: string[];
  comparedInteractionCodes: string[];
  inventoryNotesMd: string;
}

export interface HttpRestBehaviorFinding {
  findingId: string;
  title: string;
  behaviorCategory:
    | "system-interaction-changed"
    | "resource-interaction-changed"
    | "format-changed"
    | "patch-format-changed"
    | "conditional-behavior-changed"
    | "versioning-behavior-changed"
    | "history-behavior-changed"
    | "transaction-or-batch-changed"
    | "operation-advertisement-changed"
    | "search-advertisement-changed"
    | "resource-endpoint-advertisement-changed"
    | "capability-semantics-changed"
    | "other";
  oldLocator?: string;
  newLocator?: string;
  affectedResources: string[];
  changedFields: HttpRestFieldDelta[];
  impact: BehaviorImpact;
  freshReview: BehaviorFreshReview;
  evidence: BehaviorEvidence[];
  runtimeMechanismMd: string;
  migrationGuidanceMd: string;
  backwardCompatibilityAnalysisMd: string;
  requiresHumanReview: boolean;
}

export interface HttpRestFieldDelta {
  field: string;
  oldValue?: unknown;
  newValue?: unknown;
  note?: string;
}

export interface HttpRestNotableChange {
  changeId: string;
  title: string;
  locator?: string;
  whyNotBreakingMd: string;
  migrationAwarenessMd?: string;
  confidence: ConfidenceLevel;
}
```
