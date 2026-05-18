import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";

const root = resolve(import.meta.dir, "..", "..");
const dataDir = process.env.DATA_DIR
  ? resolve(process.env.DATA_DIR)
  : join(root, "output");
const targetFile = resolve(import.meta.dir, "..", "data-bundle.ts");
const reviewDirSetting = process.env.REVIEW_DIR;
const reviewDir = reviewDirSetting && ["none", "off", "false", "0"].includes(reviewDirSetting.toLowerCase())
  ? null
  : reviewDirSetting
    ? resolve(reviewDirSetting)
    : join(root, "batch", "fresh-review", "reviews");
const behaviorDir = process.env.BEHAVIOR_DATA_DIR
  ? resolve(process.env.BEHAVIOR_DATA_DIR)
  : join(dataDir, "behavior");

const baseTsvPath = join(root, "agent-inputs", "r4-base-resources-and-datatypes.tsv");
let baseArtifacts: { name: string; kind: string; abstract: boolean }[] = [];
try {
  const txt = await readFile(baseTsvPath, "utf8");
  baseArtifacts = txt.split(/\r?\n/).filter(Boolean).map((line) => {
    const [name, kind, _id, abs] = line.split("\t");
    return { name, kind, abstract: abs === "true" };
  });
} catch {
  console.warn(`No base artifact TSV at ${baseTsvPath}; coverage will be unknown.`);
}

// R4 maturity / normative status — read from a checked-in JSON map produced
// by `scripts/extract-r4-maturity.ts`. The R4 package itself is .gitignored,
// so committing the extracted JSON makes the data available in CI builds.
const maturityPath = resolve(import.meta.dir, "..", "r4-maturity.json");
type R4Maturity = { standardsStatus?: string; fmm?: number; wg?: string; normativeVersion?: string };
let r4Maturity: Record<string, R4Maturity> = {};
try {
  r4Maturity = JSON.parse(await readFile(maturityPath, "utf8"));
  console.log(`loaded maturity for ${Object.keys(r4Maturity).length} R4 artifacts from ${maturityPath}`);
} catch {
  console.warn(`No r4-maturity.json at ${maturityPath}; maturity facet will be unknown. Run scripts/extract-r4-maturity.ts to regenerate.`);
}

const files = (await readdir(dataDir)).filter((f) => f.endsWith(".report.json"));
const reports: any[] = [];
const behaviorReports: any[] = [];
const parseFailures: { file: string; error: string }[] = [];
for (const f of files) {
  try {
    const p = join(dataDir, f);
    const [txt, st] = await Promise.all([readFile(p, "utf8"), stat(p)]);
    const parsed = JSON.parse(txt);
    parsed._mtimeMs = st.mtimeMs;
    parsed._sourcePath = p;
    if (isBehaviorReport(parsed)) {
      parsed._reportKey = behaviorReportKey(parsed, f);
      behaviorReports.push(parsed);
    } else {
      reports.push(parsed);
    }
  } catch (e) {
    parseFailures.push({ file: f, error: (e as Error).message });
    console.error(`failed to parse ${f}:`, (e as Error).message);
  }
}
reports.sort((a, b) => (a.artifactName ?? "").localeCompare(b.artifactName ?? ""));

const behaviorParseFailures: { file: string; error: string }[] = [];
const hasReducedOperationReport = behaviorReports.some((r) => r.behaviorName === "OperationDefinitions");
try {
  const nestedBehaviorFiles = await collectReportFiles(behaviorDir);
  for (const p of nestedBehaviorFiles) {
    try {
      const [txt, st] = await Promise.all([readFile(p, "utf8"), stat(p)]);
      const parsed = JSON.parse(txt);
      if (!isBehaviorReport(parsed)) continue;
      if (hasReducedOperationReport && parsed.behaviorName === "OperationDefinitions") continue;
      parsed._mtimeMs = st.mtimeMs;
      parsed._sourcePath = p;
      parsed._reportKey = behaviorReportKey(parsed, p);
      behaviorReports.push(parsed);
    } catch (e) {
      behaviorParseFailures.push({ file: p, error: (e as Error).message });
      console.error(`failed to parse behavior report ${p}:`, (e as Error).message);
    }
  }
  console.log(`loaded ${behaviorReports.length} behavior report(s)`);
} catch {
  console.warn(`No behavior report directory at ${behaviorDir}; behavior view will be empty until reports are generated.`);
}
behaviorReports.sort((a, b) => String(a._reportKey ?? "").localeCompare(String(b._reportKey ?? "")));

