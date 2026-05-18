#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args["out-dir"] ?? path.join(ROOT, "batch", "behavior"));
const r4Package = path.resolve(args["r4-package"] ?? path.join(ROOT, "fhir-definitions", "r4-4.0.1", "package"));
const r6Package = path.resolve(args["r6-package"] ?? path.join(ROOT, "fhir-definitions", "r6-6.0.0-ballot4", "package"));

if (args.help) {
  console.log(`Usage: node scripts/generate_behavior_manifests.mjs [--out-dir DIR]

Generates deterministic behavior-review manifests:
  batch/behavior/operation-fanout.tsv
  batch/behavior/operation-pages.tsv`);
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });

const r4Ops = loadOperations(r4Package);
const r6Ops = loadOperations(r6Package);
const matches = matchOperations(r4Ops, r6Ops);
writeOperationFanout(matches, path.join(outDir, "operation-fanout.tsv"));
writeOperationPages(matches, path.join(outDir, "operation-pages.tsv"));

console.log(`R4 operations: ${r4Ops.length}`);
console.log(`R6 operations: ${r6Ops.length}`);
console.log(`Operation fanout rows: ${matches.length}`);
console.log(`Wrote ${path.relative(ROOT, path.join(outDir, "operation-fanout.tsv"))}`);
console.log(`Wrote ${path.relative(ROOT, path.join(outDir, "operation-pages.tsv"))}`);

function loadOperations(packageDir) {
  return fs.readdirSync(packageDir)
    .filter((name) => name.startsWith("OperationDefinition-") && name.endsWith(".json"))
    .sort()
    .map((name) => {
      const file = path.join(packageDir, name);
      const json = JSON.parse(fs.readFileSync(file, "utf8"));
      return normalizeOperation(json, file);
    });
}

function normalizeOperation(json, file) {
  const resources = Array.isArray(json.resource) ? json.resource.map(String).sort() : [];
  return {
    id: String(json.id ?? path.basename(file, ".json").replace(/^OperationDefinition-/, "")),
    url: json.url ? String(json.url) : "",
    name: json.name ? String(json.name) : "",
    code: json.code ? String(json.code) : "",
    resources,
    system: Boolean(json.system),
    type: Boolean(json.type),
    instance: Boolean(json.instance),
    file,
  };
}

function matchOperations(r4Ops, r6Ops) {
  const remainingR6 = new Map(r6Ops.map((op) => [op.id, op]));
  const rows = [];

  const uniqueR6ByUrl = uniqueMap(r6Ops, (op) => op.url);
  for (const r4 of r4Ops) {
    const r6 = r4.url ? uniqueR6ByUrl.get(r4.url) : undefined;
    if (r6 && remainingR6.has(r6.id)) {
      rows.push(makeRow("common", "canonical-url", [r4], [r6]));
      remainingR6.delete(r6.id);
    }
  }

  const matchedR4 = new Set(rows.flatMap((row) => row.r4Ops.map((op) => op.id)));
  const uniqueR6ByResourceCode = uniqueMap([...remainingR6.values()], resourceCodeKey);
  for (const r4 of r4Ops.filter((op) => !matchedR4.has(op.id))) {
    const key = resourceCodeKey(r4);
    const r6 = key ? uniqueR6ByResourceCode.get(key) : undefined;
    if (r6 && remainingR6.has(r6.id)) {
      rows.push(makeRow("common", "resource-and-code", [r4], [r6]));
      remainingR6.delete(r6.id);
      matchedR4.add(r4.id);
    }
  }

  const uniqueR6ByCode = uniqueMap(
    [...remainingR6.values()].filter((op) => op.resources.length === 0),
    (op) => op.code,
  );
  for (const r4 of r4Ops.filter((op) => !matchedR4.has(op.id))) {
    if (r4.resources.length > 0) continue;
    const r6 = r4.code ? uniqueR6ByCode.get(r4.code) : undefined;
    if (r6 && remainingR6.has(r6.id)) {
      rows.push(makeRow("common", "system-code", [r4], [r6]));
      remainingR6.delete(r6.id);
      matchedR4.add(r4.id);
    }
  }

  const unmatchedR4 = r4Ops.filter((op) => !matchedR4.has(op.id));
  for (const r4 of unmatchedR4) {
    const candidates = relatedCandidateIds(r4, [...remainingR6.values()]);
    rows.push(makeRow("r4-only", candidates.length ? "unmatched-with-same-code-candidates" : "unmatched", [r4], [], candidates));
  }

  for (const r6 of remainingR6.values()) {
    const candidates = relatedCandidateIds(r6, unmatchedR4);
    rows.push(makeRow("r6-only", candidates.length ? "unmatched-with-same-code-candidates" : "unmatched", [], [r6], candidates));
  }

  return rows.sort((a, b) => a.key.localeCompare(b.key));
}

