You are analyzing FHIR search behavior for breaking changes between FHIR R4 and the current R6 ballot build.

Assigned artifact: SearchParameters
Behavior report type: infrastructure

Read `/home/jmandel/hobby/r6breaks/agent-inputs/behavior-output-contracts.md` completely before writing the report. The TypeScript interface `FhirSearchBehaviorReport` is the required output schema. Do not use the data-model report schema from `prompt.md` for this task.

Use these local primary inputs:

- R4 core package directory: `/home/jmandel/hobby/r6breaks/fhir-definitions/r4-4.0.1/package`
- R6 core package directory: `/home/jmandel/hobby/r6breaks/fhir-definitions/r6-6.0.0-ballot4/package`
- R4 SearchParameter files: `/home/jmandel/hobby/r6breaks/fhir-definitions/r4-4.0.1/package/SearchParameter-*.json`
- R6 SearchParameter files: `/home/jmandel/hobby/r6breaks/fhir-definitions/r6-6.0.0-ballot4/package/SearchParameter-*.json`
- R4 package index: `/home/jmandel/hobby/r6breaks/fhir-definitions/r4-4.0.1/package/.index.json`
- R6 package index: `/home/jmandel/hobby/r6breaks/fhir-definitions/r6-6.0.0-ballot4/package/.index.json`
- R4/R6 package metadata: each package has `package.json` in the package directory.
- R4 base artifact list for the batch run: `/home/jmandel/hobby/r6breaks/agent-inputs/r4-base-resources-and-datatypes.tsv`

Review these published HL7 source pages in the appropriate FHIR versions:

- Search framework:
  - R4: `https://hl7.org/fhir/R4/search.html`
  - R6 ballot: `https://hl7.org/fhir/6.0.0-ballot4/search.html`
  - Priority: High
  - Review for transport, matching semantics, modifiers, prefixes, chaining, reverse chaining, `_include`, `_revinclude`, `_summary`, `_elements`, `_count`, `_total`, `_sort`, `_filter`, and conformance rules.
- Search parameter registry:
  - R4: `https://hl7.org/fhir/R4/searchparameter-registry.html`
  - R6 ballot: `https://hl7.org/fhir/6.0.0-ballot4/searchparameter-registry.html`
  - Priority: High
  - Review for the published human-readable registry and resource grouping; use local package JSON for the authoritative computable inventory.
- SearchParameter resource definition:
  - R4: `https://hl7.org/fhir/R4/searchparameter.html`
  - R6 ballot: `https://hl7.org/fhir/6.0.0-ballot4/searchparameter.html`
  - Priority: High
  - Review for changed meaning of SearchParameter fields, especially `base`, `code`, `type`, `expression`, `processingMode`, `target`, `multipleAnd`, `multipleOr`, `comparator`, `modifier`, `chain`, and `component`.
- CapabilityStatement search declarations:
  - R4: `https://hl7.org/fhir/R4/capabilitystatement.html`
  - R6 ballot: `https://hl7.org/fhir/6.0.0-ballot4/capabilitystatement.html`
  - Priority: Medium
  - Review for how servers advertise supported search parameters and search behavior.
- Compartment search context:
  - R4: `https://hl7.org/fhir/R4/compartmentdefinition.html`
  - R6 ballot: `https://hl7.org/fhir/6.0.0-ballot4/compartmentdefinition.html`
  - Priority: Medium
  - Review only when compartment-scoped search behavior or `_type` behavior appears material.

If you need to validate page availability, use `curl` rather than a web search tool. Validate each URL independently, for example:

```sh
curl -L -s -o /dev/null -w '%{http_code} %{url_effective}\n' 'https://hl7.org/fhir/R4/search.html'
```

You may inspect related R4/R6 StructureDefinitions, ValueSets, CodeSystems, ConceptMaps, OperationDefinitions, CapabilityStatements, examples, and package indexes inside those two package directories when needed. Use StructureDefinitions to understand search expression targets and resource renames, but keep this report scoped to search behavior.

Your task:

1. Build normalized R4 and R6 inventories of every `SearchParameter` in the core packages.
2. Match search parameters by canonical `url` first. When URLs differ or disappear, use `base[]`, `code`, `type`, `expression`, and `id` to identify likely renames, moves, splits, or replacements.
3. Identify removed, added, renamed, moved, split, merged, and materially changed search parameters.
4. For changed search parameters, compare at least:
   - `url`, `id`, `name`, `code`, `status`, `experimental`, and `base[]`;
   - `type`;
   - `expression`;
   - `processingMode`;
   - `target`;
   - `comparator`;
   - `modifier`;
   - `chain`;
   - `multipleAnd` and `multipleOr`;
   - `component` for composite parameters;
   - description or other narrative that changes query semantics.
5. Pay special attention to:
   - shared/base search parameters such as `_id`, `_lastUpdated`, `_tag`, `_profile`, `_security`, `_source`, `_text`, `_content`, and `_query`;
   - commonly implemented clinical parameters such as `identifier`, `patient`, `subject`, `code`, `category`, `date`, `status`, `encounter`, `performer`, and `type`;
   - R4 resources listed in `r4-base-resources-and-datatypes.tsv`;
   - parameters whose `base[]` changes because an R4 resource was removed, renamed, split, or replaced in R6;
   - changes that affect server indexes, generated client query builders, conformance tests, query result sets, or reverse include behavior.
6. Distinguish direct search behavior changes from data-model changes. If a search parameter changed only because an underlying element changed, report the search impact here and put the resource/datatype dependency in `followUpDependencies` or `reducerHints`.
7. For each material finding, explain the concrete runtime mechanism: old query rejected, old query accepted but returning different results, R6 query not expressible against an R4 server, changed chaining/comparator/modifier behavior, changed index target, or changed advertised capability.
8. Include `checkedNoMaterialChange` entries for major areas you checked with no material change.
9. Include limitations where official diffs, narrative search documentation, terminology expansions, or implementation-specific CapabilityStatements would improve confidence.

Output requirements:

- Write exactly one valid JSON object to `/home/jmandel/hobby/r6breaks/output/SearchParameters.report.json`.
- The JSON object must conform to `FhirSearchBehaviorReport` in `behavior-output-contracts.md`.
- Use `schemaVersion: "fhir-r4-r6-search-behavior/v1"` and `behaviorName: "SearchParameters"`.
- Populate `scope.publishedPagesReviewed` with the published page pairs above, plus any additional page pair you actually used.
- Use finding locators such as canonical URLs, `SearchParameter/<id>`, `base[] + code`, or `SearchParameter.component[...]`.
- Do not wrap the JSON in Markdown fences.
- Do not include comments or trailing commas.
- Create `/home/jmandel/hobby/r6breaks/output` if it does not already exist.
- After writing the file, run `jq empty /home/jmandel/hobby/r6breaks/output/SearchParameters.report.json` and fix any JSON syntax errors.
- Do not edit `prompt.md` or the downloaded FHIR package files.
