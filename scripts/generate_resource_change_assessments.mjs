#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const root = resolve(import.meta.dirname, "..");
const reportDir = resolve(args.reportDir ?? join(root, "output"));
const maturityPath = resolve(args.maturity ?? join(root, "viewer", "r4-maturity.json"));
const outDir = resolve(args.outDir ?? join(reportDir, "resource-change-assessments"));
const indexPath = resolve(args.index ?? join(reportDir, "resource-change-assessments.index.json"));
const quiet = Boolean(args.quiet);

const maturity = readJsonIfExists(maturityPath) ?? {};
const reportFiles = readdirSync(reportDir)
  .filter((name) => name.endsWith(".report.json"))
  .sort((a, b) => a.localeCompare(b));

const reports = reportFiles.map((file) => {
  const path = join(reportDir, file);
  return { file, path, report: JSON.parse(readFileSync(path, "utf8")) };
});
const resourceReports = reports
  .filter(({ report }) => report.artifactKind === "resource")
  .sort((a, b) => resourceName(a.report, a.file).localeCompare(resourceName(b.report, b.file)));
const behaviorReports = reports.filter(({ report }) => isBehaviorReport(report));
const behaviorFindings = flattenBehaviorFindings(behaviorReports);

if (resourceReports.length === 0) {
  throw new Error(`No resource reports found in ${reportDir}`);
}

if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const generatedAt = new Date().toISOString();
const resourceAssessments = [];
for (const entry of resourceReports) {
  const assessment = assessResource(entry, behaviorFindings, maturity, {
    generatedAt,
    reportDir,
    outDir,
  });
  resourceAssessments.push(assessment);
  const fileName = `${safeFileName(assessment.resourceType)}.resource-assessment.json`;
  assessment.outputFile = pathForJson(join(outDir, fileName));
  writeJson(join(outDir, fileName), assessment);
  if (!quiet) {
    console.log(
      `${assessment.resourceType}: ${assessment.majorMigrationAlreadyUnavoidable} / ${assessment.compatibilityLeverage.conclusion}`,
    );
  }
}

const summaries = resourceAssessments.map(toIndexSummary);
const index = {
  schemaVersion: "fhir-r4-r6-resource-change-assessments/v1",
  generatedAt,
  source: {
    reportDir: pathForJson(reportDir),
    maturityPath: pathForJson(maturityPath),
    resourceReportCount: resourceReports.length,
    behaviorReportCount: behaviorReports.length,
    behaviorFindingCount: behaviorFindings.length,
  },
  rubric: {
    docPath: "docs/resource-change-assessment-rubric.md",
    coreQuestion:
      "Whether each R4 resource already requires enough R4-to-R6 migration work that preventing individual breaking changes has reduced leverage.",
    note:
      "This resource-level posture does not override individual fresh-review judgments. Revisit findings can remain actionable even when a resource needs a migration program.",
  },
  summary: summarizeAssessments(resourceAssessments),
  globalBehaviorContext: behaviorFindings
    .filter((f) => (f.affectedResources ?? []).length === 0)
    .map(toBehaviorRef)
    .sort(compareFindingRefs),
  resources: summaries,
};

writeJson(indexPath, index);
console.log(`Wrote ${resourceAssessments.length} resource assessments to ${pathForJson(outDir)}`);
console.log(`Wrote index to ${pathForJson(indexPath)}`);

