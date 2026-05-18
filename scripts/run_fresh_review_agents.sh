#!/usr/bin/env bash
set -euo pipefail

ROOT=${ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
OUTPUT_DIR=${OUTPUT_DIR:-"$ROOT/output"}
REVIEW_DIR=${REVIEW_DIR:-"$ROOT/batch/fresh-review"}
MANIFEST=${MANIFEST:-"$REVIEW_DIR/fresh-review-artifacts.tsv"}
MATURITY_FILE=${MATURITY_FILE:-"$ROOT/viewer/r4-maturity.json"}
CONCURRENCY=${CONCURRENCY:-12}
JOB_TIMEOUT=${JOB_TIMEOUT:-4h}
MODEL=${MODEL:-gpt-5.5}
REASONING_EFFORT=${REASONING_EFFORT:-xhigh}
MODE=${MODE:-all}

usage() {
  cat <<EOF
Usage: $(basename "$0") [--all|--missing|--only ARTIFACT|--sample N]

Runs Copilot CLI fresh-review agents over existing output/*.report.json files.
Each agent reviews one artifact report and writes per-finding judgments to
batch/fresh-review/reviews/<Artifact>.fresh-review.json by default.

Environment:
  ROOT=$ROOT
  OUTPUT_DIR=$OUTPUT_DIR
  REVIEW_DIR=$REVIEW_DIR
  MATURITY_FILE=$MATURITY_FILE
  CONCURRENCY=$CONCURRENCY
  JOB_TIMEOUT=$JOB_TIMEOUT
  MODEL=$MODEL
  REASONING_EFFORT=$REASONING_EFFORT

Modes:
  --all       Run every artifact report with findings. This is the default.
  --missing   Skip artifacts whose fresh-review output already exists and passes jq.
  --only NAME Run one artifact.
  --sample N  Run the first N manifest rows after priority sorting.
EOF
}

ONLY_ARTIFACT=""
SAMPLE_LIMIT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)
      MODE=all
      shift
      ;;
    --missing)
      MODE=missing
      shift
      ;;
    --only)
      ONLY_ARTIFACT=${2:-}
      if [[ -z "$ONLY_ARTIFACT" ]]; then
        echo "--only requires an artifact name" >&2
        exit 2
      fi
      MODE=only
      shift 2
      ;;
    --sample)
      SAMPLE_LIMIT=${2:-}
      if [[ -z "$SAMPLE_LIMIT" || ! "$SAMPLE_LIMIT" =~ ^[0-9]+$ ]]; then
        echo "--sample requires a positive integer" >&2
        exit 2
      fi
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
  "$REVIEW_DIR/prompts" \
  "$REVIEW_DIR/stdout" \
  "$REVIEW_DIR/stderr" \
  "$REVIEW_DIR/logs" \
  "$REVIEW_DIR/status" \
  "$REVIEW_DIR/tmp" \
  "$REVIEW_DIR/reviews"

node --input-type=module - "$OUTPUT_DIR" "$MANIFEST" "$MATURITY_FILE" <<'NODE'
import fs from "node:fs";
import path from "node:path";

const [outputDir, manifestPath, maturityPath] = process.argv.slice(2);
const maturity = fs.existsSync(maturityPath)
  ? JSON.parse(fs.readFileSync(maturityPath, "utf8"))
  : {};
const rows = [];
for (const file of fs.readdirSync(outputDir).filter((name) => name.endsWith(".report.json")).sort()) {
  const full = path.join(outputDir, file);
  const report = JSON.parse(fs.readFileSync(full, "utf8"));
  if (report.schemaVersion !== "fhir-r4-r6-breaking-change-assessment/v1") continue;
  const findings = Array.isArray(report.findings) ? report.findings : [];
  if (findings.length === 0) continue;

  const artifactName = report.artifactName ?? file.replace(/\.report\.json$/, "");
  const m = maturity[artifactName] ?? {};
  const fmm = Number.isFinite(m.fmm) ? Number(m.fmm) : -1;
  const isMature = m.standardsStatus === "normative" || fmm >= 3;

  let hard = 0;
  let highOrCritical = 0;
  let yesAlt = 0;
  let revisitLike = 0;
  for (const finding of findings) {
    const impact = finding.impact ?? {};
    const just = finding.justification ?? {};
    if (impact.hardInstanceBreaking === "Yes" || impact.hardInstanceBreaking === "Potential") hard += 1;
    if (impact.overallImpact === "Critical" || impact.overallImpact === "High") highOrCritical += 1;
    if (just.backwardCompatibleAlternativeAvailable === "Yes") yesAlt += 1;
    if (
      isMature &&
      (impact.hardInstanceBreaking === "Yes" || impact.overallImpact === "Critical" || impact.overallImpact === "High")
    ) {
      revisitLike += 1;
    }
    if (just.backwardCompatibleAlternativeAvailable === "Yes") revisitLike += 1;
  }

  const priority = revisitLike > 0 ? 1 : highOrCritical > 0 || hard > 0 ? 2 : 3;
  rows.push({
    artifactName,
    reportPath: full,
    findingCount: findings.length,
    hard,
    highOrCritical,
    yesAlt,
    priority,
    fmm: m.fmm ?? "",
    standardsStatus: m.standardsStatus ?? "",
  });
}
rows.sort((a, b) =>
  a.priority - b.priority ||
  b.yesAlt - a.yesAlt ||
  b.highOrCritical - a.highOrCritical ||
  b.hard - a.hard ||
  b.findingCount - a.findingCount ||
  a.artifactName.localeCompare(b.artifactName)
);
fs.writeFileSync(
  manifestPath,
  rows.map((r) => [
    r.artifactName,
    r.reportPath,
    r.findingCount,
    r.hard,
    r.highOrCritical,
    r.yesAlt,
    r.priority,
    r.fmm,
    r.standardsStatus,
  ].join("\t")).join("\n") + "\n"
);
NODE

status_file() {
  printf '%s/status/%s.status' "$REVIEW_DIR" "$1"
}

review_file() {
  printf '%s/reviews/%s.fresh-review.json' "$REVIEW_DIR" "$1"
}

is_valid_review() {
  local artifact=$1
  local path
  path=$(review_file "$artifact")
  [[ -f "$path" ]] && jq empty "$path" >/dev/null 2>&1
}

write_prompt() {
  local artifact=$1
  local report_path=$2
  local finding_count=$3
  local hard_count=$4
  local high_or_critical_count=$5
  local yes_alt_count=$6
  local priority=$7
  local fmm=$8
  local standards_status=$9
  local prompt="$REVIEW_DIR/prompts/$artifact.fresh-review.prompt.md"
  local tmp_review="$REVIEW_DIR/tmp/$artifact.fresh-review.json"
  local final_review
  final_review=$(review_file "$artifact")

  cat > "$prompt" <<EOF
You are performing a fresh, FMM-informed review of every finding in one existing FHIR R4-to-R6 StructureDefinition report.

Assigned artifact: $artifact
Existing report: $report_path
Finding count: $finding_count
Hard or potential hard breaks in current report: $hard_count
High/Critical impacts in current report: $high_or_critical_count
Existing less-breaking alternative Yes count: $yes_alt_count
Priority tier: $priority
Supplied R4 FMM: ${fmm:-unknown}
Supplied R4 standards status: ${standards_status:-unknown}

Read \`$ROOT/docs/fresh-review-judgment-framework.md\` before writing the review. It is the required methodology for this task.

Treat the current report as prior work, not as ground truth. Its impact scores, alternative judgments, and justification text may be wrong. Use it to find the alleged change and evidence pointers, but perform an independent path-level assessment before comparing with the current JSON.

Use these local primary inputs when more evidence is needed:

- Existing report: \`$report_path\`
- R4 core package directory: \`$ROOT/fhir-definitions/r4-4.0.1/package\`
- R6 core package directory: \`$ROOT/fhir-definitions/r6-6.0.0-ballot4/package\`
- R4 assigned StructureDefinition: \`$ROOT/fhir-definitions/r4-4.0.1/package/StructureDefinition-$artifact.json\`
- R6 assigned StructureDefinition, if present: \`$ROOT/fhir-definitions/r6-6.0.0-ballot4/package/StructureDefinition-$artifact.json\`
- R4 package index: \`$ROOT/fhir-definitions/r4-4.0.1/package/.index.json\`
- R6 package index: \`$ROOT/fhir-definitions/r6-6.0.0-ballot4/package/.index.json\`
- R4 maturity map: \`$MATURITY_FILE\`

Review scope:

- Review every existing \`findings[]\` item in the report.
- Emit exactly one decision for every existing \`findings[].findingId\`.
- Evaluate the specific finding/change, not the whole artifact, unless the finding itself is a resource identity/removal, operation, search, or other top-level behavior change.
- For element-level findings, assess only the affected path and direct downstream behavior.
- Do not create, remove, split, or merge findings.
- Do not rewrite \`output/*.report.json\`.

Low-FMM handling:

- For FMM 0-1 content, do not infer broad production impact from the existence of a break alone.
- You may do a quick targeted web search for documented production use or implementation relevance when it materially affects judgment. Keep this lightweight: use only a few targeted searches, prefer official implementation guides, vendor docs, HL7 materials, or public project docs, and cite any production-use evidence in \`keyEvidence\`.
- If no quick evidence is found, say so briefly and let the low FMM soften the stability concern unless safety/business/public-health relevance is otherwise clear from the domain.

Allowed final judgments:

- \`Revisit\`
- \`Unclear\`
- \`Breaking but probably OK\`
- \`No problem\`

Output requirements:

- Write exactly one valid JSON object to temporary path \`$tmp_review\`.
- Use this JSON shape:

{
  "schemaVersion": "fresh-review-decisions-v1",
  "artifactName": "$artifact",
  "decisions": [
    {
      "findingId": "existing finding id",
      "judgment": "Revisit | Unclear | Breaking but probably OK | No problem",
      "narrativeMd": "fresh narrative rationale; do not copy the old report wording",
      "keyEvidence": ["short evidence item or source checked"],
      "fmmEffect": "how FMM/status affected the judgment",
      "compatibilityMechanism": "old-valid/new-invalid, runtime/API/codegen, warning-level, semantic/documentation, metadata/tooling, reverse-only/out-of-scope, none, or unknown, with a brief explanation",
      "lessBreakingAlternativeAssessment": "fresh assessment of whether a less-breaking base R6 design exists and what tradeoffs it has",
      "comparisonToExisting": "agree/partially agree/disagree with the existing impact and alternative judgment, after the independent assessment"
    }
  ]
}

- Include all existing finding IDs exactly once.
- Do not wrap the JSON in Markdown fences.
- Do not include comments or trailing commas.
- Run \`jq empty "$tmp_review"\` and fix any JSON syntax errors.
- After \`jq empty\` succeeds, atomically install the review with \`mv "$tmp_review" "$final_review"\`.
- Do not edit prompt files, downloaded FHIR package files, \`output/*.report.json\`, or other review files.
EOF
}

run_one() {
  local artifact=$1
  local report_path=$2
  local finding_count=$3
  local hard_count=$4
  local high_or_critical_count=$5
  local yes_alt_count=$6
  local priority=$7
  local fmm=$8
  local standards_status=$9
  local prompt="$REVIEW_DIR/prompts/$artifact.fresh-review.prompt.md"
  local stdout="$REVIEW_DIR/stdout/$artifact.stdout.jsonl"
  local stderr="$REVIEW_DIR/stderr/$artifact.stderr.log"
  local log_dir="$REVIEW_DIR/logs/$artifact"
  local status
  status=$(status_file "$artifact")
  mkdir -p "$log_dir"
  write_prompt "$artifact" "$report_path" "$finding_count" "$hard_count" "$high_or_critical_count" "$yes_alt_count" "$priority" "$fmm" "$standards_status"

  {
    echo "artifact=$artifact"
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
    echo "review=$(review_file "$artifact")"
  } > "$status"

  rm -f "$REVIEW_DIR/tmp/$artifact.fresh-review.json"

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
    echo "artifact=$artifact"
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
  if is_valid_review "$artifact"; then
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
while IFS=$'\t' read -r artifact report_path finding_count hard_count high_or_critical_count yes_alt_count priority fmm standards_status _rest; do
  [[ -n "$artifact" ]] || continue
  if [[ "$MODE" == "only" && "$artifact" != "$ONLY_ARTIFACT" ]]; then
    continue
  fi
  if [[ "$MODE" == "sample" ]]; then
    seen_for_sample=$((seen_for_sample + 1))
    if [[ "$seen_for_sample" -gt "$SAMPLE_LIMIT" ]]; then
      break
    fi
  fi
  if [[ "$MODE" == "missing" ]] && is_valid_review "$artifact"; then
    skipped=$((skipped + 1))
    continue
  fi
  wait_for_available_slot
  run_one "$artifact" "$report_path" "$finding_count" "$hard_count" "$high_or_critical_count" "$yes_alt_count" "$priority" "$fmm" "$standards_status" &
  launched=$((launched + 1))
  echo "$(date -Is) launched $artifact ($launched launched, $(active_job_count) active, $skipped skipped)"
done < "$MANIFEST"

while [[ $(active_job_count) -gt 0 ]]; do
  wait -n || true
done

non_complete=$(grep -L '^status=complete$' "$REVIEW_DIR"/status/*.status 2>/dev/null | wc -l || true)
echo "$(date -Is) fresh review run finished; launched=$launched skipped=$skipped non_complete_status_files=$non_complete"
