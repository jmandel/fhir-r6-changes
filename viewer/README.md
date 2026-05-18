# r6breaks viewer

Single-page React + Zustand viewer over `*.report.json` files in `../output/`.

## Dev

```bash
bun install
bun run build:data          # bundles ../output/*.report.json into src/data-bundle.ts
bun --hot index.html        # bun's built-in HTML dev server (auto-rebuilds on save)
```

Open http://localhost:3000.

Re-run `bun run build:data` whenever new reports are added; hot reload picks up the change.

To preview against a different report dir (e.g. dev fixtures):

```bash
DATA_DIR=./fixtures bun run build:data
```

## Build (static)

```bash
bun run build               # outputs to dist/
```

## Headless screenshot

```bash
bun run scripts/snapshot.ts # writes screens/*.png
```

## Layout

- `src/App.tsx` — top-level layout (sidebar + main)
- `src/store.ts` — Zustand store (view, selection, filters)
- `src/hashRouter.ts` — URL hash ↔ store sync (`#/artifacts/HumanName/<findingId>`)
- `src/components/Sidebar.tsx` — virtualized artifact list with sort + kind tabs
- `src/components/Dashboard.tsx` — KPIs, severity bar, assessment outcomes, risk matrix (impact × confidence), most-impacted heat table, top findings, cross-artifact patterns
- `src/components/ArtifactsView.tsx` + `ArtifactDetail.tsx` — grid and per-artifact deep dive
- `src/components/FindingsView.tsx` — virtualized cross-artifact finding browser with filters; `j`/`k` navigation
- `src/components/FindingDetail.tsx` — full finding panel (old/new state, structured delta, evidence, examples, all markdown sections)
- `src/components/VirtualList.tsx` — minimal fixed-row-height virtualizer for O(thousands) of rows

## Scale

Tested visually at ~150 synthetic reports (599 findings). All long lists (sidebar artifacts, findings browser) are virtualized; per-artifact dashboard widgets use top-N + "show more"; filter chips collapse beyond 6.
