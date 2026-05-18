You are analyzing FHIR HTTP, REST, and advertised capability behavior for breaking changes between FHIR R4 and the current R6 ballot build.

Assigned artifact: HttpRestBehavior
Behavior report type: infrastructure

Read `/home/jmandel/hobby/r6breaks/agent-inputs/behavior-output-contracts.md` completely before writing the report. The TypeScript interface `FhirHttpRestBehaviorReport` is the required output schema. Do not use the data-model report schema from `prompt.md` for this task.

Also read `/home/jmandel/hobby/r6breaks/prompt.md` for the calibration rules on judging whether a change was justified and whether the same goal could have been achieved with a less-breaking base R6 design. Apply those concepts in this behavior report using the contract field `freshReview` plus `impact.impactRationaleMd`, `runtimeMechanismMd`, `backwardCompatibilityAnalysisMd`, and `migrationGuidanceMd`; do not invent additional structured fields.

Read `/home/jmandel/hobby/r6breaks/docs/behavior-batch-plan.md` for scope boundaries and duplication rules.

Read `/home/jmandel/hobby/r6breaks/docs/fresh-review-judgment-framework.md` for the FMM-guided fresh-review rubric. Treat FMM and standards status as stability pressure, not as impact by themselves. For this R4→R6 analysis, use the R4 artifact's FMM and standards status as the stability baseline. Do not use R6 FMM/status to increase the burden for R4 compatibility.

Use these local primary inputs:

- R4 core package directory: `/home/jmandel/hobby/r6breaks/fhir-definitions/r4-4.0.1/package`
- R6 core package directory: `/home/jmandel/hobby/r6breaks/fhir-definitions/r6-6.0.0-ballot4/package`
- R4 CapabilityStatements: `/home/jmandel/hobby/r6breaks/fhir-definitions/r4-4.0.1/package/CapabilityStatement-*.json`
- R6 CapabilityStatements: `/home/jmandel/hobby/r6breaks/fhir-definitions/r6-6.0.0-ballot4/package/CapabilityStatement-*.json`
- R4 OperationDefinitions: `/home/jmandel/hobby/r6breaks/fhir-definitions/r4-4.0.1/package/OperationDefinition-*.json`
- R6 OperationDefinitions: `/home/jmandel/hobby/r6breaks/fhir-definitions/r6-6.0.0-ballot4/package/OperationDefinition-*.json`
- R4 SearchParameters: `/home/jmandel/hobby/r6breaks/fhir-definitions/r4-4.0.1/package/SearchParameter-*.json`
- R6 SearchParameters: `/home/jmandel/hobby/r6breaks/fhir-definitions/r6-6.0.0-ballot4/package/SearchParameter-*.json`
- R4 package index: `/home/jmandel/hobby/r6breaks/fhir-definitions/r4-4.0.1/package/.index.json`
- R6 package index: `/home/jmandel/hobby/r6breaks/fhir-definitions/r6-6.0.0-ballot4/package/.index.json`
- R4/R6 package metadata: each package has `package.json` in the package directory.
- R4 base artifact list for the batch run: `/home/jmandel/hobby/r6breaks/agent-inputs/r4-base-resources-and-datatypes.tsv`
- Local R4 rendered spec pages: `/home/jmandel/hobby/r6breaks/fhir-specs/r4-4.0.1/html`
- Local R6 rendered spec pages: `/home/jmandel/hobby/r6breaks/fhir-specs/r6-6.0.0-ballot4/html`
- Page download status/provenance: `/home/jmandel/hobby/r6breaks/batch/behavior/source-status.tsv`
- Behavior page seed manifest: `/home/jmandel/hobby/r6breaks/agent-inputs/behavior-page-manifest.tsv`
- FMM/standards-status context: `/home/jmandel/hobby/r6breaks/batch/behavior/fmm-context.json`

Prefer local rendered HTML pages when present. Use the published URLs below as provenance and as a fallback only if the local page cache is missing a page.

Review these published HL7 source pages in the appropriate FHIR versions:

- RESTful API:
  - R4: `https://hl7.org/fhir/R4/http.html`
  - R6 ballot: `https://hl7.org/fhir/6.0.0-ballot4/http.html`
  - Priority: High
  - Review for interaction definitions, URL shapes, headers, content negotiation, status codes, conditional behavior, history, patch, transaction, batch, and operation invocation over HTTP.
- Search over HTTP:
  - R4: `https://hl7.org/fhir/R4/search.html`
  - R6 ballot: `https://hl7.org/fhir/6.0.0-ballot4/search.html`
  - Priority: High
  - Review only the HTTP/REST-facing behavior: GET vs POST, `_search`, self links, paging links, includes, and server conformance.
- Extended operations over HTTP:
  - R4: `https://hl7.org/fhir/R4/operations.html`
  - R6 ballot: `https://hl7.org/fhir/6.0.0-ballot4/operations.html`
  - Priority: High
  - Review operation endpoint shape, invocation context, parameters over GET/POST, side effects, and HTTP response behavior.
- Asynchronous request pattern:
  - R4: `https://hl7.org/fhir/R4/async.html`
  - R6 ballot: `https://hl7.org/fhir/6.0.0-ballot4/async.html`
  - Priority: Medium
  - Review for `Prefer: respond-async`, polling, deletion/cancel behavior, manifest/bundle behavior, and conformance signals.
