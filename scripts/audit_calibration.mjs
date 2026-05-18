#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const DEFAULT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

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
const reportDir = path.resolve(args["report-dir"] ?? path.join(DEFAULT_ROOT, "output"));
const failOnMissing = Boolean(args["fail-on-missing"]);

const reportFiles = fs.readdirSync(reportDir)
  .filter((name) => name.endsWith(".report.json"))
  .sort();

const counts = {
  reports: 0,
  findings: 0,
  missingJustification: 0,
  missingVerdict: 0,
  missingBcAlternative: 0,
  missingJustificationRationale: 0,
  invalidEnum: 0,
  strongVerdictWithYesAlternative: 0,
};
const valueCounts = new Map();
const invalids = [];
const calibrationWarnings = [];

for (const file of reportFiles) {
  const full = path.join(reportDir, file);
  const report = JSON.parse(fs.readFileSync(full, "utf8"));
  counts.reports += 1;
  for (const finding of report.findings ?? []) {
    counts.findings += 1;
    const just = finding.justification;
    if (!just || typeof just !== "object") {
      counts.missingJustification += 1;
      counts.missingVerdict += 1;
      counts.missingBcAlternative += 1;
      counts.missingJustificationRationale += 1;
      continue;
    }
    for (const [field, values] of Object.entries(allowed)) {
      const value = just[field];
      if (value == null || value === "") {
        if (field === "justificationVerdict") counts.missingVerdict += 1;
        if (field === "backwardCompatibleAlternativeAvailable") counts.missingBcAlternative += 1;
        continue;
      }
      bump(valueCounts, `${field}\t${value}`);
      if (!values.has(value)) {
        counts.invalidEnum += 1;
        invalids.push(`${file} ${finding.findingId} ${field}=${JSON.stringify(value)}`);
      }
    }
    if (!just.justificationRationaleMd) counts.missingJustificationRationale += 1;

    const verdict = just.justificationVerdict ?? "missing";
    const bc = just.backwardCompatibleAlternativeAvailable ?? "missing";
    bump(valueCounts, `cross:verdict_bc\t${verdict}\t${bc}`);
    if ((verdict === "Justified" || verdict === "Probably justified") && bc === "Yes") {
      counts.strongVerdictWithYesAlternative += 1;
      calibrationWarnings.push(`${file} ${finding.findingId}: ${verdict} with BC alternative Yes`);
    }
  }
}

console.log(JSON.stringify(counts, null, 2));
console.log("");
printGroup(valueCounts, "justificationVerdict");
printGroup(valueCounts, "backwardCompatibleAlternativeAvailable");
printGroup(valueCounts, "cross:verdict_bc");

if (invalids.length) {
  console.error("Invalid enum values:");
  for (const line of invalids.slice(0, 50)) console.error(`  ${line}`);
  if (invalids.length > 50) console.error(`  ... ${invalids.length - 50} more`);
}

if (calibrationWarnings.length) {
  console.error("Calibration warnings:");
  for (const line of calibrationWarnings.slice(0, 50)) console.error(`  ${line}`);
  if (calibrationWarnings.length > 50) console.error(`  ... ${calibrationWarnings.length - 50} more`);
}

if (failOnMissing && (
  counts.missingJustification ||
  counts.missingVerdict ||
  counts.missingBcAlternative ||
  counts.missingJustificationRationale ||
  counts.invalidEnum
)) {
  process.exit(1);
}

function bump(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function printGroup(map, field) {
  const rows = [...map.entries()]
    .filter(([key]) => key.startsWith(`${field}\t`))
    .map(([key, count]) => [key.split("\t").slice(1).join("\t"), count])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  console.log(field);
  for (const [value, count] of rows) console.log(`  ${String(count).padStart(5)}  ${value}`);
  console.log("");
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
