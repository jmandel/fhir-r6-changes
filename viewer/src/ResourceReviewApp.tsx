import React, { useMemo, useState } from "react";
import { resourceReviews, resourceReviewIndex } from "./data";
import type { ResourceReview } from "../types";
import { Markdown } from "./Markdown";
import { TopBar, SubNav, Crumb, Footer } from "./Shell";

type Facet = {
  key: string;
  label: string;
  get: (r: ResourceReview) => string;
  order?: string[];
  colors?: Record<string, string>;
  format?: (value: string) => string;
};

const MIGRATION_ORDER = ["Yes", "Partial", "No", "Unknown"];
const SHAPE_ORDER = [
  "removed-or-replaced-resource",
  "major-model-remodel",
  "moderate-targeted-remodel",
  "mostly-stable-with-local-breaks",
  "low-material-change",
  "not-enough-evidence",
];
const LEVERAGE_ORDER = [
  "migration-program-dominates",
  "preserve-where-low-cost-but-expect-resource-migration",
  "preserve-compatibility-per-change",
  "no-special-break-avoidance-needed",
  "not-enough-evidence",
];
const CONFIDENCE_ORDER = ["High", "Medium", "Low", "Unknown"];
const STABILITY_ORDER = ["Strong", "Meaningful", "Neutral", "Weak", "Unknown"];
const FMM_ORDER = ["5", "4", "3", "2", "1", "0", "—"];
const STATUS_ORDER = ["normative", "trial-use", "draft", "informative", "deprecated", "—"];
const MAX_FILTER_VALUES = 50;

const MIGRATION_COLOR: Record<string, string> = {
  Yes: "#EC2028",
  Partial: "#F09225",
  No: "#2F8A4F",
  Unknown: "#8A6800",
};
const SHAPE_COLOR: Record<string, string> = {
  "removed-or-replaced-resource": "#8A1118",
  "major-model-remodel": "#EC2028",
  "moderate-targeted-remodel": "#F09225",
  "mostly-stable-with-local-breaks": "#2E5DA8",
  "low-material-change": "#2F8A4F",
  "not-enough-evidence": "#8A6800",
};
const LEVERAGE_COLOR: Record<string, string> = {
  "migration-program-dominates": "#8A1118",
  "preserve-where-low-cost-but-expect-resource-migration": "#F09225",
  "preserve-compatibility-per-change": "#2E5DA8",
  "no-special-break-avoidance-needed": "#2F8A4F",
  "not-enough-evidence": "#8A6800",
};
const CONFIDENCE_COLOR: Record<string, string> = {
  High: "#2F8A4F",
  Medium: "#2E5DA8",
  Low: "#F09225",
  Unknown: "#8A6800",
};
const STABILITY_COLOR: Record<string, string> = {
  Strong: "#2F8A4F",
  Meaningful: "#2E5DA8",
  Neutral: "#6B635C",
  Weak: "#F09225",
  Unknown: "#8A6800",
};
const FMM_COLOR: Record<string, string> = {
  "5": "#2F8A4F",
  "4": "#2E5DA8",
  "3": "#8A6800",
  "2": "#F09225",
  "1": "#EC2028",
  "0": "#8A1118",
};
const STATUS_COLOR: Record<string, string> = {
  normative: "#2F8A4F",
  "trial-use": "#2E5DA8",
  draft: "#8A6800",
  informative: "#6B635C",
  deprecated: "#8A1118",
};

const FACETS: Facet[] = [
  {
    key: "migration",
    label: "Migration program",
    get: (r) => r.overall?.majorMigrationAlreadyUnavoidable ?? "Unknown",
    order: MIGRATION_ORDER,
    colors: MIGRATION_COLOR,
  },
  {
    key: "shape",
    label: "Migration shape",
    get: (r) => r.overall?.resourceMigrationShape ?? "not-enough-evidence",
    order: SHAPE_ORDER,
    colors: SHAPE_COLOR,
    format: formatKebab,
  },
  {
    key: "leverage",
    label: "Compatibility leverage",
    get: (r) => r.overall?.compatibilityLeverage ?? "not-enough-evidence",
    order: LEVERAGE_ORDER,
    colors: LEVERAGE_COLOR,
    format: formatLeverage,
  },
  {
    key: "confidence",
    label: "Confidence",
    get: (r) => r.overall?.confidence ?? "Unknown",
    order: CONFIDENCE_ORDER,
    colors: CONFIDENCE_COLOR,
  },
  {
    key: "stability",
    label: "R4 stability pressure",
    get: (r) => r.r4Maturity?.stabilityPressure ?? "Unknown",
    order: STABILITY_ORDER,
    colors: STABILITY_COLOR,
  },
  {
    key: "fmm",
    label: "R4 maturity (FMM)",
    get: (r) => r.r4Maturity?.fmm != null ? String(r.r4Maturity.fmm) : "—",
    order: FMM_ORDER,
    colors: FMM_COLOR,
  },
  {
    key: "status",
    label: "R4 standards status",
    get: (r) => r.r4Maturity?.standardsStatus ?? "—",
    order: STATUS_ORDER,
    colors: STATUS_COLOR,
  },
];

