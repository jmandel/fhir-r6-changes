#!/usr/bin/env bash
set -euo pipefail

ROOT=${ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
OUTPUT_DIR=${OUTPUT_DIR:-"$ROOT/output"}
ASSESSMENT_DIR=${ASSESSMENT_DIR:-"$OUTPUT_DIR/resource-change-assessments"}
REVIEW_DIR=${REVIEW_DIR:-"$ROOT/batch/resource-review"}
MANIFEST=${MANIFEST:-"$REVIEW_DIR/resource-review-manifest.tsv"}
MATURITY_FILE=${MATURITY_FILE:-"$ROOT/viewer/r4-maturity.json"}
CONCURRENCY=${CONCURRENCY:-12}
JOB_TIMEOUT=${JOB_TIMEOUT:-4h}
MODEL=${MODEL:-gpt-5.5}
REASONING_EFFORT=${REASONING_EFFORT:-xhigh}
MODE=${MODE:-all}
ONLY_RESOURCE=""
SAMPLE_LIMIT=""
SKIP_VALID=0

usage() {
  cat <<EOF
Usage: $(basename "$0") [--all|--missing|--only RESOURCE|--sample N]

Runs Copilot CLI resource-level review agents over R4 resource reports.
Each agent reads one resource's StructureDefinition report, direct behavior
findings, shared Resource/DomainResource context, and the resource-level rubric,
then writes batch/resource-review/reviews/<Resource>.resource-review.json.

Environment:
  ROOT=$ROOT
  OUTPUT_DIR=$OUTPUT_DIR
  ASSESSMENT_DIR=$ASSESSMENT_DIR
  REVIEW_DIR=$REVIEW_DIR
  MATURITY_FILE=$MATURITY_FILE
  CONCURRENCY=$CONCURRENCY
  JOB_TIMEOUT=$JOB_TIMEOUT
  MODEL=$MODEL
  REASONING_EFFORT=$REASONING_EFFORT

Modes:
  --all            Run every R4 resource report. This is the default.
  --missing        Skip resources whose review output already exists and passes jq.
  --only RESOURCE  Run one resource.
  --sample N       Run the first N manifest rows after priority sorting.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)
      MODE=all
      shift
      ;;
    --missing)
      MODE=missing
      SKIP_VALID=1
      shift
      ;;
    --only)
      ONLY_RESOURCE=${2:-}
      [[ -n "$ONLY_RESOURCE" ]] || { echo "--only requires a resource name" >&2; exit 2; }
      MODE=only
      shift 2
      ;;
    --sample)
      SAMPLE_LIMIT=${2:-}
      [[ "$SAMPLE_LIMIT" =~ ^[0-9]+$ ]] || { echo "--sample requires a positive integer" >&2; exit 2; }
      MODE=sample
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

mkdir -p \
  "$REVIEW_DIR/context" \
  "$REVIEW_DIR/prompts" \
  "$REVIEW_DIR/stdout" \
  "$REVIEW_DIR/stderr" \
  "$REVIEW_DIR/logs" \
  "$REVIEW_DIR/status" \
  "$REVIEW_DIR/tmp" \
  "$REVIEW_DIR/reviews"

node --input-type=module - "$ROOT" "$OUTPUT_DIR" "$ASSESSMENT_DIR" "$REVIEW_DIR" "$MANIFEST" "$MATURITY_FILE" <<'NODE'
import fs from "node:fs";
import path from "node:path";

