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
  behaviorSourceDir?: string;
  freshReviewSourceDir?: string;
  baseArtifacts?: { name: string; kind: string; abstract: boolean }[];
  r4Maturity?: Record<string, R4Maturity>;
  parseFailures?: { file: string; error: string }[];
  behaviorParseFailures?: { file: string; error: string }[];
  freshReviewParseFailures?: { file: string; error: string }[];
  reports: Report[];
  behaviorReports?: BehaviorReport[];
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
  freshReviewSummary?: FreshReviewMergeSummary;
}

export interface BehaviorReport {
  _mtimeMs?: number;
  _sourcePath?: string;
  _reportKey?: string;
  schemaVersion?: string;
  behaviorName: string;
  scope?: any;
  narrativeReportMd?: string;
  summary?: BehaviorSummary;
  inventorySummary?: any;
  findings?: BehaviorFinding[];
  checkedNoMaterialChange?: any[];
  nonBreakingNotableChanges?: any[];
  followUpDependencies?: any[];
  analysisLimitations?: any[];
}

export interface BehaviorSummary {
  overallAssessment?: string;
  overallImpact?: ImpactLevel;
  overallConfidence?: ConfidenceLevel;
  breakingChangeCount?: number;
  potentialBreakingChangeCount?: number;
  runtimeRiskCount?: number;
  conformanceRiskCount?: number;
  requiresHumanReviewCount?: number;
  executiveSummaryMd?: string;
  migrationThemesMd?: string;
  confidenceSummaryMd?: string;
}

export interface BehaviorFinding {
  findingId: string;
  title: string;
  behaviorCategory?: string;
  category?: string;
  oldOperation?: any;
  newOperation?: any;
  oldSearchParameter?: any;
  newSearchParameter?: any;
  oldLocator?: string;
  newLocator?: string;
  affectedResources?: string[];
  changedFields?: any[];
  parameterDeltas?: any[];
  matchRationaleMd?: string;
  impact?: BehaviorImpact;
  freshReview?: FreshReviewDecision;
  evidence?: any[];
  runtimeMechanismMd?: string;
  migrationGuidanceMd?: string;
  backwardCompatibilityAnalysisMd?: string;
  requiresHumanReview?: boolean;
}

export interface BehaviorImpact {
  runtimeBreakingRisk?: ImpactLevel;
  conformanceRisk?: ImpactLevel;
  r6ToR4RepresentabilityRisk?: ImpactLevel | "Not applicable";
  affectedDirection?: string;
  expectedPrevalence?: string;
  confidence?: ConfidenceLevel;
  impactRationaleMd?: string;
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
  freshReview?: FreshReviewDecision;
}

export type FreshReviewJudgment =
  | "Revisit"
  | "Unclear"
  | "Breaking but probably OK"
  | "No problem";

export interface FreshReviewDecision {
  findingId?: string;
  judgment: FreshReviewJudgment;
  narrativeMd?: string;
  keyEvidence?: string[];
  fmmEffect?: string;
  fmmContext?: {
    fmm?: number;
    standardsStatus?: string;
    source?: string;
    effect?: string;
    rationaleMd?: string;
  };
  compatibilityMechanism?: string;
  realWorldScenarioMd?: string;
  rationaleMd?: string;
  lessBreakingAlternative?: {
    judgment?: string;
    candidateDesignMd?: string;
    tradeoffsOrReasonMd?: string;
  };
  lessBreakingAlternativeAssessment?: string;
  comparisonToExisting?: string;
}

export interface FreshReviewMergeSummary {
  schemaVersion: "fresh-review-merge-v1";
  reviewSchemaVersion?: string;
  sourceReviewFile?: string;
  findingDecisionCount?: number;
  matchedFindingDecisionCount?: number;
  missingFindingDecisionCount?: number;
  complete?: boolean;
  judgmentCounts?: Partial<Record<FreshReviewJudgment, number>>;
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
