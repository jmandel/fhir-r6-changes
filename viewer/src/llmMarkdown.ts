// Serialize a set of findings to idiomatic Markdown suitable for pasting
// into an LLM context. The output mirrors what the detail page renders
// (not the raw JSON): title + objective meta + Overview, structured diff,
// examples, and analyst rationale.

import type { FlatFinding } from "./data";

export interface CopyContext {
  url: string;
  totalShown: number;
  totalAll: number;
  filters: Array<{ label: string; values: string[] }>;
  query?: string;
}

function specUrl(version: "R4" | "R6", path: string): string {
  const base = version === "R4"
    ? "https://hl7.org/fhir/R4"
    : "https://hl7.org/fhir/6.0.0-ballot4";
  const [head, ...rest] = path.split(".");
  const lower = head.toLowerCase();
  if (rest.length === 0) return `${base}/${lower}.html`;
  return `${base}/${lower}-definitions.html#${path}`;
}

function card(s: any): string | undefined {
  return s?.cardinality ? `${s.cardinality.min}..${s.cardinality.max}` : undefined;
}
function types(s: any): string | undefined {
  if (!Array.isArray(s?.types) || s.types.length === 0) return undefined;
  return s.types.map((t: any) => t.code).join(", ");
}
function binding(s: any): string | undefined {
  if (!s?.binding) return undefined;
  return `${s.binding.strength}${s.binding.valueSet ? ` → ${s.binding.valueSet}` : ""}`;
}

function tableCell(v?: string): string {
  if (!v) return "—";
  // Escape pipes and collapse newlines so the markdown table stays valid.
  return v.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim() || "—";
}

