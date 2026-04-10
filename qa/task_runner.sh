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

run_help_case() {
  local command="$1"
  local label="help__${command}"
  local workspace

  workspace="$(qa_reset_workspace "$label" "empty")"
  qa_run_raw_capture "$workspace" "$label" "$command" --help
  if qa_expect_help_success "$label"; then
    qa_write_result "$label" "PASS"
  else
    qa_write_result "$label" "FAIL: command help contract violated"
  fi
}

run_global_case() {
  local name="$1"
  local workspace label
  label="$name"
  workspace="$(qa_reset_workspace "$label" "empty")"

  case "$name" in
    global-help)
      qa_run_raw_capture "$workspace" "$label" --help
      if qa_expect_help_success "$label"; then
        qa_write_result "$label" "PASS"
      else
        qa_write_result "$label" "FAIL: global help contract violated"
      fi
      ;;
    version-flag)
      qa_run_raw_capture "$workspace" "$label" --version
      if [ "$(cat "$RESULTS_DIR/${label}_text.exit")" = "0" ] && grep -q 'wallet-cli' "$RESULTS_DIR/${label}_text.out"; then
        qa_write_result "$label" "PASS"
      else
        qa_write_result "$label" "FAIL: version flag contract violated"
      fi
      ;;
    missing-command)
      qa_run_raw_capture "$workspace" "$label" --output json
      if [ "$(cat "$RESULTS_DIR/${label}_text.exit")" = "2" ] && grep -q 'Missing command' "$RESULTS_DIR/${label}_text.out"; then
        qa_write_result "$label" "PASS"
      else
        qa_write_result "$label" "FAIL: missing command contract violated"
      fi
      ;;
    unknown-global-option)
      qa_run_raw_capture "$workspace" "$label" --outputt json get-balance
      if [ "$(cat "$RESULTS_DIR/${label}_text.exit")" = "2" ] && grep -q 'Unknown global option' "$RESULTS_DIR/${label}_text.out"; then
        qa_write_result "$label" "PASS"
      else
        qa_write_result "$label" "FAIL: unknown global option contract violated"
      fi
      ;;
    unknown-command)
      qa_run_raw_capture "$workspace" "$label" sendkon
      if [ "$(cat "$RESULTS_DIR/${label}_text.exit")" = "2" ] && grep -qi 'Did you mean' "$RESULTS_DIR/${label}_text.out"; then
        qa_write_result "$label" "PASS"
      else
        qa_write_result "$label" "FAIL: unknown command contract violated"
      fi
      ;;
    *)
      qa_write_result "$label" "FAIL: unsupported global case"
      ;;
  esac
}

run_main_case() {
  local command="$1"
  local type template requires args label text_workspace json_workspace resolved_args unresolved

  type="$(qa_case_type "$command")"
  template="$(qa_case_template "$command")"
  requires="$(qa_case_requires "$command")"
  args="$(qa_case_args "$command")"
  label="$command"

  if [ "$type" = "excluded-interactive" ]; then
    qa_write_result "$label" "SKIP: not standard-cli-compliant interactive flow"
    return 0
  fi

  if ! qa_requires_available "$requires"; then
    qa_write_result "$label" "SKIP: missing required secret ($requires)"
    return 0
  fi

  resolved_args="$(qa_substitute_placeholders "$args")"
  unresolved="$(qa_unresolved_placeholders "$resolved_args")"
  if [ -n "$unresolved" ]; then
    qa_write_result "$label" "SKIP: missing runtime seed(s): $unresolved"
    return 0
  fi

  if [ -n "$resolved_args" ]; then
    # shellcheck disable=SC2086
    eval "set -- $resolved_args"
  else
    set --
  fi

  text_workspace="$(qa_reset_workspace "${label}__text" "$template")"
  json_workspace="$(qa_reset_workspace "${label}__json" "$template")"

  qa_run_cli_capture "$text_workspace" "$label" text "$command" "$@"
  qa_run_cli_capture "$json_workspace" "$label" json "$command" "$@"

  case "$type" in
    offline-success|noauth-success|auth-success|stateful-success)
      if qa_expect_success "$label"; then
        qa_write_result "$label" "PASS"
      else
        qa_write_result "$label" "FAIL: success contract violated"
      fi
      ;;
    expected-usage-error)
      if qa_expect_usage_error "$label"; then
        qa_write_result "$label" "PASS"
      else
        qa_write_result "$label" "FAIL: usage error contract violated"
      fi
      ;;
    expected-execution-error)
      if qa_expect_execution_error "$label"; then
        qa_write_result "$label" "PASS"
      else
        qa_write_result "$label" "FAIL: execution error contract violated"
      fi
      ;;
    *)
      qa_write_result "$label" "FAIL: unsupported case type $type"
      ;;
  esac
}

case "$task_kind" in
  help)
    run_help_case "$task_name"
    ;;
  global)
    run_global_case "$task_name"
    ;;
  main)
    run_main_case "$task_name"
    ;;
  *)
    echo "Unknown task kind: $task_kind" >&2
    exit 1
    ;;
esac
