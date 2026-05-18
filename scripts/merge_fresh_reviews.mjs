#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const STRUCTURE_SCHEMA = "fhir-r4-r6-breaking-change-assessment/v1";
const REVIEW_SCHEMA = "fresh-review-decisions-v1";
const MERGE_SCHEMA = "fresh-review-merge-v1";
const JUDGMENTS = [
  "Revisit",
  "Unclear",
  "Breaking but probably OK",
  "No problem",
];
const allowedJudgments = new Set(JUDGMENTS);

const args = parseArgs(process.argv.slice(2));
const reportDir = path.resolve(args["report-dir"] ?? path.join(ROOT, "output"));
const reviewDir = path.resolve(args["review-dir"] ?? path.join(ROOT, "batch", "fresh-review", "reviews"));
const inPlace = Boolean(args["in-place"]);
const dryRun = Boolean(args["dry-run"]);
const allowPartial = Boolean(args["allow-partial"]);
const copyBehavior = !inPlace && !Boolean(args["no-copy-behavior"]);
const outputDir = inPlace
  ? reportDir
  : path.resolve(args["output-dir"] ?? path.join(ROOT, "batch", "fresh-review", "merged-preview"));

if (inPlace && args["output-dir"]) {
  throw new Error("--output-dir cannot be used with --in-place");
}
if (!fs.existsSync(reportDir)) {
  throw new Error(`Report directory not found: ${reportDir}`);
}
if (!fs.existsSync(reviewDir)) {
  throw new Error(`Review directory not found: ${reviewDir}`);
}
if (!dryRun) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const { reviewsByArtifact, reviewIssues, reviewFileCount } = loadReviews(reviewDir);
if (reviewIssues.length) {
  for (const issue of reviewIssues.slice(0, 100)) console.error(issue);
  if (reviewIssues.length > 100) console.error(`... ${reviewIssues.length - 100} more review issues`);
  process.exit(1);
}

const reportFiles = fs.readdirSync(reportDir)
  .filter((name) => name.endsWith(".report.json"))
  .sort();

const counts = {
  reportFiles: reportFiles.length,
  structureReports: 0,
  passthroughReports: 0,
  reviewFiles: reviewFileCount,
  reportsWithReview: 0,
  findingsWithReview: 0,
  findingsMissingReview: 0,
  reportsWritten: 0,
  reportsUnchanged: 0,
  behaviorFilesCopied: 0,
  behaviorFilesUnchanged: 0,
  dryRun,
  inPlace,
  reportDir,
  reviewDir,
  outputDir,
};

const errors = [];
for (const file of reportFiles) {
  const sourcePath = path.join(reportDir, file);
  let report;
  try {
    report = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  } catch (error) {
    errors.push(`${file}: invalid JSON: ${error.message}`);
    continue;
  }

  if (report.schemaVersion !== STRUCTURE_SCHEMA) {
    counts.passthroughReports += 1;
    writeIfChanged(path.join(outputDir, file), `${JSON.stringify(report, null, 2)}\n`, counts, dryRun);
    continue;
  }

  counts.structureReports += 1;
  const artifactName = report.artifactName ?? file.replace(/\.report\.json$/, "");
  const review = reviewsByArtifact.get(artifactName);
  const findings = Array.isArray(report.findings) ? report.findings : [];

  if (!review) {
    delete report.freshReviewSummary;
    for (const finding of findings) delete finding.freshReview;
    counts.findingsMissingReview += findings.length;
    writeIfChanged(path.join(outputDir, file), `${JSON.stringify(report, null, 2)}\n`, counts, dryRun);
    continue;
  }

  const decisionsById = new Map();
  for (const decision of review.decisions) {
    decisionsById.set(decision.findingId, decision);
  }

  let matched = 0;
  let missing = 0;
  const judgmentCounts = {};
  for (const finding of findings) {
    const decision = decisionsById.get(finding.findingId);
    if (!decision) {
      delete finding.freshReview;
      missing += 1;
      continue;
    }
    finding.freshReview = normalizeDecision(decision);
    matched += 1;
    judgmentCounts[decision.judgment] = (judgmentCounts[decision.judgment] ?? 0) + 1;
  }

  if (!allowPartial && missing > 0) {
    errors.push(`${file}: review file ${review.file} is missing ${missing} finding decision(s)`);
    continue;
  }

  const findingIds = new Set(findings.map((finding) => finding.findingId));
  const unknown = review.decisions.filter((decision) => !findingIds.has(decision.findingId));
  if (unknown.length) {
    errors.push(`${file}: review file ${review.file} has ${unknown.length} unknown finding decision(s)`);
    continue;
  }

  report.freshReviewSummary = {
    schemaVersion: MERGE_SCHEMA,
    reviewSchemaVersion: review.schemaVersion,
    sourceReviewFile: path.relative(ROOT, review.path),
    findingDecisionCount: review.decisions.length,
    matchedFindingDecisionCount: matched,
    missingFindingDecisionCount: missing,
    complete: missing === 0 && matched === findings.length,
    judgmentCounts: orderedJudgmentCounts(judgmentCounts),
  };
  counts.reportsWithReview += 1;
  counts.findingsWithReview += matched;
  counts.findingsMissingReview += missing;
  writeIfChanged(path.join(outputDir, file), `${JSON.stringify(report, null, 2)}\n`, counts, dryRun);
}

