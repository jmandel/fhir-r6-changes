# UI Update Guide: Justification Calibration

## Summary

The calibration pass does **not** add new output fields. It improves the meaning and consistency of existing `findings[].justification` fields so the UI can answer:

- What breaks?
- Why did R6 probably change it?
- Was the goal reasonable?
- Could the same goal have been achieved with less breakage?

Do not build UI around previously discussed experimental fields such as `backwardCompatibleAlternativeStatus`, `breakingChangeAvoidability`, or `sameResourceDuplicationRisk`. They are not part of the simplified output model.

## Output Model

The relevant existing fields are:

```ts
finding.justification = {
  justificationVerdict:
    | "Justified"
    | "Probably justified"
    | "Not clearly justified"
    | "Probably avoidable"
    | "Cannot assess";

  backwardCompatibleAlternativeAvailable:
    | "Yes"
    | "No"
    | "Partial"
    | "Not applicable"
    | "Unknown";

  inferredGoal?: string;
  backwardCompatibleAlternativeSummary?: string;
  alternativeTradeoffSummary?: string;
  justificationRationaleMd: string;
  backwardCompatibleAlternativeMd?: string;
}
```

The main semantic change is tighter calibration of `backwardCompatibleAlternativeAvailable`:

- `Yes`: a plausible less-breaking base R6 design could preserve most/all R4-valid instances while still meeting the R6 goal with low or moderate long-term tradeoff.
- `Partial`: a less-breaking design exists but is incomplete or has material tradeoffs, including duplicate same-resource representations that may never disappear.
- `No`: no plausible less-breaking base design was identified.
- `Not applicable`: this is not a breaking R4-to-R6 base-design issue, such as optional additions or type/target widening that preserves R4 instances.
- `Unknown`: insufficient evidence.

## Current Viewer State

Entry point:

- `viewer/index.html` mounts `viewer/src/main.tsx`.
- `viewer/scripts/build-data.ts` reads `output/*.report.json` by default, or `DATA_DIR=<dir>` if supplied, and writes `viewer/src/data-bundle.ts`.
- `viewer/src/data.ts` exports `bundle`, `flat`, `findingById`, and `artifactByName`.

Existing useful UI:

- `viewer/src/Explore.tsx` already has facets for `justificationVerdict` and `backwardCompatibleAlternativeAvailable`.
- `viewer/src/FindingPage.tsx` already shows a `BC path: <value>` badge and renders `inferredGoal`, `backwardCompatibleAlternativeSummary`, and `alternativeTradeoffSummary`.
- `viewer/src/ArtifactPage.tsx` lists findings for one artifact.

## Recommended Explore Page Updates

Keep the existing `bcAlt` facet, but consider renaming the label from “Backwards-compatible path” to **“Less-breaking alternative”**. This is closer to what the field means after calibration.

Add `backwardCompatibleAlternativeAvailable` as a badge on each result row. Suggested labels:

- `Alt: Yes`
- `Alt: Partial`
- `Alt: No`
- `Alt: N/A`
- `Alt: Unknown`

Recommended badge colors:

- `Yes`: red/orange or warning color, because this may indicate an avoidable break.
- `Partial`: amber, because there is a tradeoff-heavy alternative.
- `No`: neutral/gray.
- `Not applicable`: muted gray.
- `Unknown`: muted amber/gray.

Add these search fields to the Explore search haystack:

- `justification.justificationRationaleMd`
- `justification.backwardCompatibleAlternativeMd`
- `justification.alternativeTradeoffSummary`
- `backwardCompatibilityAnalysisMd`
- `validationAndCompatibilityMd`

High-value derived filters, if the UI wants shortcuts:

- **Possibly avoidable**: `bcAlt=Yes`
- **Tradeoff alternative exists**: `bcAlt=Partial`
- **Needs justification review**: `bcAlt=Yes` and `justificationVerdict` in `Justified | Probably justified`
- **Not a forward break**: `bcAlt=Not applicable`
- **Hard break with possible alternative**: `impact.hardInstanceBreaking=Yes` and `bcAlt in Yes | Partial`

These can be implemented as preset links using the existing hash query parameters rather than new data fields.

## Recommended Finding Detail Updates

On `viewer/src/FindingPage.tsx`, make the detail page visibly answer four questions:

1. **What changed?**
   - Existing `Overview`
   - Existing `R4 vs R6 — element diff`
   - Existing `Structured delta`

2. **What breaks?**
   - `impact.hardInstanceBreaking`
   - `impact.runtimeBreakingRisk`
   - `impact.r6ToR4RepresentabilityRisk`
   - `validationAndCompatibilityMd`
   - `impact.impactRationaleMd`

3. **Why might R6 have done this?**
   - `justification.inferredGoal`
   - `justification.justificationVerdict`
   - `justification.justificationRationaleMd`

4. **Could it have been done less breakingly?**
   - `justification.backwardCompatibleAlternativeAvailable`
   - `justification.backwardCompatibleAlternativeSummary`
   - `justification.alternativeTradeoffSummary`
   - `justification.backwardCompatibleAlternativeMd`

The current detail page shows the summary/tradeoff fields but should add a dedicated Markdown section for `justification.backwardCompatibleAlternativeMd`, for example:

```tsx
<Section
  title="Less-breaking alternative"
  md={just.backwardCompatibleAlternativeMd}
/>
```

Suggested detail labels:

- `Inferred goal`
- `Justification`
- `Less-breaking alternative`
- `Alternative tradeoffs`
- `Analyst rationale`

## Recommended Artifact Page Updates

On `viewer/src/ArtifactPage.tsx`, add the same BC alternative badge used in Explore to each finding row. This lets reviewers scan one resource for:

- hard breaks,
- verdicts,
- and possible less-breaking alternatives.

Consider adding artifact-level counts:

- findings with `bcAlt=Yes`
- findings with `bcAlt=Partial`
- findings with `bcAlt=Not applicable`
- findings where `bcAlt=Yes` and verdict is still `Justified` or `Probably justified`

The last count is especially useful as a “needs review” queue after calibration.

## Data Rebuild

After calibrated reports are applied:

```bash
cd viewer
bun run build:data
```

To preview a staged calibrated output directory without replacing `output/`:

```bash
cd viewer
DATA_DIR=/home/jmandel/hobby/r6breaks/output-calibrated-smoke-simple bun run build:data
bun run dev
```

For production build:

```bash
cd viewer
bun run build
```

## What Not To Do

- Do not expect or require new fields beyond the existing `justification` fields listed above.
- Do not treat `backwardCompatibleAlternativeAvailable=Yes` as automatically “bad R6 change.” Read the summary and tradeoffs.
- Do not hide `Partial`; it is often the most important review bucket because it means “possible, but with real long-term cost.”
- Do not count R6-to-R4 extension/backport strategies as less-breaking base R6 alternatives in the UI copy.