function assessResource(entry, allBehaviorFindings, maturityMap, opts) {
  const report = entry.report;
  const name = resourceName(report, entry.file);
  const structureFindings = report.findings ?? [];
  const directBehaviorFindings = allBehaviorFindings.filter((f) => (f.affectedResources ?? []).includes(name));
  const sharedBehaviorFindings = allBehaviorFindings.filter((f) => {
    const affected = f.affectedResources ?? [];
    if (affected.includes(name)) return false;
    return affected.includes("Resource") || affected.includes("DomainResource");
  });
  const r4Maturity = maturityMap[name] ?? {};
  const stabilityPressure = classifyStabilityPressure(r4Maturity);
  const structureRefs = structureFindings.map((f) => toStructureRef(f, entry.file));
  const directBehaviorRefs = directBehaviorFindings.map(toBehaviorRef);
  const sharedBehaviorRefs = sharedBehaviorFindings.map(toBehaviorRef).sort(compareFindingRefs);
  const scoredRefs = [...structureRefs, ...directBehaviorRefs];
  const counts = countResourceFacts(structureFindings, directBehaviorFindings, sharedBehaviorFindings);
  const identityBreak = findIdentityBreak(report, structureFindings);
  const migrationUnavoidabilityScore = computeMigrationUnavoidabilityScore(counts, identityBreak, stabilityPressure);
  const migrationShape = classifyMigrationShape(counts, identityBreak, migrationUnavoidabilityScore);
  const majorMigrationAlreadyUnavoidable = classifyMajorMigration(counts, identityBreak, migrationUnavoidabilityScore);
  const compatibilityLeverage = classifyCompatibilityLeverage({
    counts,
    identityBreak,
    migrationUnavoidabilityScore,
    stabilityPressure,
    majorMigrationAlreadyUnavoidable,
  });
  const topFindings = scoredRefs
    .map((ref) => ({ ...ref, rankScore: findingRankScore(ref) }))
    .sort((a, b) => b.rankScore - a.rankScore || compareFindingRefs(a, b))
    .slice(0, 10)
    .map(({ rankScore, ...ref }) => ref);
  const rationaleMd = buildRationaleMd({
    name,
    counts,
    identityBreak,
    r4Maturity,
    stabilityPressure,
    migrationUnavoidabilityScore,
    migrationShape,
    majorMigrationAlreadyUnavoidable,
    compatibilityLeverage,
  });
  const recommendedStandardsPostureMd = buildRecommendedPostureMd({
    compatibilityLeverage,
    identityBreak,
    counts,
    stabilityPressure,
  });

  return {
    schemaVersion: "fhir-r4-r6-resource-change-assessment/v1",
    generatedAt: opts.generatedAt,
    resourceType: name,
    sourceReports: {
      structure: pathForJson(entry.path),
      directBehavior: unique(directBehaviorFindings.map((f) => f.sourceReportPath)).sort(),
      sharedBehaviorContext: unique(sharedBehaviorFindings.map((f) => f.sourceReportPath)).sort(),
    },
    r4Maturity: {
      fmm: numberOrNull(r4Maturity.fmm),
      standardsStatus: r4Maturity.standardsStatus ?? null,
      normativeVersion: r4Maturity.normativeVersion ?? null,
      workGroup: r4Maturity.wg ?? null,
      stabilityPressure,
    },
    existingReportSummary: report.summary ?? null,
    counts,
    migrationShape,
    migrationUnavoidabilityScore,
    majorMigrationAlreadyUnavoidable,
    compatibilityLeverage,
    rationaleMd,
    recommendedStandardsPostureMd,
    topFindings,
    findingRefs: {
      structure: structureRefs.sort(compareFindingRefs),
      directBehavior: directBehaviorRefs.sort(compareFindingRefs),
      sharedBehaviorContext: sharedBehaviorRefs,
    },
    caveats: buildCaveats(report, counts, identityBreak),
  };
}

