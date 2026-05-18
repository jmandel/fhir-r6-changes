export type ImpactLevel = "Critical" | "High" | "Medium" | "Low" | "Info";
export type ConfidenceLevel = "High" | "Medium" | "Low" | "Unknown";
export type JustificationVerdict =
  | "Justified"
  | "Probably justified"
  | "Not clearly justified"
  | "Probably avoidable"
  | "Cannot assess";
export type BackwardCompatibleAlternativeAvailable =
  | "Yes"
  | "No"
  | "Partial"
  | "Not applicable"
  | "Unknown";

export interface R4Maturity {
  standardsStatus?: string;
  fmm?: number;
  wg?: string;
  normativeVersion?: string;
}

export interface BundleData {
  generatedAt: string;
  sourceDir?: string;
  baseArtifacts?: { name: string; kind: string; abstract: boolean }[];
  r4Maturity?: Record<string, R4Maturity>;
  parseFailures?: { file: string; error: string }[];
  reports: Report[];
}

export interface Report {
  _mtimeMs?: number;
  schemaVersion?: string;
  artifactName: string;
  artifactKind?: "resource" | "datatype" | "unknown" | string;
  scope?: any;
  oldArtifact?: any;
  newArtifact?: any;
  narrativeReportMd?: string;
  summary?: AssessmentSummary;
  findings?: Finding[];
  checkedNoMaterialChange?: any[];
  nonBreakingNotableChanges?: any[];
  followUpDependencies?: any[];
  analysisLimitations?: any[];
  reducerHints?: any;
}

export interface AssessmentSummary {
  overallAssessment?: string;
  overallImpact?: ImpactLevel;
  overallConfidence?: ConfidenceLevel;
  hardInstanceBreakingCount?: number;
  potentialHardInstanceBreakingCount?: number;
  criticalOrHighRuntimeRiskCount?: number;
  criticalOrHighR6ToR4RiskCount?: number;
  requiresHumanReviewCount?: number;
  localFindingCount?: number;
  inheritedFindingCount?: number;
  executiveSummaryMd?: string;
  migrationThemesMd?: string;
  confidenceSummaryMd?: string;
}

export interface Finding {
  findingId: string;
  title: string;
  category: string;
  otherCategoryExplanation?: string;
  affectedLocation?: any;
  inheritedOrLocal?: "local" | "inherited" | "unknown";
  changeNature?: string;
  oldState?: any;
  newState?: any;
  structuredDelta?: any;
  impact?: ImpactAssessment;
  justification?: JustificationAssessment;
  evidence?: any[];
  examples?: any;
  narrativeMd?: string;
  validationAndCompatibilityMd?: string;
  migrationGuidanceMd?: string;
  backwardCompatibilityAnalysisMd?: string;
  reviewerNotesMd?: string;
  requiresHumanReview?: boolean;
}

export interface JustificationAssessment {
  justificationVerdict?: JustificationVerdict;
  backwardCompatibleAlternativeAvailable?: BackwardCompatibleAlternativeAvailable;
  inferredGoal?: string;
  backwardCompatibleAlternativeSummary?: string;
  justificationRationaleMd?: string;
  backwardCompatibleAlternativeMd?: string;
  alternativeTradeoffSummary?: string;
}

export interface ImpactAssessment {
  hardInstanceBreaking?: "Yes" | "No" | "Potential" | "Unknown";
  runtimeBreakingRisk?: ImpactLevel;
  r6ToR4RepresentabilityRisk?: ImpactLevel | "Not applicable";
  overallImpact?: ImpactLevel;
  affectedDirection?: string;
  confidence?: ConfidenceLevel;
  impactRationaleMd?: string;
  expectedPrevalence?: string;
  safetyOrBusinessRisk?: string;
  safetyOrBusinessRiskMd?: string;
}
