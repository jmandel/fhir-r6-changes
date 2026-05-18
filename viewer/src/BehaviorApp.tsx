import React, { useMemo, useState } from "react";
import { behaviorFlat, behaviorReports, type FlatBehaviorFinding } from "./data";
import { Markdown } from "./Markdown";
import { TopBar, SubNav, Crumb, Footer } from "./Shell";

export type BehaviorView = "operations" | "pages" | "all";

const RISK_ORDER = ["Critical", "High", "Medium", "Low", "Info", "Not applicable", "—"];
const OVERALL_ASSESSMENT_ORDER = ["Revisit", "Unclear", "Breaking but probably OK", "No problem", "—"];
const MAX_FILTER_VALUES = 50;

const RISK_COLOR: Record<string, string> = {
  Critical: "#8A1118",
  High: "#EC2028",
  Medium: "#F09225",
  Low: "#E8C547",
  Info: "#2E5DA8",
  "Not applicable": "#9C948C",
  "—": "#9C948C",
};
const OVERALL_ASSESSMENT_COLOR: Record<string, string> = {
  Revisit: "#EC2028",
  Unclear: "#8A6800",
  "Breaking but probably OK": "#2E5DA8",
  "No problem": "#2F8A4F",
  "—": "#9C948C",
};
const ALT_COLOR: Record<string, string> = {
  Yes: "#EC2028",
  Partial: "#F09225",
  No: "#6B635C",
  "Not applicable": "#9C948C",
  Unknown: "#8A6800",
  "—": "#9C948C",
};

type Facet = {
  key: string;
  label: string;
  get: (f: FlatBehaviorFinding) => string;
  order?: string[];
  colors?: Record<string, string>;
  group?: (v: string) => string;
  format?: (v: string) => string;
};

const FACETS: Facet[] = [
  { key: "judgment", label: "Overall Assessment", get: (f) => f.freshReview?.judgment ?? "—", order: OVERALL_ASSESSMENT_ORDER, colors: OVERALL_ASSESSMENT_COLOR },
  { key: "runtimeRisk", label: "Runtime risk", get: (f) => f.impact?.runtimeBreakingRisk ?? "—", order: RISK_ORDER, colors: RISK_COLOR },
  { key: "conformanceRisk", label: "Conformance risk", get: (f) => f.impact?.conformanceRisk ?? "—", order: RISK_ORDER, colors: RISK_COLOR },
  { key: "category", label: "Behavior category", get: (f) => f.behaviorCategory ?? f.category ?? "—", group: behaviorCategoryGroup, format: behaviorCategoryLabel },
  { key: "report", label: "Report", get: (f) => f.reportLabel },
];

function facetsForView(view: BehaviorView): Facet[] {
  return FACETS.filter((facet) => !(view === "pages" && facet.key === "conformanceRisk"));
}

function behaviorCategoryGroup(value: string): string {
  if (!value || value === "—") return "Miscellaneous";
  if (value.startsWith("operation-")) return "Operation lifecycle";
  if (value.startsWith("search-parameter-")) return "Search parameter lifecycle";
  if (
    value === "base-scope-changed" ||
    value === "expression-changed" ||
    value === "type-changed" ||
    value === "target-changed" ||
    value === "comparator-changed" ||
    value === "modifier-changed" ||
    value === "chain-changed" ||
    value === "composite-component-changed" ||
    value === "multiple-and-or-changed" ||
    value === "processing-mode-changed"
  ) return "Search semantics";
  if (
    value.includes("parameter") ||
    value === "parameter-binding-changed" ||
    value === "parameter-profile-changed"
  ) return "Operation parameters";
  if (value === "invocation-context-changed" || value === "affects-state-changed") return "Invocation behavior";
  if (
    value.includes("advertisement") ||
    value.includes("capability") ||
    value.includes("interaction") ||
    value.includes("endpoint") ||
    value.includes("format") ||
    value.includes("history") ||
    value.includes("conditional") ||
    value.includes("versioning") ||
    value.includes("transaction") ||
    value.includes("batch")
  ) return "Capability / REST";
  if (value.includes("semantic") || value.includes("text")) return "Narrative semantics";
  return "Miscellaneous";
}

