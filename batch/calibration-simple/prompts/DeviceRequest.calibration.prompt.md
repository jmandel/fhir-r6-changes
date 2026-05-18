You are calibrating backwards-compatible alternative judgments for one existing FHIR R4 to R6 breaking-change report.

Assigned artifact: DeviceRequest
Existing report: /home/jmandel/hobby/r6breaks/output/DeviceRequest.report.json
Finding count: 13
Findings missing core justification fields: 0
Findings with existing BC path Yes/Partial: 13
Priority tier: 1

Read `/home/jmandel/hobby/r6breaks/prompt.md` completely before writing the patch, especially `JustificationAssessment` and the calibration rules for:

- `backwardCompatibleAlternativeAvailable`
- `justificationVerdict`

Use these local primary inputs when more evidence is needed:

- R4 core package directory: `/home/jmandel/hobby/r6breaks/fhir-definitions/r4-4.0.1/package`
- R6 core package directory: `/home/jmandel/hobby/r6breaks/fhir-definitions/r6-6.0.0-ballot4/package`
- R4 assigned StructureDefinition: `/home/jmandel/hobby/r6breaks/fhir-definitions/r4-4.0.1/package/StructureDefinition-DeviceRequest.json`
- R6 assigned StructureDefinition, if present: `/home/jmandel/hobby/r6breaks/fhir-definitions/r6-6.0.0-ballot4/package/StructureDefinition-DeviceRequest.json`
- R4 package index: `/home/jmandel/hobby/r6breaks/fhir-definitions/r4-4.0.1/package/.index.json`
- R6 package index: `/home/jmandel/hobby/r6breaks/fhir-definitions/r6-6.0.0-ballot4/package/.index.json`

High-sensitivity scope:

- Review every finding in the existing report, not just obvious suspect findings.
- Emit exactly one patch entry for every existing `findings[].findingId`.
- Reconsider cases where the old report says `No` or `Unknown` but the narrative text implies a less-breaking design path.
- Reconsider cases where `Yes` or `Partial` is really only migration guidance, conversion tooling, an extension/backport strategy, or a profile mitigation rather than a backwards-compatible base R6 design.
- Do not create, remove, split, or merge findings.
- Do not rewrite the full report.
- Do not edit `/home/jmandel/hobby/r6breaks/prompt.md`, FHIR package files, or `output/*.report.json`.

Calibration rules:

- `justificationVerdict` is the combined judgment: whether the inferred R6 goal is reasonable and whether it was reasonable to accomplish that goal with this level of breakage.
- `backwardCompatibleAlternativeAvailable` is the compact judgment about whether the same goal could have been met with a less-breaking base R6 design:
  - `Yes`: a plausible less-breaking design would preserve most or all R4-valid instances while still meeting the core R6 goal with low or moderate long-term tradeoff.
  - `Partial`: a less-breaking design exists but is incomplete, covers only common cases, or has material tradeoffs such as duplicate same-resource representations, validation ambiguity, safety risk, implementation burden, or interoperability cost.
  - `No`: no plausible less-breaking base design was identified.
  - `Not applicable`: the finding is not a breaking R4-to-R6 base-design issue, such as additive optional R6 content, target/type widening that preserves R4 instances, or a pure R6-to-R4 down-conversion concern.
  - `Unknown`: evidence is insufficient.
- Do not count ordinary migration guidance, conversion tooling, or an R6-to-R4 extension/backport workaround as `Yes`; those are mitigations, not base-design alternatives.
- Living with a nonoptimal R4 name can be a legitimate way to avoid breakage. If retaining the old name/shape plus clearer definitions, broader targets/types, or profile guidance meets the R6 goal, treat that as a serious alternative.
- Duplication is not forbidden, but it must be weighed. If the less-breaking design keeps an old same-resource field and adds a new same-resource field/choice/backbone for the same fact, explain the risk that deprecated representations may never disappear and may accumulate indefinitely.
- Put alternative quality and tradeoffs in `backwardCompatibleAlternativeSummary`, `alternativeTradeoffSummary`, and `backwardCompatibleAlternativeMd`; do not add extra structured fields.
- If `backwardCompatibleAlternativeAvailable` is `Yes`, `justificationVerdict` should usually be `Not clearly justified` or `Probably avoidable` unless you explain why the less-breaking design would fail the goal.
- If `backwardCompatibleAlternativeAvailable` is `Partial`, `Probably justified` may be appropriate only when the tradeoffs are material and explicit.
- A `Justified` verdict with a `Yes` or `Partial` alternative should be rare and must explicitly explain why the breaking design was still necessary.

Output requirements:

- Write exactly one valid JSON object to temporary path `/home/jmandel/hobby/r6breaks/batch/calibration-simple/tmp/DeviceRequest.calibration.json`.
- Use this JSON shape:

{
  "schemaVersion": "calibration-patch-simple-v1",
  "artifactName": "DeviceRequest",
  "patches": [
    {
      "findingId": "existing finding id",
      "justification": {
        "justificationVerdict": "one valid verdict",
        "backwardCompatibleAlternativeAvailable": "one valid availability value",
        "backwardCompatibleAlternativeSummary": "short summary, revised if needed",
        "alternativeTradeoffSummary": "short tradeoff summary, revised if needed",
        "justificationRationaleMd": "concise rationale for the verdict and alternative tradeoffs",
        "backwardCompatibleAlternativeMd": "concise explanation of the best alternative or why none applies"
      }
    }
  ]
}

- Include all existing finding IDs exactly once.
- Do not wrap the JSON in Markdown fences.
- Do not include comments or trailing commas.
- Run `jq empty "/home/jmandel/hobby/r6breaks/batch/calibration-simple/tmp/DeviceRequest.calibration.json"` and fix any JSON syntax errors.
- After `jq empty` succeeds, atomically install the patch with `mv "/home/jmandel/hobby/r6breaks/batch/calibration-simple/tmp/DeviceRequest.calibration.json" "/home/jmandel/hobby/r6breaks/batch/calibration-simple/patches/DeviceRequest.calibration.json"`.
