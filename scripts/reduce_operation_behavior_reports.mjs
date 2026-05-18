#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const args = parseArgs(process.argv.slice(2));
const shardDir = path.resolve(args["shard-dir"] ?? path.join(ROOT, "output", "behavior", "operations"));
const outPath = path.resolve(args.output ?? path.join(ROOT, "output", "OperationDefinitions.report.json"));
const manifestPath = path.resolve(args.manifest ?? path.join(ROOT, "batch", "behavior", "operation-fanout.tsv"));
const sourceStatusPath = path.resolve(args["source-status"] ?? path.join(ROOT, "batch", "behavior", "source-status.tsv"));
const fmmContextPath = path.resolve(args["fmm-context"] ?? path.join(ROOT, "batch", "behavior", "fmm-context.json"));

if (args.help) {
  console.log(`Usage: node scripts/reduce_operation_behavior_reports.mjs [--shard-dir DIR] [--output FILE]

Merges output/behavior/operations/*.report.json into output/OperationDefinitions.report.json.`);
  process.exit(0);
}

if (!fs.existsSync(shardDir)) {
  throw new Error(`Shard directory not found: ${shardDir}`);
}

const shardFiles = fs.readdirSync(shardDir)
  .filter((name) => name.endsWith(".report.json"))
  .sort();

if (shardFiles.length === 0) {
  throw new Error(`No operation shard reports found in ${shardDir}`);
}

const shards = shardFiles.map((file) => {
  const full = path.join(shardDir, file);
  const report = JSON.parse(fs.readFileSync(full, "utf8"));
  if (report.schemaVersion !== "fhir-r4-r6-operation-behavior/v1") {
    throw new Error(`${file}: unexpected schemaVersion ${JSON.stringify(report.schemaVersion)}`);
  }
  return { file, full, report };
});

const findings = [];
const checkedNoMaterialChange = [];
const nonBreakingNotableChanges = [];
const followUpDependencies = [];
const analysisLimitations = [];
const publishedPagesReviewed = new Map();
const localInputsUsed = new Map();
const manifestRows = readManifestRows(manifestPath);
const fmmContext = readFmmContext(fmmContextPath);
let excludedReverseOrAdditiveCount = 0;

for (const shard of shards) {
  const shardKey = shard.file.replace(/\.report\.json$/, "");
  const shardMeta = manifestRows.get(shardKey);
  for (const finding of shard.report.findings ?? []) {
    const outOfScopeForR4ToR6 = isOutOfScopeReverseOrAdditive(finding, shardMeta);
    const normalized = normalizeFindingForR4ToR6(finding, shardKey, shardMeta, fmmContext);
    if (outOfScopeForR4ToR6) {
      excludedReverseOrAdditiveCount += 1;
      nonBreakingNotableChanges.push(reverseOrAdditiveToNotable(normalized, shardKey));
    } else {
      findings.push(prefixFindingId(normalized, shardKey));
    }
  }
  for (const item of shard.report.checkedNoMaterialChange ?? []) {
    checkedNoMaterialChange.push({ ...item, area: `${shardKey}: ${item.area}` });
  }
  for (const item of shard.report.nonBreakingNotableChanges ?? []) {
    nonBreakingNotableChanges.push({
      ...item,
      changeId: item.changeId?.startsWith(`${shardKey}:`) ? item.changeId : `${shardKey}:${item.changeId ?? "notable"}`,
    });
  }
  for (const item of shard.report.followUpDependencies ?? []) {
    followUpDependencies.push({
      ...item,
      dependencyId: item.dependencyId?.startsWith(`${shardKey}:`) ? item.dependencyId : `${shardKey}:${item.dependencyId ?? "dependency"}`,
    });
  }
  for (const item of shard.report.analysisLimitations ?? []) {
    analysisLimitations.push({
      ...item,
      limitationId: item.limitationId?.startsWith(`${shardKey}:`) ? item.limitationId : `${shardKey}:${item.limitationId ?? "limitation"}`,
    });
  }
  for (const page of shard.report.scope?.publishedPagesReviewed ?? []) {
    publishedPagesReviewed.set(`${page.label}\t${page.r4Url}\t${page.r6Url}`, page);
  }
  for (const input of shard.report.scope?.localInputsUsed ?? []) {
    localInputsUsed.set(`${input.kind}\t${input.pathOrGlob}`, input);
  }
}

