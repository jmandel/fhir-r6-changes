#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const DEFAULT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const allowedJudgments = new Set([
  "Revisit",
  "Unclear",
  "Breaking but probably OK",
  "No problem",
]);

const args = parseArgs(process.argv.slice(2));
const reportDir = path.resolve(args["report-dir"] ?? path.join(DEFAULT_ROOT, "output"));
const reviewDir = path.resolve(args["review-dir"] ?? path.join(DEFAULT_ROOT, "batch", "fresh-review", "reviews"));
const failOnMissing = Boolean(args["fail-on-missing"]);
const sampleMode = Boolean(args.sample);

if (!fs.existsSync(reportDir)) throw new Error(`Report directory not found: ${reportDir}`);
if (!fs.existsSync(reviewDir)) throw new Error(`Review directory not found: ${reviewDir}`);

const reportFiles = fs.readdirSync(reportDir)
  .filter((name) => name.endsWith(".report.json"))
  .sort();

const expected = new Map();
for (const file of reportFiles) {
  const reportPath = path.join(reportDir, file);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  if (report.schemaVersion !== "fhir-r4-r6-breaking-change-assessment/v1") continue;
  const findings = Array.isArray(report.findings) ? report.findings : [];
  if (findings.length === 0) continue;
  expected.set(report.artifactName ?? file.replace(/\.report\.json$/, ""), {
    file,
    findingIds: findings.map((finding) => finding.findingId),
  });
}

const reviewFiles = fs.readdirSync(reviewDir)
  .filter((name) => name.endsWith(".fresh-review.json"))
  .sort();

const counts = {
  expectedArtifacts: expected.size,
  reviewFiles: reviewFiles.length,
  artifactsReviewed: 0,
  expectedFindingsInReviewedArtifacts: 0,
  decisions: 0,
  missingArtifactReviews: 0,
  missingFindingDecisions: 0,
  duplicateFindingDecisions: 0,
  unknownFindingDecisions: 0,
  invalidJson: 0,
  invalidSchemaVersion: 0,
  invalidJudgment: 0,
  missingRequiredText: 0,
};

const judgmentCounts = new Map();
const errors = [];
const reviewedArtifacts = new Set();

for (const reviewFile of reviewFiles) {
  const reviewPath = path.join(reviewDir, reviewFile);
  let review;
  try {
    review = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
  } catch (error) {
    counts.invalidJson += 1;
    errors.push(`${reviewFile}: invalid JSON: ${error.message}`);
    continue;
  }

  if (review.schemaVersion !== "fresh-review-decisions-v1") {
    counts.invalidSchemaVersion += 1;
    errors.push(`${reviewFile}: expected schemaVersion fresh-review-decisions-v1, got ${JSON.stringify(review.schemaVersion)}`);
    continue;
  }

  const artifactName = review.artifactName ?? reviewFile.replace(/\.fresh-review\.json$/, "");
  const artifact = expected.get(artifactName);
  if (!artifact) {
    errors.push(`${reviewFile}: no matching structure report with findings for artifact ${artifactName}`);
    continue;
  }
  reviewedArtifacts.add(artifactName);
  counts.artifactsReviewed += 1;
  counts.expectedFindingsInReviewedArtifacts += artifact.findingIds.length;

  const expectedIds = new Set(artifact.findingIds);
  const seen = new Set();
  const decisions = Array.isArray(review.decisions) ? review.decisions : null;
  if (!decisions) {
    errors.push(`${reviewFile}: missing decisions[]`);
    continue;
  }
  counts.decisions += decisions.length;

  for (const decision of decisions) {
    if (!decision || typeof decision !== "object") {
      errors.push(`${reviewFile}: decision is not an object`);
      continue;
    }
    const findingId = decision.findingId;
    if (!findingId || typeof findingId !== "string") {
      errors.push(`${reviewFile}: decision missing findingId`);
      continue;
    }
    if (seen.has(findingId)) {
      counts.duplicateFindingDecisions += 1;
      errors.push(`${reviewFile}: duplicate decision for ${findingId}`);
      continue;
    }
    seen.add(findingId);
    if (!expectedIds.has(findingId)) {
      counts.unknownFindingDecisions += 1;
      errors.push(`${reviewFile}: unknown findingId ${findingId}`);
    }

    const judgment = decision.judgment;
    if (!allowedJudgments.has(judgment)) {
      counts.invalidJudgment += 1;
      errors.push(`${reviewFile}: ${findingId} invalid judgment=${JSON.stringify(judgment)}`);
    } else {
      bump(judgmentCounts, judgment);
    }

    for (const field of [
      "narrativeMd",
      "fmmEffect",
      "compatibilityMechanism",
      "lessBreakingAlternativeAssessment",
      "comparisonToExisting",
    ]) {
      if (typeof decision[field] !== "string" || decision[field].trim() === "") {
        counts.missingRequiredText += 1;
        errors.push(`${reviewFile}: ${findingId} missing non-empty ${field}`);
      }
    }
    if (!Array.isArray(decision.keyEvidence) || decision.keyEvidence.length === 0) {
      counts.missingRequiredText += 1;
      errors.push(`${reviewFile}: ${findingId} missing non-empty keyEvidence[]`);
    }
  }

  for (const findingId of expectedIds) {
    if (!seen.has(findingId)) {
      counts.missingFindingDecisions += 1;
      errors.push(`${reviewFile}: missing decision for ${findingId}`);
    }
  }
}

if (!sampleMode) {
  for (const artifactName of expected.keys()) {
    if (!reviewedArtifacts.has(artifactName)) {
      counts.missingArtifactReviews += 1;
      if (failOnMissing) {
        errors.push(`missing review file for ${artifactName}`);
      }
    }
  }
}

console.log(JSON.stringify(counts, null, 2));
console.log("");
console.log("judgment");
for (const [judgment, count] of [...judgmentCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
  console.log(`  ${String(count).padStart(5)}  ${judgment}`);
}
console.log("");

if (errors.length) {
  console.error("Fresh review audit issues:");
  for (const error of errors.slice(0, 100)) console.error(`  ${error}`);
  if (errors.length > 100) console.error(`  ... ${errors.length - 100} more`);
}

if (errors.length || (
  failOnMissing &&
  (
    counts.missingArtifactReviews ||
    counts.missingFindingDecisions ||
    counts.duplicateFindingDecisions ||
    counts.unknownFindingDecisions ||
    counts.invalidJson ||
    counts.invalidSchemaVersion ||
    counts.invalidJudgment ||
    counts.missingRequiredText
  )
)) {
  process.exit(1);
}

function bump(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (["fail-on-missing", "sample"].includes(key)) {
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