- CapabilityStatement resource:
  - R4: `https://hl7.org/fhir/R4/capabilitystatement.html`
  - R6 ballot: `https://hl7.org/fhir/6.0.0-ballot4/capabilitystatement.html`
  - Priority: High
  - Review for `rest`, `interaction`, resource-level capabilities, `searchParam`, `operation`, formats, versioning, conditional behavior, and capability advertisement semantics.
- Bundle resource:
  - R4: `https://hl7.org/fhir/R4/bundle.html`
  - R6 ballot: `https://hl7.org/fhir/6.0.0-ballot4/bundle.html`
  - Priority: Medium
  - Review for transaction, batch, history, and searchset response behavior.
- Security page:
  - R4: `https://hl7.org/fhir/R4/security.html`
  - R6 ballot: `https://hl7.org/fhir/6.0.0-ballot4/security.html`
  - Priority: Low
  - Review only when status-code, auth, audit, or transport-security changes affect HTTP behavior.

If you need to validate page availability, use `curl` rather than a web search tool. Validate each URL independently, for example:

```sh
curl -L -s -o /dev/null -w '%{http_code} %{url_effective}\n' 'https://hl7.org/fhir/R4/http.html'
```

You may inspect related StructureDefinitions, examples, package indexes, and local narrative/spec artifacts inside the two FHIR definition directories when needed. Use SearchParameters and OperationDefinitions as evidence for advertised REST behavior, but keep this report focused on HTTP/REST and capability behavior rather than fully duplicating the dedicated search or operation reports.

Your task:

1. Compare the R4 and R6 `CapabilityStatement` resources, especially `CapabilityStatement-base.json` and `CapabilityStatement-base2.json`.
2. Build a normalized view of advertised REST behavior across:
   - `rest[].mode`;
   - system-level interactions such as `transaction`, `batch`, `history-system`, and `search-system`;
   - resource-level interactions such as `read`, `vread`, `update`, `patch`, `delete`, `history-instance`, `history-type`, `create`, and `search-type`;
   - `format` and `patchFormat`;
   - resource `type`, `profile`, `supportedProfile`, `versioning`, `readHistory`, `updateCreate`, `conditionalCreate`, `conditionalRead`, `conditionalUpdate`, `conditionalDelete`, `referencePolicy`, `searchInclude`, `searchRevInclude`, `searchParam`, and `operation`;
   - top-level and resource-level operation advertisement.
3. Identify removed, added, renamed, moved, narrowed, widened, and semantically changed HTTP/REST behaviors.
4. Pay special attention to:
   - advertised support changing because R4 resources were removed, renamed, split, or replaced in R6;
   - core interactions that affect generic clients, sync engines, validators, import/export jobs, and conformance test suites;
   - changes in search and operation advertisement that alter endpoint discoverability even when the underlying SearchParameter or OperationDefinition still exists;
   - changes that affect conditional operations, versioned reads, history, transaction/batch processing, formats, patch behavior, and resource-level operation availability.
5. Do not report every resource addition/removal as an HTTP finding by default. Report it here when it changes generic REST behavior, advertised capability, endpoint availability, or migration planning beyond the data-model report.
6. Distinguish direct CapabilityStatement/REST changes from SearchParameter, OperationDefinition, and data-model changes. Cross-reference those as `followUpDependencies` instead of duplicating their entire analysis.
7. For each material finding, explain the concrete R4→R6 runtime mechanism: an R4 endpoint is no longer advertised, a generic R4 client loses an interaction, an R4 conformance statement changed, server index/query support changed for R4 behavior, or R4 operation discoverability changed.
8. For each material finding, assess whether the inferred R6 goal is reasonable and whether a less-breaking base R6 REST/capability design was available. Explain concrete alternatives such as preserving advertised support while marking it deprecated, accepting old and new endpoint shapes, adding capability flags instead of changing default semantics, or keeping old formats/search/operation advertisements as aliases.
9. Populate `freshReview` for every finding using the rubric in `docs/fresh-review-judgment-framework.md`: reconstruct the concrete R4→R6 behavior change, give one real-world scenario, identify the R4→R6 compatibility mechanism, apply R4 FMM/standards-status as stability pressure, stress-test less-breaking base R6 designs, and choose `Revisit`, `Unclear`, `Breaking but probably OK`, or `No problem`.
10. Include high-confidence non-breaking additions as `nonBreakingNotableChanges` when they are useful for migration planning.
11. Include `checkedNoMaterialChange` entries for major areas you checked with no material change.
12. Include limitations where official diffs, REST narrative pages, implementation-specific server CapabilityStatements, or examples would improve confidence.

Output requirements:

- Write exactly one valid JSON object to `/home/jmandel/hobby/r6breaks/output/HttpRestBehavior.report.json`.
- The JSON object must conform to `FhirHttpRestBehaviorReport` in `behavior-output-contracts.md`.
- Use `schemaVersion: "fhir-r4-r6-http-rest-behavior/v1"` and `behaviorName: "HttpRestBehavior"`.
- Populate `scope.publishedPagesReviewed` with the published page pairs above, plus any additional page pair you actually used.
- Use finding locators such as `CapabilityStatement/base.rest[mode=server]`, `CapabilityStatement.rest.resource[type=...]`, interaction codes, operation canonical URLs, or search parameter canonical URLs.
- Do not wrap the JSON in Markdown fences.
- Do not include comments or trailing commas.
- Create `/home/jmandel/hobby/r6breaks/output` if it does not already exist.
- After writing the file, run `jq empty /home/jmandel/hobby/r6breaks/output/HttpRestBehavior.report.json` and fix any JSON syntax errors.
- Do not edit `prompt.md` or the downloaded FHIR package files.
