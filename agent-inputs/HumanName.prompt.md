You are analyzing one FHIR artifact for breaking changes between FHIR R4 and the current R6 ballot build.

Assigned artifact: HumanName
Artifact kind: datatype

Read `/home/jmandel/hobby/r6breaks/prompt.md` completely before writing the report. Its TypeScript interface `FhirBreakingChangeAssessmentReport` is the required output schema.

Use these local primary inputs:

- R4 core package directory: `/home/jmandel/hobby/r6breaks/fhir-definitions/r4-4.0.1/package`
- R6 core package directory: `/home/jmandel/hobby/r6breaks/fhir-definitions/r6-6.0.0-ballot4/package`
- R4 assigned StructureDefinition: `/home/jmandel/hobby/r6breaks/fhir-definitions/r4-4.0.1/package/StructureDefinition-HumanName.json`
- R6 assigned StructureDefinition: `/home/jmandel/hobby/r6breaks/fhir-definitions/r6-6.0.0-ballot4/package/StructureDefinition-HumanName.json`
- R4 package index: `/home/jmandel/hobby/r6breaks/fhir-definitions/r4-4.0.1/package/.index.json`
- R6 package index: `/home/jmandel/hobby/r6breaks/fhir-definitions/r6-6.0.0-ballot4/package/.index.json`
- R4/R6 package metadata: each package has `package.json` in the package directory.
- R4 base artifact list for the future batch run: `/home/jmandel/hobby/r6breaks/agent-inputs/r4-base-resources-and-datatypes.tsv`

You may inspect related local R4/R6 StructureDefinitions, ValueSets, CodeSystems, ConceptMaps, examples, package indexes, and spec artifacts inside those two package directories when needed. Keep this report scoped to `HumanName`.

Inherited/base-artifact scope rule:

- Do not create `findings[]` entries for changes inherited only from base artifacts such as `Element`, `DataType`, `BackboneElement`, `BackboneType`, `Resource`, or `DomainResource`.
- Do not treat global base-definition/class hierarchy shifts, such as datatype roots moving through `DataType`, as local `HumanName` findings.
- Base-artifact changes will be handled by separate agents assigned to those base artifacts.
- Put inherited/base-artifact changes in `scope.outOfScope` and, if materially relevant, add a brief `followUpDependencies[]` item pointing to the base artifact.
- Set `summary.inheritedFindingCount` to `0` unless this instruction explicitly asks for inherited findings.

Your task:

1. Compare R4 `HumanName` to R6 `HumanName` in depth.
2. Identify hard instance-breaking changes, likely breaking changes, runtime/codegen risks, R6-to-R4 representability risks, semantic/conformance risks, and notable non-breaking changes.
3. Distinguish local `HumanName` changes from inherited `Element`/datatype changes and exclude inherited-only changes from `findings[]`.
4. Consider element additions/removals/renames/moves, cardinality changes, type changes, terminology bindings, constraints, modifier and summary flags, serialization/codegen impacts, and semantic text changes.
5. For each material finding, explain the validation mechanism and migration impact, not just that a field changed.
6. Include `checkedNoMaterialChange` entries for major areas you checked with no material change.
7. Include limitations where official diffs, terminology expansions, or narrative pages would improve confidence.

Output requirements:

- Write exactly one valid JSON object to `/home/jmandel/hobby/r6breaks/output/HumanName.report.json`.
- The JSON object must conform to `FhirBreakingChangeAssessmentReport` in `prompt.md`.
- Do not wrap the JSON in Markdown fences.
- Do not include comments or trailing commas.
- Keep the report focused. It is acceptable for a small datatype to have few or zero material findings, provided `checkedNoMaterialChange`, `nonBreakingNotableChanges`, and `analysisLimitations` make the reviewed scope explicit.
- After writing the file, run `jq empty /home/jmandel/hobby/r6breaks/output/HumanName.report.json` and fix any JSON syntax errors.
- Do not edit `prompt.md` or the downloaded FHIR package files.