for (const input of [
  {
    kind: "OperationDefinition",
    pathOrGlob: "/home/jmandel/hobby/r6breaks/fhir-definitions/r4-4.0.1/package/OperationDefinition-*.json",
    purpose: "R4 operation inventory and parameter definitions.",
  },
  {
    kind: "OperationDefinition",
    pathOrGlob: "/home/jmandel/hobby/r6breaks/fhir-definitions/r6-6.0.0-ballot4/package/OperationDefinition-*.json",
    purpose: "R6 operation inventory and parameter definitions.",
  },
  {
    kind: "other",
    pathOrGlob: "/home/jmandel/hobby/r6breaks/batch/behavior/fmm-context.json",
    purpose: "FMM and standards-status context for fresh review judgments.",
  },
]) {
  localInputsUsed.set(`${input.kind}\t${input.pathOrGlob}`, input);
}

const manifestSummary = readManifestSummary(manifestPath);
const pageStatus = readPageStatus(sourceStatusPath);
const summary = summarize(findings);
const output = {
  schemaVersion: "fhir-r4-r6-operation-behavior/v1",
  behaviorName: "OperationDefinitions",
  scope: {
    assignedBehavior: "OperationDefinitions",
    oldVersionLabel: "FHIR R4 4.0.1",
    newVersionLabel: "FHIR R6 6.0.0-ballot4",
    localInputsUsed: [...localInputsUsed.values()].sort(compareBy("pathOrGlob")),
    publishedPagesReviewed: [...publishedPagesReviewed.values()].sort(compareBy("label")),
    scopeNotesMd: `Reduced from ${shards.length} operation shard reports in \`${path.relative(ROOT, shardDir)}\`. Each shard owns one common, R4-only, or R6-only operation group. This reducer keeps R4→R6 material findings, normalizes fresh-review FMM/status to the R4 baseline, and moves reverse-only or purely R6-additive findings into non-breaking notable changes.`,
    outOfScope: [
      "Underlying resource/datatype StructureDefinition changes except as operation dependencies.",
      "Search behavior except where an operation directly defines search-like behavior.",
      "Implementation-specific server CapabilityStatements beyond local core package examples.",
    ],
  },
  narrativeReportMd: [
    `# OperationDefinition behavior review`,
    ``,
    `This report was reduced from ${shards.length} operation-specific shard reports.`,
    ``,
    `Fresh-review judgments: ${formatRecord(summary.freshReviewCounts)}.`,
    `Reverse-only or purely R6-additive shard findings moved out of findings: ${excludedReverseOrAdditiveCount}.`,
    `Runtime/conformance risk counts: ${summary.runtimeRiskCount} runtime, ${summary.conformanceRiskCount} conformance.`,
  ].join("\n"),
  summary: {
    overallAssessment: summary.overallAssessment,
    overallImpact: summary.overallImpact,
    overallConfidence: summary.overallConfidence,
    breakingChangeCount: summary.breakingChangeCount,
    potentialBreakingChangeCount: summary.potentialBreakingChangeCount,
    runtimeRiskCount: summary.runtimeRiskCount,
    conformanceRiskCount: summary.conformanceRiskCount,
    requiresHumanReviewCount: summary.requiresHumanReviewCount,
    executiveSummaryMd: `Reduced ${findings.length} R4→R6 findings from ${shards.length} operation shards. Fresh-review counts: ${formatRecord(summary.freshReviewCounts)}. ${excludedReverseOrAdditiveCount} reverse-only or purely R6-additive agent findings were moved to non-breaking notable changes.`,
    migrationThemesMd: "Review operation removals/replacements, invocation context changes, parameter shape changes, and normative/high-FMM operation behavior first.",
    confidenceSummaryMd: `Reduction is mechanical. Agent-level confidence is preserved per finding. Local page cache coverage: ${pageStatus.ok} pages fetched, ${pageStatus.non200} non-200 candidates.`,
  },
  inventorySummary: {
    r4OperationDefinitionCount: manifestSummary.r4OperationDefinitionCount,
    r6OperationDefinitionCount: manifestSummary.r6OperationDefinitionCount,
    matchMethodCounts: manifestSummary.matchMethodCounts,
    removedCount: manifestSummary.removedCount,
    addedCount: manifestSummary.addedCount,
    changedCount: findings.length,
    likelyRenameOrReplacementCount: manifestSummary.likelyRenameOrReplacementCount,
    inventoryNotesMd: `Fanout manifest rows: ${manifestSummary.rows}. Shard reports reduced: ${shards.length}.`,
  },
  findings,
  checkedNoMaterialChange,
  nonBreakingNotableChanges,
  followUpDependencies,
  analysisLimitations,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${path.relative(ROOT, outPath)}`);

function prefixFindingId(finding, shardKey) {
  const findingId = finding.findingId?.startsWith(`${shardKey}:`)
    ? finding.findingId
    : `${shardKey}:${finding.findingId ?? "finding"}`;
  return { ...finding, findingId };
}

function normalizeFindingForR4ToR6(finding, shardKey, shardMeta, fmmContext) {
  const out = JSON.parse(JSON.stringify(finding));
  out.impact ??= {};
  out.freshReview ??= {};

  out.impact.r6ToR4RepresentabilityRisk = "Not applicable";
  if (out.impact.affectedDirection === "R6-to-R4" || out.impact.affectedDirection === "Both") {
    out.impact.affectedDirection = "R4-to-R6";
  }
  if (out.freshReview.compatibilityMechanism === "r6-to-r4-loss") {
    out.freshReview.compatibilityMechanism = inferR4Mechanism(out);
  }
  out.freshReview.fmmContext = r4BaselineFmmContext(out, shardKey, shardMeta, fmmContext);
  stripReverseScopeText(out);
  return out;
}

function inferR4Mechanism(finding) {
  const text = [
    finding.behaviorCategory,
    finding.title,
    finding.runtimeMechanismMd,
    finding.impact?.impactRationaleMd,
  ].filter(Boolean).join(" ").toLowerCase();
  if (text.includes("old-valid") || text.includes("new-invalid") || text.includes("reject")) return "old-valid-new-invalid";
  if (text.includes("capability") || text.includes("advertis")) return "metadata-tooling";
  if (text.includes("documentation") || text.includes("semantic")) return "semantic-or-documentation";
  return "runtime-api-codegen";
}

function r4BaselineFmmContext(finding, shardKey, shardMeta, fmmContext) {
  const oldId = finding.oldOperation?.id
    ?? firstId(shardMeta?.r4Ids)
    ?? firstId(shardKey.split("--")[0]);
  const r4 = oldId ? fmmContext.operationDefinitions?.[oldId]?.r4 : undefined;
  const existing = finding.freshReview?.fmmContext ?? {};
  if (!r4) {
    return {
      source: `${path.relative(ROOT, fmmContextPath)}: no R4 OperationDefinition baseline for ${oldId ?? shardKey}`,
      effect: "Neutral",
      rationaleMd: "No R4 OperationDefinition predecessor was found for this finding, so there is no R4 FMM or standards-status baseline that should increase the burden for R4→R6 compatibility. R6 maturity may matter for future R6 stability, but it is not used as compatibility pressure here.",
    };
  }
  return {
    ...existing,
    fmm: r4.fmm,
    standardsStatus: r4.standardsStatus,
    source: `${path.relative(ROOT, fmmContextPath)} operationDefinitions.${oldId}.r4`,
    effect: fmmEffect(r4),
    rationaleMd: `R4 baseline for \`${oldId}\` is ${maturityPhrase(r4)}. For this R4→R6 analysis, that R4 maturity/status is the stability pressure. R6 maturity/status is not used to increase the burden for breaking R4 clients or servers.`,
  };
}

