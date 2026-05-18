#!/usr/bin/env bash
set -euo pipefail

ROOT=${ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
SPEC_DIR=${SPEC_DIR:-"$ROOT/fhir-specs"}
BEHAVIOR_DIR=${BEHAVIOR_DIR:-"$ROOT/batch/behavior"}
PAGE_MANIFEST=${PAGE_MANIFEST:-"$ROOT/agent-inputs/behavior-page-manifest.tsv"}
DOWNLOAD_FULL_ZIPS=${DOWNLOAD_FULL_ZIPS:-0}

mkdir -p "$SPEC_DIR" "$BEHAVIOR_DIR"

usage() {
  cat <<EOF
Usage: $(basename "$0")

Downloads local HTML page inputs for auxiliary behavior review.

Environment:
  ROOT=$ROOT
  SPEC_DIR=$SPEC_DIR
  BEHAVIOR_DIR=$BEHAVIOR_DIR
  PAGE_MANIFEST=$PAGE_MANIFEST
  DOWNLOAD_FULL_ZIPS=$DOWNLOAD_FULL_ZIPS

Set DOWNLOAD_FULL_ZIPS=1 to also fetch available full-spec ZIP files.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

status_file="$BEHAVIOR_DIR/source-status.tsv"
tmp_status="$status_file.tmp"
printf 'version\tpage\turl\tstatus\tlocalPath\n' > "$tmp_status"

download_page() {
  local version=$1
  local page=$2
  local url=$3
  [[ -n "$url" ]] || return 0

  local dest_dir="$SPEC_DIR/$version/html"
  local dest="$dest_dir/$page"
  mkdir -p "$dest_dir" "$(dirname "$dest")"

  local code
  code=$(curl -L -s -o "$dest.tmp" -w '%{http_code}' "$url" || true)
  if [[ "$code" == "200" ]]; then
    mv "$dest.tmp" "$dest"
    printf '%s\t%s\t%s\t%s\t%s\n' "$version" "$page" "$url" "$code" "$dest" >> "$tmp_status"
  else
    rm -f "$dest.tmp"
    printf '%s\t%s\t%s\t%s\t\n' "$version" "$page" "$url" "$code" >> "$tmp_status"
  fi
}

download_seed_pages() {
  while IFS= read -r line; do
    local page r4_url r6_url
    page=$(printf '%s\n' "$line" | awk -F '\t' '{print $1}')
    [[ "$page" == "page" || -z "$page" || "$page" == \#* ]] && continue
    r4_url=$(printf '%s\n' "$line" | awk -F '\t' '{print $4}')
    r6_url=$(printf '%s\n' "$line" | awk -F '\t' '{print $5}')
    download_page "r4-4.0.1" "$page" "$r4_url"
    download_page "r6-6.0.0-ballot4" "$page" "$r6_url"
  done < "$PAGE_MANIFEST"
}

download_operation_pages() {
  local op_pages="$BEHAVIOR_DIR/operation-pages.tsv"
  [[ -f "$op_pages" ]] || return 0
  while IFS=$'\t' read -r version page url operation_keys; do
    [[ "$version" == "version" || -z "$version" || -z "$page" || -z "$url" ]] && continue
    download_page "$version" "$page" "$url"
  done < "$op_pages"
}

download_full_zips() {
  [[ "$DOWNLOAD_FULL_ZIPS" == "1" ]] || return 0

  local r4_zip_dir="$SPEC_DIR/r4-4.0.1"
  mkdir -p "$r4_zip_dir"
  if [[ ! -f "$r4_zip_dir/fhir-spec.zip" ]]; then
    curl -L --fail --show-error -o "$r4_zip_dir/fhir-spec.zip" 'http://hl7.org/fhir/R4/fhir-spec.zip'
  fi

  local r6_zip_dir="$SPEC_DIR/r6-6.0.0-ballot4"
  mkdir -p "$r6_zip_dir"
  local r6_zip="$r6_zip_dir/fhir-spec.zip"
  if [[ ! -f "$r6_zip" ]]; then
    if ! curl -L --fail --show-error -o "$r6_zip.tmp" 'https://hl7.org/fhir/6.0.0-ballot4/fhir-spec.zip'; then
      rm -f "$r6_zip.tmp"
      printf 'r6-6.0.0-ballot4\tfhir-spec.zip\thttps://hl7.org/fhir/6.0.0-ballot4/fhir-spec.zip\tunavailable\t\n' >> "$tmp_status"
    else
      mv "$r6_zip.tmp" "$r6_zip"
    fi
  fi
}

download_seed_pages
download_operation_pages
download_full_zips

mv "$tmp_status" "$status_file"
echo "Wrote $status_file"
awk -F '\t' 'NR > 1 && $4 != "200" { missing += 1 } END { printf "Non-200 page downloads: %d\n", missing + 0 }' "$status_file"
