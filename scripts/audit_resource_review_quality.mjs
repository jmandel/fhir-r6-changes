#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const root = resolve(import.meta.dirname, "..");
const reviewDir = resolve(args.reviewDir ?? `${root}/batch/resource-review/reviews`);
const contextDir = resolve(args.contextDir ?? `${root}/batch/resource-review/context`);
const manifestPath = resolve(args.manifest ?? `${root}/batch/resource-review/resource-review-manifest.tsv`);
const failOnIssues = Boolean(args.failOnIssues);
const failOnWarnings = Boolean(args.failOnWarnings);

const issues = [];
const warnings = [];
const summary = {
  files: 0,
  expectedResources: 0,
  missingReviews: 0,
  citedStructureFindings: 0,
  citedDirectBehaviorFindings: 0,
  citedSharedBehaviorFindings: 0,
  reviewsWithoutDrivers: 0,
  exactDuplicateOneLineConclusion: 0,
  exactDuplicateThesis: 0,
};

const expectedResources = existsSync(manifestPath)
  ? readFileSync(manifestPath, "utf8").trim().split(/\n/).filter(Boolean).map((line) => line.split("\t")[0])
  : [];
summary.expectedResources = expectedResources.length;

const files = readdirSync(reviewDir).filter((name) => name.endsWith(".resource-review.json")).sort();
summary.files = files.length;
const fileByResource = new Map(files.map((file) => [file.replace(/\.resource-review\.json$/, ""), file]));

for (const resource of expectedResources) {
  if (!fileByResource.has(resource)) {
    summary.missingReviews += 1;
    issues.push(`${resource}: missing review file`);
  }
}

const oneLineSeen = new Map();
const thesisSeen = new Map();

for (const file of files) {
  const reviewPath = `${reviewDir}/${file}`;
  const review = readJson(reviewPath, issues);
  if (!review) continue;
  const resource = review.resourceType ?? file.replace(/\.resource-review\.json$/, "");
  const prefix = `${resource}:`;
  const contextPath = resolveContextPath(review.reviewMethod?.contextPath, resource);
  const context = readJson(contextPath, issues, `${prefix} `);
  if (!context) continue;

  if (context.resourceType !== resource) {
    issues.push(`${prefix} context resourceType ${JSON.stringify(context.resourceType)} does not match review`);
  }
  if (review.reviewMethod?.reviewedStructureFindingCount !== context.findingInventory?.length) {
    issues.push(`${prefix} reviewedStructureFindingCount does not match context findingInventory length`);
  }
  if (review.reviewMethod?.reviewedDirectBehaviorFindingCount !== context.directBehaviorFindings?.length) {
    issues.push(`${prefix} reviewedDirectBehaviorFindingCount does not match context directBehaviorFindings length`);
  }
  if (review.reviewMethod?.reviewedSharedBehaviorContextCount !== context.sharedBehaviorContext?.length) {
    issues.push(`${prefix} reviewedSharedBehaviorContextCount does not match context sharedBehaviorContext length`);
  }

  const structureIds = new Map((context.findingInventory ?? []).map((finding) => [finding.findingId, finding]));
  const directBehaviorIds = new Map((context.directBehaviorFindings ?? []).map((finding) => [finding.findingId, finding]));
  const sharedBehaviorIds = new Map((context.sharedBehaviorContext ?? []).map((finding) => [finding.findingId, finding]));

  const considerations = review.findingConsiderations ?? [];
  const drivers = considerations.filter((finding) => finding.role === "drives-resource-conclusion");
  if (drivers.length === 0) {
    summary.reviewsWithoutDrivers += 1;
    warnings.push(`${prefix} no findingConsiderations with role drives-resource-conclusion`);
  }

  if ((context.findingInventory ?? []).length > 0 && !considerations.some((finding) => finding.sourceSurface === "StructureDefinition")) {
    warnings.push(`${prefix} has structure findings in context but no StructureDefinition findingConsiderations`);
  }

  for (const [index, finding] of considerations.entries()) {
    const itemPrefix = `${prefix} findingConsiderations[${index}]`;
    if (finding.sourceSurface === "StructureDefinition") {
      const source = structureIds.get(finding.findingId);
      if (!source) {
        issues.push(`${itemPrefix} cites unknown StructureDefinition findingId ${JSON.stringify(finding.findingId)}`);
      } else {
        summary.citedStructureFindings += 1;
        checkTitle(itemPrefix, finding.title, source.title);
      }
      continue;
    }
    if (finding.sourceSurface === "SharedBehaviorContext") {
      const source = sharedBehaviorIds.get(finding.findingId);
      if (!source) {
        issues.push(`${itemPrefix} cites unknown SharedBehaviorContext findingId ${JSON.stringify(finding.findingId)}`);
      } else {
        summary.citedSharedBehaviorFindings += 1;
        checkTitle(itemPrefix, finding.title, source.title);
      }
      continue;
    }
    const source = directBehaviorIds.get(finding.findingId);
    if (!source) {
      issues.push(`${itemPrefix} cites unknown direct behavior findingId ${JSON.stringify(finding.findingId)}`);
    } else {
      summary.citedDirectBehaviorFindings += 1;
      checkTitle(itemPrefix, finding.title, source.title);
      if (!source.sourceReport?.includes(`${finding.sourceSurface}.report.json`)) {
        warnings.push(`${itemPrefix} sourceSurface ${finding.sourceSurface} does not match source report ${source.sourceReport}`);
      }
    }
  }

  if (review.overall?.resourceMigrationShape === "removed-or-replaced-resource") {
    const hasIdentityDriver = drivers.some((finding) =>
      finding.sourceSurface === "StructureDefinition" && /ARTIFACT_IDENTITY|resource identity|absent|removed|replaced/i.test(finding.findingId + " " + finding.title + " " + finding.reasonMd)
    );
    if (!hasIdentityDriver) {
      warnings.push(`${prefix} removed-or-replaced-resource review has no obvious resource-identity driver`);
    }
  }

  const textFields = {
    "overall.oneLineConclusion": review.overall?.oneLineConclusion,
    "reasoning.thesisMd": review.reasoning?.thesisMd,
    "reasoning.migrationShapeMd": review.reasoning?.migrationShapeMd,
    "reasoning.compatibilityLeverageMd": review.reasoning?.compatibilityLeverageMd,
    "reasoning.lessBreakingAlternativesMd": review.reasoning?.lessBreakingAlternativesMd,
    "reasoning.behaviorImpactMd": review.reasoning?.behaviorImpactMd,
  };
  for (const [field, value] of Object.entries(textFields)) {
    if (typeof value !== "string" || value.trim().length < minLength(field)) {
      warnings.push(`${prefix} ${field} is shorter than expected (${String(value ?? "").length} chars)`);
    }
  }
  const identityText = `${textFields["overall.oneLineConclusion"] ?? ""} ${textFields["reasoning.thesisMd"] ?? ""}`;
  if (!new RegExp(`\\b${escapeRegExp(resource)}\\b`).test(identityText)) {
    warnings.push(`${prefix} main conclusion/thesis does not mention the resource name`);
  }

  recordDuplicate(oneLineSeen, normalizeText(review.overall?.oneLineConclusion), resource, "oneLine");
  recordDuplicate(thesisSeen, normalizeText(review.reasoning?.thesisMd), resource, "thesis");
}

