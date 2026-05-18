#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const STRUCTURE_SCHEMA = "fhir-r4-r6-breaking-change-assessment/v1";
const MERGE_SCHEMA = "fresh-review-merge-v1";
const allowedJudgments = new Set([
  "Revisit",
  "Unclear",
  "Breaking but probably OK",
  "No problem",
]);

const args = parseArgs(process.argv.slice(2));
const reportDir = path.resolve(args["report-dir"] ?? path.join(ROOT, "output"));
const failOnMissing = Boolean(args["fail-on-missing"]);
const expectedReviewedReports = optionalInteger(args["expected-reviewed-reports"], "--expected-reviewed-reports");
const expectedReviewedFindings = optionalInteger(args["expected-reviewed-findings"], "--expected-reviewed-findings");

if (!fs.existsSync(reportDir)) throw new Error(`Report directory not found: ${reportDir}`);

const reportFiles = fs.readdirSync(reportDir)
  .filter((name) => name.endsWith(".report.json"))
  .sort();

const counts = {
  reportFiles: reportFiles.length,
  structureReports: 0,
  reviewedReports: 0,
  findings: 0,
  findingsWithFreshReview: 0,
  missingFreshReview: 0,
  invalidJudgment: 0,
  missingRequiredText: 0,
  invalidSummary: 0,
  expectedReviewedReports,
  expectedReviewedFindings,
};

const judgmentCounts = new Map();
const errors = [];

for (const file of reportFiles) {
  const reportPath = path.join(reportDir, file);
  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch (error) {
    errors.push(`${file}: invalid JSON: ${error.message}`);
    continue;
  }

  if (report.schemaVersion !== STRUCTURE_SCHEMA) continue;
  counts.structureReports += 1;
  const findings = Array.isArray(report.findings) ? report.findings : [];
  if (findings.length === 0) continue;

  counts.reviewedReports += 1;
  counts.findings += findings.length;
  validateSummary(file, report.freshReviewSummary, findings.length, errors, counts);

  for (const finding of findings) {
    const review = finding?.freshReview;
    if (!review || typeof review !== "object") {
      counts.missingFreshReview += 1;
      errors.push(`${file}: ${finding?.findingId ?? "<missing findingId>"} missing freshReview`);
      continue;
    }
    counts.findingsWithFreshReview += 1;
    validateFreshReview(file, finding?.findingId, review, errors, counts, judgmentCounts);
  }
}

if (expectedReviewedReports != null && counts.reviewedReports !== expectedReviewedReports) {
  errors.push(`expected ${expectedReviewedReports} reviewed report(s), got ${counts.reviewedReports}`);
}
if (expectedReviewedFindings != null && counts.findings !== expectedReviewedFindings) {
  errors.push(`expected ${expectedReviewedFindings} reviewed finding(s), got ${counts.findings}`);
}

console.log(JSON.stringify(counts, null, 2));
console.log("");
console.log("judgment");
for (const [judgment, count] of [...judgmentCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
  console.log(`  ${String(count).padStart(5)}  ${judgment}`);
}
console.log("");

if (errors.length) {
  console.error("Embedded fresh review audit issues:");
  for (const error of errors.slice(0, 100)) console.error(`  ${error}`);
  if (errors.length > 100) console.error(`  ... ${errors.length - 100} more`);
}

if (failOnMissing && errors.length) process.exit(1);

function validateSummary(file, summary, findingCount, errors, counts) {
  if (!summary || typeof summary !== "object") {
    counts.invalidSummary += 1;
    errors.push(`${file}: missing freshReviewSummary`);
    return;
  }
  if (summary.schemaVersion !== MERGE_SCHEMA) {
    counts.invalidSummary += 1;
    errors.push(`${file}: invalid freshReviewSummary.schemaVersion=${JSON.stringify(summary.schemaVersion)}`);
  }
  if (summary.complete !== true) {
    counts.invalidSummary += 1;
    errors.push(`${file}: freshReviewSummary.complete is not true`);
  }
  if (summary.matchedFindingDecisionCount !== findingCount) {
    counts.invalidSummary += 1;
    errors.push(`${file}: matchedFindingDecisionCount ${JSON.stringify(summary.matchedFindingDecisionCount)} does not match finding count ${findingCount}`);
  }
  if (summary.missingFindingDecisionCount !== 0) {
    counts.invalidSummary += 1;
    errors.push(`${file}: missingFindingDecisionCount is ${JSON.stringify(summary.missingFindingDecisionCount)}`);
  }
}

function validateFreshReview(file, findingId, review, errors, counts, judgmentCounts) {
  const id = findingId ?? review.findingId ?? "<missing findingId>";
  if (review.findingId !== findingId) {
    counts.missingRequiredText += 1;
    errors.push(`${file}: ${id} freshReview.findingId does not match findingId`);
  }

  if (!allowedJudgments.has(review.judgment)) {
    counts.invalidJudgment += 1;
    errors.push(`${file}: ${id} invalid judgment=${JSON.stringify(review.judgment)}`);
  } else {
    bump(judgmentCounts, review.judgment);
  }

  for (const field of [
    "narrativeMd",
    "fmmEffect",
    "compatibilityMechanism",
    "lessBreakingAlternativeAssessment",
    "comparisonToExisting",
  ]) {
    if (typeof review[field] !== "string" || review[field].trim() === "") {
      counts.missingRequiredText += 1;
      errors.push(`${file}: ${id} missing non-empty freshReview.${field}`);
    }
  }
  if (!Array.isArray(review.keyEvidence) || review.keyEvidence.length === 0) {
    counts.missingRequiredText += 1;
    errors.push(`${file}: ${id} missing non-empty freshReview.keyEvidence[]`);
  }
}

function bump(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function optionalInteger(value, name) {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (key === "fail-on-missing") {
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
