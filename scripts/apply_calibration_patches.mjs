#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const DEFAULT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const JUSTIFICATION_FIELDS = [
  "justificationVerdict",
  "backwardCompatibleAlternativeAvailable",
  "inferredGoal",
  "backwardCompatibleAlternativeSummary",
  "justificationRationaleMd",
  "backwardCompatibleAlternativeMd",
  "alternativeTradeoffSummary",
];

const allowed = {
  justificationVerdict: new Set([
    "Justified",
    "Probably justified",
    "Not clearly justified",
    "Probably avoidable",
    "Cannot assess",
  ]),
  backwardCompatibleAlternativeAvailable: new Set([
    "Yes",
    "No",
    "Partial",
    "Not applicable",
    "Unknown",
  ]),
};

const args = parseArgs(process.argv.slice(2));
const inputDir = path.resolve(args["input-dir"] ?? path.join(DEFAULT_ROOT, "output"));
const patchDir = path.resolve(args["patch-dir"] ?? path.join(DEFAULT_ROOT, "batch", "calibration-simple", "patches"));
const inPlace = Boolean(args["in-place"]);
const dryRun = Boolean(args["dry-run"]);
const allowPartial = Boolean(args["allow-partial"]);
const outputDir = inPlace
  ? inputDir
  : path.resolve(args["output-dir"] ?? path.join(DEFAULT_ROOT, "output-calibrated"));
const backupDir = args["backup-dir"] ? path.resolve(args["backup-dir"]) : null;

if (inPlace && args["output-dir"]) {
  throw new Error("--output-dir cannot be used with --in-place");
}
if (!fs.existsSync(patchDir)) {
  throw new Error(`Patch directory not found: ${patchDir}`);
}
if (!dryRun) {
  fs.mkdirSync(outputDir, { recursive: true });
  if (backupDir) fs.mkdirSync(backupDir, { recursive: true });
}

const patchFiles = fs.readdirSync(patchDir)
  .filter((name) => name.endsWith(".calibration.json"))
  .sort();

let reportsUpdated = 0;
let findingsUpdated = 0;
const errors = [];

for (const patchFile of patchFiles) {
  const patchPath = path.join(patchDir, patchFile);
  let patch;
  try {
    patch = JSON.parse(fs.readFileSync(patchPath, "utf8"));
  } catch (error) {
    errors.push(`${patchFile}: invalid JSON: ${error.message}`);
    continue;
  }
  const artifactName = patch.artifactName ?? patchFile.replace(/\.calibration\.json$/, "");
  if (patch.schemaVersion !== "calibration-patch-simple-v1") {
    errors.push(`${patchFile}: expected schemaVersion calibration-patch-simple-v1, got ${JSON.stringify(patch.schemaVersion)}`);
    continue;
  }
  const reportPath = path.join(inputDir, `${artifactName}.report.json`);
  if (!fs.existsSync(reportPath)) {
    errors.push(`${patchFile}: report not found: ${reportPath}`);
    continue;
  }
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const patches = Array.isArray(patch.patches) ? patch.patches : null;
  if (!patches) {
    errors.push(`${patchFile}: missing patches[]`);
    continue;
  }
  if (!allowPartial && patches.length !== findings.length) {
    errors.push(`${patchFile}: patch count ${patches.length} does not match finding count ${findings.length}`);
    continue;
  }

  const byId = new Map();
  findings.forEach((finding, index) => byId.set(finding.findingId, { finding, index }));
  const seen = new Set();
  let localUpdated = 0;

  for (const entry of patches) {
    if (!entry || typeof entry !== "object") {
      errors.push(`${patchFile}: patch entry is not an object`);
      continue;
    }
    const findingId = entry.findingId;
    if (!findingId || typeof findingId !== "string") {
      errors.push(`${patchFile}: patch entry missing findingId`);
      continue;
    }
    if (seen.has(findingId)) {
      errors.push(`${patchFile}: duplicate patch for ${findingId}`);
      continue;
    }
    seen.add(findingId);
    const target = byId.get(findingId);
    if (!target) {
      errors.push(`${patchFile}: unknown findingId ${findingId}`);
      continue;
    }
    const justPatch = normalizeJustificationPatch(entry);
    validateRequiredPatchFields(patchFile, findingId, justPatch, errors, allowPartial);
    validateEnums(patchFile, findingId, justPatch, errors);
    target.finding.justification = {
      ...(target.finding.justification ?? {}),
      ...justPatch,
    };
    localUpdated += 1;
  }

  if (!allowPartial) {
    for (const finding of findings) {
      if (!seen.has(finding.findingId)) {
        errors.push(`${patchFile}: missing patch for ${finding.findingId}`);
      }
    }
  }

  if (errors.length) continue;

  reportsUpdated += 1;
  findingsUpdated += localUpdated;
  if (!dryRun) {
    const outPath = path.join(outputDir, `${artifactName}.report.json`);
    if (backupDir && inPlace) {
      fs.copyFileSync(reportPath, path.join(backupDir, `${artifactName}.report.json`));
    }
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  }
}

if (errors.length) {
  for (const error of errors.slice(0, 100)) console.error(error);
  if (errors.length > 100) console.error(`... ${errors.length - 100} more errors`);
  process.exit(1);
}

console.log(JSON.stringify({
  patchFiles: patchFiles.length,
  reportsUpdated,
  findingsUpdated,
  inputDir,
  patchDir,
  outputDir,
  dryRun,
  inPlace,
}, null, 2));

function normalizeJustificationPatch(entry) {
  const source = entry.justification && typeof entry.justification === "object"
    ? entry.justification
    : entry;
  const out = {};
  for (const field of JUSTIFICATION_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      out[field] = source[field];
    }
  }
  return out;
}

function validateRequiredPatchFields(patchFile, findingId, justPatch, errors, allowPartial) {
  if (allowPartial) return;
  for (const field of [
    "justificationVerdict",
    "backwardCompatibleAlternativeAvailable",
    "justificationRationaleMd",
  ]) {
    if (justPatch[field] == null || justPatch[field] === "") {
      errors.push(`${patchFile}: ${findingId} missing ${field}`);
    }
  }
}

function validateEnums(patchFile, findingId, justPatch, errors) {
  for (const [field, values] of Object.entries(allowed)) {
    const value = justPatch[field];
    if (value == null || value === "") continue;
    if (!values.has(value)) {
      errors.push(`${patchFile}: ${findingId} invalid ${field}=${JSON.stringify(value)}`);
    }
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (["in-place", "dry-run", "allow-partial"].includes(key)) {
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
