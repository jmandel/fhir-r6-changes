# Operation and Special Page Review TODO

This checklist covers FHIR behavior outside the resource/datatype data model.
Use it to drive the `OperationDefinitions`, `SearchParameters`, and
`HttpRestBehavior` auxiliary reports.

Authoritative computable inputs are the local package files:

- R4: `/home/jmandel/hobby/r6breaks/fhir-definitions/r4-4.0.1/package`
- R6: `/home/jmandel/hobby/r6breaks/fhir-definitions/r6-6.0.0-ballot4/package`

Published narrative pages should be reviewed at the version-specific HL7 URLs
listed below. Validate page availability with `curl`, one URL at a time:

```sh
curl -L -s -o /dev/null -w '%{http_code} %{url_effective}\n' 'https://hl7.org/fhir/R4/operations.html'
```

## Narrative / Spec Page Source Strategy

The package JSON is not enough for this review round. Operations, search,
REST/HTTP, narrative introductions, requirement prose, and top-level pages
such as `operations.html`, `search.html`, and `http.html` live primarily in
the rendered specification, not only in the package artifacts.

Preferred source of truth for narrative page comparison:

- Download versioned full-spec ZIPs and read the HTML locally.
- Example R4 source: `http://hl7.org/fhir/R4/fhir-spec.zip`
- Use the matching R6 ballot full-spec ZIP or static published build when
  available for `6.0.0-ballot4`.
- Preserve the ZIP URL, extraction path, and page path in evidence so agents
  can cite exact local files rather than relying on live web fetches.

Secondary/correlation source:

- Clone or inspect `HL7/fhir` when source-level context, commit history, or
  generation inputs are useful.
- Correlating git commits to exact published R4 4.0.1 and R6 ballot outputs can
  be harder than using the versioned downloads, but git may explain why text or
  generated pages changed.

Tradeoff:

- Full-spec ZIPs are explicit and reproducible for published HTML, but they are
  rendered artifacts and may be harder to diff semantically.
- Git/source material can expose intent and generation inputs, but requires
  careful version matching and may not correspond exactly to the published
  static site.

Regenerate the operation inventory from disk with:

```sh
jq -r '.id' fhir-definitions/r4-4.0.1/package/OperationDefinition-*.json | sort
jq -r '.id' fhir-definitions/r6-6.0.0-ballot4/package/OperationDefinition-*.json | sort
```

Current local inventory:

- R4 OperationDefinitions: 47
- R6 OperationDefinitions: 42
- Common ids: 32
- R4-only ids: 15
- R6-only ids: 10

## Special Published Pages

High priority:

- [ ] RESTful API: `https://hl7.org/fhir/R4/http.html` and `https://hl7.org/fhir/6.0.0-ballot4/http.html`
- [ ] Extended operations framework: `https://hl7.org/fhir/R4/operations.html` and `https://hl7.org/fhir/6.0.0-ballot4/operations.html`
- [ ] Published operation list: `https://hl7.org/fhir/R4/operationslist.html` and `https://hl7.org/fhir/6.0.0-ballot4/operationslist.html`
- [ ] OperationDefinition resource: `https://hl7.org/fhir/R4/operationdefinition.html` and `https://hl7.org/fhir/6.0.0-ballot4/operationdefinition.html`
- [ ] CapabilityStatement resource: `https://hl7.org/fhir/R4/capabilitystatement.html` and `https://hl7.org/fhir/6.0.0-ballot4/capabilitystatement.html`
- [ ] Search framework: `https://hl7.org/fhir/R4/search.html` and `https://hl7.org/fhir/6.0.0-ballot4/search.html`
- [ ] SearchParameter resource: `https://hl7.org/fhir/R4/searchparameter.html` and `https://hl7.org/fhir/6.0.0-ballot4/searchparameter.html`
- [ ] Search parameter registry: `https://hl7.org/fhir/R4/searchparameter-registry.html` and `https://hl7.org/fhir/6.0.0-ballot4/searchparameter-registry.html`

Medium priority:

- [ ] Asynchronous request pattern: `https://hl7.org/fhir/R4/async.html` and `https://hl7.org/fhir/6.0.0-ballot4/async.html`
- [ ] Bundle resource: `https://hl7.org/fhir/R4/bundle.html` and `https://hl7.org/fhir/6.0.0-ballot4/bundle.html`
- [ ] Terminology service: `https://hl7.org/fhir/R4/terminology-service.html` and `https://hl7.org/fhir/6.0.0-ballot4/terminology-service.html`
- [ ] Terminology module: `https://hl7.org/fhir/R4/terminology-module.html` and `https://hl7.org/fhir/6.0.0-ballot4/terminology-module.html`
- [ ] Clinical reasoning module: `https://hl7.org/fhir/R4/clinicalreasoning-module.html` and `https://hl7.org/fhir/6.0.0-ballot4/clinicalreasoning-module.html`
- [ ] Documents page: `https://hl7.org/fhir/R4/documents.html` and `https://hl7.org/fhir/6.0.0-ballot4/documents.html`
- [ ] Messaging page: `https://hl7.org/fhir/R4/messaging.html` and `https://hl7.org/fhir/6.0.0-ballot4/messaging.html`
- [ ] Subscription resource/page: `https://hl7.org/fhir/R4/subscription.html` and `https://hl7.org/fhir/6.0.0-ballot4/subscription.html`
- [ ] GraphQL page: `https://hl7.org/fhir/R4/graphql.html` and `https://hl7.org/fhir/6.0.0-ballot4/graphql.html`
- [ ] Validation page: `https://hl7.org/fhir/R4/validation.html` and `https://hl7.org/fhir/6.0.0-ballot4/validation.html`
- [ ] CompartmentDefinition resource: `https://hl7.org/fhir/R4/compartmentdefinition.html` and `https://hl7.org/fhir/6.0.0-ballot4/compartmentdefinition.html`
- [ ] StructureMap resource: `https://hl7.org/fhir/R4/structuremap.html` and `https://hl7.org/fhir/6.0.0-ballot4/structuremap.html`
- [ ] Measure resource: `https://hl7.org/fhir/R4/measure.html` and `https://hl7.org/fhir/6.0.0-ballot4/measure.html`
- [ ] Patient resource: `https://hl7.org/fhir/R4/patient.html` and `https://hl7.org/fhir/6.0.0-ballot4/patient.html`

Conditional/R4-only context:

- [ ] GraphDefinition resource for R4 `Resource-graph`: `https://hl7.org/fhir/R4/graphdefinition.html`; the checked R6 ballot URL `https://hl7.org/fhir/6.0.0-ballot4/graphdefinition.html` returned 404, so treat this as a likely removed/replaced context page.

## Operation-Specific Page Pattern

For each operation below, review the local `OperationDefinition-*.json` files
first. Then review the published operation-specific narrative page if it exists.
The common page pattern is:

- `https://hl7.org/fhir/R4/<resource-lower>-operation-<code>.html`
- `https://hl7.org/fhir/6.0.0-ballot4/<resource-lower>-operation-<code>.html`

Some operation pages also exist in the alternate form
`operation-<resource-lower>-<code>.html`. Validate candidates with `curl`
before relying on them.

Representative page checks returned 200 for:

- `activitydefinition-operation-apply.html`
- `codesystem-operation-lookup.html`
- `patient-operation-everything.html`
- `resource-operation-validate.html`
- `valueset-operation-expand.html`
- `operation-valueset-expand.html`

## Common OperationDefinitions To Compare

For each common operation, compare canonical identity, status, invocation level,
`affectsState`, input/output parameters, nested `part`, profiles, bindings,
documentation, and CapabilityStatement advertisement.

