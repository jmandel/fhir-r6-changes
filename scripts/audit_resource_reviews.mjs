#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const root = resolve(import.meta.dirname, "..");
const reviewDir = resolve(args.reviewDir ?? `${root}/batch/resource-review/reviews`);
const failOnInvalid = Boolean(args.failOnInvalid);
const expected = args.expected ? Number(args.expected) : null;
const quiet = Boolean(args.quiet);
const onlyResource = args.onlyResource ?? null;

if (!existsSync(reviewDir)) {
  throw new Error(`Review directory does not exist: ${reviewDir}`);
}

let files = readdirSync(reviewDir).filter((name) => name.endsWith(".resource-review.json")).sort();
const errors = [];
if (onlyResource) {
  const onlyFile = `${onlyResource}.resource-review.json`;
  files = files.filter((name) => name === onlyFile);
  if (files.length === 0) errors.push(`${onlyFile}: review file not found`);
}
const counts = {
  files: files.length,
  majorMigrationAlreadyUnavoidable: {},
  compatibilityLeverage: {},
  migrationShape: {},
  confidence: {},
};

const enums = {
  majorMigrationAlreadyUnavoidable: new Set(["Yes", "Partial", "No", "Unknown"]),
  resourceMigrationShape: new Set([
    "removed-or-replaced-resource",
    "major-model-remodel",
    "moderate-targeted-remodel",
    "mostly-stable-with-local-breaks",
    "low-material-change",
    "not-enough-evidence",
  ]),
  compatibilityLeverage: new Set([
    "migration-program-dominates",
    "preserve-where-low-cost-but-expect-resource-migration",
    "preserve-compatibility-per-change",
    "no-special-break-avoidance-needed",
    "not-enough-evidence",
  ]),
  confidence: new Set(["High", "Medium", "Low", "Unknown"]),
  stabilityPressure: new Set(["Strong", "Meaningful", "Neutral", "Weak", "Unknown"]),
  sourceSurface: new Set([
    "StructureDefinition",
    "OperationDefinitions",
    "SearchParameters",
    "HttpRestBehavior",
    "SharedBehaviorContext",
  ]),
  findingRole: new Set([
    "drives-resource-conclusion",
    "important-but-local",
    "context-only",
    "discounted",
    "needs-follow-up",
  ]),
  actionPriority: new Set(["High", "Medium", "Low"]),
};