function countResourceFacts(structureFindings, directBehaviorFindings, sharedBehaviorFindings) {
  const judgmentCounts = countBy(structureFindings, (f) => f.freshReview?.judgment ?? "Missing");
  const behaviorJudgmentCounts = countBy(directBehaviorFindings, (f) => f.freshReview?.judgment ?? "Missing");
  const categoryCounts = countBy(structureFindings, (f) => f.category ?? "Unknown");
  const deltaKindCounts = countBy(structureFindings, (f) => f.structuredDelta?.deltaKind ?? "Unknown");
  const hardInstanceBreaks = structureFindings.filter((f) => f.impact?.hardInstanceBreaking === "Yes").length;
  const potentialHardInstanceBreaks = structureFindings.filter((f) => f.impact?.hardInstanceBreaking === "Potential").length;
  const criticalOrHighStructureImpact = structureFindings.filter((f) =>
    isCriticalOrHigh(f.impact?.overallImpact) || isCriticalOrHigh(f.impact?.runtimeBreakingRisk)
  ).length;
  const directBehaviorHighRisk = directBehaviorFindings.filter((f) =>
    isCriticalOrHigh(f.impact?.runtimeBreakingRisk) || isCriticalOrHigh(f.impact?.conformanceRisk)
  ).length;
  const sharedBehaviorHighRisk = sharedBehaviorFindings.filter((f) =>
    isCriticalOrHigh(f.impact?.runtimeBreakingRisk) || isCriticalOrHigh(f.impact?.conformanceRisk)
  ).length;
  const revisitFindings = structureFindings.filter((f) => f.freshReview?.judgment === "Revisit").length;
  const unclearFindings = structureFindings.filter((f) => f.freshReview?.judgment === "Unclear").length;
  const behaviorRevisitFindings = directBehaviorFindings.filter((f) => f.freshReview?.judgment === "Revisit").length;
  const behaviorUnclearFindings = directBehaviorFindings.filter((f) => f.freshReview?.judgment === "Unclear").length;
  const lessBreakingYesOrPartial = structureFindings.filter((f) => {
    const judgment = f.freshReview?.lessBreakingAlternative?.judgment;
    const assessment = f.freshReview?.lessBreakingAlternativeAssessment ?? "";
    return judgment === "Yes" || judgment === "Partial" || /\b(yes|partial)\b/i.test(assessment);
  }).length;
  const nonMechanicalBreaks = structureFindings.filter(isNonMechanicalStructureFinding).length;
  const removalRenameOrMove = structureFindings.filter(isRemovalRenameOrMove).length;
  const requiredOrModifierAdditions = structureFindings.filter(isRequiredOrModifierAddition).length;
  const referenceOrTerminologyNarrowing = structureFindings.filter(isReferenceOrTerminologyNarrowing).length;
  const behaviorByReport = countBy(directBehaviorFindings, (f) => f.sourceReportName);

  return {
    structureFindingCount: structureFindings.length,
    directBehaviorFindingCount: directBehaviorFindings.length,
    sharedBehaviorContextCount: sharedBehaviorFindings.length,
    hardInstanceBreaks,
    potentialHardInstanceBreaks,
    criticalOrHighStructureImpact,
    directBehaviorHighRisk,
    sharedBehaviorHighRisk,
    revisitFindings,
    unclearFindings,
    behaviorRevisitFindings,
    behaviorUnclearFindings,
    lessBreakingYesOrPartial,
    nonMechanicalBreaks,
    removalRenameOrMove,
    requiredOrModifierAdditions,
    referenceOrTerminologyNarrowing,
    structureJudgments: judgmentCounts,
    directBehaviorJudgments: behaviorJudgmentCounts,
    structureCategories: categoryCounts,
    structureDeltaKinds: deltaKindCounts,
    directBehaviorByReport: behaviorByReport,
  };
}

function findIdentityBreak(report, structureFindings) {
  const finding = structureFindings.find((f) => {
    const title = f.title ?? "";
    const deltaKind = f.structuredDelta?.deltaKind ?? "";
    const hardBreak = f.impact?.hardInstanceBreaking === "Yes" || f.impact?.runtimeBreakingRisk === "Critical";
    return (
      ((f.category === "ARTIFACT_IDENTITY" || deltaKind === "artifact-identity-changed") && hardBreak) ||
      looksLikeResourceIdentityBreakTitle(title)
    );
  });
  const newStatus = String(report.newArtifact?.status ?? "");
  if (finding) {
    return {
      findingId: finding.findingId,
      title: finding.title,
      reason: "ARTIFACT_IDENTITY finding or equivalent resource-removal evidence",
    };
  }
  if (/\b(absent|missing|old type)\b/i.test(newStatus)) {
    return {
      findingId: null,
      title: `R6 artifact status is ${newStatus}`,
      reason: "newArtifact status indicates absence",
    };
  }
  return null;
}

