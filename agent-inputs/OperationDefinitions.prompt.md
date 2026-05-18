You are analyzing FHIR operation behavior for breaking changes between FHIR R4 and the current R6 ballot build.

Assigned artifact: OperationDefinitions
Behavior report type: infrastructure

Read `/home/jmandel/hobby/r6breaks/agent-inputs/behavior-output-contracts.md` completely before writing the report. The TypeScript interface `FhirOperationBehaviorReport` is the required output schema. Do not use the data-model report schema from `prompt.md` for this task.

Also read `/home/jmandel/hobby/r6breaks/prompt.md` for the calibration rules on judging whether a change was justified and whether the same goal could have been achieved with a less-breaking base R6 design. Apply those concepts in this behavior report using the contract field `freshReview` plus `impact.impactRationaleMd`, `runtimeMechanismMd`, `backwardCompatibilityAnalysisMd`, and `migrationGuidanceMd`; do not invent additional structured fields.

Read `/home/jmandel/hobby/r6breaks/docs/behavior-batch-plan.md` for scope boundaries and duplication rules.

Read `/home/jmandel/hobby/r6breaks/docs/fresh-review-judgment-framework.md` for the FMM-guided fresh-review rubric. Treat FMM and standards status as stability pressure, not as impact by themselves. For this R4→R6 analysis, use the R4 artifact's FMM and standards status as the stability baseline. Do not use R6 FMM/status to increase the burden for R4 compatibility.

Use these local primary inputs:

- R4 core package directory: `/home/jmandel/hobby/r6breaks/fhir-definitions/r4-4.0.1/package`
- R6 core package directory: `/home/jmandel/hobby/r6breaks/fhir-definitions/r6-6.0.0-ballot4/package`
- R4 OperationDefinition files: `/home/jmandel/hobby/r6breaks/fhir-definitions/r4-4.0.1/package/OperationDefinition-*.json`
- R6 OperationDefinition files: `/home/jmandel/hobby/r6breaks/fhir-definitions/r6-6.0.0-ballot4/package/OperationDefinition-*.json`
- R4 CapabilityStatements: `/home/jmandel/hobby/r6breaks/fhir-definitions/r4-4.0.1/package/CapabilityStatement-*.json`
- R6 CapabilityStatements: `/home/jmandel/hobby/r6breaks/fhir-definitions/r6-6.0.0-ballot4/package/CapabilityStatement-*.json`
- R4 package index: `/home/jmandel/hobby/r6breaks/fhir-definitions/r4-4.0.1/package/.index.json`
- R6 package index: `/home/jmandel/hobby/r6breaks/fhir-definitions/r6-6.0.0-ballot4/package/.index.json`
- R4/R6 package metadata: each package has `package.json` in the package directory.
- R4 base artifact list for the batch run: `/home/jmandel/hobby/r6breaks/agent-inputs/r4-base-resources-and-datatypes.tsv`
- Local R4 rendered spec pages: `/home/jmandel/hobby/r6breaks/fhir-specs/r4-4.0.1/html`
- Local R6 rendered spec pages: `/home/jmandel/hobby/r6breaks/fhir-specs/r6-6.0.0-ballot4/html`
- Page download status/provenance: `/home/jmandel/hobby/r6breaks/batch/behavior/source-status.tsv`
- Operation fanout manifest, if generated: `/home/jmandel/hobby/r6breaks/batch/behavior/operation-fanout.tsv`
- Operation page candidate manifest, if generated: `/home/jmandel/hobby/r6breaks/batch/behavior/operation-pages.tsv`
- FMM/standards-status context: `/home/jmandel/hobby/r6breaks/batch/behavior/fmm-context.json`

Prefer local rendered HTML pages when present. Use the published URLs below as provenance and as a fallback only if the local page cache is missing a page.

Review these published HL7 source pages in the appropriate FHIR versions:

- Extended operations framework:
  - R4: `https://hl7.org/fhir/R4/operations.html`
  - R6 ballot: `https://hl7.org/fhir/6.0.0-ballot4/operations.html`
  - Priority: High
  - Review for invocation levels, URL shape, GET vs POST behavior, idempotence, parameters, side effects, and conformance expectations.
- Published operation list:
  - R4: `https://hl7.org/fhir/R4/operationslist.html`
  - R6 ballot: `https://hl7.org/fhir/6.0.0-ballot4/operationslist.html`
  - Priority: High
  - Review for the human-readable list, but derive the authoritative inventory from local `OperationDefinition-*.json` files.
- OperationDefinition resource definition:
  - R4: `https://hl7.org/fhir/R4/operationdefinition.html`
  - R6 ballot: `https://hl7.org/fhir/6.0.0-ballot4/operationdefinition.html`
  - Priority: High
  - Review for changed meaning of operation metadata and parameter fields, especially `system`, `type`, `instance`, `affectsState`, `parameter`, nested `part`, binding, profile, and synchronicity-related fields.
