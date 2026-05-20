#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const root = resolve(import.meta.dirname, "..");
const reviewDir = resolve(args.reviewDir ?? join(root, "batch", "resource-review", "reviews"));
const outDir = resolve(args.outDir ?? join(root, "output", "resource-reviews"));
const indexPath = resolve(args.index ?? join(root, "output", "resource-reviews.index.json"));
const manifestPath = resolve(args.manifest ?? join(root, "batch", "resource-review", "resource-review-manifest.tsv"));
const quiet = Boolean(args.quiet);

if (!existsSync(reviewDir)) throw new Error(`Review directory does not exist: ${reviewDir}`);

const expectedResources = existsSync(manifestPath)
  ? readFileSync(manifestPath, "utf8").trim().split(/\n/).filter(Boolean).map((line) => line.split("\t")[0])
  : [];
const files = readdirSync(reviewDir).filter((name) => name.endsWith(".resource-review.json")).sort();
const reviews = files.map((file) => {
  const review = JSON.parse(readFileSync(join(reviewDir, file), "utf8"));
  return { file, review };
});

if (expectedResources.length > 0) {
  const seen = new Set(reviews.map(({ review }) => review.resourceType));
  const missing = expectedResources.filter((resource) => !seen.has(resource));
  if (missing.length > 0) {
    throw new Error(`Missing ${missing.length} expected resource reviews: ${missing.join(", ")}`);
  }
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const generatedAt = new Date().toISOString();
const resources = reviews
  .sort((a, b) => a.review.resourceType.localeCompare(b.review.resourceType))
  .map(({ file, review }) => {
    const outputFile = `${review.resourceType}.resource-review.json`;
    const reviewForOutput = normalizeReviewForOutput(review);
    writeJson(join(outDir, outputFile), reviewForOutput);
    return toIndexEntry(reviewForOutput, join(outDir, outputFile));
  });

const index = {
  schemaVersion: "fhir-r4-r6-resource-reviews-index/v1",
  generatedAt,
  source: {
    reviewDir: rel(reviewDir),
    manifestPath: existsSync(manifestPath) ? rel(manifestPath) : null,
    reviewCount: resources.length,
    expectedResourceCount: expectedResources.length || null,
  },
  summary: summarize(resources),
  resources,
};

writeJson(indexPath, index);

if (!quiet) {
  console.log(`Published ${resources.length} resource reviews to ${rel(outDir)}`);
  console.log(`Wrote index to ${rel(indexPath)}`);
}

function toIndexEntry(review, outputPath) {
  const driverCount = (review.findingConsiderations ?? []).filter((finding) => finding.role === "drives-resource-conclusion").length;
  const sourceSurfaceCounts = countBy(review.findingConsiderations ?? [], (finding) => finding.sourceSurface ?? "Unknown");
  return {
    resourceType: review.resourceType,
    outputFile: rel(outputPath),
    r4Maturity: review.r4Maturity ?? null,
    overall: review.overall,
    reviewMethod: {
      reviewedStructureFindingCount: review.reviewMethod?.reviewedStructureFindingCount ?? null,
      reviewedDirectBehaviorFindingCount: review.reviewMethod?.reviewedDirectBehaviorFindingCount ?? null,
      reviewedSharedBehaviorContextCount: review.reviewMethod?.reviewedSharedBehaviorContextCount ?? null,
    },
    considerationCounts: {
      total: (review.findingConsiderations ?? []).length,
      drivers: driverCount,
      bySourceSurface: sourceSurfaceCounts,
      byRole: countBy(review.findingConsiderations ?? [], (finding) => finding.role ?? "Unknown"),
    },
    recommendedNextActionCount: (review.recommendedNextActions ?? []).length,
  };
}

function normalizeReviewForOutput(review) {
  const copy = JSON.parse(JSON.stringify(review));
  if (copy.reviewMethod) {
    copy.reviewMethod.contextPath = normalizeRepoPath(copy.reviewMethod.contextPath);
    copy.reviewMethod.structureReportPath = normalizeRepoPath(copy.reviewMethod.structureReportPath);
    copy.reviewMethod.deterministicAggregatePath = normalizeRepoPath(copy.reviewMethod.deterministicAggregatePath);
    copy.reviewMethod.behaviorReportPaths = (copy.reviewMethod.behaviorReportPaths ?? []).map(normalizeRepoPath);
  }
  return copy;
}

function summarize(resources) {
  return {
    resourceCount: resources.length,
    majorMigrationAlreadyUnavoidable: countBy(resources, (entry) => entry.overall?.majorMigrationAlreadyUnavoidable ?? "Missing"),
    resourceMigrationShape: countBy(resources, (entry) => entry.overall?.resourceMigrationShape ?? "Missing"),
    compatibilityLeverage: countBy(resources, (entry) => entry.overall?.compatibilityLeverage ?? "Missing"),
    confidence: countBy(resources, (entry) => entry.overall?.confidence ?? "Missing"),
    r4StabilityPressure: countBy(resources, (entry) => entry.r4Maturity?.stabilityPressure ?? "Missing"),
  };
}

function countBy(items, fn) {
  const out = {};
  for (const item of items) {
    const key = fn(item);
    out[key] = (out[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function rel(path) {
  return relative(root, path).replaceAll("\\", "/");
}

function normalizeRepoPath(value) {
  if (typeof value !== "string" || value.length === 0) return value;
  const resolved = value.startsWith("/") ? resolve(value) : resolve(root, value);
  const relativePath = rel(resolved);
  return relativePath.startsWith("..") ? value : relativePath;
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
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
    out[key] = value;
    i += 1;
  }
  return out;
}