function computeMigrationUnavoidabilityScore(counts, identityBreak, stabilityPressure) {
  if (identityBreak) {
    return clamp(
      88 +
        Math.min(6, counts.hardInstanceBreaks) +
        Math.min(4, counts.directBehaviorHighRisk) +
        Math.min(2, counts.nonMechanicalBreaks),
      0,
      100,
    );
  }
  let score = 0;
  score += counts.hardInstanceBreaks * 6;
  score += counts.potentialHardInstanceBreaks * 3;
  score += counts.nonMechanicalBreaks * 5;
  score += counts.removalRenameOrMove * 2;
  score += counts.requiredOrModifierAdditions * 3;
  score += counts.referenceOrTerminologyNarrowing * 2;
  score += counts.directBehaviorHighRisk * 5;
  score += counts.behaviorRevisitFindings * 3;
  score += counts.revisitFindings * 2;
  score += counts.lessBreakingYesOrPartial;
  if (stabilityPressure === "Strong") score += 3;
  if (stabilityPressure === "Weak" && score < 75) score -= 4;
  return clamp(score, 0, 100);
}

function classifyMigrationShape(counts, identityBreak, score) {
  if (identityBreak) return "removed-or-replaced-resource";
  if (
    score >= 85 ||
    (counts.hardInstanceBreaks >= 8 && (counts.nonMechanicalBreaks >= 5 || counts.removalRenameOrMove >= 3))
  ) {
    return "major-model-remodel";
  }
  if (score >= 35 || counts.hardInstanceBreaks >= 3 || counts.revisitFindings >= 4) return "moderate-targeted-remodel";
  if (counts.hardInstanceBreaks > 0 || counts.potentialHardInstanceBreaks > 0 || counts.directBehaviorFindingCount > 0) {
    return "mostly-stable-with-local-breaks";
  }
  return "low-material-change";
}

function classifyMajorMigration(counts, identityBreak, score) {
  if (identityBreak) return "Yes";
  if (
    (score >= 85 && counts.hardInstanceBreaks >= 6) ||
    (counts.hardInstanceBreaks >= 8 && (counts.nonMechanicalBreaks >= 5 || counts.removalRenameOrMove >= 3))
  ) {
    return "Yes";
  }
  if (
    score >= 35 ||
    counts.hardInstanceBreaks >= 3 ||
    counts.revisitFindings >= 4 ||
    counts.directBehaviorHighRisk >= 2 ||
    counts.nonMechanicalBreaks >= 4
  ) {
    return "Partial";
  }
  if (
    counts.unclearFindings + counts.behaviorUnclearFindings >
    (counts.structureFindingCount + counts.directBehaviorFindingCount) / 2
  ) {
    return "Unknown";
  }
  return "No";
}

function classifyCompatibilityLeverage({
  counts,
  identityBreak,
  migrationUnavoidabilityScore,
  stabilityPressure,
  majorMigrationAlreadyUnavoidable,
}) {
  let conclusion;
  let confidence = "High";
  if (identityBreak) {
    conclusion = "migration-program-dominates";
  } else if (
    majorMigrationAlreadyUnavoidable === "Yes" &&
    stabilityPressure !== "Strong" &&
    stabilityPressure !== "Meaningful" &&
    counts.lessBreakingYesOrPartial === 0
  ) {
    conclusion = "migration-program-dominates";
  } else if (
    majorMigrationAlreadyUnavoidable === "Partial" ||
    majorMigrationAlreadyUnavoidable === "Yes" ||
    migrationUnavoidabilityScore >= 70 ||
    counts.hardInstanceBreaks >= 3 ||
    counts.revisitFindings >= 4 ||
    counts.directBehaviorHighRisk >= 2
  ) {
    conclusion = "preserve-where-low-cost-but-expect-resource-migration";
  } else if (
    counts.hardInstanceBreaks > 0 ||
    counts.potentialHardInstanceBreaks > 0 ||
    counts.directBehaviorFindingCount > 0 ||
    counts.revisitFindings > 0
  ) {
    conclusion = "preserve-compatibility-per-change";
  } else if (counts.unclearFindings + counts.behaviorUnclearFindings > 0 && counts.structureFindingCount <= 2) {
    conclusion = "not-enough-evidence";
    confidence = "Medium";
  } else {
    conclusion = "no-special-break-avoidance-needed";
  }
  if (counts.unclearFindings + counts.behaviorUnclearFindings >= 3) confidence = "Medium";
  return {
    conclusion,
    confidence,
    note:
      "Resource-level leverage is a planning signal. It does not mark individual Revisit findings as justified or unimportant.",
  };
}