const CATEGORY_LABELS: Record<string, string> = {
  "operation-removed": "Removed",
  "operation-added": "Added",
  "operation-renamed": "Renamed",
  "operation-replaced": "Replaced",
  "search-parameter-removed": "Removed",
  "search-parameter-added": "Added",
  "search-parameter-renamed": "Renamed",
  "search-parameter-replaced": "Replaced",
  "base-scope-changed": "Base scope",
  "expression-changed": "Expression",
  "type-changed": "Type",
  "target-changed": "Target",
  "comparator-changed": "Comparator",
  "modifier-changed": "Modifier",
  "chain-changed": "Chain",
  "composite-component-changed": "Composite component",
  "multiple-and-or-changed": "Multiple AND/OR",
  "processing-mode-changed": "Processing mode",
  "input-parameter-requiredness-changed": "Input requiredness",
  "input-parameter-type-changed": "Input type",
  "output-parameter-shape-changed": "Output shape",
  "parameter-binding-changed": "Binding",
  "parameter-profile-changed": "Profile",
  "invocation-context-changed": "Invocation context",
  "affects-state-changed": "Side effects",
  "capability-advertisement-changed": "Capability advertisement",
  "operation-advertisement-changed": "Operation advertisement",
  "search-advertisement-changed": "Search advertisement",
  "resource-endpoint-advertisement-changed": "Resource endpoint",
  "capability-semantics-changed": "Capability semantics",
  "system-interaction-changed": "System interaction",
  "resource-interaction-changed": "Resource interaction",
  "format-changed": "Format",
  "patch-format-changed": "Patch format",
  "conditional-behavior-changed": "Conditional behavior",
  "versioning-behavior-changed": "Versioning",
  "history-behavior-changed": "History",
  "transaction-or-batch-changed": "Transaction/batch",
  "semantic-text-changed": "Text changed",
  "other": "Other",
  "—": "—",
};

function behaviorCategoryLabel(value: string): string {
  return CATEGORY_LABELS[value] ?? value.replace(/-changed$/, "").replace(/-/g, " ");
}

const VIEW_LABEL: Record<BehaviorView, { title: string; crumb: string; sub: string }> = {
  operations: {
    title: "Operation findings",
    crumb: "Operations",
    sub: "OperationDefinition, operation pages, invocation routes, Parameters contracts, and operation-specific runtime behavior.",
  },
  pages: {
    title: "Page/API findings",
    crumb: "Pages/API",
    sub: "Non-operation behavior reports, including SearchParameter, HTTP, REST, CapabilityStatement, and published-page/API semantics.",
  },
  all: {
    title: "Behavior/API findings",
    crumb: "Behavior/API",
    sub: "Auxiliary R4-to-R6 reviews for behavior outside resource and datatype StructureDefinitions.",
  },
};

export function BehaviorApp({ view }: { view: BehaviorView }) {
  const [params, setParams] = useUrlParams();
  const meta = VIEW_LABEL[view] ?? VIEW_LABEL.all;
  const scoped = useMemo(() => behaviorFlat.filter((f) => includeForView(view, f)), [view]);
  const detailReport = params.get("report");
  const detailFinding = params.get("finding");
  const selected = detailReport && detailFinding
    ? scoped.find((f) => f.reportKey === detailReport && f.findingId === detailFinding)
    : undefined;

  if (detailReport && detailFinding) {
    return (
      <BehaviorFindingPage
        finding={selected}
        reportKey={detailReport}
        findingId={detailFinding}
        view={view}
        onBack={() => setParams(new URLSearchParams())}
      />
    );
  }

  return <BehaviorExplore scoped={scoped} params={params} setParams={setParams} view={view} meta={meta} />;
}