function fmmEffect(maturity) {
  const status = String(maturity.standardsStatus ?? "").toLowerCase();
  const fmm = typeof maturity.fmm === "number" ? maturity.fmm : undefined;
  if (status === "normative" || (fmm ?? -1) >= 3) return "Raises burden of justification";
  if (fmm === 2) return "Neutral";
  if (fmm === 0 || fmm === 1) return "Softens stability concern";
  return "Unknown";
}

function maturityPhrase(maturity) {
  const parts = [];
  if (maturity.standardsStatus) parts.push(`standards-status \`${maturity.standardsStatus}\``);
  if (maturity.fmm != null) parts.push(`FMM ${maturity.fmm}`);
  if (parts.length === 0) return "no stated FMM or standards status";
  return parts.join(" and ");
}

function isOutOfScopeReverseOrAdditive(finding, shardMeta) {
  if (shardMeta?.kind === "r6-only") return true;
  return finding.impact?.affectedDirection === "R6-to-R4";
}

function reverseOrAdditiveToNotable(finding, shardKey) {
  return {
    changeId: `${shardKey}:${finding.findingId ?? "notable"}`,
    title: finding.title ?? "R6-only or reverse-direction behavior",
    operation: finding.newOperation ?? finding.oldOperation,
    whyNotBreakingMd: "Moved out of material findings during reduction because this item is reverse-only or purely additive R6 behavior. The current report is scoped to R4→R6 compatibility: whether R4 clients, servers, generated code, validators, conformance tests, or existing operation contracts break when moving to R6.",
    migrationAwarenessMd: finding.migrationGuidanceMd ?? finding.runtimeMechanismMd,
    confidence: finding.impact?.confidence ?? "Unknown",
  };
}