function buildRationaleMd({
  name,
  counts,
  identityBreak,
  r4Maturity,
  stabilityPressure,
  migrationUnavoidabilityScore,
  migrationShape,
  majorMigrationAlreadyUnavoidable,
  compatibilityLeverage,
}) {
  const maturityText = r4Maturity.fmm != null || r4Maturity.standardsStatus
    ? `R4 maturity context is ${r4Maturity.standardsStatus ?? "unknown status"}${r4Maturity.fmm != null ? `/FMM ${r4Maturity.fmm}` : ""}, which creates ${stabilityPressure.toLowerCase()} stability pressure.`
    : "R4 maturity context is not known from the checked-in maturity map.";
  const parts = [];
  if (identityBreak) {
    parts.push(
      `${name} has a resource-identity break: ${identityBreak.title}. That makes a resource-level migration program unavoidable before element-level compatibility can solve much.`,
    );
  } else {
    parts.push(
      `${name} keeps its resource identity. The aggregate has ${counts.hardInstanceBreaks} hard R4-to-R6 instance break(s), ${counts.potentialHardInstanceBreaks} potential hard break(s), ${counts.nonMechanicalBreaks} non-mechanical migration finding(s), and ${counts.directBehaviorFindingCount} direct behavior/API finding(s).`,
    );
  }
  parts.push(maturityText);
  parts.push(
    `The computed migration-unavoidability score is ${migrationUnavoidabilityScore}/100, producing migration shape \`${migrationShape}\`, major migration \`${majorMigrationAlreadyUnavoidable}\`, and compatibility posture \`${compatibilityLeverage.conclusion}\`.`,
  );
  if (counts.lessBreakingYesOrPartial > 0) {
    parts.push(
      `${counts.lessBreakingYesOrPartial} finding(s) identify a yes/partial less-breaking base-design alternative, so the aggregate should not be used to dismiss local avoidability review.`,
    );
  }
  if (counts.sharedBehaviorContextCount > 0) {
    parts.push(
      `${counts.sharedBehaviorContextCount} shared Resource/DomainResource behavior finding(s) are listed as context but not scored for this resource to avoid duplicating base behavior issues across all resources.`,
    );
  }
  return parts.join("\n\n");
}

