// Single source of truth: re-export the generated bundle and provide a
// flattened list of findings for the explore view.

import { bundle as raw } from "../data-bundle";
import type { BehaviorFinding, BehaviorReport, Finding, R4Maturity, ResourceReview } from "../types";

export const bundle = raw;

export interface FlatFinding extends Finding {
  artifactName: string;
  artifactKind: string;
  r4Maturity?: R4Maturity;
}

const maturity = raw.r4Maturity ?? {};

export function r4MaturityFor(name: string): R4Maturity | undefined {
  return maturity[name];
}

export const flat: FlatFinding[] = (() => {
  const out: FlatFinding[] = [];
  for (const r of raw.reports) {
    const m = maturity[r.artifactName];
    for (const f of r.findings ?? []) {
      out.push({ ...f, artifactName: r.artifactName, artifactKind: r.artifactKind ?? "unknown", r4Maturity: m });
    }
  }
  return out;
})();

export function findingById(id: string): FlatFinding | undefined {
  return flat.find((f) => f.findingId === id);
}

export function artifactByName(name: string) {
  return raw.reports.find((r) => r.artifactName === name);
}

export interface FlatBehaviorFinding extends BehaviorFinding {
  report: BehaviorReport;
  reportKey: string;
  reportLabel: string;
  family: string;
}

export const behaviorReports = raw.behaviorReports ?? [];
export const resourceReviews: ResourceReview[] = raw.resourceReviews ?? [];
export const resourceReviewIndex = raw.resourceReviewIndex ?? null;

export const behaviorFlat: FlatBehaviorFinding[] = (() => {
  const out: FlatBehaviorFinding[] = [];
  for (const report of behaviorReports) {
    const reportKey = report._reportKey ?? report.scope?.assignedBehavior ?? report.behaviorName;
    const family = behaviorFamily(report);
    const reportLabel = behaviorReportLabel(report);
    for (const finding of report.findings ?? []) {
      out.push({ ...finding, report, reportKey, reportLabel, family });
    }
  }
  return out;
})();

export function behaviorFindingById(reportKey: string, findingId: string): FlatBehaviorFinding | undefined {
  return behaviorFlat.find((f) => f.reportKey === reportKey && f.findingId === findingId);
}

export function behaviorFamily(report: BehaviorReport): string {
  if (report.behaviorName === "OperationDefinitions") return "Operations";
  if (report.behaviorName === "SearchParameters") return "Search";
  if (report.behaviorName === "HttpRestBehavior") return "HTTP / REST";
  return report.behaviorName ?? "Behavior";
}

export function behaviorReportLabel(report: BehaviorReport): string {
  const assigned = report.scope?.assignedBehavior;
  if (typeof assigned === "string" && assigned.startsWith("OperationDefinition:")) {
    return assigned.slice("OperationDefinition:".length);
  }
  return behaviorFamily(report);
}

export function resourceReviewByName(resourceType: string): ResourceReview | undefined {
  return resourceReviews.find((review) => review.resourceType === resourceType);
}

/** Distinct values for a coded field, sorted by count desc. */
export function distinct<T extends string | undefined | null>(get: (f: FlatFinding) => T) {
  const counts = new Map<string, number>();
  for (const f of flat) {
    const v = get(f) ?? "—";
    counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}
