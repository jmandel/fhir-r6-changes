import React from "react";
import { artifactByName } from "./data";
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
const BCALT_COLOR: Record<string, string> = {
  "Yes": "#EC2028", "Partial": "#F09225", "No": "#6B635C", "Not applicable": "#9C948C", "Unknown": "#8A6800",
};
const FRESH_REVIEW_COLOR: Record<string, string> = {
  "Revisit": "#EC2028",
  "Unclear": "#8A6800",
  "Breaking but probably OK": "#2E5DA8",
  "No problem": "#2F8A4F",
};

export function ArtifactPage({ artifactName }: { artifactName: string }) {
  const r = artifactByName(artifactName);
  if (!r) {
    return (
      <>
        <TopBar />
        <SubNav />
        <Crumb><a href="#/">↑ Explorer</a></Crumb>
        <main className="detail-page">
          <div className="empty">Artifact not found: <code>{artifactName}</code></div>
        </main>
        <Footer />
      </>
    );
  }
  const s = r.summary ?? {};
  const findings = r.findings ?? [];
  const deltaKinds = new Set<string>();
  let evidenceItems = 0;
  for (const f of findings) {
    if (f.structuredDelta?.deltaKind) deltaKinds.add(f.structuredDelta.deltaKind);
    evidenceItems += f.evidence?.length ?? 0;
  }

  return (
    <>
      <TopBar />
      <SubNav />
      <Crumb>
        <a href="#/">↑ Explorer</a>
        <span className="sep">·</span>
        <span className="here">{r.artifactName}</span>
        <span style={{ marginLeft: "auto" }} />
        <RawJsonLink data={r} filename={`${r.artifactName}.report.json`} />
      </Crumb>

      <main className="detail-page">
        <header className="detail-h">
          <div className="eyebrow">
            <span className="resource">{r.artifactName}</span>
            <span style={{ fontFamily: "var(--font-mono)" }}>{r.artifactKind ?? "unknown"}</span>
          </div>
          <h1>{r.artifactName} — R4 → R6 findings</h1>
          <div className="bdgs">
            {s.overallAssessment && <span className="bdg neutral">{s.overallAssessment}</span>}
          </div>
        </header>

        <div className="stats">
          <div className="stat">
            <div className="k">Findings</div>
            <div className="v">{findings.length}</div>
            <div className="d">in this artifact</div>
          </div>
          <div className="stat">
            <div className="k">Delta kinds</div>
            <div className="v">{deltaKinds.size}</div>
            <div className="d">represented in findings</div>
          </div>
          <div className="stat">
            <div className="k">Evidence items</div>
            <div className="v">{evidenceItems}</div>
            <div className="d">linked across findings</div>
          </div>
        </div>

        {s.executiveSummaryMd && (
          <section className="section"><h2>Executive summary</h2><div className="md"><Markdown source={s.executiveSummaryMd} /></div></section>
        )}
        {s.migrationThemesMd && (
          <section className="section"><h2>Migration themes</h2><div className="md"><Markdown source={s.migrationThemesMd} /></div></section>
        )}
        {s.confidenceSummaryMd && (
          <section className="section"><h2>Confidence</h2><div className="md"><Markdown source={s.confidenceSummaryMd} /></div></section>
        )}

        <section className="section">
          <h2>Findings ({findings.length})</h2>
          {findings.length === 0 ? (
            <p className="dim">No findings.</p>
          ) : (
            <table className="findings-table">
              <colgroup>
                <col style={{ width: 260 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 170 }} />
                <col style={{ width: 150 }} />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th>Path</th>
                  <th>Impact</th>
                  <th>Overall Assessment</th>
                  <th>Verdict</th>
                  <th>Less-breaking alt</th>
                  <th>Delta</th>
                </tr>
              </thead>
              <tbody>
                {findings.map((f) => {
                  const overall = f.impact?.overallImpact ?? "Info";
                  const freshReview = f.freshReview?.judgment;
                  const verdict = f.justification?.justificationVerdict;
                  const bcAlt = f.justification?.backwardCompatibleAlternativeAvailable;
                  const path = f.affectedLocation?.newPath ?? f.affectedLocation?.oldPath;
                  const tail = path && path.startsWith(r.artifactName + ".") ? path.slice(r.artifactName.length) : (path === r.artifactName ? "" : path ?? "");
                  const href = buildHref(["f", f.findingId]);
                  const open = (e: React.MouseEvent) => {
                    if (e.metaKey || e.ctrlKey) return;
                    if ((e.target as HTMLElement).closest("a")) return;
                    window.open(href, "_blank", "noopener");
                  };
                  return (
                    <React.Fragment key={f.findingId}>
                      <tr className="ft-meta-row" onClick={open}>
                        <td className="ft-path">
                          <span className="path-resource">{r.artifactName}</span>
                          {tail && <span className="path-element">{tail}</span>}
                        </td>
                        <td className="ft-impact">
                          <span className="impact-dot" style={{ background: IMPACT_COLOR[overall] }} />
                          <span style={{ color: IMPACT_COLOR[overall], fontWeight: 600 }}>{overall}</span>
                        </td>
                        <td className="ft-verdict">
                          {freshReview ? <span style={{ color: FRESH_REVIEW_COLOR[freshReview] ?? "var(--ink-2)", fontWeight: freshReview === "Revisit" ? 700 : 500 }}>{freshReview}</span> : <span className="dim">—</span>}
                        </td>
                        <td className="ft-verdict">{verdict ? <span style={{ color: VERDICT_COLOR[verdict] ?? "var(--ink-2)" }}>{verdict}</span> : <span className="dim">—</span>}</td>
                        <td className="ft-bcalt">
                          {bcAlt ? <span style={{ color: BCALT_COLOR[bcAlt] ?? "var(--ink-2)", fontWeight: bcAlt === "Yes" ? 700 : bcAlt === "Partial" ? 600 : 500 }}>{bcAlt}</span> : <span className="dim">—</span>}
                        </td>
                        <td className="ft-delta">{f.structuredDelta?.deltaKind ? <code className="delta-code">{f.structuredDelta.deltaKind}</code> : <span className="dim">—</span>}</td>
                      </tr>
                      <tr className="ft-title-row" onClick={open}>
                        <td colSpan={6}>
                          <a className="ft-title" href={href} target="_blank" rel="noopener">{f.title}</a>
                          {f.justification?.inferredGoal && (
                            <div className="ft-goal">{f.justification.inferredGoal}</div>
                          )}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
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