function buildRecommendedPostureMd({ compatibilityLeverage, identityBreak, counts, stabilityPressure }) {
  switch (compatibilityLeverage.conclusion) {
    case "migration-program-dominates":
      return identityBreak
        ? "Prioritize an explicit migration map, successor-resource guidance, endpoint/search transition guidance, and compatibility profiles or aliases where they are cheap. Do not rely on preserving individual old element names to solve the main break."
        : "Plan a resource-level migration program first. Still preserve low-cost aliases, deprecated fields, wider bindings, or transition behavior for high-value Revisit findings where they reduce migration cost without perpetuating conflicting representations.";
    case "preserve-where-low-cost-but-expect-resource-migration":
      return `Expect targeted migration work, but continue reviewing individual breaks. ${stabilityPressure === "Strong" ? "Because R4 stability pressure is strong, low-cost compatible designs should be preferred unless they clearly undermine the R6 goal." : "Use less-breaking designs where they do not preserve obsolete or conflicting models indefinitely."}`;
    case "preserve-compatibility-per-change":
      return "Treat this as a mostly stable resource. Individual hard breaks, renames, required bindings, or behavior changes should stand or fall on their own rationale and available less-breaking alternatives.";
    case "no-special-break-avoidance-needed":
      return "No major resource-level migration pressure is evident from the current reports. Routine migration notes and generated-code updates should be enough unless downstream implementation evidence says otherwise.";
    default:
      return `Do not draw a strong resource-level conclusion yet. Review the ${counts.unclearFindings + counts.behaviorUnclearFindings} unclear finding(s), official change rationale, and implementation evidence before deciding whether compatibility preservation still has leverage.`;
  }
}

function buildCaveats(report, counts, identityBreak) {
  const caveats = [];
  if (report.summary?.overallConfidence && report.summary.overallConfidence !== "High") {
    caveats.push(`Source report confidence is ${report.summary.overallConfidence}.`);
  }
  if ((report.scope?.missingInputs ?? []).length > 0) {
    caveats.push(`${report.scope.missingInputs.length} missing input note(s) were present in the source report.`);
  }
  if (counts.sharedBehaviorContextCount > 0) {
    caveats.push("Shared Resource/DomainResource behavior context is listed but not scored to avoid duplicated base-class conclusions.");
  }
  if (identityBreak && counts.structureFindingCount <= 2) {
    caveats.push("A whole-resource removal can have a small finding count but still dominate migration because every instance and endpoint is affected.");
  }
  return caveats;
}

function toStructureRef(finding, sourceReportFile) {
  return {
    sourceSurface: "StructureDefinition",
    sourceReport: `output/${sourceReportFile}`,
    findingId: finding.findingId,
    title: finding.title,
    category: finding.category ?? null,
    deltaKind: finding.structuredDelta?.deltaKind ?? null,
    affectedPath: finding.affectedLocation?.oldPath ?? finding.affectedLocation?.newPath ?? finding.affectedLocation?.parentPath ?? null,
    hardInstanceBreaking: finding.impact?.hardInstanceBreaking ?? null,
    overallImpact: finding.impact?.overallImpact ?? null,
    runtimeBreakingRisk: finding.impact?.runtimeBreakingRisk ?? null,
    freshReviewJudgment: finding.freshReview?.judgment ?? null,
    compatibilityMechanism: finding.freshReview?.compatibilityMechanism ?? null,
    lessBreakingAlternativeJudgment: finding.freshReview?.lessBreakingAlternative?.judgment ?? null,
    whyRelevant: "Owned by this resource's StructureDefinition report.",
  };
}

function toBehaviorRef(finding) {
  return {
    sourceSurface: finding.sourceBehaviorName,
    sourceReport: finding.sourceReportPath,
    findingId: finding.findingId,
    title: finding.title,
    category: finding.behaviorCategory ?? finding.category ?? null,
    deltaKind: null,
    affectedResources: finding.affectedResources ?? [],
    runtimeBreakingRisk: finding.impact?.runtimeBreakingRisk ?? null,
    conformanceRisk: finding.impact?.conformanceRisk ?? null,
    freshReviewJudgment: finding.freshReview?.judgment ?? null,
    compatibilityMechanism: finding.freshReview?.compatibilityMechanism ?? null,
    lessBreakingAlternativeJudgment: finding.freshReview?.lessBreakingAlternative?.judgment ?? null,
    whyRelevant: "Behavior/API finding whose affectedResources include this resource, or shared context when listed under sharedBehaviorContext.",
  };
}

function flattenBehaviorFindings(entries) {
  const out = [];
  for (const { file, path, report } of entries) {
    for (const finding of report.findings ?? []) {
      out.push({
        ...finding,
        sourceReportName: file,
        sourceReportPath: pathForJson(path),
        sourceBehaviorName: report.behaviorName ?? file.replace(/\.report\.json$/, ""),
      });
    }
  }
  return out;
}

