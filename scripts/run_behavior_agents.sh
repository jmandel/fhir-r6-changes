#!/usr/bin/env bash
set -euo pipefail

ROOT=${ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
BEHAVIOR_DIR=${BEHAVIOR_DIR:-"$ROOT/batch/behavior"}
OUTPUT_DIR=${OUTPUT_DIR:-"$ROOT/output"}
SPEC_DIR=${SPEC_DIR:-"$ROOT/fhir-specs"}
CONCURRENCY=${CONCURRENCY:-12}
JOB_TIMEOUT=${JOB_TIMEOUT:-4h}
MODEL=${MODEL:-gpt-5.5}
REASONING_EFFORT=${REASONING_EFFORT:-xhigh}
MODE=core
ONLY_NAME=""
SAMPLE_LIMIT=""

usage() {
  cat <<EOF
Usage: $(basename "$0") [--core|--operations] [--only NAME] [--sample N] [--missing]

Runs Copilot CLI agents for auxiliary behavior review.

Environment:
  ROOT=$ROOT
  BEHAVIOR_DIR=$BEHAVIOR_DIR
  OUTPUT_DIR=$OUTPUT_DIR
  SPEC_DIR=$SPEC_DIR
  CONCURRENCY=$CONCURRENCY
  JOB_TIMEOUT=$JOB_TIMEOUT
  MODEL=$MODEL
  REASONING_EFFORT=$REASONING_EFFORT

Modes:
  --core        Run OperationDefinitions, SearchParameters, and HttpRestBehavior overview prompts.
  --operations  Run operation-shard fanout from batch/behavior/operation-fanout.tsv.
  --only NAME   Run one core behavior name or one operation shard key.
  --sample N    Run first N selected operation shard rows.
  --missing     Skip operation shard outputs that already pass jq.
EOF
}

SKIP_VALID=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --core)
      MODE=core
      shift
      ;;
    --operations)
      MODE=operations
      shift
      ;;
    --only)
      ONLY_NAME=${2:-}
      [[ -n "$ONLY_NAME" ]] || { echo "--only requires a name" >&2; exit 2; }
      shift 2
      ;;
    --sample)
      SAMPLE_LIMIT=${2:-}
      [[ "$SAMPLE_LIMIT" =~ ^[0-9]+$ ]] || { echo "--sample requires a positive integer" >&2; exit 2; }
      shift 2
      ;;
    --missing)
      SKIP_VALID=1
      shift
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
  "$BEHAVIOR_DIR/prompts/core" \
  "$BEHAVIOR_DIR/prompts/operations" \
  "$BEHAVIOR_DIR/stdout" \
  "$BEHAVIOR_DIR/stderr" \
  "$BEHAVIOR_DIR/logs" \
  "$BEHAVIOR_DIR/status" \
  "$BEHAVIOR_DIR/tmp" \
  "$OUTPUT_DIR/behavior/operations"

if [[ ! -f "$BEHAVIOR_DIR/fmm-context.json" ]]; then
  node "$ROOT/scripts/generate_behavior_context.mjs"
fi

active_job_count() {
  jobs -pr | wc -l
}

wait_for_available_slot() {
  while [[ $(active_job_count) -ge $CONCURRENCY ]]; do
    wait -n || true
  done
}

run_copilot() {
  local name=$1
  local prompt=$2
  local output=$3
  local stdout="$BEHAVIOR_DIR/stdout/$name.stdout.jsonl"
  local stderr="$BEHAVIOR_DIR/stderr/$name.stderr.log"
  local log_dir="$BEHAVIOR_DIR/logs/$name"
  local status="$BEHAVIOR_DIR/status/$name.status"
  mkdir -p "$log_dir" "$(dirname "$output")"

  {
    echo "name=$name"
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
    echo "output=$output"
  } > "$status"

  rm -f "$BEHAVIOR_DIR/tmp/$name.report.json"

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
  if [[ -f "$output" ]] && jq empty "$output" >/dev/null 2>&1; then
    echo "status=complete" >> "$status"
  else
    echo "status=invalid_or_missing_output" >> "$status"
  fi
}