function stripReverseScopeText(finding) {
  for (const pathParts of [
    ["impact", "impactRationaleMd"],
    ["runtimeMechanismMd"],
    ["migrationGuidanceMd"],
    ["backwardCompatibilityAnalysisMd"],
    ["freshReview", "realWorldScenarioMd"],
    ["freshReview", "rationaleMd"],
    ["freshReview", "lessBreakingAlternative", "candidateDesignMd"],
    ["freshReview", "lessBreakingAlternative", "tradeoffsOrReasonMd"],
  ]) {
    setIfString(finding, pathParts, stripReverseSentences(getPath(finding, pathParts)));
  }
  for (const delta of finding.parameterDeltas ?? []) {
    if (typeof delta.impactMd === "string") delta.impactMd = stripReverseSentences(delta.impactMd);
  }
  for (const delta of finding.changedFields ?? []) {
    if (typeof delta.note === "string") delta.note = stripReverseSentences(delta.note);
  }
}

function stripReverseSentences(value) {
  if (typeof value !== "string" || !isReverseScopeText(value)) return value;
  const sentences = value.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((sentence) => !isReverseScopeText(sentence));
  return kept.join(" ").trim() || "Reverse-direction compatibility notes omitted; this report is scoped to R4→R6 compatibility.";
}

function isReverseScopeText(value) {
  return /\b(R6[- ]?to[- ]?R4|downgrade|round[- ]?trip|reverse[- ]direction|reverse\/discovery|against an R4 server|talking to R4 servers|R4 servers? will not know|R4 validators? and generated clients have no standard)\b/i.test(value);
}

function getPath(obj, parts) {
  let cur = obj;
  for (const part of parts) cur = cur?.[part];
  return cur;
}

function setIfString(obj, parts, value) {
  if (typeof value !== "string") return;
  let cur = obj;
  for (const part of parts.slice(0, -1)) {
    if (!cur?.[part]) return;
    cur = cur[part];
  }
  cur[parts[parts.length - 1]] = value;
}

function firstId(value) {
  if (!value) return undefined;
  return String(value).split(/[;,]/).map((s) => s.trim()).filter(Boolean)[0];
}