function toIndexSummary(assessment) {
  return {
    resourceType: assessment.resourceType,
    outputFile: assessment.outputFile,
    r4Maturity: assessment.r4Maturity,
    counts: assessment.counts,
    migrationShape: assessment.migrationShape,
    migrationUnavoidabilityScore: assessment.migrationUnavoidabilityScore,
    majorMigrationAlreadyUnavoidable: assessment.majorMigrationAlreadyUnavoidable,
    compatibilityLeverage: assessment.compatibilityLeverage,
    topFindings: assessment.topFindings,
    rationaleMd: assessment.rationaleMd,
  };
}

function summarizeAssessments(assessments) {
  return {
    resourceCount: assessments.length,
    majorMigrationAlreadyUnavoidable: countBy(assessments, (a) => a.majorMigrationAlreadyUnavoidable),
    migrationShapes: countBy(assessments, (a) => a.migrationShape),
    compatibilityLeverageConclusions: countBy(assessments, (a) => a.compatibilityLeverage.conclusion),
    stabilityPressure: countBy(assessments, (a) => a.r4Maturity.stabilityPressure),
    totalHardInstanceBreaks: sum(assessments, (a) => a.counts.hardInstanceBreaks),
    totalPotentialHardInstanceBreaks: sum(assessments, (a) => a.counts.potentialHardInstanceBreaks),
    totalDirectBehaviorFindings: sum(assessments, (a) => a.counts.directBehaviorFindingCount),
  };
}

function isBehaviorReport(report) {
  return (
    typeof report.schemaVersion === "string" &&
    report.schemaVersion.startsWith("fhir-r4-r6-") &&
    report.schemaVersion.endsWith("-behavior/v1")
  );
}

function resourceName(report, file) {
  return report.artifactName ?? report.scope?.assignedArtifact ?? file.replace(/\.report\.json$/, "");
}

function isNonMechanicalStructureFinding(finding) {
  const kind = finding.structuredDelta?.deltaKind ?? "";
  const category = finding.category ?? "";
  const isHardIdentityBreak =
    category === "ARTIFACT_IDENTITY" &&
    (finding.impact?.hardInstanceBreaking === "Yes" || looksLikeResourceIdentityBreakTitle(finding.title ?? ""));
  return (
    isHardIdentityBreak ||
    category === "CONVERSION_OR_MAPPING" ||
    category === "SLICING_AND_CONTENT_MODEL" ||
    [
      "element-removed",
      "element-renamed",
      "element-moved",
      "element-replaced",
      "r6-not-representable-in-r4",
      "reference-target-replaced",
      "reference-target-removed",
      "cardinality-min-increased",
      "binding-strength-increased",
      "constraint-added",
      "modifier-flag-changed",
      "type-removed",
    ].includes(kind)
  );
}

function isRemovalRenameOrMove(finding) {
  const kind = finding.structuredDelta?.deltaKind ?? "";
  if (kind === "artifact-identity-changed") {
    return finding.impact?.hardInstanceBreaking === "Yes" || looksLikeResourceIdentityBreakTitle(finding.title ?? "");
  }
  return ["element-removed", "element-renamed", "element-moved", "element-replaced"].includes(kind);
}

function isRequiredOrModifierAddition(finding) {
  const kind = finding.structuredDelta?.deltaKind ?? "";
  const title = finding.title ?? "";
  const facts = finding.structuredDelta?.facts ?? [];
  return (
    kind === "cardinality-min-increased" ||
    (kind === "element-added" &&
      (finding.impact?.hardInstanceBreaking === "Yes" ||
        /\b(required|mandatory|modifier)\b/i.test(title) ||
        facts.some((fact) => fact.field === "min" && Number(fact.newValue) > 0) ||
        facts.some((fact) => /modifier/i.test(String(fact.field)) && fact.newValue === true)))
  );
}

