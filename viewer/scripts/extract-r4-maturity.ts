// One-shot scan of the R4 StructureDefinition package to extract maturity
// metadata (standards status, FMM, work group, normative version) keyed by
// artifact name. The local `fhir-definitions/` directory is .gitignored, so
// we bake the result into a committed JSON file that `build-data.ts` reads.
// Re-run this when the R4 package changes:
//
//   cd viewer && bun run scripts/extract-r4-maturity.ts
//
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..", "..");
const r4PkgDir = join(root, "fhir-definitions", "r4-4.0.1", "package");
const outFile = resolve(import.meta.dir, "..", "r4-maturity.json");

const STATUS_EXT = "http://hl7.org/fhir/StructureDefinition/structuredefinition-standards-status";
const FMM_EXT    = "http://hl7.org/fhir/StructureDefinition/structuredefinition-fmm";
const WG_EXT     = "http://hl7.org/fhir/StructureDefinition/structuredefinition-wg";
const NORM_VER   = "http://hl7.org/fhir/StructureDefinition/structuredefinition-normative-version";

type R4Maturity = { standardsStatus?: string; fmm?: number; wg?: string; normativeVersion?: string };
const out: Record<string, R4Maturity> = {};

const sdFiles = (await readdir(r4PkgDir)).filter((f) => f.startsWith("StructureDefinition-") && f.endsWith(".json"));
for (const f of sdFiles) {
  try {
    const sd = JSON.parse(await readFile(join(r4PkgDir, f), "utf8"));
    if (!sd?.name) continue;
    const exts: any[] = sd.extension ?? [];
    const m: R4Maturity = {};
    for (const e of exts) {
      if (e.url === STATUS_EXT && e.valueCode) m.standardsStatus = e.valueCode;
      else if (e.url === FMM_EXT && typeof e.valueInteger === "number") m.fmm = e.valueInteger;
      else if (e.url === WG_EXT && e.valueCode) m.wg = e.valueCode;
      else if (e.url === NORM_VER && e.valueCode) m.normativeVersion = e.valueCode;
    }
    if (Object.keys(m).length > 0) out[sd.name] = m;
  } catch {
    // skip malformed defs
  }
}

const sorted = Object.fromEntries(Object.entries(out).sort((a, b) => a[0].localeCompare(b[0])));
await writeFile(outFile, JSON.stringify(sorted, null, 2) + "\n");
console.log(`extracted maturity for ${Object.keys(sorted).length} R4 artifacts → ${outFile}`);
