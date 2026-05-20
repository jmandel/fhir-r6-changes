# Resource Review Output Contract

This contract is for holistic resource-level review after the per-finding
StructureDefinition and behavior/API reports already exist.

The goal is not to concatenate or rescore existing findings. The goal is to
make an independent resource-level judgment:

- Does this R4 resource already require a migration program for R6?
- If yes, does that make additional break prevention lower leverage?
- Which individual findings still deserve preservation or design attention
  despite the aggregate migration burden?

Each resource review must return exactly one valid JSON object. Markdown-bearing
fields may contain GitHub-flavored Markdown strings.

## Types

```ts
export type ConfidenceLevel = "High" | "Medium" | "Low" | "Unknown";

export type MajorMigrationAlreadyUnavoidable =
  | "Yes"
  | "Partial"
  | "No"
  | "Unknown";

export type ResourceMigrationShape =
  | "removed-or-replaced-resource"
  | "major-model-remodel"
  | "moderate-targeted-remodel"
  | "mostly-stable-with-local-breaks"
  | "low-material-change"
  | "not-enough-evidence";

export type CompatibilityLeverageConclusion =
  | "migration-program-dominates"
  | "preserve-where-low-cost-but-expect-resource-migration"
  | "preserve-compatibility-per-change"
  | "no-special-break-avoidance-needed"
  | "not-enough-evidence";

export type FindingRole =
  | "drives-resource-conclusion"
  | "important-but-local"
  | "context-only"
  | "discounted"
  | "needs-follow-up";

export interface ResourceReview {
  schemaVersion: "fhir-r4-r6-resource-review/v1";
  resourceType: string;

  reviewMethod: {
    contextPath: string;
    structureReportPath: string;
    deterministicAggregatePath?: string;
    behaviorReportPaths: string[];
    reviewedStructureFindingCount: number;
    reviewedDirectBehaviorFindingCount: number;
    reviewedSharedBehaviorContextCount: number;
    methodNotesMd: string;
  };

  r4Maturity: {
    fmm?: number;
    standardsStatus?: string;
    workGroup?: string;
    stabilityPressure:
      | "Strong"
      | "Meaningful"
      | "Neutral"
      | "Weak"
      | "Unknown";
    effectMd: string;
  };

  overall: {
    majorMigrationAlreadyUnavoidable: MajorMigrationAlreadyUnavoidable;
    resourceMigrationShape: ResourceMigrationShape;
    compatibilityLeverage: CompatibilityLeverageConclusion;
    confidence: ConfidenceLevel;
    oneLineConclusion: string;
  };

  reasoning: {
    thesisMd: string;
    migrationShapeMd: string;
    compatibilityLeverageMd: string;
    lessBreakingAlternativesMd: string;
    behaviorImpactMd: string;
    comparisonToDeterministicAggregateMd?: string;
    uncertaintyMd?: string;
  };

  /**
   * Include the findings that materially shaped the resource-level answer.
   * This is not required to repeat every finding. It must be enough for a
   * reviewer to see that the resource report was actually read and considered.
   */
  findingConsiderations: Array<{
    sourceSurface: "StructureDefinition" | "OperationDefinitions" | "SearchParameters" | "HttpRestBehavior" | "SharedBehaviorContext";
    findingId: string;
    title: string;
    role: FindingRole;
    reasonMd: string;
  }>;

  recommendedNextActions: Array<{
    priority: "High" | "Medium" | "Low";
    actionMd: string;
  }>;

  caveats: string[];
}
```

## Review Rules

Do not decide by counts alone. Counts may help orient the review, but the final
resource judgment must be argued from the actual migration shape and the
substantive findings.

Use the deterministic aggregate as prior context only. It may be wrong. Compare
against it after making the independent resource-level judgment.

Keep these ideas distinct:

- A resource-level migration program may be unavoidable.
- An individual breaking change may still be avoidable or worth revisiting.
- Low FMM weakens stability expectations, but it does not erase safety,
  regulatory, billing, public-health, audit, or common implementation impact.
- Normative/FMM 5 raises the burden to justify breaks, even when there are
  several breaks in the same resource.

Shared `Resource` and `DomainResource` behavior findings are context only
unless the assigned resource is `Resource` or `DomainResource`.