export function ResourceReviewApp() {
  const [params, setParams] = useUrlParams();
  const selectedName = params.get("resource");
  const selected = selectedName ? resourceReviews.find((review) => review.resourceType === selectedName) : undefined;

  if (selectedName) {
    return (
      <ResourceReviewDetail
        review={selected}
        resourceType={selectedName}
        onBack={() => setParams(new URLSearchParams())}
      />
    );
  }

  return <ResourceReviewExplore params={params} setParams={setParams} />;
}

function ResourceReviewExplore({ params, setParams }: {
  params: URLSearchParams;
  setParams: (p: URLSearchParams, replace?: boolean) => void;
}) {
  const query = params.get("q") ?? "";
  const active = useMemo(() => {
    const out: Record<string, Set<string>> = {};
    for (const facet of FACETS) {
      const value = params.get(facet.key);
      out[facet.key] = value ? new Set(value.split(",").filter(Boolean)) : new Set();
    }
    return out;
  }, [params]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return resourceReviews.filter((review) => {
      for (const facet of FACETS) {
        const set = active[facet.key];
        if (set.size && !set.has(facet.get(review))) return false;
      }
      if (!needle) return true;
      return resourceHaystack(review).includes(needle);
    });
  }, [active, query]);

  const facetBins = useMemo(() => {
    const bins: Record<string, Map<string, number>> = {};
    const needle = query.trim().toLowerCase();
    for (const facet of FACETS) {
      const others = { ...active, [facet.key]: new Set<string>() };
      const counts = new Map<string, number>();
      for (const review of resourceReviews) {
        let ok = true;
        for (const other of FACETS) {
          const set = others[other.key];
          if (set.size && !set.has(other.get(review))) { ok = false; break; }
        }
        if (!ok) continue;
        if (needle && !resourceHaystack(review).includes(needle)) continue;
        const value = facet.get(review);
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
      bins[facet.key] = counts;
    }
    return bins;
  }, [active, query]);

  const values = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const facet of FACETS) {
      const set = new Set<string>();
      for (const review of resourceReviews) set.add(facet.get(review));
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
  }, [facetBins]);

  const visibleFacets = useMemo(
    () => FACETS.filter((facet) => {
      const distinctCount = values[facet.key]?.length ?? 0;
      return distinctCount > 1 && distinctCount <= MAX_FILTER_VALUES;
    }),
    [values]
  );

  const stats = useMemo(() => summarize(resourceReviews, filtered), [filtered]);
  const anyFiltersOn = query.length > 0 || Object.values(active).some((set) => set.size > 0);

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

  return (
    <>
      <TopBar />
      <SubNav />
      <Crumb>
        <a href="../index.html">Structure explorer</a>
        <span className="sep">·</span>
        <span className="here">Resource reviews</span>
        <span className="sep">·</span>
        <span className="here">All reviews across {resourceReviews.length.toLocaleString()} resources</span>
        <span className="crumb-actions">
          <CopyResourcesForLlmButton reviews={filtered} active={active} facets={FACETS} query={query} totalAll={resourceReviews.length} />
        </span>
      </Crumb>

      <main className="changes-page resource-review-page">
        <aside className="changes-side">
          <div className="sidebar-top">
            <div className="filter-search">
              <input placeholder="Filter resources..." value={query} onChange={(event) => setQuery(event.target.value)} />
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
              onToggle={(value) => toggleFacet(facet.key, value)}
              onClear={() => clearFacet(facet.key)}
            />
          ))}
        </aside>

        <section className="changes-main">
          <div className="changes-h">
            <div>
              <h1>Resource reviews</h1>
              <div className="sub">
                Holistic R4 4.0.1 to R6 6.0.0-ballot4 review of whether each resource needs migration, what drives it, and where compatibility work still has leverage.
              </div>
            </div>
          </div>

          <div className="stats resource-stats">
            <div className="stat">
              <div className="k">Reviews</div>
              <div className="v">{resourceReviews.length.toLocaleString()}</div>
              <div className="d">R4 resources reviewed</div>
            </div>
            <div className="stat">
              <div className="k">Cited findings</div>
              <div className="v">{stats.findingConsiderations.toLocaleString()}</div>
              <div className="d">considered in these reviews</div>
            </div>
            <div className="stat">
              <div className="k">Direct behavior</div>
              <div className="v">{stats.directBehavior.toLocaleString()}</div>
              <div className="d">behavior findings reviewed</div>
            </div>
            <div className="stat">
              <div className="k">Visible</div>
              <div className="v">{filtered.length.toLocaleString()}</div>
              <div className="d">matching current filters</div>
            </div>
          </div>

          <ActiveFilters
            active={active}
            facets={FACETS}
            query={query}
            onClearFacet={clearFacet}
            onClearQuery={() => setQuery("")}
            totalShown={filtered.length}
            totalAll={resourceReviews.length}
          />

          <ResourceResults reviews={filtered} query={query} />
        </section>
      </main>
      <Footer />
    </>
  );
}

