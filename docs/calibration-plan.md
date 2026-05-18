# Justification Calibration Plan

## Goal

Backfill every existing finding with a clearer, simpler judgment about the R4-to-R6 change:

- What breaks for R4 instances or implementations?
- What was the likely R6 goal?
- Was that goal reasonable?
- Could the same goal have been accomplished with less breakage?

Do not add extra structured dimensions for alternative quality. Keep the schema compact and use the existing `justification` fields better.

## Schema

No new output fields are needed. Calibrate these existing fields:

- `justificationVerdict`
- `backwardCompatibleAlternativeAvailable`
- `inferredGoal`
- `backwardCompatibleAlternativeSummary`
- `alternativeTradeoffSummary`
- `justificationRationaleMd`
- `backwardCompatibleAlternativeMd`

`backwardCompatibleAlternativeAvailable` should carry the compact alternative judgment:

- `Yes`: a plausible less-breaking base R6 design would meet the core R6 goal with low or moderate long-term tradeoff.
- `Partial`: a less-breaking design exists but is incomplete, covers only common cases, or has material tradeoffs such as duplicate same-resource representations, validation ambiguity, safety risk, implementation burden, or interoperability cost.
- `No`: no plausible less-breaking base design was identified.
- `Not applicable`: the finding is not a breaking R4-to-R6 base-design issue.
- `Unknown`: evidence is insufficient.

Living with a nonoptimal R4 name can be a reasonable compatibility strategy. Duplication is not forbidden, but agents must discuss the risk that deprecated same-resource representations may never disappear and may accumulate indefinitely.

## High-Sensitivity Scope

Do not calibrate only an obvious suspect set. Include every finding in every existing report that has findings. Priority tiers are used only for ordering and review:

- `priority=1`: verdict is `Justified` or `Probably justified` and the existing BC field is `Yes` or `Partial`.
- `priority=2`: existing BC field is `Yes` or `Partial`, regardless of verdict.
- `priority=3`: all other findings.

Agents must emit one patch entry for every finding in their assigned artifact report.

## Agent Workflow

For each artifact:

1. Read `prompt.md`.
2. Read `output/<Artifact>.report.json`.
3. Inspect local FHIR definitions only as needed:
   - R4: `fhir-definitions/r4-4.0.1/package`
   - R6 ballot: `fhir-definitions/r6-6.0.0-ballot4/package`
4. Re-evaluate the existing `justification` block for every finding.
5. Write a small calibration patch to `batch/calibration-simple/patches/<Artifact>.calibration.json`.

Agents must not rewrite full reports. They should update only the `justification` fields needed for calibration.

## Patch Contract

Patch files use:

```json
{
  "schemaVersion": "calibration-patch-simple-v1",
  "artifactName": "Communication",
  "patches": [
    {
      "findingId": "Communication:example:123",
      "justification": {
        "justificationVerdict": "Not clearly justified",
        "backwardCompatibleAlternativeAvailable": "Yes",
        "backwardCompatibleAlternativeSummary": "...",
        "alternativeTradeoffSummary": "...",
        "justificationRationaleMd": "...",
        "backwardCompatibleAlternativeMd": "..."
      }
    }
  ]
}
```

Strict validation requires exactly one patch per existing finding.

## Execution Plan

1. Run a small sample with `CONCURRENCY=1` or `2`.
2. Validate patch JSON and strict per-finding coverage.
3. Apply sample patches to a staged directory such as `output-calibrated-smoke/`.
4. Audit the staged output for missing or invalid core justification fields.
5. Run the full pass with `CONCURRENCY=12`, `MODEL=gpt-5.5`, `REASONING_EFFORT=xhigh`, and a long timeout such as `JOB_TIMEOUT=4h`.
6. Apply all patches in place only after validation succeeds, writing backups under `batch/calibration-simple/backups/`.
7. Rebuild viewer data and run the viewer build.

## Supporting Commands

Sample run:

```bash
CONCURRENCY=1 JOB_TIMEOUT=4h scripts/run_calibration_agents.sh --sample 2
node scripts/apply_calibration_patches.mjs \
  --patch-dir batch/calibration-simple/patches \
  --output-dir output-calibrated-smoke
node scripts/audit_calibration.mjs --report-dir output-calibrated-smoke --fail-on-missing
```

Full run:

```bash
CONCURRENCY=12 JOB_TIMEOUT=4h scripts/run_calibration_agents.sh --all
node scripts/apply_calibration_patches.mjs \
  --patch-dir batch/calibration-simple/patches \
  --in-place \
  --backup-dir batch/calibration-simple/backups/$(date +%Y%m%dT%H%M%S)
node scripts/audit_calibration.mjs --report-dir output --fail-on-missing
```