function findingMarkdown(f: FlatFinding): string {
  const impact = f.impact ?? {};
  const just = f.justification ?? {};
  const delta = f.structuredDelta ?? {};
  const loc = f.affectedLocation ?? {};
  const ex = f.examples ?? {};
  const old = f.oldState;
  const neu = f.newState;

  const out: string[] = [];
  out.push(`## ${f.title}`);
  out.push("");

  // Objective meta block.
  const meta: string[] = [];
  if (impact.hardInstanceBreaking) meta.push(`- **R4→R6 instance break:** ${impact.hardInstanceBreaking}`);
  if (f.freshReview?.judgment) meta.push(`- **Overall Assessment:** ${f.freshReview.judgment}`);
  if (delta.deltaKind) meta.push(`- **Delta kind:** \`${delta.deltaKind}\``);
  if (loc.oldPath) meta.push(`- **R4 path:** \`${loc.oldPath}\` — [spec](${specUrl("R4", loc.oldPath)})`);
  if (loc.newPath) meta.push(`- **R6 path:** \`${loc.newPath}\` — [spec](${specUrl("R6", loc.newPath)})`);
  if (meta.length > 0) {
    out.push(...meta);
    out.push("");
  }

  // What changed? — Overview.
  if (f.narrativeMd?.trim()) {
    out.push("### Overview");
    out.push("");
    out.push(f.narrativeMd.trim());
    out.push("");
  }

  // R4 vs R6 element diff.
  const diffRows: Array<{ k: string; o?: string; n?: string }> = [];
  const add = (k: string, o?: string, n?: string) => { if (o || n) diffRows.push({ k, o, n }); };
  add("Path", loc.oldPath, loc.newPath);
  add("Cardinality", card(old), card(neu));
  add("Types", types(old), types(neu));
  add("Binding", binding(old), binding(neu));
  add("Definition", old?.semanticText?.definition, neu?.semanticText?.definition);
  if (diffRows.length > 0) {
    out.push("### R4 vs R6 element diff");
    out.push("");
    out.push("| Field | R4 (4.0.1) | R6 (6.0.0-ballot4) |");
    out.push("|---|---|---|");
    for (const r of diffRows) {
      out.push(`| ${r.k} | ${tableCell(r.o)} | ${tableCell(r.n)} |`);
    }
    out.push("");
  }

  // Structured delta facts.
  if (Array.isArray(delta.facts) && delta.facts.length > 0) {
    out.push("### Structured delta");
    out.push("");
    out.push("| Field | R4 | R6 | Note |");
    out.push("|---|---|---|---|");
    for (const d of delta.facts) {
      const oldV = d.oldValue === undefined ? "—" : typeof d.oldValue === "string" ? d.oldValue : JSON.stringify(d.oldValue);
      const newV = d.newValue === undefined ? "—" : typeof d.newValue === "string" ? d.newValue : JSON.stringify(d.newValue);
      out.push(`| \`${tableCell(d.field)}\` | ${tableCell(oldV)} | ${tableCell(newV)} | ${tableCell(d.note ?? "")} |`);
    }
    out.push("");
  }

  // Examples (only what we render, not the migration example).
  const exParts: string[] = [];
  if (ex.examplesMd?.trim()) exParts.push(ex.examplesMd.trim());
  if (ex.oldValidNewInvalidJson !== undefined && ex.oldValidNewInvalidJson !== null) {
    exParts.push("**Valid in R4 — invalid in R6:**");
    exParts.push("```json");
    exParts.push(jsonPretty(ex.oldValidNewInvalidJson));
    exParts.push("```");
  }
  if (ex.r6NotRepresentableInR4Json !== undefined && ex.r6NotRepresentableInR4Json !== null) {
    exParts.push("**Representable in R6 but not in R4:**");
    exParts.push("```json");
    exParts.push(jsonPretty(ex.r6NotRepresentableInR4Json));
    exParts.push("```");
  }
  if (exParts.length > 0) {
    out.push("### Examples");
    out.push("");
    out.push(...exParts);
    out.push("");
  }

  // Why might R6 have done this?
  const whyParts: string[] = [];
  if (just.inferredGoal?.trim()) {
    whyParts.push("**Inferred goal:** " + just.inferredGoal.trim());
  }
  if ((just as any).justificationRationaleMd?.trim()) {
    whyParts.push("**Analyst rationale:**");
    whyParts.push((just as any).justificationRationaleMd.trim());
  }
  if (whyParts.length > 0) {
    out.push("### Why might R6 have done this?");
    out.push("");
    out.push(...whyParts);
    out.push("");
  }

  if (f.freshReview) {
    out.push("### Overall Assessment");
    out.push("");
    out.push(`**Judgment:** ${f.freshReview.judgment}`);
    if (f.freshReview.narrativeMd?.trim()) {
      out.push("");
      out.push(f.freshReview.narrativeMd.trim());
    }
    if (f.freshReview.compatibilityMechanism?.trim()) {
      out.push("");
      out.push(`**Mechanism:** ${f.freshReview.compatibilityMechanism.trim()}`);
    }
    if (f.freshReview.fmmEffect?.trim()) {
      out.push("");
      out.push(`**FMM effect:** ${f.freshReview.fmmEffect.trim()}`);
    }
    if (f.freshReview.lessBreakingAlternativeAssessment?.trim()) {
      out.push("");
      out.push(`**Less-breaking alternative:** ${f.freshReview.lessBreakingAlternativeAssessment.trim()}`);
    }
    if (f.freshReview.comparisonToExisting?.trim()) {
      out.push("");
      out.push(`**Existing report:** ${f.freshReview.comparisonToExisting.trim()}`);
    }
    if (Array.isArray(f.freshReview.keyEvidence) && f.freshReview.keyEvidence.length > 0) {
      out.push("");
      out.push("**Key evidence:**");
      for (const item of f.freshReview.keyEvidence) out.push(`- ${item}`);
    }
    out.push("");
  }

  return out.join("\n");
}

function jsonPretty(v: any): string {
  try {
    return JSON.stringify(typeof v === "string" ? JSON.parse(v) : v, null, 2);
  } catch {
    return String(v);
  }
}

export function buildLlmMarkdown(findings: FlatFinding[], ctx: CopyContext): string {
  const out: string[] = [];
  out.push("# FHIR R4 → R6 breaking-change review");
  out.push("");
  out.push(`Source: ${ctx.url}`);
  out.push("");
  out.push(
    "This excerpt was exported from a viewer that compares the FHIR R4 (4.0.1) " +
    "and R6 (6.0.0-ballot4) StructureDefinitions and surfaces analyst findings " +
    "about breaking changes. The content below mirrors what the detail page renders " +
    "for each currently-visible finding (overview, structural element diff, " +
    "examples, and analyst rationale) — not the raw report JSON."
  );
  out.push("");
  out.push(`**Showing:** ${ctx.totalShown.toLocaleString()} of ${ctx.totalAll.toLocaleString()} findings`);
  out.push("");
  if (ctx.filters.length > 0 || ctx.query) {
    out.push("**Active filters:**");
    if (ctx.query) out.push(`- Search: \`${ctx.query}\``);
    for (const f of ctx.filters) {
      out.push(`- ${f.label}: ${f.values.join(", ")}`);
    }
    out.push("");
  }
  out.push("---");
  out.push("");
  for (const f of findings) {
    out.push(findingMarkdown(f));
    out.push("---");
    out.push("");
  }
  return out.join("\n");
}
