// Generates ~300 synthetic reports under fixtures-many/ for stress testing only.
import { writeFile, mkdir, rm } from "node:fs/promises";
import { resolve, join } from "node:path";

const out = resolve(import.meta.dir, "..", "fixtures-many");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const RESOURCES = [
  "Patient","Practitioner","Organization","Encounter","Observation","Condition","Procedure","MedicationRequest","MedicationStatement","AllergyIntolerance",
  "Bundle","DocumentReference","DiagnosticReport","ServiceRequest","Specimen","Location","HealthcareService","Schedule","Slot","Appointment",
  "Coverage","Claim","ExplanationOfBenefit","Account","ChargeItem","Invoice","PaymentNotice","PaymentReconciliation","Contract","Consent",
  "CarePlan","CareTeam","Goal","Task","Communication","CommunicationRequest","DeviceRequest","DeviceUseStatement","NutritionOrder","VisionPrescription",
  "Immunization","ImmunizationEvaluation","ImmunizationRecommendation","Library","Measure","MeasureReport","Questionnaire","QuestionnaireResponse",
  "List","Group","RelatedPerson","Person","Practitioner","Substance","BiologicallyDerivedProduct","Device","DeviceDefinition","DeviceMetric",
  "ResearchStudy","ResearchSubject","Evidence","EvidenceVariable","EvidenceReport","Citation","ArtifactAssessment",
  "OperationDefinition","SearchParameter","CapabilityStatement","CompartmentDefinition","StructureDefinition","StructureMap","GraphDefinition",
  "ValueSet","CodeSystem","ConceptMap","NamingSystem","TerminologyCapabilities",
  "Subscription","SubscriptionStatus","SubscriptionTopic","AuditEvent","Provenance","MessageHeader","MessageDefinition","EventDefinition",
  "MedicinalProductDefinition","ManufacturedItemDefinition","Ingredient","ClinicalUseDefinition","RegulatedAuthorization","SubstanceDefinition","PackagedProductDefinition","AdministrableProductDefinition","DocumentManifest","Endpoint",
  "ExplanationOfBenefit","Composition","BodyStructure","ImagingStudy","FamilyMemberHistory","Flag","RiskAssessment","DetectedIssue","Linkage",
  "ChargeItemDefinition","InsurancePlan","SubstanceSpecification","SupplyDelivery","SupplyRequest","Transport","VerificationResult","Permission",
  "MolecularSequence","GenomicStudy","NutritionProduct","InventoryItem","InventoryReport","BiologicallyDerivedProductDispense","DeviceDispense","DeviceAssociation"
];
const DATATYPES = [
  "HumanName","Address","ContactPoint","Identifier","Period","Reference","CodeableConcept","Coding","Quantity","Ratio","Range","SampledData",
  "Money","Duration","Annotation","Attachment","Signature","Timing","Dosage","Element","Extension","DataType","BackboneElement","BackboneType",
  "Meta","Narrative","ContactDetail","Contributor","DataRequirement","Expression","ParameterDefinition","RelatedArtifact","TriggerDefinition","UsageContext",
  "MarketingStatus","ProductShelfLife","ProdCharacteristic","SubstanceAmount","Population"
];
const CATEGORIES = [
  "ARTIFACT_IDENTITY","ELEMENT_PRESENCE_OR_IDENTITY","CARDINALITY","TYPE_DOMAIN","REFERENCE_TARGET",
  "TERMINOLOGY_BINDING","VALUE_CONSTRAINT","FLAGS_AND_MODIFIERS","SLICING_AND_CONTENT_MODEL",
  "SEMANTIC_OR_CONFORMANCE_TEXT","SERIALIZATION_OR_CODEGEN","CONVERSION_OR_MAPPING","OTHER"
];
const IMPACTS = ["Critical","High","Medium","Low","Info"];
const BREAKING = ["Yes","Potential","No","Unknown"];
const CONFIDENCES = ["High","Medium","Low"];
const DIRECTIONS = ["R4-to-R6","R6-to-R4","Both","Runtime only"];
const ASSESSMENTS = [
  "Breaking changes found",
  "Potential breaking changes found",
  "Mostly runtime or migration risks",
  "No material breaking changes found",
  "Inconclusive",
];

let seed = 42;
function rng() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; }
function pick<T>(a: T[]) { return a[Math.floor(rng() * a.length)]; }
function pickWeighted<T>(a: T[], w: number[]) {
  const total = w.reduce((s, x) => s + x, 0);
  let r = rng() * total;
  for (let i = 0; i < a.length; i++) { r -= w[i]; if (r <= 0) return a[i]; }
  return a[a.length - 1];
}

