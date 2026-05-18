#!/usr/bin/env bash
set -euo pipefail

ROOT=${ROOT:-/home/jmandel/hobby/r6breaks}
SOURCE_MANIFEST=${SOURCE_MANIFEST:-"$ROOT/agent-inputs/r4-base-resources-and-datatypes.tsv"}
BATCH_DIR=${BATCH_DIR:-"$ROOT/batch"}
MANIFEST=${MANIFEST:-"$BATCH_DIR/r4-artifacts.tsv"}
OUTPUT_DIR=${OUTPUT_DIR:-"$ROOT/output"}
CONCURRENCY=${CONCURRENCY:-8}
JOB_TIMEOUT=${JOB_TIMEOUT:-20m}
MODEL=${MODEL:-gpt-5.5}
REASONING_EFFORT=${REASONING_EFFORT:-xhigh}
MODE=${MODE:-all}

usage() {
  cat <<EOF
Usage: $(basename "$0") [--all|--missing|--only ARTIFACT]

Runs Copilot CLI agents over R4 resources and datatypes.

Environment:
  CONCURRENCY=$CONCURRENCY
  JOB_TIMEOUT=$JOB_TIMEOUT
  MODEL=$MODEL
  REASONING_EFFORT=$REASONING_EFFORT
  MODE=$MODE

Modes:
  --all       Run every artifact in the manifest, overwriting final reports only
              after the agent writes valid JSON. This is the default.
  --missing   Skip artifacts whose output/<Artifact>.report.json already exists
              and passes jq validation.
  --only NAME Run one artifact.
EOF
}

ONLY_ARTIFACT=""
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
  "$BATCH_DIR/prompts" \
  "$BATCH_DIR/stdout" \
  "$BATCH_DIR/stderr" \
  "$BATCH_DIR/copilot-logs" \
  "$BATCH_DIR/status" \
  "$BATCH_DIR/tmp" \
  "$OUTPUT_DIR"

{
  printf 'Element\tcomplex-type\tElement\ttrue\n'
  printf 'Resource\tresource\tResource\ttrue\n'
  cat "$SOURCE_MANIFEST"
} | awk -F '\t' 'NF >= 4 && !seen[$1]++ { print }' > "$MANIFEST"

artifact_kind() {
  case "$1" in
    resource) printf 'resource' ;;
    complex-type|primitive-type) printf 'datatype' ;;
    *) printf 'unknown' ;;
  esac
}

status_file() {
  printf '%s/status/%s.status' "$BATCH_DIR" "$1"
}

is_valid_report() {
  local artifact=$1
  local path="$OUTPUT_DIR/$artifact.report.json"
  [[ -f "$path" ]] && jq empty "$path" >/dev/null 2>&1
}