const [root, outputDir, assessmentDir, reviewDir, manifestPath, maturityPath] = process.argv.slice(2);
const maturity = fs.existsSync(maturityPath) ? JSON.parse(fs.readFileSync(maturityPath, "utf8")) : {};
const reportFiles = fs.readdirSync(outputDir).filter((name) => name.endsWith(".report.json")).sort();
const reports = reportFiles.map((file) => {
  const full = path.join(outputDir, file);
  return { file, path: full, report: JSON.parse(fs.readFileSync(full, "utf8")) };
});
const resourceReports = reports.filter(({ report }) => report.artifactKind === "resource");
const behaviorReports = reports.filter(({ report }) =>
  typeof report.schemaVersion === "string" &&
  report.schemaVersion.startsWith("fhir-r4-r6-") &&
  report.schemaVersion.endsWith("-behavior/v1")
);
const behaviorFindings = [];
for (const { file, path: reportPath, report } of behaviorReports) {
  for (const finding of report.findings ?? []) {
    behaviorFindings.push({
      sourceReport: rel(root, reportPath),
      sourceBehaviorName: report.behaviorName ?? file.replace(/\.report\.json$/, ""),
      findingId: finding.findingId,
      title: finding.title,
      behaviorCategory: finding.behaviorCategory ?? finding.category ?? null,
      affectedResources: finding.affectedResources ?? [],
      impact: finding.impact ?? null,
      freshReview: finding.freshReview ?? null,
      runtimeMechanismMd: finding.runtimeMechanismMd ?? null,
      migrationGuidanceMd: finding.migrationGuidanceMd ?? null,
      backwardCompatibilityAnalysisMd: finding.backwardCompatibilityAnalysisMd ?? null,
    });
  }
}

const rows = [];
for (const { file, path: reportPath, report } of resourceReports) {
  const resourceType = report.artifactName ?? file.replace(/\.report\.json$/, "");
  const findings = report.findings ?? [];
  const directBehaviorFindings = behaviorFindings.filter((finding) =>
    (finding.affectedResources ?? []).includes(resourceType)
  );
  const sharedBehaviorContext = behaviorFindings.filter((finding) => {
    const affected = finding.affectedResources ?? [];
    return !affected.includes(resourceType) && (affected.includes("Resource") || affected.includes("DomainResource"));
  });
  const deterministicAggregatePath = path.join(assessmentDir, `${resourceType}.resource-assessment.json`);
  const deterministicAggregate = fs.existsSync(deterministicAggregatePath)
    ? JSON.parse(fs.readFileSync(deterministicAggregatePath, "utf8"))
    : null;
  const m = maturity[resourceType] ?? {};
  const hard = findings.filter((finding) => finding.impact?.hardInstanceBreaking === "Yes").length;
  const potential = findings.filter((finding) => finding.impact?.hardInstanceBreaking === "Potential").length;
  const revisit = findings.filter((finding) => finding.freshReview?.judgment === "Revisit").length;
  const high = findings.filter((finding) =>
    ["Critical", "High"].includes(finding.impact?.overallImpact) ||
    ["Critical", "High"].includes(finding.impact?.runtimeBreakingRisk)
  ).length;
  const identity = findings.some((finding) =>
    finding.category === "ARTIFACT_IDENTITY" &&
    (finding.impact?.hardInstanceBreaking === "Yes" || /absent|no same-name|no same-named|no .*StructureDefinition|removed/i.test(finding.title ?? ""))
  );
  const priority = identity ? 1 : hard >= 6 || revisit >= 4 ? 2 : hard > 0 || directBehaviorFindings.length > 0 ? 3 : 4;
  const context = {
    schemaVersion: "fhir-r4-r6-resource-review-context/v1",
    resourceType,
    structureReportPath: rel(root, reportPath),
    deterministicAggregatePath: fs.existsSync(deterministicAggregatePath) ? rel(root, deterministicAggregatePath) : null,
    r4Maturity: m,
    sourceSummary: report.summary ?? null,
    findingInventory: findings.map((finding) => ({
      findingId: finding.findingId,
      title: finding.title,
      category: finding.category ?? null,
      deltaKind: finding.structuredDelta?.deltaKind ?? null,
      hardInstanceBreaking: finding.impact?.hardInstanceBreaking ?? null,
      overallImpact: finding.impact?.overallImpact ?? null,
      runtimeBreakingRisk: finding.impact?.runtimeBreakingRisk ?? null,
      freshReviewJudgment: finding.freshReview?.judgment ?? null,
      compatibilityMechanism: finding.freshReview?.compatibilityMechanism ?? null,
      lessBreakingAlternativeAssessment: finding.freshReview?.lessBreakingAlternativeAssessment ?? null,
      affectedPath: finding.affectedLocation?.oldPath ?? finding.affectedLocation?.newPath ?? finding.affectedLocation?.parentPath ?? null,
    })),
    directBehaviorFindings,
    sharedBehaviorContext,
    deterministicAggregateSummary: deterministicAggregate
      ? {
          majorMigrationAlreadyUnavoidable: deterministicAggregate.majorMigrationAlreadyUnavoidable,
          migrationShape: deterministicAggregate.migrationShape,
          migrationUnavoidabilityScore: deterministicAggregate.migrationUnavoidabilityScore,
          compatibilityLeverage: deterministicAggregate.compatibilityLeverage,
          rationaleMd: deterministicAggregate.rationaleMd,
          counts: deterministicAggregate.counts,
        }
      : null,
  };
  const contextPath = path.join(reviewDir, "context", `${resourceType}.resource-review-context.json`);
  fs.writeFileSync(contextPath, `${JSON.stringify(context, null, 2)}\n`);
  rows.push({
    resourceType,
    structureReportPath: rel(root, reportPath),
    contextPath: rel(root, contextPath),
    deterministicAggregatePath: context.deterministicAggregatePath ?? "",
    findingCount: findings.length,
    directBehaviorCount: directBehaviorFindings.length,
    sharedBehaviorCount: sharedBehaviorContext.length,
    hard,
    potential,
    high,
    revisit,
    identity: identity ? 1 : 0,
    priority,
    fmm: m.fmm ?? "",
    standardsStatus: m.standardsStatus ?? "",
  });
}
rows.sort((a, b) =>
  a.priority - b.priority ||
  b.identity - a.identity ||
  b.revisit - a.revisit ||
  b.hard - a.hard ||
  b.directBehaviorCount - a.directBehaviorCount ||
  a.resourceType.localeCompare(b.resourceType)
);
fs.writeFileSync(
  manifestPath,
  rows.map((row) => [
    row.resourceType,
    row.structureReportPath,
    row.contextPath,
    row.deterministicAggregatePath,
    row.findingCount,
    row.directBehaviorCount,
    row.sharedBehaviorCount,
    row.hard,
    row.potential,
    row.high,
    row.revisit,
    row.identity,
    row.priority,
    row.fmm,
    row.standardsStatus,
  ].join("\t")).join("\n") + "\n"
);