function make(name: string, kind: "resource" | "datatype") {
  const n = Math.floor(rng() * 8);
  const findings: any[] = [];
  let hard = 0, pot = 0, hr = 0, hi = 0;
  for (let i = 0; i < n; i++) {
    const sev = pickWeighted(IMPACTS, [1, 2, 3, 4, 3]);
    const br = pickWeighted(BREAKING, sev === "Critical" ? [6,2,1,0] : sev === "High" ? [3,3,3,0] : sev === "Info" ? [0,0,7,1] : [1,2,5,1]);
    const review = rng() < 0.18;
    if (br === "Yes") hard++;
    else if (br === "Potential") pot++;
    if (review) hr++;
    if (sev === "Critical" || sev === "High") hi++;
    const cat = pick(CATEGORIES);
    findings.push({
      findingId: `${name}:${cat}:f${i}`,
      title: `${name} ${cat.toLowerCase().replace(/_/g,' ')} adjustment #${i+1}`,
      category: cat,
      affectedLocation: { oldPath: `${name}.field${i}`, newPath: `${name}.field${i}` },
      inheritedOrLocal: "local",
      changeNature: pick(["added","removed","renamed","narrowed","widened","strengthened","weakened","semantic-change","constraint-change","terminology-change","modifier-change"]),
      oldState: { summary: `R4 state for ${name}.field${i}` },
      newState: { summary: `R6 state for ${name}.field${i}` },
      structuredDelta: { deltaKind: "other", facts: [{ field: "min", oldValue: 0, newValue: 1 }] },
      impact: {
        hardInstanceBreaking: br,
        runtimeBreakingRisk: sev,
        r6ToR4RepresentabilityRisk: pick(IMPACTS),
        overallImpact: sev,
        affectedDirection: pick(DIRECTIONS),
        confidence: pick(CONFIDENCES),
        impactRationaleMd: `Synthetic rationale for **${name}.field${i}**.`,
        expectedPrevalence: pick(["Common","Occasional","Rare","Unknown"]),
        safetyOrBusinessRisk: pick(["Critical","High","Medium","Low","None identified"]),
      },
      justification: {
        justificationVerdict: pick(["Justified","Probably justified","Not clearly justified","Probably avoidable","Cannot assess"]),
        backwardCompatibleAlternativeAvailable: pick(["Yes","No","Partial","Unknown"]),
        justificationRationaleMd: `Synthetic justification rationale.`,
      },
      evidence: [],
      examples: {},
      narrativeMd: `Synthetic finding describing a change on \`${name}.field${i}\`.`,
      validationAndCompatibilityMd: `Validation/compat description.`,
      migrationGuidanceMd: `Migration guidance.`,
      backwardCompatibilityAnalysisMd: `BC analysis.`,
      requiresHumanReview: review,
    });
  }
  const assessment = hard > 0 ? "Breaking changes found" :
                     pot > 0 ? "Potential breaking changes found" :
                     hi > 0 ? "Mostly runtime or migration risks" :
                     n === 0 ? "No material breaking changes found" :
                     pick(ASSESSMENTS);
  const overallImpact = hard > 0 ? "High" : pot > 0 ? "Medium" : hi > 0 ? "Medium" : n === 0 ? "Low" : pick(["Low","Info"]);
  return {
    schemaVersion: "fhir-r4-r6-breaking-change-assessment/v1",
    artifactName: name, artifactKind: kind,
    scope: {
      assignedArtifact: name, analyzedArtifact: name,
      oldVersionLabel: "FHIR R4 4.0.1", newVersionLabel: "FHIR R6 6.0.0-ballot4",
      inputsUsed: [], missingInputs: [],
      scopeNotesMd: `Synthetic scope for ${name}.`, outOfScope: [],
    },
    oldArtifact: { url: `http://hl7.org/fhir/StructureDefinition/${name}`, version: "4.0.1", kind },
    newArtifact: { url: `http://hl7.org/fhir/StructureDefinition/${name}`, version: "6.0.0-ballot4", kind },
    narrativeReportMd: `# ${name} R4→R6\n\nSynthetic narrative.`,
    summary: {
      overallAssessment: assessment,
      overallImpact, overallConfidence: "High",
      hardInstanceBreakingCount: hard, potentialHardInstanceBreakingCount: pot,
      criticalOrHighRuntimeRiskCount: hi, criticalOrHighR6ToR4RiskCount: Math.floor(hi/2),
      requiresHumanReviewCount: hr, localFindingCount: findings.length, inheritedFindingCount: 0,
      executiveSummaryMd: `Synthetic exec summary for **${name}**.`,
      migrationThemesMd: `Synthetic migration themes.`,
      confidenceSummaryMd: `Confidence: high.`,
    },
    findings,
    checkedNoMaterialChange: [], nonBreakingNotableChanges: [],
    followUpDependencies: [], analysisLimitations: [],
    reducerHints: {
      crossArtifactPatternsToCheck: rng() < 0.3 ? ["Choice type narrowing","Required-binding tightening"][Math.floor(rng()*2)] ? ["Choice type narrowing"] : [] : [],
      suggestedMigrationBacklogGroups: rng() < 0.3 ? ["Refresh datatype hierarchy"] : [],
    },
  };
}

const all = [
  ...new Set(RESOURCES).values().map((n) => ({ n, k: "resource" as const })),
  ...new Set(DATATYPES).values().map((n) => ({ n, k: "datatype" as const })),
];

let i = 0;
for (const { n, k } of all) {
  const report = make(n, k);
  await writeFile(join(out, `${n}.report.json`), JSON.stringify(report, null, 2));
  i++;
}
console.log(`wrote ${i} synthetic reports to ${out}`);