write_prompt() {
  local artifact=$1
  local r4_kind=$2
  local r4_type=$3
  local abstract=$4
  local kind
  kind=$(artifact_kind "$r4_kind")
  local prompt="$BATCH_DIR/prompts/$artifact.prompt.md"
  local r4_sd="$ROOT/fhir-definitions/r4-4.0.1/package/StructureDefinition-$artifact.json"
  local r6_sd="$ROOT/fhir-definitions/r6-6.0.0-ballot4/package/StructureDefinition-$artifact.json"
  local tmp_report="$BATCH_DIR/tmp/$artifact.report.json"
  local final_report="$OUTPUT_DIR/$artifact.report.json"

  cat > "$prompt" <<EOF
You are analyzing one FHIR artifact for breaking changes between FHIR R4 and the current R6 ballot build.

Assigned artifact: $artifact
Artifact kind: $kind
R4 StructureDefinition kind: $r4_kind
R4 StructureDefinition type: $r4_type
R4 abstract flag: $abstract

Read \`$ROOT/prompt.md\` completely before writing the report. Its TypeScript interface \`FhirBreakingChangeAssessmentReport\` is the required output schema.

Use these local primary inputs:

- R4 core package directory: \`$ROOT/fhir-definitions/r4-4.0.1/package\`
- R6 core package directory: \`$ROOT/fhir-definitions/r6-6.0.0-ballot4/package\`
- R4 assigned StructureDefinition: \`$r4_sd\`
- R6 assigned StructureDefinition, if present: \`$r6_sd\`
- R4 package index: \`$ROOT/fhir-definitions/r4-4.0.1/package/.index.json\`
- R6 package index: \`$ROOT/fhir-definitions/r6-6.0.0-ballot4/package/.index.json\`
- R4/R6 package metadata: each package has \`package.json\` in the package directory.
- Full batch manifest: \`$MANIFEST\`

You may inspect related local R4/R6 StructureDefinitions, ValueSets, CodeSystems, ConceptMaps, examples, package indexes, and spec artifacts inside those two package directories when needed. Keep this report scoped to \`$artifact\`.

Inherited/base-artifact scope rule:

- Do not create \`findings[]\` entries for changes inherited only from base artifacts such as \`Element\`, \`DataType\`, \`BackboneElement\`, \`BackboneType\`, \`Resource\`, or \`DomainResource\`.
- Do not treat global base-definition/class hierarchy shifts as local \`$artifact\` findings unless \`$artifact\` itself is the base or infrastructure artifact whose report should own that class-hierarchy issue.
- Base-artifact changes are handled by separate agents assigned to those base artifacts.
- Put inherited/base-artifact changes in \`scope.outOfScope\` and, if materially relevant, add a brief \`followUpDependencies[]\` item pointing to the base artifact.
- Set \`summary.inheritedFindingCount\` to \`0\` unless this instruction explicitly asks for inherited findings.

Your task:

1. Compare R4 \`$artifact\` to R6 \`$artifact\` in depth. If the R6 StructureDefinition path above is absent, search the R6 package for a likely renamed, split, merged, or removed counterpart and report the identity issue clearly.
2. Identify hard instance-breaking changes, likely breaking changes, runtime/codegen risks, R6-to-R4 representability risks, semantic/conformance risks, and notable non-breaking changes.
3. Distinguish local \`$artifact\` changes from inherited/base-artifact changes and exclude inherited-only changes from \`findings[]\`.
4. Consider element additions/removals/renames/moves, cardinality changes, choice type additions/removals, reference target changes, terminology binding strength and value set changes, invariant/constraint changes, modifier and summary flag changes, serialization/code generation impacts, and narrative/definition/comment changes that affect semantics.
5. For each material finding, explain the validation mechanism and migration impact, not just that a field changed.
6. Include \`checkedNoMaterialChange\` entries for major areas you checked with no material change.
7. Include limitations where terminology expansions, official diffs, or narrative pages would improve confidence.

Output requirements:

- Write exactly one valid JSON object to temporary path \`$tmp_report\`.
- The JSON object must conform to \`FhirBreakingChangeAssessmentReport\` in \`$ROOT/prompt.md\`.
- Do not wrap the JSON in Markdown fences.
- Do not include comments or trailing commas.
- Run \`jq empty "$tmp_report"\` and fix any JSON syntax errors.
- After \`jq empty\` succeeds, atomically install the report with \`mv "$tmp_report" "$final_report"\`.
- Do not edit \`$ROOT/prompt.md\`, the downloaded FHIR package files, or other artifacts' report files.
EOF
}

run_one() {
  local artifact=$1
  local r4_kind=$2
  local r4_type=$3
  local abstract=$4
  local prompt="$BATCH_DIR/prompts/$artifact.prompt.md"
  local stdout="$BATCH_DIR/stdout/$artifact.stdout.jsonl"
  local stderr="$BATCH_DIR/stderr/$artifact.stderr.log"
  local log_dir="$BATCH_DIR/copilot-logs/$artifact"
  local status
  status=$(status_file "$artifact")
  mkdir -p "$log_dir"
  write_prompt "$artifact" "$r4_kind" "$r4_type" "$abstract"

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
  } > "$status"

  rm -f "$BATCH_DIR/tmp/$artifact.report.json"

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
  if is_valid_report "$artifact"; then
    echo "status=complete" >> "$status"
  else
    echo "status=invalid_or_missing_output" >> "$status"
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
while IFS=$'\t' read -r artifact r4_kind r4_type abstract _rest; do
  [[ -n "$artifact" ]] || continue
  if [[ "$MODE" == "only" && "$artifact" != "$ONLY_ARTIFACT" ]]; then
    continue
  fi
  if [[ "$MODE" == "missing" ]] && is_valid_report "$artifact"; then
    skipped=$((skipped + 1))
    continue
  fi
  wait_for_available_slot
  run_one "$artifact" "$r4_kind" "$r4_type" "$abstract" &
  launched=$((launched + 1))
  echo "$(date -Is) launched $artifact ($launched launched, $(active_job_count) active, $skipped skipped)"
done < "$MANIFEST"

while [[ $(active_job_count) -gt 0 ]]; do
  wait -n || true
done

non_complete=$(grep -L '^status=complete$' "$BATCH_DIR"/status/*.status 2>/dev/null | wc -l || true)
echo "$(date -Is) batch run finished; launched=$launched skipped=$skipped non_complete_status_files=$non_complete"