function makeRow(kind, matchMethod, r4Ops, r6Ops, candidates = []) {
  const keyIds = [...r4Ops, ...r6Ops].map((op) => op.id);
  const key = sanitizeKey(keyIds.join("--") || `${kind}-${Math.random().toString(36).slice(2)}`);
  const pageCandidates = unique([...r4Ops, ...r6Ops].flatMap(operationPageCandidates));
  return {
    key,
    kind,
    matchMethod,
    r4Ops,
    r6Ops,
    pageCandidates,
    notes: candidates.length ? `Same-code candidate ids: ${candidates.join(", ")}` : "",
  };
}

function writeOperationFanout(rows, file) {
  const header = [
    "key",
    "kind",
    "matchMethod",
    "r4Ids",
    "r6Ids",
    "r4Files",
    "r6Files",
    "candidatePages",
    "notes",
  ];
  const lines = [header.join("\t")];
  for (const row of rows) {
    lines.push([
      row.key,
      row.kind,
      row.matchMethod,
      row.r4Ops.map((op) => op.id).join(","),
      row.r6Ops.map((op) => op.id).join(","),
      row.r4Ops.map((op) => op.file).join(","),
      row.r6Ops.map((op) => op.file).join(","),
      row.pageCandidates.join(","),
      row.notes,
    ].map(tsv).join("\t"));
  }
  fs.writeFileSync(file, `${lines.join("\n")}\n`);
}

function writeOperationPages(rows, file) {
  const seen = new Set();
  const lines = [["version", "page", "url", "operationKeys"].join("\t")];
  const pageToKeys = new Map();
  for (const row of rows) {
    for (const page of row.pageCandidates) {
      const keys = pageToKeys.get(page) ?? [];
      keys.push(row.key);
      pageToKeys.set(page, keys);
    }
  }
  for (const [page, keys] of [...pageToKeys.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    for (const [version, baseUrl] of [
      ["r4-4.0.1", "https://hl7.org/fhir/R4/"],
      ["r6-6.0.0-ballot4", "https://hl7.org/fhir/6.0.0-ballot4/"],
    ]) {
      const id = `${version}\t${page}`;
      if (seen.has(id)) continue;
      seen.add(id);
      lines.push([version, page, `${baseUrl}${page}`, unique(keys).join(",")].map(tsv).join("\t"));
    }
  }
  fs.writeFileSync(file, `${lines.join("\n")}\n`);
}

function operationPageCandidates(op) {
  if (!op.code) return [];
  const pages = [];
  for (const resource of op.resources.length ? op.resources : ["operation"]) {
    const lower = resource.toLowerCase();
    pages.push(`${lower}-operation-${op.code}.html`);
    pages.push(`operation-${lower}-${op.code}.html`);
  }
  pages.push(`operation-${op.code}.html`);
  return unique(pages);
}

function resourceCodeKey(op) {
  if (!op.code || op.resources.length === 0) return "";
  return `${op.resources.join(",")}|${op.code}`;
}

function relatedCandidateIds(op, candidates) {
  return candidates
    .filter((candidate) => {
      if (!resourceSetsRelated(op.resources, candidate.resources)) return false;
      return sameOrSimilarOperationCode(op.code, candidate.code);
    })
    .map((candidate) => candidate.id);
}

function resourceSetsRelated(left, right) {
  if (left.length === 0 && right.length === 0) return true;
  if (left.join(",") === right.join(",")) return true;
  return left.some((l) => right.some((r) => resourceRelated(l, r)));
}

function resourceRelated(left, right) {
  if (left === right) return true;
  const aliases = new Set([
    "MedicinalProduct|MedicinalProductDefinition",
  ]);
  return aliases.has(`${left}|${right}`) || aliases.has(`${right}|${left}`);
}

function sameOrSimilarOperationCode(left, right) {
  if (!left || !right) return false;
  if (left === right) return true;
  const normalize = (value) => value.replace(/-measure$/, "");
  return normalize(left) === normalize(right);
}

function uniqueMap(items, keyFn) {
  const seen = new Map();
  const dupes = new Set();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    if (seen.has(key)) dupes.add(key);
    else seen.set(key, item);
  }
  for (const dupe of dupes) seen.delete(dupe);
  return seen;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function sanitizeKey(value) {
  return value.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}

function tsv(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
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