- [ ] `ActivityDefinition-apply` - R4/R6 code `apply`; resource `ActivityDefinition`; levels `type/instance` -> `type/instance`
- [ ] `ActivityDefinition-data-requirements` - R4/R6 code `data-requirements`; resource `ActivityDefinition`; levels `instance` -> `instance`
- [ ] `CapabilityStatement-versions` - R4/R6 code `versions`; resource `CapabilityStatement`; levels `system` -> `system`
- [ ] `Claim-submit` - R4/R6 code `submit`; resource `Claim`; levels `type` -> `type`
- [ ] `CodeSystem-lookup` - R4/R6 code `lookup`; resource `CodeSystem`; levels `type` -> `type/instance`
- [ ] `CodeSystem-subsumes` - R4/R6 code `subsumes`; resource `CodeSystem`; levels `type/instance` -> `type/instance`
- [ ] `CodeSystem-validate-code` - R4/R6 code `validate-code`; resource `CodeSystem`; levels `type/instance` -> `type/instance`
- [ ] `Composition-document` - R4/R6 code `document`; resource `Composition`; levels `type/instance` -> `instance`
- [ ] `ConceptMap-translate` - R4/R6 code `translate`; resource `ConceptMap`; levels `type/instance` -> `type/instance`
- [ ] `CoverageEligibilityRequest-submit` - R4/R6 code `submit`; resource `CoverageEligibilityRequest`; levels `type` -> `type`
- [ ] `Group-everything` - R4/R6 code `everything`; resource `Group`; levels `instance` -> `instance`
- [ ] `Library-data-requirements` - R4/R6 code `data-requirements`; resource `Library`; levels `system/instance` -> `system/instance`
- [ ] `Measure-care-gaps` - R4/R6 code `care-gaps`; resource `Measure`; levels `type` -> `type`
- [ ] `Measure-collect-data` - R4/R6 code `collect-data`; resource `Measure`; levels `type/instance` -> `type`
- [ ] `Measure-data-requirements` - R4/R6 code `data-requirements`; resource `Measure`; levels `instance` -> `instance`
- [ ] `Measure-evaluate-measure` - R4/R6 code `evaluate-measure`; resource `Measure`; levels `type/instance` -> `type/instance`
- [ ] `Measure-submit-data` - R4/R6 code `submit-data`; resource `Measure`; levels `type/instance` -> `type`
- [ ] `MessageHeader-process-message` - R4/R6 code `process-message`; resource `MessageHeader`; levels `system` -> `system`
- [ ] `NamingSystem-preferred-id` - R4/R6 code `preferred-id`; resource `NamingSystem`; levels `type` -> `type`
- [ ] `Observation-lastn` - R4/R6 code `lastn`; resource `Observation`; levels `type` -> `type`
- [ ] `Observation-stats` - R4/R6 code `stats`; resource `Observation`; levels `type` -> `type`
- [ ] `Patient-match` - R4/R6 code `match`; resource `Patient`; levels `type` -> `type`
- [ ] `PlanDefinition-apply` - R4/R6 code `apply`; resource `PlanDefinition`; levels `type/instance` -> `type/instance`
- [ ] `PlanDefinition-data-requirements` - R4/R6 code `data-requirements`; resource `PlanDefinition`; levels `instance` -> `instance`
- [ ] `Resource-convert` - R4/R6 code `convert`; resource `Resource`; levels `system` -> `system`
- [ ] `Resource-graphql` - R4/R6 code `graphql`; resource `Resource`; levels `system/instance` -> `system/instance`
- [ ] `Resource-validate` - R4/R6 code `validate`; resource `Resource`; levels `type/instance` -> `system/type/instance`
- [ ] `StructureDefinition-snapshot` - R4/R6 code `snapshot`; resource `StructureDefinition`; levels `type/instance` -> `type/instance`
- [ ] `StructureMap-transform` - R4/R6 code `transform`; resource `StructureMap`; levels `type/instance` -> `type/instance`
- [ ] `ValueSet-expand` - R4/R6 code `expand`; resource `ValueSet`; levels `type/instance` -> `type/instance`
- [ ] `ValueSet-validate-code` - R4/R6 code `validate-code`; resource `ValueSet`; levels `type/instance` -> `type/instance`
- [ ] `example` - R4/R6 code `populate`; resource `Questionnaire`; levels `instance` -> `instance`

## R4-Only OperationDefinitions To Review For Removal Or Replacement

