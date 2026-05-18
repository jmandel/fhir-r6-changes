# FHIR R4 to R6 Breaking Changes

Static analysis reports and a small web viewer for exploring candidate breaking changes between FHIR R4 4.0.1 and the R6 6.0.0-ballot4 package.

The deployed site is built by GitHub Actions from the checked-in report JSON files in `output/`.

## Local Build

```bash
cd viewer
bun install
bun run build
```

The build regenerates `viewer/data-bundle.ts` from `output/` and writes the static site to `viewer/dist/`.

## Contents

- `output/`: calibrated per-artifact report JSON files used by the web app.
- `prompt.md`: main analysis prompt and output schema.
- `batch/calibration-simple/prompts/`: per-artifact calibration prompts.
- `batch/calibration-simple/patches/`: calibration patches applied to `output/`.
- `scripts/`: local scripts for calibration application and audit.
- `viewer/`: React/Bun static viewer.

This project is not affiliated with HL7. Use alongside the official FHIR specification and ballot materials.