const freshReviewParseFailures: { file: string; error: string }[] = [];
const freshReviewByFindingId: Record<string, any> = {};
if (reviewDir) {
  try {
    const reviewFiles = (await readdir(reviewDir)).filter((f) => f.endsWith(".fresh-review.json"));
    for (const f of reviewFiles) {
      try {
        const review = JSON.parse(await readFile(join(reviewDir, f), "utf8"));
        if (review.schemaVersion !== "fresh-review-decisions-v1") {
          freshReviewParseFailures.push({ file: f, error: `unexpected schemaVersion ${JSON.stringify(review.schemaVersion)}` });
          continue;
        }
        for (const decision of review.decisions ?? []) {
          if (decision?.findingId) freshReviewByFindingId[decision.findingId] = decision;
        }
      } catch (e) {
        freshReviewParseFailures.push({ file: f, error: (e as Error).message });
        console.error(`failed to parse fresh review ${f}:`, (e as Error).message);
      }
    }
    console.log(`loaded ${Object.keys(freshReviewByFindingId).length} fresh review decision(s) from ${reviewDir}`);
  } catch {
    console.warn(`No fresh review directory at ${reviewDir}; fresh review overlay will be empty.`);
  }
} else {
  console.log("fresh review overlay disabled by REVIEW_DIR=none; using embedded report data only");
}

for (const report of reports) {
  for (const finding of report.findings ?? []) {
    const decision = freshReviewByFindingId[finding.findingId];
    if (decision) finding.freshReview = decision;
  }
}

const payload = {
  generatedAt: new Date().toISOString(),
  sourceDir: dataDir,
  behaviorSourceDir: behaviorDir,
  freshReviewSourceDir: reviewDir ?? "embedded",
  baseArtifacts,
  r4Maturity,
  parseFailures,
  behaviorParseFailures,
  freshReviewParseFailures,
  reports,
  behaviorReports,
};

await mkdir(dirname(targetFile), { recursive: true });
const ts = `// AUTO-GENERATED by scripts/build-data.ts — do not edit by hand
import type { BundleData } from "./types";
export const bundle: BundleData = ${JSON.stringify(payload, null, 2)} as unknown as BundleData;
`;
await writeFile(targetFile, ts);
console.log(`bundled ${reports.length} report(s) from ${dataDir} → ${targetFile}`);

function isBehaviorReport(report: any): boolean {
  return typeof report?.schemaVersion === "string" && report.schemaVersion.startsWith("fhir-r4-r6-") && report.schemaVersion.endsWith("-behavior/v1");
}

function behaviorReportKey(report: any, fallbackPath: string): string {
  const assigned = report?.scope?.assignedBehavior;
  if (assigned) return String(assigned);
  if (report?.behaviorName) return String(report.behaviorName);
  return fallbackPath.split(/[\\/]/).pop()?.replace(/\.report\.json$/, "") ?? fallbackPath;
}

async function collectReportFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(cur: string) {
    const entries = await readdir(cur, { withFileTypes: true });
    for (const entry of entries) {
      const p = join(cur, entry.name);
      if (entry.isDirectory()) await walk(p);
      else if (entry.isFile() && entry.name.endsWith(".report.json")) out.push(p);
    }
  }
  await walk(dir);
  return out.sort();
}