copy_core_prompt() {
  local name=$1
  local src="$ROOT/agent-inputs/$name.prompt.md"
  local prompt="$BEHAVIOR_DIR/prompts/core/$name.prompt.md"
  local output="$OUTPUT_DIR/$name.report.json"
  cp "$src" "$prompt"
  printf '%s\t%s\n' "$prompt" "$output"
}

write_operation_prompt() {
  local key=$1
  local kind=$2
  local match_method=$3
  local r4_ids=$4
  local r6_ids=$5
  local r4_files=$6
  local r6_files=$7
  local candidate_pages=$8
  local notes=$9

  local prompt="$BEHAVIOR_DIR/prompts/operations/$key.prompt.md"
  local tmp_report="$BEHAVIOR_DIR/tmp/$key.report.json"
  local final_report="$OUTPUT_DIR/behavior/operations/$key.report.json"

  cat > "$prompt" <<EOF
You are analyzing one FHIR OperationDefinition shard for behavior changes between FHIR R4 and the current R6 ballot build.

Assigned operation shard: $key
Shard kind: $kind
Match method: $match_method
R4 OperationDefinition ids: $r4_ids
R6 OperationDefinition ids: $r6_ids
R4 OperationDefinition files: $r4_files
R6 OperationDefinition files: $r6_files
Candidate operation narrative pages: $candidate_pages
Notes: $notes

Read these files before writing the report:

- \`$ROOT/agent-inputs/behavior-output-contracts.md\`
- \`$ROOT/prompt.md\`, especially the calibration rules for judging whether a goal could have been achieved with a less-breaking design.
- \`$ROOT/docs/behavior-batch-plan.md\`
- \`$ROOT/docs/fresh-review-judgment-framework.md\`

Use these local primary inputs:

- R4 core package directory: \`$ROOT/fhir-definitions/r4-4.0.1/package\`
- R6 core package directory: \`$ROOT/fhir-definitions/r6-6.0.0-ballot4/package\`
- Local R4 rendered spec pages: \`$SPEC_DIR/r4-4.0.1/html\`
- Local R6 rendered spec pages: \`$SPEC_DIR/r6-6.0.0-ballot4/html\`
- Page download status: \`$BEHAVIOR_DIR/source-status.tsv\`
- Operation fanout manifest: \`$BEHAVIOR_DIR/operation-fanout.tsv\`
- FMM/standards-status context: \`$BEHAVIOR_DIR/fmm-context.json\`
  - For R4→R6 compatibility judgments, use the R4 entry as the stability
    baseline. R6 FMM/status is future-version context only; do not use it to
    raise the burden for R4 compatibility.

Scope:

- Keep this report focused on the assigned operation shard.
- Report operation-specific behavior: canonical identity, invocation level, \`affectsState\`, input/output \`Parameters\` shape, requiredness, repeatability, parameter type/profile/binding, nested parts, operation-specific narrative, and operation-specific CapabilityStatement advertisement.
- Do not duplicate resource/datatype StructureDefinition findings. If a parameter impact depends on a resource/datatype change, explain the operation impact and put the artifact dependency in \`followUpDependencies\`.
- Do not duplicate broad HTTP/search framework findings unless this operation is a concrete example of that framework change.

For each material finding, answer the practical questions:

- What breaks for R4 clients, R4 servers, generated code, validators, or conformance tests when moving R4 behavior to R6?
- Is the inferred R6 goal reasonable?
- Could the same goal have been accomplished with a less-breaking base R6 design? If yes or partial, describe what that design would have looked like and the tradeoff.
- What is the fresh-review judgment under \`docs/fresh-review-judgment-framework.md\`: \`Revisit\`, \`Unclear\`, \`Breaking but probably OK\`, or \`No problem\`?

Output requirements:

- Write exactly one valid JSON object to temporary path \`$tmp_report\`.
- The JSON object must conform to \`FhirOperationBehaviorReport\` in \`behavior-output-contracts.md\`.
- Use \`schemaVersion: "fhir-r4-r6-operation-behavior/v1"\` and \`behaviorName: "OperationDefinitions"\`.
- Set \`scope.assignedBehavior\` to \`OperationDefinition:$key\`.
- Populate \`scope.localInputsUsed\` and \`scope.publishedPagesReviewed\` with the files/pages actually used.
- Use \`backwardCompatibilityAnalysisMd\`, \`impact.impactRationaleMd\`, and \`migrationGuidanceMd\` for the less-breaking alternative/rationale analysis; do not invent new structured fields.
- Populate \`freshReview\` for every finding. Use FMM/standards-status as stability pressure, not as the impact score.
- Set \`freshReview.fmmContext.fmm\` and \`standardsStatus\` from the R4 artifact when there is an R4 predecessor. For R6-only additions, explain that there is no R4 maturity baseline and do not treat the addition as a breaking finding solely because R4 servers do not implement it.
- Set \`impact.r6ToR4RepresentabilityRisk\` to \`"Not applicable"\`; reverse R6→R4 loss is out of scope for this behavior round.
- Do not wrap the JSON in Markdown fences.
- Do not include comments or trailing commas.
- Run \`jq empty "$tmp_report"\` and fix any JSON syntax errors.
- After \`jq empty\` succeeds, atomically install the report with \`mv "$tmp_report" "$final_report"\`.
- Do not edit prompt files, downloaded FHIR package files, or other report files.
EOF
  printf '%s\t%s\n' "$prompt" "$final_report"
}

run_core() {
  local names=(OperationDefinitions SearchParameters HttpRestBehavior)
  local launched=0
  for name in "${names[@]}"; do
    [[ -z "$ONLY_NAME" || "$ONLY_NAME" == "$name" ]] || continue
    local pair prompt output
    pair=$(copy_core_prompt "$name")
    prompt=${pair%%$'\t'*}
    output=${pair#*$'\t'}
    if [[ $SKIP_VALID -eq 1 && -f "$output" ]] && jq empty "$output" >/dev/null 2>&1; then
      continue
    fi
    wait_for_available_slot
    run_copilot "$name" "$prompt" "$output" &
    launched=$((launched + 1))
    echo "$(date -Is) launched $name ($launched launched, $(active_job_count) active)"
  done
}

run_operations() {
  local manifest="$BEHAVIOR_DIR/operation-fanout.tsv"
  [[ -f "$manifest" ]] || {
    echo "Missing $manifest. Run: node scripts/generate_behavior_manifests.mjs" >&2
    exit 2
  }

  local launched=0
  local seen=0
  while IFS=$'\t' read -r key kind match_method r4_ids r6_ids r4_files r6_files candidate_pages notes; do
    [[ "$key" == "key" || -z "$key" ]] && continue
    [[ -z "$ONLY_NAME" || "$ONLY_NAME" == "$key" ]] || continue
    seen=$((seen + 1))
    if [[ -n "$SAMPLE_LIMIT" && "$seen" -gt "$SAMPLE_LIMIT" ]]; then
      break
    fi
    local output="$OUTPUT_DIR/behavior/operations/$key.report.json"
    if [[ $SKIP_VALID -eq 1 && -f "$output" ]] && jq empty "$output" >/dev/null 2>&1; then
      continue
    fi
    local pair prompt
    pair=$(write_operation_prompt "$key" "$kind" "$match_method" "$r4_ids" "$r6_ids" "$r4_files" "$r6_files" "$candidate_pages" "$notes")
    prompt=${pair%%$'\t'*}
    wait_for_available_slot
    run_copilot "$key" "$prompt" "$output" &
    launched=$((launched + 1))
    echo "$(date -Is) launched $key ($launched launched, $(active_job_count) active)"
  done < "$manifest"
}

case "$MODE" in
  core) run_core ;;
  operations) run_operations ;;
esac

while [[ $(active_job_count) -gt 0 ]]; do
  wait -n || true
done

non_complete=$(grep -L '^status=complete$' "$BEHAVIOR_DIR"/status/*.status 2>/dev/null | wc -l || true)
echo "$(date -Is) behavior run finished; non_complete_status_files=$non_complete"