for (const [text, resources] of oneLineSeen) {
  if (text && resources.length > 1) {
    summary.exactDuplicateOneLineConclusion += resources.length;
    warnings.push(`duplicate oneLineConclusion across: ${resources.join(", ")}`);
  }
}
for (const [text, resources] of thesisSeen) {
  if (text && resources.length > 1) {
    summary.exactDuplicateThesis += resources.length;
    warnings.push(`duplicate thesisMd across: ${resources.join(", ")}`);
  }
}

console.log(JSON.stringify({ reviewDir, contextDir, manifestPath, summary, issues: issues.length, warnings: warnings.length }, null, 2));
if (issues.length > 0) {
  console.error("\nIssues:");
  console.error(issues.join("\n"));
}
if (warnings.length > 0 && !args.quietWarnings) {
  console.error("\nWarnings:");
  console.error(warnings.slice(0, Number(args.maxWarnings ?? 200)).join("\n"));
  if (warnings.length > Number(args.maxWarnings ?? 200)) {
    console.error(`... ${warnings.length - Number(args.maxWarnings ?? 200)} more warnings`);
  }
}
if (issues.length > 0 && failOnIssues) process.exit(1);
if ((issues.length > 0 || warnings.length > 0) && failOnWarnings) process.exit(1);

function resolveContextPath(contextPath, resource) {
  if (typeof contextPath === "string" && contextPath.length > 0) {
    return contextPath.startsWith("/") ? contextPath : resolve(root, contextPath);
  }
  return `${contextDir}/${resource}.resource-review-context.json`;
}

function readJson(path, out, prefix = "") {
  if (!existsSync(path)) {
    out.push(`${prefix}missing file ${path}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    out.push(`${prefix}${basename(path)} JSON parse failed: ${error.message}`);
    return null;
  }
}

function checkTitle(prefix, actual, expected) {
  if (typeof actual !== "string" || typeof expected !== "string") return;
  if (titleSimilarity(actual, expected) < 0.68) {
    warnings.push(`${prefix} title differs from source title: ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`);
  }
}

function minLength(field) {
  if (field === "overall.oneLineConclusion") return 60;
  if (field === "reasoning.behaviorImpactMd") return 80;
  return 140;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function titleSimilarity(left, right) {
  const leftTokens = titleTokens(left);
  const rightTokens = titleTokens(right);
  if (leftTokens.size === 0 && rightTokens.size === 0) return 1;
  const union = new Set([...leftTokens, ...rightTokens]);
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  return intersection / union.size;
}

function titleTokens(value) {
  const stop = new Set(["a", "an", "and", "from", "is", "of", "the", "to"]);
  return new Set(
    normalizeText(value)
      .toLowerCase()
      .replace(/[`'"]/g, "")
      .replace(/[^a-z0-9_$-]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 0 && !stop.has(token))
  );
}

function recordDuplicate(map, text, resource) {
  if (!text) return;
  const resources = map.get(text) ?? [];
  resources.push(resource);
  map.set(text, resources);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--fail-on-issues") {
      out.failOnIssues = true;
      continue;
    }
    if (arg === "--fail-on-warnings") {
      out.failOnWarnings = true;
      continue;
    }
    if (arg === "--quiet-warnings") {
      out.quietWarnings = true;
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