function summarize(findings) {
  const freshReviewCounts = {};
  let breakingChangeCount = 0;
  let potentialBreakingChangeCount = 0;
  let runtimeRiskCount = 0;
  let conformanceRiskCount = 0;
  let requiresHumanReviewCount = 0;
  let maxImpactIndex = 0;
  let minConfidenceIndex = 0;
  const impactOrder = ["Info", "Low", "Medium", "High", "Critical"];
  const confidenceOrder = ["High", "Medium", "Low", "Unknown"];

  for (const finding of findings) {
    const judgment = finding.freshReview?.judgment ?? "Unclear";
    freshReviewCounts[judgment] = (freshReviewCounts[judgment] ?? 0) + 1;
    if (judgment === "Revisit") breakingChangeCount += 1;
    if (judgment === "Unclear" || judgment === "Breaking but probably OK") potentialBreakingChangeCount += 1;
    if (finding.requiresHumanReview) requiresHumanReviewCount += 1;
    if (["Critical", "High"].includes(finding.impact?.runtimeBreakingRisk)) runtimeRiskCount += 1;
    if (["Critical", "High"].includes(finding.impact?.conformanceRisk)) conformanceRiskCount += 1;
    maxImpactIndex = Math.max(maxImpactIndex, impactOrder.indexOf(finding.impact?.runtimeBreakingRisk ?? "Info"), impactOrder.indexOf(finding.impact?.conformanceRisk ?? "Info"));
    minConfidenceIndex = Math.max(minConfidenceIndex, confidenceOrder.indexOf(finding.impact?.confidence ?? "Unknown"));
  }

  const hasRevisit = (freshReviewCounts.Revisit ?? 0) > 0;
  const hasUnclear = (freshReviewCounts.Unclear ?? 0) > 0;
  return {
    freshReviewCounts,
    breakingChangeCount,
    potentialBreakingChangeCount,
    runtimeRiskCount,
    conformanceRiskCount,
    requiresHumanReviewCount,
    overallAssessment: hasRevisit
      ? "Breaking behavior changes found"
      : hasUnclear
        ? "Potential breaking behavior changes found"
        : findings.length
          ? "Mostly runtime or conformance risks"
          : "No material behavior changes found",
    overallImpact: impactOrder[Math.max(0, maxImpactIndex)] ?? "Info",
    overallConfidence: confidenceOrder[Math.max(0, minConfidenceIndex)] ?? "Unknown",
  };
}

function readManifestSummary(file) {
  const summary = {
    rows: 0,
    r4OperationDefinitionCount: 47,
    r6OperationDefinitionCount: 42,
    matchMethodCounts: {},
    removedCount: 0,
    addedCount: 0,
    likelyRenameOrReplacementCount: 0,
  };
  if (!fs.existsSync(file)) return summary;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("key\t")) continue;
    const columns = line.split("\t");
    const kind = columns[1];
    const matchMethod = columns[2];
    summary.rows += 1;
    summary.matchMethodCounts[matchMethod] = (summary.matchMethodCounts[matchMethod] ?? 0) + 1;
    if (kind === "r4-only") summary.removedCount += 1;
    if (kind === "r6-only") summary.addedCount += 1;
    if (matchMethod.includes("candidate")) summary.likelyRenameOrReplacementCount += 1;
  }
  return summary;
}

function readManifestRows(file) {
  const rows = new Map();
  if (!fs.existsSync(file)) return rows;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("key\t")) continue;
    const [key, kind, matchMethod, r4Ids, r6Ids, r4Files, r6Files, candidatePages, notes] = line.split("\t");
    rows.set(key, { key, kind, matchMethod, r4Ids, r6Ids, r4Files, r6Files, candidatePages, notes });
  }
  return rows;
}

function readFmmContext(file) {
  if (!fs.existsSync(file)) return { operationDefinitions: {} };
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readPageStatus(file) {
  const status = { ok: 0, non200: 0 };
  if (!fs.existsSync(file)) return status;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("version\t")) continue;
    const code = line.split("\t")[3];
    if (code === "200") status.ok += 1;
    else status.non200 += 1;
  }
  return status;
}

function formatRecord(record) {
  return Object.entries(record)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ") || "none";
}

function compareBy(key) {
  return (a, b) => String(a[key] ?? "").localeCompare(String(b[key] ?? ""));
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) parsed[key] = true;
      else {
        parsed[key] = next;
        i += 1;
      }
    }
  }
  return parsed;
}
