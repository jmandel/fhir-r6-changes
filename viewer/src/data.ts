// Single source of truth: re-export the generated bundle and provide a
// flattened list of findings for the explore view.

import { bundle as raw } from "../data-bundle";
import type { Finding, R4Maturity } from "../types";

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

/** Distinct values for a coded field, sorted by count desc. */
export function distinct<T extends string | undefined | null>(get: (f: FlatFinding) => T) {
  const counts = new Map<string, number>();
  for (const f of flat) {
    const v = get(f) ?? "—";
    counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}
