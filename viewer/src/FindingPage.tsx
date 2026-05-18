import React from "react";
import { findingById } from "./data";
import { buildHref } from "./router";
import { Markdown } from "./Markdown";
import { TopBar, SubNav, Crumb, Footer } from "./Shell";

const IMPACT_COLOR: Record<string, string> = {
  Critical: "#8A1118", High: "#EC2028", Medium: "#F09225", Low: "#E8C547", Info: "#2E5DA8",
};
const VERDICT_COLOR: Record<string, string> = {
  "Justified": "#2F8A4F",
  "Probably justified": "#2E5DA8",
  "Cannot assess": "#E8C547",
  "Not clearly justified": "#F09225",
  "Probably avoidable": "#EC2028",
};
const BREAK_COLOR: Record<string, string> = {
  Yes: "#EC2028",
  Potential: "#F09225",
  Unknown: "#7B8494",
  No: "#2F8A4F",
};

export function FindingPage({ findingId }: { findingId: string }) {
  const f = findingById(findingId);
  if (!f) {
    return (
      <>
        <TopBar />
        <SubNav />
        <Crumb><a href="#/">↑ Explorer</a></Crumb>
        <main className="detail-page">
          <div className="empty">Finding not found: <code>{findingId}</code></div>
        </main>
        <Footer />
      </>
    );
  }
  const impact = f.impact ?? {};
  const just = f.justification ?? {};
  const delta = f.structuredDelta ?? {};
  const loc = f.affectedLocation ?? {};
  const ex = f.examples ?? {};
  const overallImpact = impact.overallImpact ?? "Info";
  const verdict = just.justificationVerdict;

  return (
    <>
      <TopBar />
      <SubNav />
      <Crumb>
        <a href="#/">↑ Explorer</a>
        <span className="sep">·</span>
        <a href={buildHref(["a", f.artifactName])} target="_blank" rel="noopener">{f.artifactName}</a>
        <span className="sep">·</span>
        <span className="here">{f.findingId}</span>
        <span style={{ marginLeft: "auto" }} />
        <RawJsonLink data={f} filename={`${f.findingId}.json`} />
      </Crumb>

      <main className="detail-page">
        <header className="detail-h">
          <h1>{f.title}</h1>
          <dl className="detail-meta">
            {impact.hardInstanceBreaking && (
              <>
                <dt>R4→R6 instance break</dt>
                <dd style={{ color: BREAK_COLOR[impact.hardInstanceBreaking] ?? undefined, fontWeight: 600 }}>
                  {impact.hardInstanceBreaking}
                </dd>
              </>
            )}
            {delta.deltaKind && <><dt>Delta kind</dt><dd><code>{delta.deltaKind}</code></dd></>}
            {loc.oldPath && <><dt>R4 path</dt><dd><SpecLink href={specUrl("R4", loc.oldPath)} title="Open in R4 spec"><code>{loc.oldPath}</code></SpecLink></dd></>}
            {loc.newPath && <><dt>R6 path</dt><dd><SpecLink href={specUrl("R6", loc.newPath)} title="Open in R6 ballot4 spec"><code>{loc.newPath}</code></SpecLink></dd></>}
          </dl>
        </header>

        <QuestionGroup q="What changed?">
          <Section title="Overview" md={f.narrativeMd} />
          {(f.oldState || f.newState) && (
            <section className="section">
              <h2>R4 vs R6 — element diff</h2>
              <StateDiff oldState={f.oldState} newState={f.newState} oldPath={loc.oldPath} newPath={loc.newPath} />
            </section>
          )}
          {Array.isArray(delta.facts) && delta.facts.length > 0 && (
            <section className="section">
              <h2>Structured delta</h2>
              <table className="table">
                <thead><tr><th>Field</th><th>R4</th><th>R6</th><th>Note</th></tr></thead>
                <tbody>
                  {delta.facts.map((d: any, i: number) => (
                    <tr key={i}>
                      <td><code>{d.field}</code></td>
                      <td><code className="dim">{fmt(d.oldValue)}</code></td>
                      <td><code>{fmt(d.newValue)}</code></td>
                      <td className="dim">{d.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </QuestionGroup>

        {(ex.examplesMd || ex.oldValidNewInvalidJson || ex.r6NotRepresentableInR4Json || ex.migrationExampleJson) && (
          <section className="section">
            <h2>Examples</h2>
            {ex.examplesMd && <div className="md"><Markdown source={ex.examplesMd} /></div>}
            <JsonExample label="Valid in R4 — invalid in R6" value={ex.oldValidNewInvalidJson} />
            <JsonExample label="Representable in R6 but not in R4" value={ex.r6NotRepresentableInR4Json} />
          </section>
        )}

        <QuestionGroup q="Why might R6 have done this?">
          {just.inferredGoal && (
            <section className="section">
              <h2>Inferred goal</h2>
              <p className="md">{just.inferredGoal}</p>
            </section>
          )}
          <Section title="Analyst rationale" md={just.justificationRationaleMd} />
        </QuestionGroup>
      </main>
      <Footer />
    </>
  );
}

function Section({ title, md }: { title: string; md?: string }) {
  if (!md || !md.trim()) return null;
  return (
    <section className="section">
      <h2>{title}</h2>
      <div className="md"><Markdown source={md} /></div>
    </section>
  );
}

function RiskValue({ value }: { value: string }) {
  const color = IMPACT_COLOR[value];
  return (
    <>
      {color && <span className="impact-dot" style={{ background: color }} />}
      <span style={{ color, fontWeight: color ? 600 : undefined }}>{value}</span>
    </>
  );
}

function QuestionGroup({ q, children }: { q: string; children: React.ReactNode }) {
  // Hide the whole group if no children render content (Section returns null when md is empty).
  const arr = React.Children.toArray(children).filter(Boolean);
  if (arr.length === 0) return null;
  return (
    <div className="qgroup">
      <div className="qgroup-h">{q}</div>
      {arr}
    </div>
  );
}

function StateDiff({ oldState, newState, oldPath, newPath }: {
  oldState?: any; newState?: any; oldPath?: string; newPath?: string;
}) {
  const card = (s: any) => s?.cardinality ? `${s.cardinality.min}..${s.cardinality.max}` : undefined;
  const types = (s: any) => Array.isArray(s?.types) && s.types.length > 0 ? s.types.map((t: any) => t.code).join(", ") : undefined;
  const binding = (s: any) => s?.binding ? `${s.binding.strength}${s.binding.valueSet ? ` → ${s.binding.valueSet}` : ""}` : undefined;
  const def = (s: any) => s?.semanticText?.definition;
  const sum = (s: any) => s?.summary;

  type Row = { k: string; oldV?: string; newV?: string; mono?: boolean };
  const rows: Row[] = [];
  const add = (k: string, oldV?: string, newV?: string, mono = true) => {
    if (oldV || newV) rows.push({ k, oldV, newV, mono });
  };
  add("Path", oldPath, newPath);
  add("Cardinality", card(oldState), card(newState));
  add("Types", types(oldState), types(newState));
  add("Binding", binding(oldState), binding(newState));
  add("Definition", def(oldState), def(newState), false);
  // sum() and narrativeMd are commentary about the change, not the changing
  // content itself — they live in the Overview section, not the diff.

  return (
    <div className="elem-diff">
      <div className="elem-diff-head">
        <span className="elem-diff-versions">
          <span className="ver ver-r4">R4 · 4.0.1</span> → <span className="ver ver-r6">R6 · 6.0.0-ballot4</span>
        </span>
      </div>
      <table className="elem-diff-table">
        <tbody>
          {rows.map((r) => (
            <tr key={r.k} className={(r.oldV ?? "") === (r.newV ?? "") ? "diff-row same" : "diff-row changed"}>
              <th>{r.k}</th>
              <td><DiffCell oldV={r.oldV} newV={r.newV} mono={r.mono} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DiffCell({ oldV, newV, mono }: { oldV?: string; newV?: string; mono?: boolean }) {
  const Wrap = ({ children }: { children: React.ReactNode }) => mono
    ? <code className="diff-code">{children}</code>
    : <span className="diff-text">{children}</span>;
  if (!oldV && !newV) return <span className="dim">—</span>;
  if (oldV && !newV) return <Wrap><span className="diff-del">{oldV}</span></Wrap>;
  if (!oldV && newV) return <Wrap><span className="diff-add">{newV}</span></Wrap>;
  if (oldV === newV) return <Wrap>{oldV}</Wrap>;
  const tokens = diffWords(oldV!, newV!);
  return (
    <Wrap>
      {tokens.map((t, i) =>
        t.type === "same" ? <span key={i}>{t.text}</span> :
        t.type === "del" ? <span key={i} className="diff-del">{t.text}</span> :
        <span key={i} className="diff-add">{t.text}</span>
      )}
    </Wrap>
  );
}

type DiffToken = { type: "same" | "add" | "del"; text: string };

// Word-level Myers/LCS diff with chunk-coalescing post-processing. Naive
// LCS produces fragmented add/del tokens around heavy edits. We fold a
// same-island into its surrounding chunks whenever it is *smaller* than
// the larger of the two flanking change runs — purely structural, no word
// lists, no fixed thresholds. The result is readable chunks of "this part
// changed" rather than alternating word-by-word tokens.

// If the LCS retains less than this fraction of non-whitespace content
// (measured against the longer side), we abandon interleaving and render
// the whole thing as one replacement block. Below this density the diff
// is dominated by stopword anchors that don't reflect semantic overlap
// and the result is harder to read than a plain before/after.
const MIN_MATCH_DENSITY = 0.75;

function diffWords(a: string, b: string): DiffToken[] {
  const at = a.split(/(\s+)/);
  const bt = b.split(/(\s+)/);
  const n = at.length, m = bt.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = at[i] === bt[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const raw: DiffToken[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (at[i] === bt[j]) { raw.push({ type: "same", text: at[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { raw.push({ type: "del", text: at[i] }); i++; }
    else { raw.push({ type: "add", text: bt[j] }); j++; }
  }
  while (i < n) raw.push({ type: "del", text: at[i++] });
  while (j < m) raw.push({ type: "add", text: bt[j++] });

  // Density check: if the LCS didn't preserve enough overlap, bail out to
  // a single replacement block.
  const nws = (s: string) => s.replace(/\s+/g, "").length;
  const sameChars = raw.filter((t) => t.type === "same").reduce((n, t) => n + nws(t.text), 0);
  const denom = Math.max(nws(a), nws(b));
  if (denom > 0 && sameChars / denom < MIN_MATCH_DENSITY) {
    const out: DiffToken[] = [];
    if (a) out.push({ type: "del", text: a });
    if (b) out.push({ type: "add", text: b });
    return out;
  }

  return collapseRuns(coalesceIslands(collapseRuns(raw)));
}

function collapseRuns(toks: DiffToken[]): DiffToken[] {
  const out: DiffToken[] = [];
  for (const t of toks) {
    const last = out[out.length - 1];
    if (last && last.type === t.type) last.text += t.text;
    else out.push({ ...t });
  }
  return out;
}

function coalesceIslands(toks: DiffToken[]): DiffToken[] {
  // Iterative chunking. Each pass folds a same-island into its flanking
  // changes whenever the island is structurally smaller than the nearby
  // edit activity. After each fold we re-collapse runs and may discover
  // new fold opportunities — keep going until the diff is stable.
  let cur = toks.slice();
  for (let pass = 0; pass < 6; pass++) {
    const next: DiffToken[] = [];
    const isChange = (x?: DiffToken) => !!x && (x.type === "del" || x.type === "add");
    const nws = (s: string) => s.replace(/\s+/g, "").length;
    let folded = false;
    for (let k = 0; k < cur.length; k++) {
      const t = cur[k];
      if (t.type !== "same") { next.push(t); continue; }
      const prev = next[next.length - 1];
      const after = cur[k + 1];
      if (!isChange(prev) || !isChange(after)) { next.push(t); continue; }
      // Look at the larger of the two flanking changes — the local edit
      // intensity. A same-island shorter than that gets folded.
      const flankSize = Math.max(nws(prev!.text), nws(after!.text));
      const sameSize = nws(t.text);
      if (sameSize === 0 || sameSize < flankSize) {
        if (prev!.type !== after!.type) {
          next.push({ type: "del", text: t.text });
          next.push({ type: "add", text: t.text });
        } else {
          next.push({ type: prev!.type, text: t.text });
        }
        folded = true;
      } else {
        next.push(t);
      }
    }
    cur = collapseRuns(next);
    if (!folded) break;
  }
  return cur;
}

function JsonExample({ label, value }: { label: string; value?: any }) {
  if (value === undefined || value === null) return null;
  let pretty: string;
  try {
    pretty = JSON.stringify(typeof value === "string" ? JSON.parse(value) : value, null, 2);
  } catch {
    pretty = String(value);
  }
  return (
    <div className="json-example">
      <div className="json-label">{label}</div>
      <pre><code>{pretty}</code></pre>
    </div>
  );
}

function SpecLink({ href, title, children }: { href: string; title?: string; children: React.ReactNode }) {
  return (
    <a className="spec-link" href={href} target="_blank" rel="noopener" title={title}>
      {children}<span className="spec-link-icon" aria-hidden="true">↗</span>
    </a>
  );
}

/**
 * Construct a URL to the relevant FHIR spec page for a path like
 * "Patient.deceased[x]". For a bare resource/datatype name, returns the
 * resource overview page; otherwise the element-anchored definitions page.
 *
 * R4  → https://hl7.org/fhir/R4/...
 * R6  → https://hl7.org/fhir/6.0.0-ballot4/... (the analyzed ballot)
 */
function specUrl(version: "R4" | "R6", path: string): string {
  const base = version === "R4"
    ? "https://hl7.org/fhir/R4"
    : "https://hl7.org/fhir/6.0.0-ballot4";
  const [head, ...rest] = path.split(".");
  const lower = head.toLowerCase();
  if (rest.length === 0) return `${base}/${lower}.html`;
  return `${base}/${lower}-definitions.html#${path}`;
}

function RawJsonLink({ data, filename }: { data: any; filename: string }) {
  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (w) setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  return <a href="#" onClick={onClick} title={filename}>Raw JSON ↗</a>;
}

function fmt(v: any) {
  if (v === undefined) return "—";
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}