for (const file of files) {
  let review;
  try {
    review = JSON.parse(readFileSync(`${reviewDir}/${file}`, "utf8"));
  } catch (error) {
    errors.push(`${file}: JSON parse failed: ${error.message}`);
    continue;
  }
  const prefix = `${file}:`;
  const expectedResourceType = file.replace(/\.resource-review\.json$/, "");
  if (review.schemaVersion !== "fhir-r4-r6-resource-review/v1") {
    errors.push(`${prefix} bad schemaVersion ${JSON.stringify(review.schemaVersion)}`);
  }
  if (!isNonEmptyString(review.resourceType)) errors.push(`${prefix} missing resourceType`);
  if (isNonEmptyString(review.resourceType) && review.resourceType !== expectedResourceType) {
    errors.push(`${prefix} resourceType ${JSON.stringify(review.resourceType)} does not match filename`);
  }
  if (!review.reviewMethod?.structureReportPath) errors.push(`${prefix} missing reviewMethod.structureReportPath`);
  if (!isNonEmptyString(review.reviewMethod?.contextPath)) errors.push(`${prefix} missing reviewMethod.contextPath`);
  if (!Array.isArray(review.reviewMethod?.behaviorReportPaths)) {
    errors.push(`${prefix} missing reviewMethod.behaviorReportPaths`);
  }
  for (const countKey of [
    "reviewedStructureFindingCount",
    "reviewedDirectBehaviorFindingCount",
    "reviewedSharedBehaviorContextCount",
  ]) {
    if (!Number.isInteger(review.reviewMethod?.[countKey]) || review.reviewMethod[countKey] < 0) {
      errors.push(`${prefix} missing numeric reviewMethod.${countKey}`);
    }
  }
  if (!review.r4Maturity?.stabilityPressure) errors.push(`${prefix} missing r4Maturity.stabilityPressure`);
  if (review.r4Maturity?.stabilityPressure && !enums.stabilityPressure.has(review.r4Maturity.stabilityPressure)) {
    errors.push(`${prefix} bad r4Maturity.stabilityPressure ${JSON.stringify(review.r4Maturity.stabilityPressure)}`);
  }
  if (!review.overall?.majorMigrationAlreadyUnavoidable) {
    errors.push(`${prefix} missing overall.majorMigrationAlreadyUnavoidable`);
  } else if (!enums.majorMigrationAlreadyUnavoidable.has(review.overall.majorMigrationAlreadyUnavoidable)) {
    errors.push(`${prefix} bad overall.majorMigrationAlreadyUnavoidable ${JSON.stringify(review.overall.majorMigrationAlreadyUnavoidable)}`);
  }
  if (!review.overall?.resourceMigrationShape) errors.push(`${prefix} missing overall.resourceMigrationShape`);
  if (review.overall?.resourceMigrationShape && !enums.resourceMigrationShape.has(review.overall.resourceMigrationShape)) {
    errors.push(`${prefix} bad overall.resourceMigrationShape ${JSON.stringify(review.overall.resourceMigrationShape)}`);
  }
  if (!review.overall?.compatibilityLeverage) errors.push(`${prefix} missing overall.compatibilityLeverage`);
  if (review.overall?.compatibilityLeverage && !enums.compatibilityLeverage.has(review.overall.compatibilityLeverage)) {
    errors.push(`${prefix} bad overall.compatibilityLeverage ${JSON.stringify(review.overall.compatibilityLeverage)}`);
  }
  if (!review.overall?.confidence) errors.push(`${prefix} missing overall.confidence`);
  if (review.overall?.confidence && !enums.confidence.has(review.overall.confidence)) {
    errors.push(`${prefix} bad overall.confidence ${JSON.stringify(review.overall.confidence)}`);
  }
  if (!isNonEmptyString(review.overall?.oneLineConclusion)) {
    errors.push(`${prefix} missing overall.oneLineConclusion`);
  }
  if (!review.reasoning?.thesisMd) errors.push(`${prefix} missing reasoning.thesisMd`);
  if (!review.reasoning?.migrationShapeMd) errors.push(`${prefix} missing reasoning.migrationShapeMd`);
  if (!review.reasoning?.compatibilityLeverageMd) {
    errors.push(`${prefix} missing reasoning.compatibilityLeverageMd`);
  }
  if (!review.reasoning?.lessBreakingAlternativesMd) {
    errors.push(`${prefix} missing reasoning.lessBreakingAlternativesMd`);
  }
  if (!review.reasoning?.behaviorImpactMd) errors.push(`${prefix} missing reasoning.behaviorImpactMd`);
  if (!Array.isArray(review.findingConsiderations) || review.findingConsiderations.length === 0) {
    errors.push(`${prefix} missing findingConsiderations`);
  } else {
    const seen = new Set();
    review.findingConsiderations.forEach((finding, index) => {
      const itemPrefix = `${prefix} findingConsiderations[${index}]`;
      if (!enums.sourceSurface.has(finding?.sourceSurface)) {
        errors.push(`${itemPrefix} bad sourceSurface ${JSON.stringify(finding?.sourceSurface)}`);
      }
      if (!isNonEmptyString(finding?.findingId)) errors.push(`${itemPrefix} missing findingId`);
      if (!isNonEmptyString(finding?.title)) errors.push(`${itemPrefix} missing title`);
      if (!enums.findingRole.has(finding?.role)) errors.push(`${itemPrefix} bad role ${JSON.stringify(finding?.role)}`);
      if (!isNonEmptyString(finding?.reasonMd)) errors.push(`${itemPrefix} missing reasonMd`);
      const key = `${finding?.sourceSurface ?? ""}\u0000${finding?.findingId ?? ""}`;
      if (seen.has(key)) errors.push(`${itemPrefix} duplicate finding consideration`);
      seen.add(key);
    });
  }
  if (!Array.isArray(review.recommendedNextActions)) {
    errors.push(`${prefix} missing recommendedNextActions`);
  } else {
    review.recommendedNextActions.forEach((action, index) => {
      const itemPrefix = `${prefix} recommendedNextActions[${index}]`;
      if (!enums.actionPriority.has(action?.priority)) {
        errors.push(`${itemPrefix} bad priority ${JSON.stringify(action?.priority)}`);
      }
      if (!isNonEmptyString(action?.actionMd)) errors.push(`${itemPrefix} missing actionMd`);
    });
  }
  if (!Array.isArray(review.caveats)) errors.push(`${prefix} missing caveats`);
  inc(counts.majorMigrationAlreadyUnavoidable, review.overall?.majorMigrationAlreadyUnavoidable ?? "Missing");
  inc(counts.compatibilityLeverage, review.overall?.compatibilityLeverage ?? "Missing");
  inc(counts.migrationShape, review.overall?.resourceMigrationShape ?? "Missing");
  inc(counts.confidence, review.overall?.confidence ?? "Missing");
}

if (expected != null && files.length !== expected) {
  errors.push(`expected ${expected} review files, found ${files.length}`);
}

if (!quiet) {
  console.log(JSON.stringify({ reviewDir, ...counts, errors: errors.length }, null, 2));
}
if (errors.length > 0) {
  console.error(errors.join("\n"));
  if (failOnInvalid) process.exit(1);
}

function inc(obj, key) {
  obj[key] = (obj[key] ?? 0) + 1;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--fail-on-invalid") {
      out.failOnInvalid = true;
      continue;
    }
    if (arg === "--quiet") {
      out.quiet = true;
      continue;
    }
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
    out[key] = value;
    i += 1;
  }
  return out;
}
