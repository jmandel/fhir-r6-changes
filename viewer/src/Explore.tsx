import React, { useMemo, useState } from "react";
import { flat, bundle, type FlatFinding } from "./data";
import { buildHref, type RouteState } from "./router";
import { TopBar, SubNav, Crumb, Footer } from "./Shell";
import { buildLlmMarkdown } from "./llmMarkdown";

const IMPACT_ORDER = ["Critical", "High", "Medium", "Low", "Info"];
const BREAK_ORDER = ["Yes", "Potential", "Unknown", "No"];
const OVERALL_ASSESSMENT_ORDER = ["Revisit", "Unclear", "Breaking but probably OK", "No problem", "—"];

const IMPACT_COLOR: Record<string, string> = {
  Critical: "#8A1118", High: "#EC2028", Medium: "#F09225", Low: "#E8C547", Info: "#2E5DA8",
};
const BREAK_COLOR: Record<string, string> = {
  Yes: "#EC2028", Potential: "#F09225", Unknown: "#8A6800", No: "#2F8A4F",
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
const OVERALL_ASSESSMENT_COLOR: Record<string, string> = {
  "Revisit": "#EC2028",
  "Unclear": "#8A6800",
  "Breaking but probably OK": "#2E5DA8",
  "No problem": "#2F8A4F",
  "—": "#9C948C",
};

type Facet = {
  key: string;
  label: string;
  get: (f: FlatFinding) => string;
  order?: string[];
  colors?: Record<string, string>;
  group?: (v: string) => string;
};

function deltaGroup(v: string): string {
  if (!v || v === "—") return "—";
  if (v === "r6-not-representable-in-r4") return "representability";
  if (v === "artifact-identity-changed") return "artifact";
  if (v === "modifier-flag-changed") return "modifier-flag";
  if (v === "other") return "other";
  const m = v.match(/^([^-]+)/);
  return m ? m[1] : v;
}
const DELTA_GROUP_ORDER = [
  "artifact", "element", "cardinality", "binding", "type",
  "constraint", "code", "modifier-flag", "representability", "other", "—",
];

const R4_STATUS_ORDER = ["normative", "trial-use", "draft", "informative", "deprecated", "—"];
const R4_STATUS_COLOR: Record<string, string> = {
  "normative": "#2F8A4F",
  "trial-use": "#2E5DA8",
  "draft": "#8A6800",
  "informative": "#6B635C",
  "deprecated": "#8A1118",
};
const FMM_ORDER = ["5", "4", "3", "2", "1", "0", "—"];
const FMM_COLOR: Record<string, string> = {
  "5": "#2F8A4F", "4": "#2E5DA8", "3": "#8A6800", "2": "#F09225", "1": "#EC2028", "0": "#8A1118",
};
const MAX_FILTER_VALUES = 50;

const FACETS: Facet[] = [
  { key: "review",    label: "Overall Assessment",    get: (f) => f.freshReview?.judgment ?? "—", order: OVERALL_ASSESSMENT_ORDER, colors: OVERALL_ASSESSMENT_COLOR },
  { key: "impact",    label: "Impact (severity)",     get: (f) => f.impact?.overallImpact ?? "Info", order: IMPACT_ORDER, colors: IMPACT_COLOR },
  { key: "breaking",  label: "Hard instance break",   get: (f) => f.impact?.hardInstanceBreaking ?? "Unknown", order: BREAK_ORDER, colors: BREAK_COLOR },
  { key: "r4Status",  label: "R4 standards status",   get: (f) => f.r4Maturity?.standardsStatus ?? "—", order: R4_STATUS_ORDER, colors: R4_STATUS_COLOR },
  { key: "r4Fmm",     label: "R4 maturity (FMM)",     get: (f) => f.r4Maturity?.fmm != null ? String(f.r4Maturity.fmm) : "—", order: FMM_ORDER, colors: FMM_COLOR },
  { key: "deltaKind", label: "Delta kind",            get: (f) => f.structuredDelta?.deltaKind ?? "—", group: deltaGroup },
  { key: "artifact",  label: "Resource / artifact",   get: (f) => f.artifactName },
];

export function Explore({ route }: { route: RouteState }) {
  // First-visit default: hard breaks only. If the user arrives with a totally
  // empty URL hash (no query, no facets) push the default filter so the URL
  // stays the source of truth and the "Clear all" button can wipe it.
  React.useEffect(() => {
    if ([...route.params.keys()].length === 0) {
      location.hash = buildHref([], new URLSearchParams({ breaking: "Yes" }));
    }
  }, []);

  const q = route.params.get("q") ?? "";
  const [query, setQuery] = useState(q);
  React.useEffect(() => { setQuery(q); }, [q]);

  const active = useMemo(() => {
    const out: Record<string, Set<string>> = {};
    for (const f of FACETS) {
      const v = route.params.get(f.key);
      out[f.key] = v ? new Set(v.split(",").filter(Boolean)) : new Set();
    }
    return out;
  }, [route.params]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return flat.filter((f) => {
      for (const facet of FACETS) {
        const set = active[facet.key];
        if (set.size && !set.has(facet.get(f))) return false;
      }
      if (needle) {
        const hay = [
          f.title, f.findingId, f.artifactName, f.category,
          f.affectedLocation?.oldPath, f.affectedLocation?.newPath,
          f.justification?.inferredGoal,
          f.justification?.justificationRationaleMd,
          f.justification?.backwardCompatibleAlternativeSummary,
          f.justification?.alternativeTradeoffSummary,
          (f.justification as any)?.backwardCompatibleAlternativeMd,
          f.freshReview?.judgment,
          f.freshReview?.narrativeMd,
          f.freshReview?.compatibilityMechanism,
          f.freshReview?.lessBreakingAlternativeAssessment,
          f.backwardCompatibilityAnalysisMd,
          f.validationAndCompatibilityMd,
          f.oldState?.summary, f.newState?.summary,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [active, query]);

  const facetBins = useMemo(() => {
    const bins: Record<string, Map<string, number>> = {};
    for (const facet of FACETS) {
      const others = { ...active, [facet.key]: new Set<string>() };
      const m = new Map<string, number>();
      for (const f of flat) {
        let ok = true;
        for (const ff of FACETS) {
          const set = others[ff.key];
          if (set.size && !set.has(ff.get(f))) { ok = false; break; }
        }
        if (!ok) continue;
        if (query.trim()) {
          const needle = query.trim().toLowerCase();
          const hay = [
            f.title, f.findingId, f.artifactName, f.category,
            f.affectedLocation?.oldPath, f.affectedLocation?.newPath,
          ].filter(Boolean).join(" ").toLowerCase();
          if (!hay.includes(needle)) continue;
        }
        const v = facet.get(f);
        m.set(v, (m.get(v) ?? 0) + 1);
      }
      bins[facet.key] = m;
    }
    return bins;
  }, [active, query]);

  const allValues = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const f of FACETS) {
      const set = new Set<string>();
      for (const ff of flat) set.add(f.get(ff));
      const arr = [...set];
      if (f.order) {
        arr.sort((a, b) => {
          const ai = f.order!.indexOf(a); const bi = f.order!.indexOf(b);
          if (ai === -1 && bi === -1) return a.localeCompare(b);
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        });
      } else {
        arr.sort((a, b) => (facetBins[f.key].get(b) ?? 0) - (facetBins[f.key].get(a) ?? 0) || a.localeCompare(b));
      }
      out[f.key] = arr;
    }
    return out;
  }, [facetBins]);
  const visibleFacets = useMemo(
    () => FACETS.filter((facet) => {
      const distinctCount = allValues[facet.key]?.length ?? 0;
      return distinctCount > 1 && distinctCount <= MAX_FILTER_VALUES;
    }),
    [allValues]
  );

  const toggleFacet = (key: string, value: string) => {
    const next = new Set(active[key]);
    next.has(value) ? next.delete(value) : next.add(value);
    const params = new URLSearchParams(route.params);
    if (next.size === 0) params.delete(key);
    else params.set(key, [...next].join(","));
    location.hash = buildHref([], params);
  };
  const clearFacet = (key: string) => {
    const params = new URLSearchParams(route.params);
    params.delete(key);
    location.hash = buildHref([], params);
  };
  const setQ = (v: string) => {
    setQuery(v);
    const params = new URLSearchParams(route.params);
    if (v) params.set("q", v); else params.delete("q");
    history.replaceState(null, "", buildHref([], params));
  };
  const clearAll = () => { location.hash = "#/"; };

  const anyFiltersOn = Object.values(active).some((s) => s.size > 0) || query.length > 0;

  // Top-line stats — computed once over the full dataset.
  const stats = useMemo(() => {
    let critical = 0, high = 0, altYes = 0;
    for (const f of flat) {
      const imp = f.impact?.overallImpact;
      if (imp === "Critical") critical++;
      else if (imp === "High") high++;
      if (f.justification?.backwardCompatibleAlternativeAvailable === "Yes") altYes++;
    }
    return { critical, high, altYes };
  }, []);

  return (
    <>
      <TopBar />
      <SubNav />
      <Crumb>
        <span className="here">All findings across {bundle.reports.length} artifacts</span>
        <span className="crumb-actions">
          <CopyForLlmButton findings={filtered} active={active} query={query} totalAll={flat.length} />
        </span>
      </Crumb>

      <main className="changes-page">
        <aside className="changes-side">
          <div className="sidebar-top">
            <div className="filter-search">
              <input placeholder="Filter findings…" value={query} onChange={(e) => setQ(e.target.value)} />
            </div>
            {anyFiltersOn && (
              <button className="clear-all-top" onClick={clearAll} title="Reset search + every facet">
                Clear all filters
              </button>
            )}
          </div>

          {visibleFacets.map((facet) => (
            <FilterBlock
              key={facet.key}
              facet={facet}
              values={allValues[facet.key]}
              counts={facetBins[facet.key]}
              selected={active[facet.key]}
              onToggle={(v) => toggleFacet(facet.key, v)}
              onClear={() => clearFacet(facet.key)}
            />
          ))}

        </aside>

        <section className="changes-main">
          <div className="changes-h">
            <div>
              <h1>
                R4 → R6 findings
              </h1>
              <div className="sub">
                <b style={{ color: "var(--ink-2)", fontFamily: "var(--font-mono)" }}>R4 4.0.1</b> compared with{" "}
                <b style={{ color: "var(--ink-2)", fontFamily: "var(--font-mono)" }}>R6 6.0.0-ballot4</b>.
                Each finding includes the analyst's verdict on whether the breaking change was justified.
              </div>
            </div>
          </div>

          <div className="stats stats-4">
            <a className="stat stat-link" href={buildHref([])} title="Show all findings">
              <div className="k">Findings</div>
              <div className="v">{flat.length.toLocaleString()}</div>
              <div className="d">across {bundle.reports.length} artifacts</div>
            </a>
            <a className="stat stat-link" href={buildHref([], new URLSearchParams({ impact: "Critical" }))} title="Filter to Critical impact">
              <div className="k">Critical impact</div>
              <div className="v" style={{ color: "#8A1118" }}>{stats.critical.toLocaleString()}</div>
              <div className="d">overallImpact = Critical</div>
            </a>
            <a className="stat stat-link" href={buildHref([], new URLSearchParams({ impact: "High" }))} title="Filter to High impact">
              <div className="k">High impact</div>
              <div className="v" style={{ color: "#EC2028" }}>{stats.high.toLocaleString()}</div>
              <div className="d">overallImpact = High</div>
            </a>
            <div className="stat">
              <div className="k">Possibly avoidable</div>
              <div className="v" style={{ color: "#8A4500" }}>{stats.altYes.toLocaleString()}</div>
              <div className="d">a less-breaking alternative was identified</div>
            </div>
          </div>

          <ActiveFilters active={active} query={query} onClearFacet={clearFacet} onClearQuery={() => setQ("")} totalShown={filtered.length} totalAll={flat.length} />

          <ResultsList items={filtered} query={query} />
        </section>
      </main>
      <Footer />
    </>
  );
}

function FilterBlock({ facet, values, counts, selected, onToggle, onClear }: {
  facet: Facet;
  values: string[];
  counts: Map<string, number>;
  selected: Set<string>;
  onToggle: (v: string) => void;
  onClear: () => void;
}) {
  // Grouped rendering for facets that supplied a group() extractor.
  if (facet.group) {
    return <GroupedFilterBlock facet={facet} values={values} counts={counts} selected={selected} onToggle={onToggle} onClear={onClear} />;
  }
  return (
    <div className="filter-block">
      <div className="filter-h">
        {facet.label}
        {selected.size > 0 && <button className="clear" onClick={onClear}>Clear</button>}
      </div>
      <div className="filter-list">
        {values.map((v) => {
          const c = counts.get(v) ?? 0;
          const isSel = selected.has(v);
          const dot = facet.colors?.[v];
          const cls = `filter-row ${isSel ? "on" : ""} ${c === 0 && !isSel ? "disabled" : ""}`;
          return (
            <button
              key={v}
              className={cls}
              disabled={c === 0 && !isSel}
              onClick={() => (c === 0 && !isSel) ? undefined : onToggle(v)}
              title={c === 0 ? "No findings match with current filters" : undefined}
            >
              <span className="box" />
              {dot && <span className="sw-dot" style={{ background: dot }} />}
              <span className="lbl">{v || "—"}</span>
              <span className="cnt">{c.toLocaleString()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GroupedFilterBlock({ facet, values, counts, selected, onToggle, onClear }: {
  facet: Facet;
  values: string[];
  counts: Map<string, number>;
  selected: Set<string>;
  onToggle: (v: string) => void;
  onClear: () => void;
}) {
  const groups = new Map<string, string[]>();
  for (const v of values) {
    const g = facet.group!(v);
    const arr = groups.get(g) ?? [];
    arr.push(v);
    groups.set(g, arr);
  }
  const groupCounts = new Map<string, number>();
  for (const [g, vs] of groups) {
    let n = 0;
    for (const v of vs) n += counts.get(v) ?? 0;
    groupCounts.set(g, n);
  }
  const groupOrder = [...groups.keys()].sort((a, b) =>
    (groupCounts.get(b) ?? 0) - (groupCounts.get(a) ?? 0) || a.localeCompare(b)
  );

  return (
    <div className="filter-block">
      <div className="filter-h">
        {facet.label}
        {selected.size > 0 && <button className="clear" onClick={onClear}>Clear</button>}
      </div>
      <div className="filter-list grouped">
        {groupOrder.map((g) => {
          const leaves = groups.get(g) ?? [];
          return (
            <div key={g} className="facet-subgroup">
              <div className="facet-subgroup-h">{g}</div>
              {leaves.map((v) => {
                const c = counts.get(v) ?? 0;
                const isSel = selected.has(v);
                const cls = `filter-row leaf ${isSel ? "on" : ""} ${c === 0 && !isSel ? "disabled" : ""}`;
                const leafLabel = v.startsWith(g + "-") ? v.slice(g.length + 1) : v;
                return (
                  <button
                    key={v}
                    className={cls}
                    disabled={c === 0 && !isSel}
                    onClick={() => (c === 0 && !isSel) ? undefined : onToggle(v)}
                    title={v}
                  >
                    <span className="box" />
                    <span className="lbl">{leafLabel}</span>
                    <span className="cnt">{c.toLocaleString()}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActiveFilters({ active, query, onClearFacet, onClearQuery, totalShown, totalAll }: {
  active: Record<string, Set<string>>;
  query: string;
  onClearFacet: (k: string) => void;
  onClearQuery: () => void;
  totalShown: number;
  totalAll: number;
}) {
  const chips: { label: string; onClear: () => void }[] = [];
  if (query) chips.push({ label: `“${query}”`, onClear: onClearQuery });
  for (const facet of FACETS) {
    const set = active[facet.key];
    if (set.size > 0) {
      const values = [...set];
      const label = values.length === 1 ? `${facet.label}: ${values[0]}` : `${facet.label}: ${values.length}`;
      chips.push({ label, onClear: () => onClearFacet(facet.key) });
    }
  }
  return (
    <div className="toolbar">
      <span className="lbl">Showing {totalShown.toLocaleString()} of {totalAll.toLocaleString()}</span>
      {chips.length > 0 && <span className="lbl" style={{ marginLeft: 8 }}>Filters</span>}
      {chips.map((c, i) => (
        <span key={i} className="chip">
          <b>{c.label}</b>
          <button className="x" onClick={c.onClear} aria-label="Remove filter">×</button>
        </span>
      ))}
    </div>
  );
}

function ResultsList({ items, query }: { items: FlatFinding[]; query: string }) {
  if (items.length === 0) {
    return <div className="empty">No findings match these filters.</div>;
  }
  return (
    <>
      <table className="findings-table">
        <colgroup>
          <col style={{ width: 280 }} />
          <col style={{ width: 90 }} />
          <col style={{ width: 150 }} />
          <col style={{ width: 170 }} />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th>Artifact · path</th>
            <th>Impact</th>
            <th>Overall Assessment</th>
            <th>Verdict</th>
            <th>Delta</th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, 500).map((f) => (
            <FindingRows key={f.findingId} f={f} query={query} />
          ))}
        </tbody>
      </table>
      {items.length > 500 && (
        <div className="results-overflow">
          + {(items.length - 500).toLocaleString()} more matching. Narrow the filters to see them.
        </div>
      )}
    </>
  );
}

function stripArtifactPrefix(path: string, artifact: string): string {
  if (path.startsWith(artifact + ".")) return path.slice(artifact.length);
  return path;
}

function FindingRows({ f, query }: { f: FlatFinding; query: string }) {
  const href = buildHref(["f", f.findingId]);
  const impact = f.impact?.overallImpact ?? "Info";
  const freshReview = f.freshReview?.judgment;
  const verdict = f.justification?.justificationVerdict;
  const deltaKind = f.structuredDelta?.deltaKind;
  const path = f.affectedLocation?.newPath ?? f.affectedLocation?.oldPath;
  const pathTail = path && path !== f.artifactName ? stripArtifactPrefix(path, f.artifactName) : "";

  const onRowClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || (e as any).button === 1) return;
    if ((e.target as HTMLElement).closest("a")) return;
    window.open(href, "_blank", "noopener");
  };

  return (
    <>
      <tr className="ft-meta-row" onClick={onRowClick}>
        <td className="ft-path">
          <span className="path-resource">{f.artifactName}</span>
          {pathTail && <span className="path-element">{highlight(pathTail, query)}</span>}
        </td>
        <td className="ft-impact">
          <span className="impact-dot" style={{ background: IMPACT_COLOR[impact] }} />
          <span style={{ color: IMPACT_COLOR[impact], fontWeight: 600 }}>{impact}</span>
        </td>
        <td className="ft-verdict">{freshReviewCell(freshReview)}</td>
        <td className="ft-verdict">{verdictCell(verdict)}</td>
        <td className="ft-delta">{deltaKind ? <code className="delta-code">{deltaKind}</code> : <span className="dim">—</span>}</td>
      </tr>
      <tr className="ft-title-row" onClick={onRowClick}>
        <td colSpan={5}>
          <a className="ft-title" href={href} target="_blank" rel="noopener">{highlight(f.title, query)}</a>
          {f.justification?.inferredGoal && (
            <div className="ft-goal">{highlight(f.justification.inferredGoal, query)}</div>
          )}
        </td>
      </tr>
    </>
  );
}

function verdictCell(v?: string) {
  if (!v) return <span className="dim">—</span>;
  return <span style={{ color: VERDICT_COLOR[v] ?? "var(--ink-2)", fontWeight: 500 }}>{v}</span>;
}

function freshReviewCell(v?: string) {
  if (!v) return <span className="dim">—</span>;
  const color = OVERALL_ASSESSMENT_COLOR[v] ?? "var(--ink-2)";
  const weight = v === "Revisit" ? 700 : v === "Unclear" ? 600 : 500;
  return <span style={{ color, fontWeight: weight }}>{v}</span>;
}

function bcAltCell(v?: string) {
  if (!v) return <span className="dim">—</span>;
  const color = BCALT_COLOR[v] ?? "var(--ink-2)";
  const weight = v === "Yes" ? 700 : v === "Partial" ? 600 : 500;
  return <span style={{ color, fontWeight: weight }}>{v}</span>;
}

function CopyForLlmButton({ findings, active, query, totalAll }: {
  findings: FlatFinding[];
  active: Record<string, Set<string>>;
  query: string;
  totalAll: number;
}) {
  const [state, setState] = useState<"idle" | "ok" | "err">("idle");
  const onClick = async () => {
    const filters: { label: string; values: string[] }[] = [];
    for (const facet of FACETS) {
      const set = active[facet.key];
      if (set && set.size > 0) filters.push({ label: facet.label, values: [...set] });
    }
    const md = buildLlmMarkdown(findings, {
      url: location.href,
      totalShown: findings.length,
      totalAll,
      filters,
      query: query.trim() || undefined,
    });
    try {
      await navigator.clipboard.writeText(md);
      setState("ok");
    } catch {
      setState("err");
    }
    setTimeout(() => setState("idle"), 1800);
  };
  const label = state === "ok"
    ? `Copied ${findings.length.toLocaleString()} findings`
    : state === "err"
    ? "Copy failed"
    : `Copy for LLM (${findings.length.toLocaleString()})`;
  return (
    <button
      className={`pill-btn ${state === "ok" ? "primary" : ""}`}
      onClick={onClick}
      disabled={findings.length === 0}
      title="Copy currently-filtered findings to clipboard as Markdown for pasting into an LLM"
    >
      {label}
    </button>
  );
}

function highlight(text: string, q: string): React.ReactNode {
  if (!q.trim()) return text;
  const re = new RegExp(`(${q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
  const parts = text.split(re);
  return parts.map((p, i) => i % 2 === 1 ? <mark key={i}>{p}</mark> : <React.Fragment key={i}>{p}</React.Fragment>);
}
