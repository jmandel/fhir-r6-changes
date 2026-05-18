#!/usr/bin/env bash
set -euo pipefail

ROOT=${ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
OUTPUT_DIR=${OUTPUT_DIR:-"$ROOT/output"}
CALIBRATION_DIR=${CALIBRATION_DIR:-"$ROOT/batch/calibration-simple"}
MANIFEST=${MANIFEST:-"$CALIBRATION_DIR/calibration-artifacts.tsv"}
CONCURRENCY=${CONCURRENCY:-12}
JOB_TIMEOUT=${JOB_TIMEOUT:-4h}
MODEL=${MODEL:-gpt-5.5}
REASONING_EFFORT=${REASONING_EFFORT:-xhigh}
MODE=${MODE:-all}

usage() {
  cat <<EOF
Usage: $(basename "$0") [--all|--missing|--only ARTIFACT|--sample N]

Runs Copilot CLI calibration agents over existing output/*.report.json files.
Each agent writes a small patch to batch/calibration-simple/patches/<Artifact>.calibration.json by default.

Environment:
  ROOT=$ROOT
  OUTPUT_DIR=$OUTPUT_DIR
  CALIBRATION_DIR=$CALIBRATION_DIR
  CONCURRENCY=$CONCURRENCY
  JOB_TIMEOUT=$JOB_TIMEOUT
  MODEL=$MODEL
  REASONING_EFFORT=$REASONING_EFFORT

Modes:
  --all       Run every artifact with findings. This is the default.
  --missing   Skip artifacts whose calibration patch already exists and passes jq.
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
  "$CALIBRATION_DIR/prompts" \
  "$CALIBRATION_DIR/stdout" \
  "$CALIBRATION_DIR/stderr" \
  "$CALIBRATION_DIR/logs" \
  "$CALIBRATION_DIR/status" \
  "$CALIBRATION_DIR/tmp" \
  "$CALIBRATION_DIR/patches"

node --input-type=module - "$OUTPUT_DIR" "$MANIFEST" <<'NODE'
import fs from "node:fs";
import path from "node:path";

const [outputDir, manifestPath] = process.argv.slice(2);
const rows = [];
for (const file of fs.readdirSync(outputDir).filter((name) => name.endsWith(".report.json")).sort()) {
  const full = path.join(outputDir, file);
  const report = JSON.parse(fs.readFileSync(full, "utf8"));
  const findings = Array.isArray(report.findings) ? report.findings : [];
  if (findings.length === 0) continue;
  let priority = 3;
  let missing = 0;
  let candidate = 0;
  for (const finding of findings) {
    const just = finding.justification ?? {};
    if (!just.justificationVerdict || !just.backwardCompatibleAlternativeAvailable || !just.justificationRationaleMd) missing += 1;
    const verdict = just.justificationVerdict;
    const bc = just.backwardCompatibleAlternativeAvailable;
    if ((bc === "Yes" || bc === "Partial")) {
      candidate += 1;
      if (verdict === "Justified" || verdict === "Probably justified") priority = Math.min(priority, 1);
      else priority = Math.min(priority, 2);
    }
  }
  rows.push({
    artifactName: report.artifactName ?? file.replace(/\.report\.json$/, ""),
    reportPath: full,
    findingCount: findings.length,
    missing,
    candidate,
    priority,
  });
}
rows.sort((a, b) =>
  a.priority - b.priority ||
  b.missing - a.missing ||
  b.candidate - a.candidate ||
  a.artifactName.localeCompare(b.artifactName)
);
fs.writeFileSync(
  manifestPath,
  rows.map((r) => [
    r.artifactName,
    r.reportPath,
    r.findingCount,
    r.missing,
    r.candidate,
    r.priority,
  ].join("\t")).join("\n") + "\n"
);
NODE

status_file() {
  printf '%s/status/%s.status' "$CALIBRATION_DIR" "$1"
}

patch_file() {
  printf '%s/patches/%s.calibration.json' "$CALIBRATION_DIR" "$1"
}

is_valid_patch() {
  local artifact=$1
  local path
  path=$(patch_file "$artifact")
  [[ -f "$path" ]] && jq empty "$path" >/dev/null 2>&1
}

write_prompt() {
  local artifact=$1
  local report_path=$2
  local finding_count=$3
  local missing_count=$4
  local candidate_count=$5
  local priority=$6
  local prompt="$CALIBRATION_DIR/prompts/$artifact.calibration.prompt.md"
  local tmp_patch="$CALIBRATION_DIR/tmp/$artifact.calibration.json"
  local final_patch
  final_patch=$(patch_file "$artifact")

  cat > "$prompt" <<EOF
You are calibrating backwards-compatible alternative judgments for one existing FHIR R4 to R6 breaking-change report.

Assigned artifact: $artifact
Existing report: $report_path
Finding count: $finding_count
Findings missing core justification fields: $missing_count
Findings with existing BC path Yes/Partial: $candidate_count
Priority tier: $priority

Read \`$ROOT/prompt.md\` completely before writing the patch, especially \`JustificationAssessment\` and the calibration rules for:

- \`backwardCompatibleAlternativeAvailable\`
- \`justificationVerdict\`

Use these local primary inputs when more evidence is needed:

- R4 core package directory: \`$ROOT/fhir-definitions/r4-4.0.1/package\`
- R6 core package directory: \`$ROOT/fhir-definitions/r6-6.0.0-ballot4/package\`
- R4 assigned StructureDefinition: \`$ROOT/fhir-definitions/r4-4.0.1/package/StructureDefinition-$artifact.json\`
- R6 assigned StructureDefinition, if present: \`$ROOT/fhir-definitions/r6-6.0.0-ballot4/package/StructureDefinition-$artifact.json\`
- R4 package index: \`$ROOT/fhir-definitions/r4-4.0.1/package/.index.json\`
- R6 package index: \`$ROOT/fhir-definitions/r6-6.0.0-ballot4/package/.index.json\`

High-sensitivity scope:

- Review every finding in the existing report, not just obvious suspect findings.
- Emit exactly one patch entry for every existing \`findings[].findingId\`.
- Reconsider cases where the old report says \`No\` or \`Unknown\` but the narrative text implies a less-breaking design path.
- Reconsider cases where \`Yes\` or \`Partial\` is really only migration guidance, conversion tooling, an extension/backport strategy, or a profile mitigation rather than a backwards-compatible base R6 design.
- Do not create, remove, split, or merge findings.
- Do not rewrite the full report.
- Do not edit \`$ROOT/prompt.md\`, FHIR package files, or \`output/*.report.json\`.

Calibration rules:

- \`justificationVerdict\` is the combined judgment: whether the inferred R6 goal is reasonable and whether it was reasonable to accomplish that goal with this level of breakage.
- \`backwardCompatibleAlternativeAvailable\` is the compact judgment about whether the same goal could have been met with a less-breaking base R6 design:
  - \`Yes\`: a plausible less-breaking design would preserve most or all R4-valid instances while still meeting the core R6 goal with low or moderate long-term tradeoff.
  - \`Partial\`: a less-breaking design exists but is incomplete, covers only common cases, or has material tradeoffs such as duplicate same-resource representations, validation ambiguity, safety risk, implementation burden, or interoperability cost.
  - \`No\`: no plausible less-breaking base design was identified.
  - \`Not applicable\`: the finding is not a breaking R4-to-R6 base-design issue, such as additive optional R6 content, target/type widening that preserves R4 instances, or a pure R6-to-R4 down-conversion concern.
  - \`Unknown\`: evidence is insufficient.
- Do not count ordinary migration guidance, conversion tooling, or an R6-to-R4 extension/backport workaround as \`Yes\`; those are mitigations, not base-design alternatives.
- Living with a nonoptimal R4 name can be a legitimate way to avoid breakage. If retaining the old name/shape plus clearer definitions, broader targets/types, or profile guidance meets the R6 goal, treat that as a serious alternative.
- Duplication is not forbidden, but it must be weighed. If the less-breaking design keeps an old same-resource field and adds a new same-resource field/choice/backbone for the same fact, explain the risk that deprecated representations may never disappear and may accumulate indefinitely.
- Put alternative quality and tradeoffs in \`backwardCompatibleAlternativeSummary\`, \`alternativeTradeoffSummary\`, and \`backwardCompatibleAlternativeMd\`; do not add extra structured fields.
- If \`backwardCompatibleAlternativeAvailable\` is \`Yes\`, \`justificationVerdict\` should usually be \`Not clearly justified\` or \`Probably avoidable\` unless you explain why the less-breaking design would fail the goal.
- If \`backwardCompatibleAlternativeAvailable\` is \`Partial\`, \`Probably justified\` may be appropriate only when the tradeoffs are material and explicit.
- A \`Justified\` verdict with a \`Yes\` or \`Partial\` alternative should be rare and must explicitly explain why the breaking design was still necessary.

Output requirements:

- Write exactly one valid JSON object to temporary path \`$tmp_patch\`.
- Use this JSON shape:

{
  "schemaVersion": "calibration-patch-simple-v1",
  "artifactName": "$artifact",
  "patches": [
    {
      "findingId": "existing finding id",
      "justification": {
        "justificationVerdict": "one valid verdict",
        "backwardCompatibleAlternativeAvailable": "one valid availability value",
        "backwardCompatibleAlternativeSummary": "short summary, revised if needed",
        "alternativeTradeoffSummary": "short tradeoff summary, revised if needed",
        "justificationRationaleMd": "concise rationale for the verdict and alternative tradeoffs",
        "backwardCompatibleAlternativeMd": "concise explanation of the best alternative or why none applies"
      }
    }
  ]
}

- Include all existing finding IDs exactly once.
- Do not wrap the JSON in Markdown fences.
- Do not include comments or trailing commas.
- Run \`jq empty "$tmp_patch"\` and fix any JSON syntax errors.
- After \`jq empty\` succeeds, atomically install the patch with \`mv "$tmp_patch" "$final_patch"\`.
EOF
}

run_one() {
  local artifact=$1
  local report_path=$2
  local finding_count=$3
  local missing_count=$4
  local candidate_count=$5
  local priority=$6
  local prompt="$CALIBRATION_DIR/prompts/$artifact.calibration.prompt.md"
  local stdout="$CALIBRATION_DIR/stdout/$artifact.stdout.jsonl"
  local stderr="$CALIBRATION_DIR/stderr/$artifact.stderr.log"
  local log_dir="$CALIBRATION_DIR/logs/$artifact"
  local status
  status=$(status_file "$artifact")
  mkdir -p "$log_dir"
  write_prompt "$artifact" "$report_path" "$finding_count" "$missing_count" "$candidate_count" "$priority"

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
    echo "patch=$(patch_file "$artifact")"
  } > "$status"

  rm -f "$CALIBRATION_DIR/tmp/$artifact.calibration.json"

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
  if is_valid_patch "$artifact"; then
    echo "status=complete" >> "$status"
  else
    echo "status=invalid_or_missing_patch" >> "$status"
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
while IFS=$'\t' read -r artifact report_path finding_count missing_count candidate_count priority _rest; do
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
  if [[ "$MODE" == "missing" ]] && is_valid_patch "$artifact"; then
    skipped=$((skipped + 1))
    continue
  fi
  wait_for_available_slot
  run_one "$artifact" "$report_path" "$finding_count" "$missing_count" "$candidate_count" "$priority" &
  launched=$((launched + 1))
  echo "$(date -Is) launched $artifact ($launched launched, $(active_job_count) active, $skipped skipped)"
done < "$MANIFEST"

while [[ $(active_job_count) -gt 0 ]]; do
  wait -n || true
done

non_complete=$(grep -L '^status=complete$' "$CALIBRATION_DIR"/status/*.status 2>/dev/null | wc -l || true)
echo "$(date -Is) calibration run finished; launched=$launched skipped=$skipped non_complete_status_files=$non_complete"