function ResourceReviewDetail({ review, resourceType, onBack }: {
  review?: ResourceReview;
  resourceType: string;
  onBack: () => void;
}) {
  if (!review) {
    return (
      <>
        <TopBar />
        <SubNav />
        <Crumb><a href="#" onClick={(event) => { event.preventDefault(); onBack(); }}>Back to resource reviews</a></Crumb>
        <main className="detail-page">
          <div className="empty">Resource review not found: <code>{resourceType}</code></div>
        </main>
        <Footer />
      </>
    );
  }

  const maturity = review.r4Maturity ?? {};
  const counts = review.reviewMethod ?? {};
  const totalReviewed = (counts.reviewedStructureFindingCount ?? 0) +
    (counts.reviewedDirectBehaviorFindingCount ?? 0) +
    (counts.reviewedSharedBehaviorContextCount ?? 0);

  return (
    <>
      <TopBar />
      <SubNav />
      <Crumb>
        <a href="#" onClick={(event) => { event.preventDefault(); onBack(); }}>Back to resource reviews</a>
        <span className="sep">·</span>
        <span className="here">{review.resourceType}</span>
        <span style={{ marginLeft: "auto" }} />
        <CopySingleResourceForLlmButton review={review} />
        <RawJsonLink data={review} filename={`${review.resourceType}.resource-review.json`} />
      </Crumb>

      <main className="detail-page resource-detail-page">
        {/* Keep this visual detail layout in sync with resourceReviewMarkdown() below. */}
        <header className="detail-h resource-detail-h">
          <div className="eyebrow">
            <span className="resource">{review.resourceType}</span>
            <span>Resource-level review</span>
          </div>
          <h1>{review.resourceType} resource review</h1>
          {review.overall?.oneLineConclusion && (
            <p className="resource-lede">{review.overall.oneLineConclusion}</p>
          )}
          <dl className="detail-meta">
            <dt>Migration program</dt>
            <dd>{migrationValue(review.overall?.majorMigrationAlreadyUnavoidable)}</dd>
            <dt>Migration shape</dt>
            <dd>{shapeValue(review.overall?.resourceMigrationShape)}</dd>
            <dt>Compatibility leverage</dt>
            <dd>{leverageValue(review.overall?.compatibilityLeverage)}</dd>
            <dt>Confidence</dt>
            <dd>{confidenceValue(review.overall?.confidence)}</dd>
            <dt>R4 maturity</dt>
            <dd>
              {maturity.fmm != null ? `FMM ${maturity.fmm}` : "FMM unknown"}
              {maturity.standardsStatus ? ` · ${maturity.standardsStatus}` : ""}
              {maturity.workGroup ? ` · ${maturity.workGroup}` : ""}
            </dd>
            <dt>Stability pressure</dt>
            <dd>{stabilityValue(maturity.stabilityPressure)}</dd>
            <dt>Reviewed inputs</dt>
            <dd>
              {totalReviewed.toLocaleString()} findings
              {counts.reviewedStructureFindingCount != null ? ` · ${counts.reviewedStructureFindingCount} structure` : ""}
              {counts.reviewedDirectBehaviorFindingCount != null ? ` · ${counts.reviewedDirectBehaviorFindingCount} direct behavior` : ""}
              {counts.reviewedSharedBehaviorContextCount != null ? ` · ${counts.reviewedSharedBehaviorContextCount} shared context` : ""}
            </dd>
          </dl>
        </header>

        <QuestionGroup q="Overall Assessment">
          <Section title="Thesis" md={review.reasoning?.thesisMd} />
          <Section title="R4 maturity effect" md={review.r4Maturity?.effectMd} />
        </QuestionGroup>

        <QuestionGroup q="Migration Shape">
          <Section title="Migration shape" md={review.reasoning?.migrationShapeMd} />
          <Section title="Compatibility leverage" md={review.reasoning?.compatibilityLeverageMd} />
          <Section title="Less-breaking alternatives" md={review.reasoning?.lessBreakingAlternativesMd} />
          <Section title="Behavior/API impact" md={review.reasoning?.behaviorImpactMd} />
          <Section title="Comparison to deterministic aggregate" md={review.reasoning?.comparisonToDeterministicAggregateMd} />
          <Section title="Uncertainty" md={review.reasoning?.uncertaintyMd} />
        </QuestionGroup>

        <QuestionGroup q="What Drove This?">
          <FindingConsiderations review={review} />
        </QuestionGroup>

        <QuestionGroup q="Next Actions">
          <RecommendedActions review={review} />
          <Caveats review={review} />
        </QuestionGroup>

        <QuestionGroup q="Method">
          <Section title="Method notes" md={review.reviewMethod?.methodNotesMd} />
          <section className="section">
            <h2>Source files</h2>
            <dl className="kv">
              <dt>Structure report</dt>
              <dd><code>{review.reviewMethod?.structureReportPath ?? "—"}</code></dd>
              <dt>Context</dt>
              <dd><code>{review.reviewMethod?.contextPath ?? "—"}</code></dd>
              {review.reviewMethod?.deterministicAggregatePath && (
                <>
                  <dt>Prepass</dt>
                  <dd><code>{review.reviewMethod.deterministicAggregatePath}</code></dd>
                </>
              )}
              {(review.reviewMethod?.behaviorReportPaths ?? []).length > 0 && (
                <>
                  <dt>Behavior reports</dt>
                  <dd>{review.reviewMethod!.behaviorReportPaths!.map((path) => <code key={path}>{path}</code>)}</dd>
                </>
              )}
            </dl>
          </section>
        </QuestionGroup>
      </main>
      <Footer />
    </>
  );
}

