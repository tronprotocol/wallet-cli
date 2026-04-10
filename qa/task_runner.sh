#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/config.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/cli.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/semantic.sh"

task_kind="${1:?task kind required}"
task_name="${2:?task name required}"

run_case() {
  local kind="$1"
  local label="$2"
  local resolved_json argv_text_file argv_json_file
  local resolved_label suite template requires env_mode expectation error_code
  local json_path_exists json_path_absent text_contains text_absent preflight excluded
  local workspace_path_exists workspace_path_absent
  local workspace_text workspace_json assertion_workspace unresolved mode
  local -a argv_text=()
  local -a argv_json=()
  local -a preflight_argv=()
  local line preflight_reason

  resolved_json="$(mktemp "$RUNTIME_DIR/case.XXXXXX")"
  argv_text_file="$(mktemp "$RUNTIME_DIR/argvtext.XXXXXX")"
  argv_json_file="$(mktemp "$RUNTIME_DIR/argvjson.XXXXXX")"
  trap 'rm -f "$resolved_json" "$argv_text_file" "$argv_json_file"' RETURN

  qa_export_seeds
  qa_resolve_case_to_file "$kind" "$label" "$resolved_json"

  resolved_label="$(qa_case_json_get "$resolved_json" "label")"
  suite="$(qa_case_json_get "$resolved_json" "suite")"
  template="$(qa_case_json_get "$resolved_json" "template")"
  requires="$(qa_case_json_get "$resolved_json" "requires")"
  env_mode="$(qa_case_json_get "$resolved_json" "env_mode")"
  expectation="$(qa_case_json_get "$resolved_json" "expectation")"
  error_code="$(qa_case_json_get "$resolved_json" "error_code")"
  json_path_exists="$(qa_case_json_get "$resolved_json" "json_path_exists")"
  json_path_absent="$(qa_case_json_get "$resolved_json" "json_path_absent")"
  text_contains="$(qa_case_json_get "$resolved_json" "text_contains")"
  text_absent="$(qa_case_json_get "$resolved_json" "text_absent")"
  preflight="$(qa_case_json_get "$resolved_json" "preflight")"
  workspace_path_exists="$(qa_case_json_get "$resolved_json" "workspace_path_exists")"
  workspace_path_absent="$(qa_case_json_get "$resolved_json" "workspace_path_absent")"
  excluded="$(qa_case_json_bool "$resolved_json" "excluded")"
  unresolved="$(qa_case_json_get "$resolved_json" "unresolved_placeholders")"

  if [ "$excluded" = "true" ]; then
    qa_write_result "$resolved_label" "SKIP: unsupported/excluded from standard CLI smoke coverage"
    return 0
  fi

  if ! qa_requires_available "$requires"; then
    qa_write_result "$resolved_label" "SKIP: missing required secret ($requires)"
    return 0
  fi

  if [ -n "$unresolved" ]; then
    qa_write_result "$resolved_label" "SKIP: missing runtime seed(s): $unresolved"
    return 0
  fi

  qa_case_json_write_lines "$resolved_json" "text_argv" "$argv_text_file"
  qa_case_json_write_lines "$resolved_json" "json_argv" "$argv_json_file"

  while IFS= read -r line || [ -n "$line" ]; do
    argv_text+=("$line")
  done < "$argv_text_file"
  while IFS= read -r line || [ -n "$line" ]; do
    argv_json+=("$line")
  done < "$argv_json_file"

  mode="dual"
  if [ ${#argv_text[@]} -eq 0 ]; then
    mode="json"
  elif [ ${#argv_json[@]} -eq 0 ]; then
    mode="text"
  fi

  if [ "$mode" = "json" ]; then
    preflight_argv=("${argv_json[@]}")
  else
    preflight_argv=("${argv_text[@]}")
  fi

  if [ -n "$preflight" ]; then
    if ! preflight_reason="$(qa_preflight_check "$preflight" "$label" "${preflight_argv[@]}" 2>/dev/null)"; then
      qa_write_result "$resolved_label" "SKIP: unmet chain precondition ($preflight_reason)"
      return 0
    fi
  fi

  if [ ${#argv_text[@]} -gt 0 ]; then
    workspace_text="$(qa_reset_workspace "${resolved_label}__text" "$template")"
    qa_run_raw_capture "$workspace_text" "$resolved_label" text "$env_mode" "${argv_text[@]}"
  fi

  if [ ${#argv_json[@]} -gt 0 ]; then
    workspace_json="$(qa_reset_workspace "${resolved_label}__json" "$template")"
    qa_run_raw_capture "$workspace_json" "$resolved_label" json "$env_mode" "${argv_json[@]}"
  fi

  assertion_workspace="${workspace_text:-$workspace_json}"

  if qa_assert_case_files "$resolved_label" "$expectation" "$mode" \
    "$json_path_exists" "$json_path_absent" "$error_code" "$text_contains" "$text_absent" \
    "$assertion_workspace" "$workspace_path_exists" "$workspace_path_absent"; then
    qa_write_result "$resolved_label" "PASS"
  else
    qa_write_result "$resolved_label" "FAIL: ${suite} contract violated"
  fi
}

case "$task_kind" in
  help|smoke|contract)
    run_case "$task_kind" "$task_name"
    ;;
  *)
    echo "Unknown task kind: $task_kind" >&2
    exit 1
    ;;
esac