- CapabilityStatement operation advertisement:
  - R4: `https://hl7.org/fhir/R4/capabilitystatement.html`
  - R6 ballot: `https://hl7.org/fhir/6.0.0-ballot4/capabilitystatement.html`
  - Priority: Medium
  - Review for how servers advertise system-level, type-level, and instance-level operations.
- Terminology service:
  - R4: `https://hl7.org/fhir/R4/terminology-service.html`
  - R6 ballot: `https://hl7.org/fhir/6.0.0-ballot4/terminology-service.html`
  - Priority: Medium
  - Review when terminology operations such as `$lookup`, `$validate-code`, `$subsumes`, `$translate`, or `$expand` materially changed.

If you need to validate page availability, use `curl` rather than a web search tool. Validate each URL independently, for example:

```sh
curl -L -s -o /dev/null -w '%{http_code} %{url_effective}\n' 'https://hl7.org/fhir/R4/operations.html'
```

You may inspect related StructureDefinitions, SearchParameters, ValueSets, CodeSystems, ConceptMaps, examples, and package indexes inside the two package directories when needed. Use CapabilityStatements to understand which operations are advertised, but keep this report scoped to OperationDefinition behavior.

Your task:

1. Build normalized R4 and R6 inventories of every `OperationDefinition` in the core packages. Script or otherwise compute this from the local package files; do not hand-copy the operation list from the narrative page. At minimum, derive the R4/R6 operation counts and ids from the `OperationDefinition-*.json` files on disk.
2. Match operations by canonical `url` first. When URLs differ or disappear, use `code`, `name`, `base`, `system`, `type`, `instance`, affected resource type, and parameter shape to identify likely renames, replacements, splits, or removals.
3. Identify removed, added, renamed, replaced, split, merged, and materially changed operations.
4. For changed operations, compare at least:
   - `url`, `id`, `name`, `title`, `status`, `kind`, `code`, `base`, and `resource`;
   - invocation context flags: `system`, `type`, and `instance`;
   - side-effect signal: `affectsState`;
   - input/output `parameter[]` names, `use`, `min`, `max`, `type`, `targetProfile`, `searchType`, `binding`, `part`, and documentation;
   - changed requiredness, repeatability, parameter nesting, response shape, or profile constraints;
   - related CapabilityStatement advertisement changes.
5. Pay special attention to operations that are likely to be directly implemented by clients or servers, including terminology operations, validation/conversion operations, `$everything`, `$match`, `$lastn`, `$stats`, measure operations, subscription operations, purge/delete-like operations, graph/graphql operations, and metadata operations.
6. Distinguish operation behavior changes from data-model changes. If an operation parameter changed because the referenced resource/datatype changed, report the operation impact here and put the resource/datatype dependency in `followUpDependencies` or `reducerHints`; do not duplicate the underlying StructureDefinition finding.
7. For each material finding, explain the concrete R4→R6 runtime mechanism: an R4 `$operation` URL is no longer advertised, invocation moved from system/type/instance level, an R4-optional parameter is now required, an R4 parameter type changed, an R4 response `Parameters` shape changed, side effects changed for an R4-supported operation, or the same R4 request is accepted but behaves materially differently.
8. For each material finding, assess whether the inferred R6 goal is reasonable and whether a less-breaking base R6 operation design was available. Explain concrete alternatives such as preserving an old operation name, accepting both old and new parameter names, adding an optional parameter instead of replacing one, or documenting a preferred replacement while keeping the old operation.
9. Populate `freshReview` for every finding using the rubric in `docs/fresh-review-judgment-framework.md`: reconstruct the concrete R4→R6 behavior change, give one real-world scenario, identify the R4→R6 compatibility mechanism, apply R4 FMM/standards-status as stability pressure, stress-test less-breaking base R6 designs, and choose `Revisit`, `Unclear`, `Breaking but probably OK`, or `No problem`.
10. Include high-confidence non-breaking additions as `nonBreakingNotableChanges` when they are useful for migration planning.
11. Include `checkedNoMaterialChange` entries for major areas you checked with no material change.
12. Include limitations where official diffs, narrative operation pages, terminology expansions, or implementation-specific CapabilityStatements would improve confidence.

Output requirements:

- Write exactly one valid JSON object to `/home/jmandel/hobby/r6breaks/output/OperationDefinitions.report.json`.
- The JSON object must conform to `FhirOperationBehaviorReport` in `behavior-output-contracts.md`.
- Use `schemaVersion: "fhir-r4-r6-operation-behavior/v1"` and `behaviorName: "OperationDefinitions"`.
- Populate `scope.publishedPagesReviewed` with the published page pairs above, plus any additional page pair you actually used.
- Use finding locators such as canonical URLs, `OperationDefinition/<id>`, `$<code>`, or `OperationDefinition.parameter[name=...]`.
- Do not wrap the JSON in Markdown fences.
- Do not include comments or trailing commas.
- Create `/home/jmandel/hobby/r6breaks/output` if it does not already exist.
- After writing the file, run `jq empty /home/jmandel/hobby/r6breaks/output/OperationDefinitions.report.json` and fix any JSON syntax errors.
- Do not edit `prompt.md` or the downloaded FHIR package files.