function ResourceResults({ reviews, query }: { reviews: ResourceReview[]; query: string }) {
  if (reviews.length === 0) return <div className="empty">No resource reviews match these filters.</div>;
  return (
    <>
      <table className="findings-table resource-review-table">
        <colgroup>
          <col style={{ width: 260 }} />
          <col style={{ width: 150 }} />
          <col style={{ width: 210 }} />
          <col style={{ width: 230 }} />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th>Resource</th>
            <th>Migration</th>
            <th>Shape</th>
            <th>Compatibility leverage</th>
            <th>Conclusion</th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((review) => (
            <ResourceRows key={review.resourceType} review={review} query={query} />
          ))}
        </tbody>
      </table>
    </>
  );
}

function ResourceRows({ review, query }: { review: ResourceReview; query: string }) {
  const href = detailHref(review);
  const onRowClick = (event: React.MouseEvent) => {
    if (event.metaKey || event.ctrlKey || (event as any).button === 1) return;
    if ((event.target as HTMLElement).closest("a")) return;
    window.open(href, "_blank", "noopener");
  };
  const drivers = (review.findingConsiderations ?? []).filter((item) => item.role === "drives-resource-conclusion").length;
  const total = review.findingConsiderations?.length ?? 0;
  const behavior = review.reviewMethod?.reviewedDirectBehaviorFindingCount ?? 0;
  return (
    <>
      <tr className="ft-meta-row resource-row" onClick={onRowClick}>
        <td className="ft-path">
          <span className="path-resource">{highlight(review.resourceType, query)}</span>
          <span className="path-element">
            {review.r4Maturity?.fmm != null ? ` · FMM ${review.r4Maturity.fmm}` : ""}
            {review.r4Maturity?.standardsStatus ? ` · ${review.r4Maturity.standardsStatus}` : ""}
          </span>
        </td>
        <td className="ft-impact">{migrationValue(review.overall?.majorMigrationAlreadyUnavoidable)}</td>
        <td className="ft-delta">{shapeValue(review.overall?.resourceMigrationShape)}</td>
        <td className="ft-delta">{leverageValue(review.overall?.compatibilityLeverage)}</td>
        <td className="ft-delta">
          <span className="resource-evidence-note">{drivers} drivers · {total} cited · {behavior} behavior</span>
        </td>
      </tr>
      <tr className="ft-title-row" onClick={onRowClick}>
        <td colSpan={5}>
          <a className="ft-title" href={href} target="_blank" rel="noopener">
            {highlight(review.overall?.oneLineConclusion ?? `${review.resourceType} review`, query)}
          </a>
          {review.reasoning?.thesisMd && (
            <div className="ft-goal">{highlight(stripMarkdown(review.reasoning.thesisMd), query)}</div>
          )}
        </td>
      </tr>
    </>
  );
}