For each R4-only operation, determine whether R6 removed it, renamed it,
replaced it with another operation, moved it to an IG, or changed it through a
resource rename.

- [ ] `CapabilityStatement-conforms` - code `conforms`; resource `CapabilityStatement`; levels `type`
- [ ] `CapabilityStatement-implements` - code `implements`; resource `CapabilityStatement`; levels `type/instance`
- [ ] `CapabilityStatement-subset` - code `subset`; resource `CapabilityStatement`; levels `type/instance`
- [ ] `ChargeItemDefinition-apply` - code `apply`; resource `ChargeItemDefinition`; levels `instance`
- [ ] `CodeSystem-find-matches` - code `find-matches`; resource `CodeSystem`; levels `type/instance`
- [ ] `ConceptMap-closure` - code `closure`; resource `ConceptMap`; levels `system`
- [ ] `Encounter-everything` - code `everything`; resource `Encounter`; levels `instance`
- [ ] `List-find` - code `find`; resource `List`; levels `type`
- [ ] `MedicinalProduct-everything` - code `everything`; resource `MedicinalProduct`; levels `type/instance`; check likely relation to R6 `MedicinalProductDefinition-everything`
- [ ] `Patient-everything` - code `everything`; resource `Patient`; levels `type/instance`
- [ ] `Resource-graph` - code `graph`; resource `Resource`; levels `instance`; check GraphDefinition removal/replacement context
- [ ] `Resource-meta` - code `meta`; resource `Resource`; levels `system/type/instance`
- [ ] `Resource-meta-add` - code `meta-add`; resource `Resource`; levels `instance`
- [ ] `Resource-meta-delete` - code `meta-delete`; resource `Resource`; levels `instance`
- [ ] `StructureDefinition-questionnaire` - code `questionnaire`; resource `StructureDefinition`; levels `type/instance`

## R6-Only OperationDefinitions To Review For Additions Or Replacements

For each R6-only operation, determine whether it is genuinely additive,
replaces an R4 operation, changes advertised behavior, or introduces R6 content
that cannot be represented against an R4 server.

- [ ] `CanonicalResource-current-canonical` - code `current-canonical`; resource `CanonicalResource`; levels `system/type`
- [ ] `DocumentReference-docref` - code `docref`; resource `DocumentReference`; levels `type`
- [ ] `Group-purge` - code `purge`; resource `Group`; levels `instance`
- [ ] `Measure-evaluate` - code `evaluate`; resource `Measure`; levels `type`; check relation to `Measure-evaluate-measure`
- [ ] `MedicinalProductDefinition-everything` - code `everything`; resource `MedicinalProductDefinition`; levels `type/instance`; check relation to R4 `MedicinalProduct-everything`
- [ ] `NamingSystem-translate-id` - code `translate-id`; resource `NamingSystem`; levels `type`
- [ ] `Patient-purge` - code `purge`; resource `Patient`; levels `instance`
- [ ] `Subscription-events` - code `events`; resource `Subscription`; levels `instance`
- [ ] `Subscription-status` - code `status`; resource `Subscription`; levels `type/instance`
- [ ] `example-query-high-risk` - code `example-query-high-risk`; resource `Patient`; levels `type`

## Cross-Cutting Questions For Each Operation

- [ ] Did the canonical `url`, `id`, `code`, or resource context change?
- [ ] Did invocation move between system, type, and instance levels?
- [ ] Did `affectsState` appear, disappear, or change?
- [ ] Did an input parameter become required, repeatable, or non-repeatable?
- [ ] Did any parameter type, target profile, binding, or nested `part` shape change?
- [ ] Did output shape change in a way that affects clients parsing `Parameters`?
- [ ] Did the operation disappear from `CapabilityStatement-base.json` or move between top-level and resource-level advertisement?
- [ ] Does an R6 operation return or require resources/datatypes that cannot round-trip to R4?
- [ ] Is the behavior described in narrative pages different from the computable `OperationDefinition` files?
- [ ] Is the operation better handled in the `OperationDefinitions` report, the `HttpRestBehavior` report, or both with cross-references?