function isReferenceOrTerminologyNarrowing(finding) {
  const kind = finding.structuredDelta?.deltaKind ?? "";
  return [
    "reference-target-removed",
    "reference-target-replaced",
    "binding-strength-increased",
    "value-set-changed",
    "code-removed",
    "type-removed",
  ].includes(kind);
}

function classifyStabilityPressure(maturity) {
  const status = String(maturity.standardsStatus ?? "").toLowerCase();
  const fmm = numberOrNull(maturity.fmm);
  if (status === "normative" || (fmm != null && fmm >= 5)) return "Strong";
  if (fmm != null && fmm >= 3) return "Meaningful";
  if (fmm === 2) return "Neutral";
  if (fmm != null && fmm <= 1) return "Weak";
  return "Unknown";
}

function findingRankScore(ref) {
  let score = 0;
  if (
    ref.category === "ARTIFACT_IDENTITY" &&
    (ref.hardInstanceBreaking === "Yes" || looksLikeResourceIdentityBreakTitle(ref.title ?? ""))
  ) {
    score += 100;
  }
  if (ref.hardInstanceBreaking === "Yes") score += 50;
  if (ref.hardInstanceBreaking === "Potential") score += 25;
  score += impactRank(ref.overallImpact) * 8;
  score += Math.max(impactRank(ref.runtimeBreakingRisk), impactRank(ref.conformanceRisk)) * 6;
  if (ref.freshReviewJudgment === "Revisit") score += 30;
  if (ref.freshReviewJudgment === "Unclear") score += 15;
  if (ref.lessBreakingAlternativeJudgment === "Yes") score += 8;
  if (ref.lessBreakingAlternativeJudgment === "Partial") score += 4;
  if (isNonMechanicalRef(ref)) score += 8;
  return score;
}

function isNonMechanicalRef(ref) {
  return (
    (ref.category === "ARTIFACT_IDENTITY" &&
      (ref.hardInstanceBreaking === "Yes" || looksLikeResourceIdentityBreakTitle(ref.title ?? ""))) ||
    ref.category === "CONVERSION_OR_MAPPING" ||
    [
      "artifact-identity-changed",
      "element-removed",
      "element-renamed",
      "element-moved",
      "element-replaced",
      "r6-not-representable-in-r4",
      "reference-target-replaced",
      "reference-target-removed",
      "binding-strength-increased",
      "constraint-added",
    ].includes(ref.deltaKind)
  );
}

function looksLikeResourceIdentityBreakTitle(title) {
  return /\b(resource is absent|resource .* absent|no same-named|no same-name|no matching .*StructureDefinition|no .*StructureDefinition|absent from .*core package|no longer defines .*resource|core package no longer defines|has no .*R6 StructureDefinition)\b/i.test(
    title,
  );
}

function impactRank(value) {
  return { Critical: 5, High: 4, Medium: 3, Low: 2, Info: 1 }[value] ?? 0;
}

function isCriticalOrHigh(value) {
  return value === "Critical" || value === "High";
}

function compareFindingRefs(a, b) {
  return String(a.sourceSurface ?? "").localeCompare(String(b.sourceSurface ?? "")) ||
    String(a.findingId ?? "").localeCompare(String(b.findingId ?? ""));
}

function countBy(items, fn) {
  const out = {};
  for (const item of items) {
    const key = String(fn(item) ?? "Unknown");
    out[key] = (out[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => a[0].localeCompare(b[0])));
}

function sum(items, fn) {
  return items.reduce((acc, item) => acc + Number(fn(item) ?? 0), 0);
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function numberOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeFileName(value) {
  return String(value).replace(/[^A-Za-z0-9._-]/g, "_");
}

function pathForJson(path) {
  const rel = relative(root, path);
  return rel && !rel.startsWith("..") ? rel : path;
}

function readJsonIfExists(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--quiet") {
      out.quiet = true;
      continue;
    }
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for ${arg}`);
    out[key] = next;
    i += 1;
  }
  return out;
}