function FindingConsiderations({ review }: { review: ResourceReview }) {
  const considerations = review.findingConsiderations ?? [];
  if (considerations.length === 0) return null;
  const roleOrder: Record<string, number> = {
    "drives-resource-conclusion": 0,
    "important-but-local": 1,
    "needs-follow-up": 2,
    "context-only": 3,
    discounted: 4,
  };
  const sorted = [...considerations].sort((a, b) =>
    (roleOrder[a.role ?? ""] ?? 99) - (roleOrder[b.role ?? ""] ?? 99) ||
    String(a.sourceSurface ?? "").localeCompare(String(b.sourceSurface ?? "")) ||
    String(a.title ?? "").localeCompare(String(b.title ?? ""))
  );
  return (
    <section className="section">
      <h2>Finding considerations</h2>
      <table className="table resource-considerations">
        <thead>
          <tr>
            <th>Role</th>
            <th>Surface</th>
            <th>Finding</th>
            <th>Why it mattered</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((finding, index) => (
            <tr key={`${finding.sourceSurface}:${finding.findingId}:${index}`}>
              <td>{roleValue(finding.role)}</td>
              <td><code>{finding.sourceSurface ?? "—"}</code></td>
              <td>
                <div className="resource-finding-title">{finding.title ?? "Untitled finding"}</div>
                {finding.findingId && <code>{finding.findingId}</code>}
              </td>
              <td><Markdown source={finding.reasonMd} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function RecommendedActions({ review }: { review: ResourceReview }) {
  const actions = review.recommendedNextActions ?? [];
  if (actions.length === 0) return null;
  return (
    <section className="section">
      <h2>Recommended next actions</h2>
      <ul className="resource-actions">
        {actions.map((action, index) => (
          <li key={index}>
            {priorityValue(action.priority)}
            <Markdown source={action.actionMd} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Caveats({ review }: { review: ResourceReview }) {
  if (!review.caveats?.length) return null;
  return (
    <section className="section">
      <h2>Caveats</h2>
      <ul className="resource-caveats">
        {review.caveats.map((item, index) => <li key={index}>{item}</li>)}
      </ul>
    </section>
  );
}

function FilterBlock({ facet, values, counts, selected, onToggle, onClear }: {
  facet: Facet;
  values: string[];
  counts: Map<string, number>;
  selected: Set<string>;
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="filter-block">
      <div className="filter-h">
        {facet.label}
        {selected.size > 0 && <button className="clear" onClick={onClear}>Clear</button>}
      </div>
      <div className="filter-list">
        {values.map((value) => {
          const count = counts.get(value) ?? 0;
          const isSelected = selected.has(value);
          const dot = facet.colors?.[value];
          const cls = `filter-row ${isSelected ? "on" : ""} ${count === 0 && !isSelected ? "disabled" : ""}`;
          return (
            <button
              key={value}
              className={cls}
              disabled={count === 0 && !isSelected}
              onClick={() => count === 0 && !isSelected ? undefined : onToggle(value)}
              title={count === 0 ? "No resources match with current filters" : value}
            >
              <span className="box" />
              {dot && <span className="sw-dot" style={{ background: dot }} />}
              <span className="lbl">{facet.format ? facet.format(value) : (value || "—")}</span>
              <span className="cnt">{count.toLocaleString()}</span>
            </button>
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
  onClearFacet: (key: string) => void;
  onClearQuery: () => void;
  totalShown: number;
  totalAll: number;
}) {
  const chips: { label: string; onClear: () => void }[] = [];
  if (query) chips.push({ label: `"${query}"`, onClear: onClearQuery });
  for (const facet of facets) {
    const set = active[facet.key];
    if (set.size > 0) {
      const values = [...set].map((value) => facet.format ? facet.format(value) : value);
      chips.push({
        label: values.length === 1 ? `${facet.label}: ${values[0]}` : `${facet.label}: ${values.length}`,
        onClear: () => onClearFacet(facet.key),
      });
    }
  }
  return (
    <div className="toolbar">
      <span className="lbl">Showing {totalShown.toLocaleString()} of {totalAll.toLocaleString()}</span>
      {chips.length > 0 && <span className="lbl" style={{ marginLeft: 8 }}>Filters</span>}
      {chips.map((chip, index) => (
        <span key={index} className="chip">
          <b>{chip.label}</b>
          <button className="x" onClick={chip.onClear} aria-label="Remove filter">x</button>
        </span>
      ))}
    </div>
  );
}

function CopyResourcesForLlmButton({ reviews, active, facets, query, totalAll }: {
  reviews: ResourceReview[];
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
      if (set.size > 0) filters.push(`${facet.label}: ${[...set].map((v) => facet.format ? facet.format(v) : v).join(", ")}`);
    }
    const markdown = buildResourcesLlmMarkdown(reviews, {
      url: location.href,
      totalShown: reviews.length,
      totalAll,
      filters,
      query: query.trim() || undefined,
    });
    try {
      await navigator.clipboard.writeText(markdown);
      setState("ok");
    } catch {
      setState("err");
    }
    setTimeout(() => setState("idle"), 1800);
  };
  const label = state === "ok"
    ? `Copied ${reviews.length.toLocaleString()} reviews`
    : state === "err"
    ? "Copy failed"
    : `Copy for LLM (${reviews.length.toLocaleString()})`;
  return (
    <button
      className={`pill-btn ${state === "ok" ? "primary" : ""}`}
      onClick={onClick}
      disabled={reviews.length === 0}
      title="Copy currently-filtered resource reviews to clipboard as Markdown for pasting into an LLM"
    >
      {label}
    </button>
  );
}

function CopySingleResourceForLlmButton({ review }: { review: ResourceReview }) {
  const [state, setState] = useState<"idle" | "ok" | "err">("idle");
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(resourceReviewMarkdown(review, 1));
      setState("ok");
    } catch {
      setState("err");
    }
    setTimeout(() => setState("idle"), 1800);
  };
  const label = state === "ok" ? "Copied review" : state === "err" ? "Copy failed" : "Copy for LLM";
  return (
    <button className={`pill-btn ${state === "ok" ? "primary" : ""}`} onClick={onClick}>
      {label}
    </button>
  );
}

function buildResourcesLlmMarkdown(reviews: ResourceReview[], ctx: {
  url: string;
  totalShown: number;
  totalAll: number;
  filters: string[];
  query?: string;
}) {
  const out: string[] = [];
  out.push("# FHIR R4 to R6 resource-level reviews");
  out.push("");
  out.push(`Source: ${ctx.url}`);
  out.push("");
  out.push("This excerpt mirrors the resource review detail page for each currently-visible resource: objective metadata, overall assessment, migration shape, drivers, next actions, caveats, and method notes.");
  out.push("");
  out.push(`**Showing:** ${ctx.totalShown.toLocaleString()} of ${ctx.totalAll.toLocaleString()} resource reviews`);
  if (ctx.query || ctx.filters.length > 0) {
    out.push("");
    out.push("**Active filters:**");
    if (ctx.query) out.push(`- Search: \`${ctx.query}\``);
    for (const filter of ctx.filters) out.push(`- ${filter}`);
  }
  out.push("");
  out.push("---");
  out.push("");
  reviews.forEach((review, index) => {
    out.push(resourceReviewMarkdown(review, index + 1));
    out.push("---");
    out.push("");
  });
  return out.join("\n").replace(/\n{4,}/g, "\n\n\n").trim();
}

function resourceReviewMarkdown(review: ResourceReview, index: number): string {
  const out: string[] = [];
  const maturity = review.r4Maturity ?? {};
  const method = review.reviewMethod ?? {};
  const totalReviewed = (method.reviewedStructureFindingCount ?? 0) +
    (method.reviewedDirectBehaviorFindingCount ?? 0) +
    (method.reviewedSharedBehaviorContextCount ?? 0);

  out.push(`## ${index}. ${review.resourceType}`);
  out.push("");
  if (review.overall?.oneLineConclusion) out.push(review.overall.oneLineConclusion);
  out.push("");
  out.push(`- **Migration program:** ${review.overall?.majorMigrationAlreadyUnavoidable ?? "Unknown"}`);
  out.push(`- **Migration shape:** ${formatKebab(review.overall?.resourceMigrationShape ?? "not-enough-evidence")}`);
  out.push(`- **Compatibility leverage:** ${formatKebab(review.overall?.compatibilityLeverage ?? "not-enough-evidence")}`);
  out.push(`- **Confidence:** ${review.overall?.confidence ?? "Unknown"}`);
  out.push(`- **R4 maturity:** ${maturity.fmm != null ? `FMM ${maturity.fmm}` : "FMM unknown"}${maturity.standardsStatus ? ` · ${maturity.standardsStatus}` : ""}${maturity.workGroup ? ` · ${maturity.workGroup}` : ""}`);
  out.push(`- **Stability pressure:** ${maturity.stabilityPressure ?? "Unknown"}`);
  out.push(`- **Reviewed inputs:** ${totalReviewed} findings (${method.reviewedStructureFindingCount ?? 0} structure, ${method.reviewedDirectBehaviorFindingCount ?? 0} direct behavior, ${method.reviewedSharedBehaviorContextCount ?? 0} shared context)`);
  out.push("");

  pushQuestion(out, "Overall Assessment", () => {
    pushMdSection(out, "Thesis", review.reasoning?.thesisMd);
    pushMdSection(out, "R4 maturity effect", review.r4Maturity?.effectMd);
  });
  pushQuestion(out, "Migration Shape", () => {
    pushMdSection(out, "Migration shape", review.reasoning?.migrationShapeMd);
    pushMdSection(out, "Compatibility leverage", review.reasoning?.compatibilityLeverageMd);
    pushMdSection(out, "Less-breaking alternatives", review.reasoning?.lessBreakingAlternativesMd);
    pushMdSection(out, "Behavior/API impact", review.reasoning?.behaviorImpactMd);
    pushMdSection(out, "Comparison to deterministic aggregate", review.reasoning?.comparisonToDeterministicAggregateMd);
    pushMdSection(out, "Uncertainty", review.reasoning?.uncertaintyMd);
  });
  pushQuestion(out, "What Drove This?", () => {
    if ((review.findingConsiderations ?? []).length > 0) {
      out.push("#### Finding considerations");
      out.push("");
      out.push("| Role | Surface | Finding | Why it mattered |");
      out.push("|---|---|---|---|");
      for (const finding of review.findingConsiderations ?? []) {
        out.push(`| ${tableCell(formatKebab(finding.role ?? "—"))} | ${tableCell(finding.sourceSurface ?? "—")} | ${tableCell(finding.title ?? finding.findingId ?? "—")} | ${tableCell(finding.reasonMd ?? "")} |`);
      }
      out.push("");
    }
  });
  pushQuestion(out, "Next Actions", () => {
    if ((review.recommendedNextActions ?? []).length > 0) {
      out.push("#### Recommended next actions");
      out.push("");
      for (const action of review.recommendedNextActions ?? []) out.push(`- **${action.priority ?? "Medium"}:** ${action.actionMd ?? ""}`);
      out.push("");
    }
    if ((review.caveats ?? []).length > 0) {
      out.push("#### Caveats");
      out.push("");
      for (const caveat of review.caveats ?? []) out.push(`- ${caveat}`);
      out.push("");
    }
  });
  pushQuestion(out, "Method", () => {
    pushMdSection(out, "Method notes", method.methodNotesMd);
    out.push("#### Source files");
    out.push("");
    out.push(`- **Structure report:** \`${method.structureReportPath ?? "—"}\``);
    out.push(`- **Context:** \`${method.contextPath ?? "—"}\``);
    if (method.deterministicAggregatePath) out.push(`- **Prepass:** \`${method.deterministicAggregatePath}\``);
    for (const path of method.behaviorReportPaths ?? []) out.push(`- **Behavior report:** \`${path}\``);
    out.push("");
  });
  return out.join("\n").replace(/\n{4,}/g, "\n\n\n").trim();
}

function pushQuestion(out: string[], title: string, build: () => void) {
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

function Section({ title, md }: { title: string; md?: string }) {
  if (!md || !md.trim()) return null;
  return (
    <section className="section">
      <h2>{title}</h2>
      <Markdown source={md} />
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

function migrationValue(value?: string) {
  const v = value ?? "Unknown";
  return <span className="resource-value" style={{ color: MIGRATION_COLOR[v] ?? "var(--ink-2)" }}>{v}</span>;
}

function shapeValue(value?: string) {
  const v = value ?? "not-enough-evidence";
  return <span className="resource-value" style={{ color: SHAPE_COLOR[v] ?? "var(--ink-2)" }}>{formatKebab(v)}</span>;
}

function leverageValue(value?: string) {
  const v = value ?? "not-enough-evidence";
  return <span className="resource-value" style={{ color: LEVERAGE_COLOR[v] ?? "var(--ink-2)" }}>{formatLeverage(v)}</span>;
}

function confidenceValue(value?: string) {
  const v = value ?? "Unknown";
  return <span className="resource-value" style={{ color: CONFIDENCE_COLOR[v] ?? "var(--ink-2)" }}>{v}</span>;
}

function stabilityValue(value?: string) {
  const v = value ?? "Unknown";
  return <span className="resource-value" style={{ color: STABILITY_COLOR[v] ?? "var(--ink-2)" }}>{v}</span>;
}

function roleValue(value?: string) {
  const v = value ?? "context-only";
  return <span className={`role-pill role-${v.replaceAll("-", "_")}`}>{formatKebab(v)}</span>;
}

function priorityValue(value?: string) {
  const v = value ?? "Medium";
  return <span className={`priority-pill priority-${v}`}>{v}</span>;
}

function resourceHaystack(review: ResourceReview): string {
  return [
    review.resourceType,
    review.overall?.oneLineConclusion,
    review.overall?.majorMigrationAlreadyUnavoidable,
    review.overall?.resourceMigrationShape,
    review.overall?.compatibilityLeverage,
    review.r4Maturity?.standardsStatus,
    review.r4Maturity?.workGroup,
    review.r4Maturity?.effectMd,
    review.reasoning?.thesisMd,
    review.reasoning?.migrationShapeMd,
    review.reasoning?.compatibilityLeverageMd,
    review.reasoning?.lessBreakingAlternativesMd,
    review.reasoning?.behaviorImpactMd,
    review.reasoning?.comparisonToDeterministicAggregateMd,
    ...(review.findingConsiderations ?? []).flatMap((finding) => [finding.title, finding.findingId, finding.sourceSurface, finding.role, finding.reasonMd]),
    ...(review.recommendedNextActions ?? []).map((action) => action.actionMd),
    ...(review.caveats ?? []),
  ].filter(Boolean).join(" ").toLowerCase();
}

function summarize(all: ResourceReview[], visible: ResourceReview[]) {
  return {
    findingConsiderations: all.reduce((sum, review) => sum + (review.findingConsiderations?.length ?? 0), 0),
    directBehavior: all.reduce((sum, review) => sum + (review.reviewMethod?.reviewedDirectBehaviorFindingCount ?? 0), 0),
    visibleDrivers: visible.reduce((sum, review) => sum + (review.findingConsiderations ?? []).filter((finding) => finding.role === "drives-resource-conclusion").length, 0),
  };
}

function useUrlParams(): [URLSearchParams, (p: URLSearchParams, replace?: boolean) => void] {
  const [params, setParamsState] = useState(() => new URLSearchParams(location.search));
  React.useEffect(() => {
    const onPop = () => setParamsState(new URLSearchParams(location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const setParams = (next: URLSearchParams, replace = false) => {
    const query = next.toString();
    const href = `${location.pathname}${query ? `?${query}` : ""}`;
    if (replace) history.replaceState(null, "", href);
    else history.pushState(null, "", href);
    setParamsState(new URLSearchParams(next));
  };
  return [params, setParams];
}

function detailHref(review: ResourceReview) {
  const params = new URLSearchParams();
  params.set("resource", review.resourceType);
  return `${entrypointHref()}?${params.toString()}`;
}

function entrypointHref() {
  return location.pathname || "./";
}

function RawJsonLink({ data, filename }: { data: any; filename: string }) {
  const onClick = (event: React.MouseEvent) => {
    event.preventDefault();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  return <a href="#" onClick={onClick} title={filename}>Raw JSON</a>;
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const re = new RegExp(`(${query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
  const parts = text.split(re);
  return parts.map((part, index) => index % 2 === 1 ? <mark key={index}>{part}</mark> : <React.Fragment key={index}>{part}</React.Fragment>);
}

function stripMarkdown(value: string) {
  return value.replace(/[`*_#[\]()]/g, "").replace(/\s+/g, " ").trim();
}

function formatKebab(value: string) {
  if (!value || value === "—") return "—";
  return value.replace(/-/g, " ");
}

function formatLeverage(value: string) {
  if (value === "migration-program-dominates") return "migration program dominates";
  if (value === "preserve-where-low-cost-but-expect-resource-migration") return "preserve low-cost compatibility";
  if (value === "preserve-compatibility-per-change") return "preserve per change";
  if (value === "no-special-break-avoidance-needed") return "no special avoidance";
  if (value === "not-enough-evidence") return "not enough evidence";
  return formatKebab(value);
}

function tableCell(value: string) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ").trim() || "—";
}

void resourceReviewIndex;