function rel(root, target) {
  return path.relative(root, target).replaceAll(path.sep, "/");
}
NODE

review_file() {
  printf '%s/reviews/%s.resource-review.json' "$REVIEW_DIR" "$1"
}

is_valid_review() {
  local resource=$1
  local path
  path=$(review_file "$resource")
  [[ -f "$path" ]] && \
    jq empty "$path" >/dev/null 2>&1 && \
    node "$ROOT/scripts/audit_resource_reviews.mjs" \
      --review-dir "$REVIEW_DIR/reviews" \
      --only-resource "$resource" \
      --quiet \
      --fail-on-invalid >/dev/null 2>&1
}

write_prompt() {
  local resource=$1
  local structure_report=$2
  local context_path=$3
  local deterministic_path=$4
  local finding_count=$5
  local direct_behavior_count=$6
  local shared_behavior_count=$7
  local hard_count=$8
  local potential_count=$9
  local high_count=${10}
  local revisit_count=${11}
  local identity_flag=${12}
  local priority=${13}
  local fmm=${14}
  local standards_status=${15}
  local prompt="$REVIEW_DIR/prompts/$resource.resource-review.prompt.md"
  local tmp_review="$REVIEW_DIR/tmp/$resource.resource-review.json"
  local final_review
  final_review=$(review_file "$resource")

  cat > "$prompt" <<EOF
You are performing an independent, holistic resource-level review of R4-to-R6 changes.

Assigned resource: $resource
Structure report: $ROOT/$structure_report
Resource-review context: $ROOT/$context_path
Deterministic aggregate prepass: ${deterministic_path:+$ROOT/$deterministic_path}
Structure finding count: $finding_count
Direct behavior finding count: $direct_behavior_count
Shared Resource/DomainResource behavior context count: $shared_behavior_count
Hard R4-to-R6 instance breaks in structure report: $hard_count
Potential hard breaks in structure report: $potential_count
High/Critical structure impacts: $high_count
Structure findings currently judged Revisit: $revisit_count
Resource identity break flag from manifest: $identity_flag
Priority tier: $priority
Supplied R4 FMM: ${fmm:-unknown}
Supplied R4 standards status: ${standards_status:-unknown}

Read these before writing:

- \`$ROOT/agent-inputs/resource-review-output-contract.md\`
- \`$ROOT/docs/resource-change-assessment-rubric.md\`
- \`$ROOT/docs/fresh-review-judgment-framework.md\`

Use these local inputs:

- Resource-review context: \`$ROOT/$context_path\`
- Full StructureDefinition report: \`$ROOT/$structure_report\`
- Behavior reports under \`$ROOT/output/OperationDefinitions.report.json\`,
  \`$ROOT/output/SearchParameters.report.json\`, and
  \`$ROOT/output/HttpRestBehavior.report.json\` as needed
- R4 core package: \`$ROOT/fhir-definitions/r4-4.0.1/package\`
- R6 core package: \`$ROOT/fhir-definitions/r6-6.0.0-ballot4/package\`
- R4 maturity map: \`$MATURITY_FILE\`

Critical task:

Do not merely summarize, count, or concatenate the findings. The deterministic aggregate prepass did that already and may be wrong.

You must make an independent resource-level judgment by reading the relevant report material and deciding:

1. What is the actual migration shape of this resource?
2. Is a resource-level migration program already unavoidable?
3. If migration is already unavoidable, does that really lower the value of preventing additional breaking changes?
4. Which specific findings still matter as avoidable, low-cost-to-preserve, safety/business critical, or standards-review-worthy?
5. Which findings are just local migration chores once the broader resource redesign is accepted?

Scope and calibration:

- Review the whole resource, but do not re-adjudicate every finding mechanically.
- Include enough \`findingConsiderations\` to prove the important findings were actually considered.
- Include at least one \`findingConsiderations\` entry with \`role: "drives-resource-conclusion"\`, even when the conclusion is that the resource is mostly stable or low-material-change. In stable cases, the driver can be the most important local finding or the finding that best demonstrates why no resource-level migration program is unavoidable.
- Direct behavior findings whose \`affectedResources\` include \`$resource\` are in scope.
- Shared \`Resource\` and \`DomainResource\` behavior findings are context only unless \`$resource\` is \`Resource\` or \`DomainResource\`.
- Use R4 FMM/status as stability pressure. R6 FMM/status is not the compatibility burden baseline.
- Keep "migration program needed" separate from "there is no point avoiding this break." Often the right answer is that migration is needed, but low-cost compatibility preservation still matters.
- Treat the deterministic aggregate as prior context only. Compare with it after you form your own conclusion.
- Every \`findingConsiderations[].findingId\` must be copied from the resource-review context, not invented or summarized:
  - Use \`sourceSurface: "StructureDefinition"\` only for IDs in \`findingInventory\`.
  - Use \`sourceSurface: "OperationDefinitions"\`, \`"SearchParameters"\`, or \`"HttpRestBehavior"\` only for IDs in \`directBehaviorFindings\`, matching the cited finding's \`sourceReport\`.
  - Use \`sourceSurface: "SharedBehaviorContext"\` only for IDs in \`sharedBehaviorContext\`.
  - Do not cite a synthetic grouped ID such as \`shared-resource-domainresource-behavior-context\`; cite the specific shared finding IDs from the context if they matter.

Output requirements:

- Write exactly one valid JSON object to temporary path \`$tmp_review\`.
- The JSON object must conform to \`ResourceReview\` in \`resource-review-output-contract.md\`.
- Use \`schemaVersion: "fhir-r4-r6-resource-review/v1"\`.
- Do not wrap JSON in Markdown fences.
- Do not include comments or trailing commas.
- Run \`jq empty "$tmp_review"\` and fix JSON syntax errors.
- After \`jq empty\` succeeds, atomically install the review with \`mv "$tmp_review" "$final_review"\`.
- Do not edit prompt files, downloaded FHIR package files, \`output/*.report.json\`, or deterministic aggregate files.
EOF
}

run_one() {
  local resource=$1
  local structure_report=$2
  local context_path=$3
  local deterministic_path=$4
  local finding_count=$5
  local direct_behavior_count=$6
  local shared_behavior_count=$7
  local hard_count=$8
  local potential_count=$9
  local high_count=${10}
  local revisit_count=${11}
  local identity_flag=${12}
  local priority=${13}
  local fmm=${14}
  local standards_status=${15}
  local prompt="$REVIEW_DIR/prompts/$resource.resource-review.prompt.md"
  local stdout="$REVIEW_DIR/stdout/$resource.stdout.jsonl"
  local stderr="$REVIEW_DIR/stderr/$resource.stderr.log"
  local log_dir="$REVIEW_DIR/logs/$resource"
  local status="$REVIEW_DIR/status/$resource.status"

  mkdir -p "$log_dir"
  write_prompt "$resource" "$structure_report" "$context_path" "$deterministic_path" \
    "$finding_count" "$direct_behavior_count" "$shared_behavior_count" "$hard_count" \
    "$potential_count" "$high_count" "$revisit_count" "$identity_flag" "$priority" "$fmm" "$standards_status"

  {
    echo "resource=$resource"
    echo "status=running"
    echo "started_at=$(date -Is)"
    echo "pid=$BASHPID"
    echo "model=$MODEL"
    echo "reasoning_effort=$REASONING_EFFORT"
    echo "job_timeout=$JOB_TIMEOUT"
    echo "prompt=$prompt"
    echo "stdout=$stdout"
    echo "stderr=$stderr"
    echo "copilot_log_dir=$log_dir"
    echo "review=$(review_file "$resource")"
  } > "$status"

  rm -f "$REVIEW_DIR/tmp/$resource.resource-review.json"

  local rc=0
  (
    cd "$ROOT"
    timeout "$JOB_TIMEOUT" copilot \
      --model "$MODEL" \
      --reasoning-effort "$REASONING_EFFORT" \
      --enable-reasoning-summaries \
      --output-format json \
      --stream on \
      --log-dir "$log_dir" \
      --log-level all \
      --allow-all-tools \
      --allow-all-paths \
      --allow-all-urls \
      --no-ask-user \
      --silent \
      -p "$(< "$prompt")"
  ) > "$stdout" 2> "$stderr" || rc=$?

  {
    echo "finished_at=$(date -Is)"
    echo "exit_code=$rc"
  } >> "$status"

  if [[ $rc -eq 124 ]]; then
    echo "status=timeout" >> "$status"
    return 0
  fi
  if [[ $rc -ne 0 ]]; then
    echo "status=failed" >> "$status"
    return 0
  fi
  if is_valid_review "$resource"; then
    echo "status=complete" >> "$status"
  else
    echo "status=invalid_or_missing_review" >> "$status"
  fi
}

active_job_count() {
  jobs -pr | wc -l
}

wait_for_available_slot() {
  while [[ $(active_job_count) -ge $CONCURRENCY ]]; do
    wait -n || true
  done
}

launched=0
skipped=0
seen_for_sample=0
while IFS=$'\t' read -r resource structure_report context_path deterministic_path finding_count direct_behavior_count shared_behavior_count hard_count potential_count high_count revisit_count identity_flag priority fmm standards_status _rest; do
  [[ -n "$resource" ]] || continue
  if [[ "$MODE" == "only" && "$resource" != "$ONLY_RESOURCE" ]]; then
    continue
  fi
  if [[ "$MODE" == "sample" ]]; then
    seen_for_sample=$((seen_for_sample + 1))
    if [[ "$seen_for_sample" -gt "$SAMPLE_LIMIT" ]]; then
      break
    fi
  fi
  if [[ $SKIP_VALID -eq 1 ]] && is_valid_review "$resource"; then
    skipped=$((skipped + 1))
    continue
  fi
  wait_for_available_slot
  run_one "$resource" "$structure_report" "$context_path" "$deterministic_path" "$finding_count" \
    "$direct_behavior_count" "$shared_behavior_count" "$hard_count" "$potential_count" \
    "$high_count" "$revisit_count" "$identity_flag" "$priority" "$fmm" "$standards_status" &
  launched=$((launched + 1))
done < "$MANIFEST"

wait || true
echo "resource review complete: launched=$launched skipped=$skipped review_dir=$REVIEW_DIR"