function BehaviorExplore({ scoped, params, setParams, view, meta }: {
  scoped: FlatBehaviorFinding[];
  params: URLSearchParams;
  setParams: (p: URLSearchParams, replace?: boolean) => void;
  view: BehaviorView;
  meta: { title: string; crumb: string; sub: string };
}) {
  const facets = useMemo(() => facetsForView(view), [view]);
  const query = params.get("q") ?? "";
  const active = useMemo(() => {
    const out: Record<string, Set<string>> = {};
    for (const facet of facets) {
      const v = params.get(facet.key);
      out[facet.key] = v ? new Set(v.split(",").filter(Boolean)) : new Set();
    }
    return out;
  }, [facets, params]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return scoped.filter((f) => {
      for (const facet of facets) {
        const set = active[facet.key];
        if (set.size && !set.has(facet.get(f))) return false;
      }
      if (!needle) return true;
      return behaviorHaystack(f).includes(needle);
    });
  }, [active, facets, query, scoped]);

  const facetBins = useMemo(() => {
    const bins: Record<string, Map<string, number>> = {};
    const needle = query.trim().toLowerCase();
    for (const facet of facets) {
      const others = { ...active, [facet.key]: new Set<string>() };
      const m = new Map<string, number>();
      for (const f of scoped) {
        let ok = true;
        for (const ff of facets) {
          const set = others[ff.key];
          if (set.size && !set.has(ff.get(f))) { ok = false; break; }
        }
        if (!ok) continue;
        if (needle && !behaviorHaystack(f).includes(needle)) continue;
        const v = facet.get(f);
        m.set(v, (m.get(v) ?? 0) + 1);
      }
      bins[facet.key] = m;
    }
    return bins;
  }, [active, facets, query, scoped]);

  const values = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const facet of facets) {
      const set = new Set<string>();
      for (const f of scoped) set.add(facet.get(f));
      const arr = [...set];
      if (facet.order) {
        arr.sort((a, b) => {
          const ai = facet.order!.indexOf(a);
          const bi = facet.order!.indexOf(b);
          if (ai === -1 && bi === -1) return a.localeCompare(b);
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        });
      } else {
        arr.sort((a, b) => (facetBins[facet.key].get(b) ?? 0) - (facetBins[facet.key].get(a) ?? 0) || a.localeCompare(b));
      }
      out[facet.key] = arr;
    }
    return out;
  }, [facets, facetBins, scoped]);
  const visibleFacets = useMemo(
    () => facets.filter((facet) => {
      const distinctCount = values[facet.key]?.length ?? 0;
      return distinctCount > 1 && distinctCount <= MAX_FILTER_VALUES;
    }),
    [facets, values]
  );

  const stats = useMemo(() => {
    const reportKeys = new Set(scoped.map((f) => f.reportKey));
    return { reports: reportKeys.size };
  }, [scoped]);

  const toggleFacet = (key: string, value: string) => {
    const nextSet = new Set(active[key]);
    nextSet.has(value) ? nextSet.delete(value) : nextSet.add(value);
    const next = new URLSearchParams(params);
    if (nextSet.size) next.set(key, [...nextSet].join(","));
    else next.delete(key);
    setParams(next);
  };
  const clearFacet = (key: string) => {
    const next = new URLSearchParams(params);
    next.delete(key);
    setParams(next);
  };
  const setQuery = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set("q", value);
    else next.delete("q");
    setParams(next, true);
  };
  const clearAll = () => setParams(new URLSearchParams());
  const anyFiltersOn = query.length > 0 || Object.values(active).some((s) => s.size > 0);

  return (
    <>
      <TopBar />
      <SubNav />
      <Crumb>
        <a href="../index.html">Structure explorer</a>
        <span className="sep">·</span>
        <span className="here">{meta.crumb}</span>
        <span className="sep">·</span>
        <span className="here">All findings across {stats.reports.toLocaleString()} reports</span>
        <span className="crumb-actions">
          <CopyBehaviorForLlmButton findings={filtered} active={active} facets={facets} query={query} totalAll={scoped.length} />
        </span>
      </Crumb>

      <main className="changes-page">
        <aside className="changes-side">
          <div className="sidebar-top">
            <div className="filter-search">
              <input placeholder="Filter findings..." value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            {anyFiltersOn && (
              <button className="clear-all-top" onClick={clearAll} title="Reset search and every facet">
                Clear all filters
              </button>
            )}
          </div>
          {visibleFacets.map((facet) => (
            <FilterBlock
              key={facet.key}
              facet={facet}
              values={values[facet.key]}
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
              <h1>{meta.title}</h1>
              <div className="sub">{meta.sub}</div>
            </div>
            <a className="pill-btn" href={view === "operations" ? "../pages" : "../operations"}>
              {view === "operations" ? "Open Pages/API" : "Open Operations"}
            </a>
          </div>

          <div className="stats">
            <div className="stat">
              <div className="k">Findings</div>
              <div className="v">{scoped.length.toLocaleString()}</div>
              <div className="d">total behavior findings</div>
            </div>
            <div className="stat">
              <div className="k">Reports</div>
              <div className="v">{stats.reports.toLocaleString()}</div>
              <div className="d">included in this view</div>
            </div>
            <div className="stat">
              <div className="k">Visible</div>
              <div className="v">{filtered.length.toLocaleString()}</div>
              <div className="d">matching current filters</div>
            </div>
          </div>

          <ActiveFilters
            active={active}
            facets={facets}
            query={query}
            onClearFacet={clearFacet}
            onClearQuery={() => setQuery("")}
            totalShown={filtered.length}
            totalAll={scoped.length}
          />

          <BehaviorResults items={filtered} query={query} />
        </section>
      </main>
      <Footer />
    </>
  );
}

function BehaviorFindingPage({ finding, reportKey, findingId, view, onBack }: {
  finding?: FlatBehaviorFinding;
  reportKey: string;
  findingId: string;
  view: BehaviorView;
  onBack: () => void;
}) {
  const meta = VIEW_LABEL[view] ?? VIEW_LABEL.all;
  if (!finding) {
    return (
      <>
        <TopBar />
        <SubNav />
        <Crumb><a href={entrypointHref()}>Back to {meta.crumb}</a></Crumb>
        <main className="detail-page">
          <div className="empty">
            Behavior finding not found: <code>{reportKey}</code> / <code>{findingId}</code>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const impact = finding.impact ?? {};
  const review = finding.freshReview;
  const lessBreaking = review?.lessBreakingAlternative;

  return (
    <>
      <TopBar />
      <SubNav />
      <Crumb>
        <a href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>Back to {meta.crumb}</a>
        <span className="sep">·</span>
        <span className="here">{finding.reportLabel}</span>
        <span className="sep">·</span>
        <span className="here">{finding.findingId}</span>
        <span style={{ marginLeft: "auto" }} />
        <RawJsonLink data={finding} filename={`${finding.findingId}.json`} />
      </Crumb>

      <main className="detail-page">
        <header className="detail-h">
          <div className="eyebrow">
            <span className="resource">{finding.family}</span>
            <span>{finding.reportLabel}</span>
          </div>
          <h1>{finding.title}</h1>
          <dl className="detail-meta">
            <dt>Overall Assessment</dt>
            <dd>{judgmentCell(review?.judgment)}</dd>
            <dt>Runtime risk</dt>
            <dd><RiskValue value={impact.runtimeBreakingRisk ?? "—"} /></dd>
            <dt>Conformance risk</dt>
            <dd><RiskValue value={impact.conformanceRisk ?? "—"} /></dd>
            {impact.affectedDirection && <><dt>Direction</dt><dd>{impact.affectedDirection}</dd></>}
            {(finding.behaviorCategory || finding.category) && <><dt>Category</dt><dd><code>{finding.behaviorCategory ?? finding.category}</code></dd></>}
            {review?.compatibilityMechanism && <><dt>Mechanism</dt><dd><code>{review.compatibilityMechanism}</code></dd></>}
            {lessBreaking?.judgment && <><dt>Less-breaking option</dt><dd>{altCell(lessBreaking.judgment)}</dd></>}
            {review?.fmmContext && (
              <>
                <dt>R4 maturity context</dt>
                <dd>
                  {review.fmmContext.fmm != null ? `FMM ${review.fmmContext.fmm}` : "FMM unknown"}
                  {review.fmmContext.standardsStatus ? ` · ${review.fmmContext.standardsStatus}` : ""}
                  {review.fmmContext.effect ? ` · ${review.fmmContext.effect}` : ""}
                </dd>
              </>
            )}
            {finding.requiresHumanReview != null && <><dt>Human review</dt><dd>{finding.requiresHumanReview ? "Required" : "Not flagged"}</dd></>}
          </dl>
        </header>

        <QuestionGroup q="What changed?">
          {Array.isArray(finding.changedFields) && finding.changedFields.length > 0 && (
            <section className="section">
              <h2>Changed fields</h2>
              <DeltaTable rows={finding.changedFields} />
            </section>
          )}
          {Array.isArray(finding.parameterDeltas) && finding.parameterDeltas.length > 0 && (
            <section className="section">
              <h2>Parameter deltas</h2>
              <DeltaTable rows={finding.parameterDeltas} />
            </section>
          )}
        </QuestionGroup>

        <QuestionGroup q="What breaks?">
          <Section title="Runtime mechanism" md={finding.runtimeMechanismMd} />
          <Section title="Impact rationale" md={impact.impactRationaleMd} />
          {(impact.expectedPrevalence || impact.confidence) && (
            <section className="section">
              <h2>Compatibility profile</h2>
              <dl className="detail-meta">
                {impact.expectedPrevalence && <><dt>Expected prevalence</dt><dd>{impact.expectedPrevalence}</dd></>}
                {impact.confidence && <><dt>Confidence</dt><dd>{impact.confidence}</dd></>}
              </dl>
            </section>
          )}
        </QuestionGroup>

        {review && (
          <QuestionGroup q="Overall Assessment">
            <Section title="Real-world scenario" md={review.realWorldScenarioMd} />
            <Section title="Rationale" md={review.rationaleMd ?? review.narrativeMd} />
            <Section title="FMM/status rationale" md={review.fmmContext?.rationaleMd} />
            {lessBreaking && (
              <section className="section">
                <h2>Less-breaking alternative</h2>
                <dl className="detail-meta">
                  <dt>Judgment</dt>
                  <dd>{altCell(lessBreaking.judgment ?? "—")}</dd>
                </dl>
                <Section title="Candidate design" md={lessBreaking.candidateDesignMd} />
                <Section title="Tradeoffs" md={lessBreaking.tradeoffsOrReasonMd} />
              </section>
            )}
            {Array.isArray(review.keyEvidence) && review.keyEvidence.length > 0 && (
              <section className="section">
                <h2>Key evidence</h2>
                <ul>
                  {review.keyEvidence.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              </section>
            )}
          </QuestionGroup>
        )}

        <QuestionGroup q="Migration">
          <Section title="Migration guidance" md={finding.migrationGuidanceMd} />
          <Section title="Backward-compatibility analysis" md={finding.backwardCompatibilityAnalysisMd} />
        </QuestionGroup>

        {Array.isArray(finding.evidence) && finding.evidence.length > 0 && (
          <section className="section">
            <h2>Evidence</h2>
            <ul className="evidence">
              {finding.evidence.map((ev, i) => (
                <li key={i}>
                  <div className="source">{ev.source ?? "evidence"} · {ev.confidence ?? "Unknown"}</div>
                  {ev.locator && <div className="locator">{ev.locator}</div>}
                  {ev.detail && <div className="detail">{ev.detail}</div>}
                  {ev.quote && <blockquote>{ev.quote}</blockquote>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}

function BehaviorResults({ items, query }: { items: FlatBehaviorFinding[]; query: string }) {
  if (items.length === 0) {
    return <div className="empty">No behavior findings match these filters.</div>;
  }
  return (
    <>
      <table className="findings-table behavior-table">
        <colgroup>
          <col style={{ width: 280 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 160 }} />
          <col style={{ width: 190 }} />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th>Report · category</th>
            <th>Risk</th>
            <th>Overall Assessment</th>
            <th>Mechanism</th>
            <th>Finding</th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, 500).map((f) => (
            <BehaviorRows key={`${f.reportKey}:${f.findingId}`} f={f} query={query} />
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

function CopyBehaviorForLlmButton({ findings, active, facets, query, totalAll }: {
  findings: FlatBehaviorFinding[];
  active: Record<string, Set<string>>;
  facets: Facet[];
  query: string;
  totalAll: number;
}) {
  const [state, setState] = useState<"idle" | "ok" | "err">("idle");
  const onClick = async () => {
    const filters: string[] = [];
    for (const facet of facets) {
      const set = active[facet.key];
      if (set && set.size > 0) {
        filters.push(`${facet.label}: ${[...set].map((v) => facet.format ? facet.format(v) : v).join(", ")}`);
      }
    }
    const lines = buildBehaviorLlmMarkdown(findings, {
      url: location.href,
      totalShown: findings.length,
      totalAll,
      filters,
      query: query.trim() || undefined,
    });
    try {
      await navigator.clipboard.writeText(lines);
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
      title="Copy currently-filtered behavior findings to clipboard as Markdown for pasting into an LLM"
    >
      {label}
    </button>
  );
}

function buildBehaviorLlmMarkdown(findings: FlatBehaviorFinding[], ctx: {
  url: string;
  totalShown: number;
  totalAll: number;
  filters: string[];
  query?: string;
}): string {
  const out: string[] = [];
  out.push("# FHIR R4 to R6 behavior/API findings");
  out.push("");
  out.push(`Source: ${ctx.url}`);
  out.push("");
  out.push(
    "This excerpt mirrors the behavior finding detail page for each currently-visible item: " +
    "objective metadata, what changed, what breaks, overall assessment, migration notes, and evidence."
  );
  out.push("");
  out.push(`**Showing:** ${ctx.totalShown.toLocaleString()} of ${ctx.totalAll.toLocaleString()} findings`);
  if (ctx.query || ctx.filters.length > 0) {
    out.push("");
    out.push("**Active filters:**");
    if (ctx.query) out.push(`- Search: \`${ctx.query}\``);
    for (const filter of ctx.filters) out.push(`- ${filter}`);
  }
  out.push("");
  out.push("---");
  out.push("");
  for (let i = 0; i < findings.length; i += 1) {
    out.push(behaviorFindingMarkdown(findings[i], i + 1));
    out.push("---");
    out.push("");
  }
  return out.join("\n");
}

function behaviorFindingMarkdown(f: FlatBehaviorFinding, index: number): string {
  const out: string[] = [];
  const impact = f.impact ?? {};
  const review = f.freshReview;
  const lessBreaking = review?.lessBreakingAlternative;

  out.push(`## ${index}. ${f.title}`);
  out.push("");
  out.push(`- **Report:** ${f.reportLabel}`);
  out.push(`- **Finding ID:** \`${f.findingId}\``);
  out.push(`- **Family:** ${f.family}`);
  if (review?.judgment) out.push(`- **Overall Assessment:** ${review.judgment}`);
  out.push(`- **Runtime risk:** ${impact.runtimeBreakingRisk ?? "—"}`);
  out.push(`- **Conformance risk:** ${impact.conformanceRisk ?? "—"}`);
  if (impact.affectedDirection) out.push(`- **Direction:** ${impact.affectedDirection}`);
  if (f.behaviorCategory || f.category) out.push(`- **Category:** \`${f.behaviorCategory ?? f.category}\``);
  if (review?.compatibilityMechanism) out.push(`- **Mechanism:** \`${review.compatibilityMechanism}\``);
  if (lessBreaking?.judgment) out.push(`- **Less-breaking option:** ${lessBreaking.judgment}`);
  if (review?.fmmContext) {
    const parts = [
      review.fmmContext.fmm != null ? `FMM ${review.fmmContext.fmm}` : "FMM unknown",
      review.fmmContext.standardsStatus,
      review.fmmContext.effect,
    ].filter(Boolean);
    out.push(`- **R4 maturity context:** ${parts.join(" · ")}`);
  }
  if (f.requiresHumanReview != null) out.push(`- **Human review:** ${f.requiresHumanReview ? "Required" : "Not flagged"}`);
  out.push("");

  pushBehaviorQuestion(out, "What changed?", () => {
    pushDeltaSection(out, "Changed fields", f.changedFields);
    pushDeltaSection(out, "Parameter deltas", f.parameterDeltas);
  });
  pushBehaviorQuestion(out, "What breaks?", () => {
    pushMdSection(out, "Runtime mechanism", f.runtimeMechanismMd);
    pushMdSection(out, "Impact rationale", impact.impactRationaleMd);
    const profile = [
      impact.expectedPrevalence ? `- **Expected prevalence:** ${impact.expectedPrevalence}` : undefined,
      impact.confidence ? `- **Confidence:** ${impact.confidence}` : undefined,
    ].filter(Boolean);
    if (profile.length > 0) {
      out.push("#### Compatibility profile");
      out.push("");
      out.push(...profile);
      out.push("");
    }
  });
  if (review) {
    pushBehaviorQuestion(out, "Overall Assessment", () => {
      pushMdSection(out, "Real-world scenario", review.realWorldScenarioMd);
      pushMdSection(out, "Rationale", review.rationaleMd ?? review.narrativeMd);
      pushMdSection(out, "FMM/status rationale", review.fmmContext?.rationaleMd);
      if (lessBreaking) {
        out.push("#### Less-breaking alternative");
        out.push("");
        out.push(`- **Judgment:** ${lessBreaking.judgment ?? "—"}`);
        out.push("");
        pushMdSection(out, "Candidate design", lessBreaking.candidateDesignMd);
        pushMdSection(out, "Tradeoffs", lessBreaking.tradeoffsOrReasonMd);
      }
      if (Array.isArray(review.keyEvidence) && review.keyEvidence.length > 0) {
        out.push("#### Key evidence");
        out.push("");
        for (const item of review.keyEvidence) out.push(`- ${item}`);
        out.push("");
      }
    });
  }
  pushBehaviorQuestion(out, "Migration", () => {
    pushMdSection(out, "Migration guidance", f.migrationGuidanceMd);
    pushMdSection(out, "Backward-compatibility analysis", f.backwardCompatibilityAnalysisMd);
  });
  if (Array.isArray(f.evidence) && f.evidence.length > 0) {
    out.push("### Evidence");
    out.push("");
    for (const ev of f.evidence) {
      out.push(`- **${ev.source ?? "evidence"}** · ${ev.confidence ?? "Unknown"}`);
      if (ev.locator) out.push(`  - Locator: \`${ev.locator}\``);
      if (ev.detail) out.push(`  - Detail: ${ev.detail}`);
      if (ev.quote) out.push(`  - Quote: ${ev.quote}`);
    }
    out.push("");
  }

  return out.join("\n").replace(/\n{4,}/g, "\n\n\n").trim();
}

function pushBehaviorQuestion(out: string[], title: string, build: () => void) {
  const start = out.length;
  build();
  if (out.length === start) return;
  const section = out.splice(start);
  out.push(`### ${title}`);
  out.push("");
  out.push(...section);
}

function pushMdSection(out: string[], title: string, md?: string) {
  if (!md || !md.trim()) return;
  out.push(`#### ${title}`);
  out.push("");
  out.push(md.trim());
  out.push("");
}

function pushDeltaSection(out: string[], title: string, rows?: any[]) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  out.push(`#### ${title}`);
  out.push("");
  out.push("| Field | R4 | R6 | Note |");
  out.push("|---|---|---|---|");
  for (const row of rows) {
    const field = row.field ?? row.name ?? row.path ?? row.changeKind ?? "delta";
    const note = row.note ?? row.impactMd ?? row.changeKind ?? "";
    out.push(`| \`${tableCell(field)}\` | ${tableCell(fmt(row.oldValue))} | ${tableCell(fmt(row.newValue))} | ${tableCell(note)} |`);
  }
  out.push("");
}

function tableCell(value: any): string {
  const text = fmt(value);
  return text.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim() || "—";
}

function BehaviorRows({ f, query }: { f: FlatBehaviorFinding; query: string }) {
  const href = detailHref(f);
  const risk = f.impact?.runtimeBreakingRisk ?? "—";
  const mechanism = f.freshReview?.compatibilityMechanism ?? "—";
  const category = f.behaviorCategory ?? f.category ?? "—";
  const onRowClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || (e as any).button === 1) return;
    if ((e.target as HTMLElement).closest("a")) return;
    window.open(href, "_blank", "noopener");
  };
  return (
    <>
      <tr className="ft-meta-row" onClick={onRowClick}>
        <td className="ft-path">
          <span className="path-resource">{f.reportLabel}</span>
          <span className="path-element"> · {highlight(category, query)}</span>
        </td>
        <td className="ft-impact"><RiskValue value={risk} /></td>
        <td className="ft-verdict">{judgmentCell(f.freshReview?.judgment)}</td>
        <td className="ft-delta"><code className="delta-code">{mechanism}</code></td>
        <td className="ft-delta">
          {f.requiresHumanReview ? <span style={{ color: "#EC2028", fontWeight: 700 }}>review</span> : <span className="dim">—</span>}
        </td>
      </tr>
      <tr className="ft-title-row" onClick={onRowClick}>
        <td colSpan={5}>
          <a className="ft-title" href={href} target="_blank" rel="noopener">{highlight(f.title, query)}</a>
          {f.freshReview?.realWorldScenarioMd && (
            <div className="ft-goal">{highlight(stripMarkdown(f.freshReview.realWorldScenarioMd), query)}</div>
          )}
        </td>
      </tr>
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
              title={c === 0 ? "No findings match with current filters" : v}
            >
              <span className="box" />
              {dot && <span className="sw-dot" style={{ background: dot }} />}
              <span className="lbl">{facet.format ? facet.format(v) : (v || "—")}</span>
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
                return (
                  <button
                    key={v}
                    className={cls}
                    disabled={c === 0 && !isSel}
                    onClick={() => (c === 0 && !isSel) ? undefined : onToggle(v)}
                    title={v}
                  >
                    <span className="box" />
                    <span className="lbl">{facet.format ? facet.format(v) : v}</span>
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

function ActiveFilters({ active, facets, query, onClearFacet, onClearQuery, totalShown, totalAll }: {
  active: Record<string, Set<string>>;
  facets: Facet[];
  query: string;
  onClearFacet: (k: string) => void;
  onClearQuery: () => void;
  totalShown: number;
  totalAll: number;
}) {
  const chips: { label: string; onClear: () => void }[] = [];
  if (query) chips.push({ label: `"${query}"`, onClear: onClearQuery });
  for (const facet of facets) {
    const set = active[facet.key];
    if (set.size > 0) {
      const values = [...set];
      const labelValues = values.map((v) => facet.format ? facet.format(v) : v);
      chips.push({
        label: values.length === 1 ? `${facet.label}: ${labelValues[0]}` : `${facet.label}: ${values.length}`,
        onClear: () => onClearFacet(facet.key),
      });
    }
  }
  return (
    <div className="toolbar">
      <span className="lbl">Showing {totalShown.toLocaleString()} of {totalAll.toLocaleString()}</span>
      {chips.length > 0 && <span className="lbl" style={{ marginLeft: 8 }}>Filters</span>}
      {chips.map((c, i) => (
        <span key={i} className="chip">
          <b>{c.label}</b>
          <button className="x" onClick={c.onClear} aria-label="Remove filter">x</button>
        </span>
      ))}
    </div>
  );
}

function DeltaTable({ rows }: { rows: any[] }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Field</th>
          <th>R4</th>
          <th>R6</th>
          <th>Note</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <td><code>{row.field ?? row.name ?? row.path ?? row.changeKind ?? "delta"}</code></td>
            <td><code className="dim">{fmt(row.oldValue)}</code></td>
            <td><code>{fmt(row.newValue)}</code></td>
            <td className="dim">
              {row.note ?? row.impactMd ?? row.changeKind ?? ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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

function QuestionGroup({ q, children }: { q: string; children: React.ReactNode }) {
  const arr = React.Children.toArray(children).filter(Boolean);
  if (arr.length === 0) return null;
  return (
    <div className="qgroup">
      <div className="qgroup-h">{q}</div>
      {arr}
    </div>
  );
}

function RiskValue({ value }: { value?: string }) {
  const v = value ?? "—";
  const color = RISK_COLOR[v] ?? "var(--ink-3)";
  return (
    <>
      <span className="impact-dot" style={{ background: color }} />
      <span style={{ color, fontWeight: 600 }}>{v}</span>
    </>
  );
}

function judgmentCell(value?: string) {
  if (!value) return <span className="dim">—</span>;
  return <span style={{ color: OVERALL_ASSESSMENT_COLOR[value] ?? "var(--ink-2)", fontWeight: value === "Revisit" ? 700 : 600 }}>{value}</span>;
}

function altCell(value?: string) {
  if (!value) return <span className="dim">—</span>;
  return <span style={{ color: ALT_COLOR[value] ?? "var(--ink-2)", fontWeight: value === "Yes" ? 700 : 600 }}>{value}</span>;
}

function includeForView(view: BehaviorView, f: FlatBehaviorFinding): boolean {
  if (view === "operations") return f.family === "Operations";
  if (view === "pages") return f.family !== "Operations";
  return true;
}

function behaviorHaystack(f: FlatBehaviorFinding): string {
  return [
    f.title,
    f.findingId,
    f.family,
    f.reportLabel,
    f.behaviorCategory,
    f.category,
    f.matchRationaleMd,
    f.runtimeMechanismMd,
    f.migrationGuidanceMd,
    f.backwardCompatibilityAnalysisMd,
    f.freshReview?.judgment,
    f.freshReview?.compatibilityMechanism,
    f.freshReview?.realWorldScenarioMd,
    f.freshReview?.rationaleMd,
    f.freshReview?.lessBreakingAlternative?.candidateDesignMd,
    f.freshReview?.lessBreakingAlternative?.tradeoffsOrReasonMd,
    ...(f.affectedResources ?? []),
  ].filter(Boolean).join(" ").toLowerCase();
}

function useUrlParams(): [URLSearchParams, (p: URLSearchParams, replace?: boolean) => void] {
  const [params, setParamsState] = useState(() => new URLSearchParams(location.search));
  React.useEffect(() => {
    const onPop = () => setParamsState(new URLSearchParams(location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const setParams = (next: URLSearchParams, replace = false) => {
    const qs = next.toString();
    const href = `${location.pathname}${qs ? `?${qs}` : ""}`;
    if (replace) history.replaceState(null, "", href);
    else history.pushState(null, "", href);
    setParamsState(new URLSearchParams(next));
  };
  return [params, setParams];
}

function withParams(key: string, value: string): string {
  const params = new URLSearchParams(location.search);
  params.set(key, value);
  params.delete("report");
  params.delete("finding");
  return `${entrypointHref()}?${params.toString()}`;
}

function detailHref(f: FlatBehaviorFinding): string {
  const params = new URLSearchParams();
  params.set("report", f.reportKey);
  params.set("finding", f.findingId);
  return `${entrypointHref()}?${params.toString()}`;
}

function entrypointHref(): string {
  return location.pathname || "./";
}

function highlight(text: string, q: string): React.ReactNode {
  if (!q.trim()) return text;
  const re = new RegExp(`(${q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
  const parts = text.split(re);
  return parts.map((p, i) => i % 2 === 1 ? <mark key={i}>{p}</mark> : <React.Fragment key={i}>{p}</React.Fragment>);
}

function stripMarkdown(value: string): string {
  return value.replace(/[`*_#[\]()]/g, "").replace(/\s+/g, " ").trim();
}

function RawJsonLink({ data, filename }: { data: any; filename: string }) {
  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (w) setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  return <a href="#" onClick={onClick} title={filename}>Raw JSON</a>;
}

function fmt(value: any): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

void behaviorReports;
