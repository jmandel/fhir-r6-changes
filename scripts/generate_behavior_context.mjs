#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args["out-dir"] ?? path.join(ROOT, "batch", "behavior"));
const r4Package = path.resolve(args["r4-package"] ?? path.join(ROOT, "fhir-definitions", "r4-4.0.1", "package"));
const r6Package = path.resolve(args["r6-package"] ?? path.join(ROOT, "fhir-definitions", "r6-6.0.0-ballot4", "package"));
const pageManifest = path.resolve(args["page-manifest"] ?? path.join(ROOT, "agent-inputs", "behavior-page-manifest.tsv"));
const outPath = path.resolve(args.output ?? path.join(outDir, "fmm-context.json"));

if (args.help) {
  console.log(`Usage: node scripts/generate_behavior_context.mjs [--output FILE]

Writes batch/behavior/fmm-context.json with maturity/status context for
operations, key infrastructure resources, search parameters, and page families.`);
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });

const r4Structures = loadStructures(r4Package);
const r6Structures = loadStructures(r6Package);
const context = {
  schemaVersion: "behavior-fmm-context/v1",
  generatedAt: new Date().toISOString(),
  guidance: {
    summary: "FMM/standards status changes stability expectations; it is not itself impact.",
    effects: {
      "normative-or-fmm5": "Raises burden of justification",
      "fmm3-4": "Raises burden of justification for central/common workflows",
      "fmm2": "Neutral",
      "fmm0-1": "Softens stability concern unless real production, safety, regulatory, billing, public-health, audit, or expert-lossy migration impact is plausible",
    },
  },
  infrastructureArtifacts: {},
  operationDefinitions: {},
  searchParameters: {},
  pageFamilies: loadPageFamilies(pageManifest),
};

for (const artifact of [
  "OperationDefinition",
  "SearchParameter",
  "CapabilityStatement",
  "Bundle",
  "Parameters",
  "OperationOutcome",
  "Resource",
  "DomainResource",
  "StructureDefinition",
  "CompartmentDefinition",
  "Subscription",
  "SubscriptionTopic",
]) {
  context.infrastructureArtifacts[artifact] = {
    r4: r4Structures.get(artifact) ?? null,
    r6: r6Structures.get(artifact) ?? null,
  };
}

for (const op of loadArtifacts(r4Package, "OperationDefinition")) {
  context.operationDefinitions[op.id] ??= {};
  context.operationDefinitions[op.id].r4 = maturityFromArtifact(op);
}
for (const op of loadArtifacts(r6Package, "OperationDefinition")) {
  context.operationDefinitions[op.id] ??= {};
  context.operationDefinitions[op.id].r6 = maturityFromArtifact(op);
}

for (const sp of loadArtifacts(r4Package, "SearchParameter")) {
  context.searchParameters[sp.id] ??= {};
  context.searchParameters[sp.id].r4 = {
    ...maturityFromArtifact(sp),
    base: sp.base ?? [],
    code: sp.code,
    type: sp.type,
  };
}
for (const sp of loadArtifacts(r6Package, "SearchParameter")) {
  context.searchParameters[sp.id] ??= {};
  context.searchParameters[sp.id].r6 = {
    ...maturityFromArtifact(sp),
    base: sp.base ?? [],
    code: sp.code,
    type: sp.type,
  };
}

fs.writeFileSync(outPath, `${JSON.stringify(context, null, 2)}\n`);
console.log(`Wrote ${path.relative(ROOT, outPath)}`);

function loadStructures(packageDir) {
  const structures = new Map();
  for (const artifact of loadArtifacts(packageDir, "StructureDefinition")) {
    const key = artifact.type ?? artifact.id;
    structures.set(key, maturityFromArtifact(artifact));
  }
  return structures;
}

function loadArtifacts(packageDir, prefix) {
  if (!fs.existsSync(packageDir)) return [];
  return fs.readdirSync(packageDir)
    .filter((name) => name.startsWith(`${prefix}-`) && name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(packageDir, name), "utf8")));
}

function maturityFromArtifact(artifact) {
  return {
    id: artifact.id,
    url: artifact.url,
    name: artifact.name,
    title: artifact.title,
    status: artifact.status,
    standardsStatus: extensionValue(artifact, "structuredefinition-standards-status"),
    normativeVersion: extensionValue(artifact, "structuredefinition-normative-version"),
    fmm: extensionValue(artifact, "structuredefinition-fmm"),
    wg: extensionValue(artifact, "structuredefinition-wg"),
  };
}

function extensionValue(artifact, suffix) {
  const extension = (artifact.extension ?? []).find((ext) => String(ext.url ?? "").endsWith(suffix));
  if (!extension) return undefined;
  if ("valueInteger" in extension) return extension.valueInteger;
  if ("valueCode" in extension) return extension.valueCode;
  if ("valueString" in extension) return extension.valueString;
  if ("valueUri" in extension) return extension.valueUri;
  return undefined;
}

function loadPageFamilies(file) {
  const families = {};
  if (!fs.existsSync(file)) return families;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("page\t") || line.startsWith("#")) continue;
    const [page, family, priority, r4Url, r6Url, whyReview] = line.split("\t");
    if (!family) continue;
    families[family] ??= [];
    families[family].push({ page, priority, r4Url, r6Url, whyReview });
  }
  return families;
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