if (errors.length) {
  for (const error of errors.slice(0, 100)) console.error(error);
  if (errors.length > 100) console.error(`... ${errors.length - 100} more errors`);
  process.exit(1);
}

if (copyBehavior) {
  copyReportTree(path.join(reportDir, "behavior"), path.join(outputDir, "behavior"), counts, dryRun);
}

console.log(JSON.stringify(counts, null, 2));

function loadReviews(dir) {
  const reviewsByArtifact = new Map();
  const reviewIssues = [];
  const files = fs.readdirSync(dir)
    .filter((name) => name.endsWith(".fresh-review.json"))
    .sort();

  for (const file of files) {
    const reviewPath = path.join(dir, file);
    let review;
    try {
      review = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
    } catch (error) {
      reviewIssues.push(`${file}: invalid JSON: ${error.message}`);
      continue;
    }

    if (review.schemaVersion !== REVIEW_SCHEMA) {
      reviewIssues.push(`${file}: expected schemaVersion ${REVIEW_SCHEMA}, got ${JSON.stringify(review.schemaVersion)}`);
      continue;
    }
    const artifactName = review.artifactName ?? file.replace(/\.fresh-review\.json$/, "");
    const decisions = Array.isArray(review.decisions) ? review.decisions : null;
    if (!decisions) {
      reviewIssues.push(`${file}: missing decisions[]`);
      continue;
    }

    const seen = new Set();
    for (const decision of decisions) {
      validateDecision(file, decision, seen, reviewIssues);
    }

    if (reviewsByArtifact.has(artifactName)) {
      reviewIssues.push(`${file}: duplicate review for artifact ${artifactName}`);
      continue;
    }
    reviewsByArtifact.set(artifactName, {
      ...review,
      artifactName,
      decisions,
      file,
      path: reviewPath,
    });
  }

  return { reviewsByArtifact, reviewIssues, reviewFileCount: files.length };
}

function validateDecision(file, decision, seen, issues) {
  if (!decision || typeof decision !== "object") {
    issues.push(`${file}: decision is not an object`);
    return;
  }
  if (!decision.findingId || typeof decision.findingId !== "string") {
    issues.push(`${file}: decision missing findingId`);
    return;
  }
  if (seen.has(decision.findingId)) {
    issues.push(`${file}: duplicate decision for ${decision.findingId}`);
    return;
  }
  seen.add(decision.findingId);
  if (!allowedJudgments.has(decision.judgment)) {
    issues.push(`${file}: ${decision.findingId} invalid judgment=${JSON.stringify(decision.judgment)}`);
  }
  for (const field of [
    "narrativeMd",
    "fmmEffect",
    "compatibilityMechanism",
    "lessBreakingAlternativeAssessment",
    "comparisonToExisting",
  ]) {
    if (typeof decision[field] !== "string" || decision[field].trim() === "") {
      issues.push(`${file}: ${decision.findingId} missing non-empty ${field}`);
    }
  }
  if (!Array.isArray(decision.keyEvidence) || decision.keyEvidence.length === 0) {
    issues.push(`${file}: ${decision.findingId} missing non-empty keyEvidence[]`);
  }
}

function normalizeDecision(decision) {
  const ordered = {};
  for (const key of [
    "findingId",
    "judgment",
    "narrativeMd",
    "keyEvidence",
    "fmmEffect",
    "compatibilityMechanism",
    "lessBreakingAlternativeAssessment",
    "comparisonToExisting",
    "fmmContext",
    "realWorldScenarioMd",
    "rationaleMd",
    "lessBreakingAlternative",
  ]) {
    if (Object.prototype.hasOwnProperty.call(decision, key)) ordered[key] = decision[key];
  }
  for (const key of Object.keys(decision).sort()) {
    if (!Object.prototype.hasOwnProperty.call(ordered, key)) ordered[key] = decision[key];
  }
  return ordered;
}

function orderedJudgmentCounts(counts) {
  const out = {};
  for (const judgment of JUDGMENTS) {
    if (counts[judgment]) out[judgment] = counts[judgment];
  }
  return out;
}

function writeIfChanged(targetPath, content, counts, dryRun) {
  const existing = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf8") : null;
  if (existing === content) {
    counts.reportsUnchanged += 1;
    return;
  }
  counts.reportsWritten += 1;
  if (dryRun) return;
  atomicWrite(targetPath, content);
}

function copyReportTree(sourceDir, targetDir, counts, dryRun) {
  if (!fs.existsSync(sourceDir)) return;
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyReportTree(sourcePath, targetPath, counts, dryRun);
    } else if (entry.isFile() && entry.name.endsWith(".report.json")) {
      const content = fs.readFileSync(sourcePath, "utf8");
      const existing = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf8") : null;
      if (existing === content) {
        counts.behaviorFilesUnchanged += 1;
      } else {
        counts.behaviorFilesCopied += 1;
        if (!dryRun) atomicWrite(targetPath, content);
      }
    }
  }
}

function atomicWrite(targetPath, content) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tmpPath = `${targetPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, content);
  fs.renameSync(tmpPath, targetPath);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (["in-place", "dry-run", "allow-partial", "no-copy-behavior"].includes(key)) {
      out[key] = true;
    } else {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      out[key] = value;
      i += 1;
    }
  }
  return out;
}
