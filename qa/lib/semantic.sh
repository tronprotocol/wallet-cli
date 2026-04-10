#!/bin/bash

qa_assert_exit_code() {
  local file="$1"
  local expected="$2"
  [ "$(cat "$file")" = "$expected" ]
}

qa_assert_single_json_object() {
  local file="$1"
  python3 - <<'PY' "$file"
import json
import sys

text = open(sys.argv[1], "r", encoding="utf-8").read()
if not text.strip():
    raise SystemExit("JSON stdout is empty")
decoder = json.JSONDecoder()
_, end = decoder.raw_decode(text.lstrip())
remaining = text.lstrip()[end:].strip()
if remaining:
    raise SystemExit("JSON stdout must contain exactly one top-level object")
print("PASS")
PY
}

qa_assert_json_success() {
  local file="$1"
  qa_assert_single_json_object "$file" >/dev/null 2>&1 || return 1
  python3 - <<'PY' "$file"
import json
import sys

payload = json.load(open(sys.argv[1], "r", encoding="utf-8"))
if not isinstance(payload, dict) or payload.get("success") is not True or "data" not in payload:
    raise SystemExit(1)
print("PASS")
PY
}

qa_assert_json_error() {
  local file="$1"
  local expectation="$2"
  local expected_code="${3:-}"
  qa_assert_single_json_object "$file" >/dev/null 2>&1 || return 1
  python3 - <<'PY' "$file" "$expectation" "$expected_code"
import json
import sys

payload = json.load(open(sys.argv[1], "r", encoding="utf-8"))
expectation = sys.argv[2]
expected_code = sys.argv[3]
if not isinstance(payload, dict) or payload.get("success") is not False:
    raise SystemExit(1)
error = payload.get("error")
message = payload.get("message")
if not error or not message:
    raise SystemExit(1)
if expected_code and error != expected_code:
    raise SystemExit(1)
if expectation == "usage" and error != "usage_error":
    raise SystemExit(1)
if expectation == "execution" and error == "usage_error":
    raise SystemExit(1)
print("PASS")
PY
}

qa_assert_json_path_exists() {
  local file="$1"
  local path="$2"
  qa_json_path_exists_in_file "$file" "$path"
}

qa_assert_json_path_absent() {
  local file="$1"
  local path="$2"
  ! qa_json_path_exists_in_file "$file" "$path"
}

qa_assert_json_stderr_clean() {
  local file="$1"
  [ -z "$(qa_filtered_stderr "$file")" ]
}

qa_assert_text_contains() {
  local file="$1"
  local csv="${2:-}"
  local token text
  local -a tokens=()
  text="$(qa_filtered_text_stdout "$file")"
  IFS=',' read -r -a tokens <<< "$csv"
  for token in "${tokens[@]-}"; do
    token="$(printf '%s' "$token" | xargs)"
    [ -z "$token" ] && continue
    printf '%s' "$text" | grep -Fq -- "$token" || return 1
  done
  return 0
}

qa_assert_text_absent() {
  local file="$1"
  local csv="${2:-}"
  local token text
  local -a tokens=()
  text="$(qa_filtered_text_stdout "$file")"
  IFS=',' read -r -a tokens <<< "$csv"
  for token in "${tokens[@]-}"; do
    token="$(printf '%s' "$token" | xargs)"
    [ -z "$token" ] && continue
    printf '%s' "$text" | grep -Fq -- "$token" && return 1
  done
  return 0
}

qa_assert_text_not_error_like() {
  local file="$1"
  qa_assert_text_absent "$file" "Error:,Usage:"
}

qa_assert_json_paths() {
  local file="$1"
  local exists_csv="${2:-}"
  local absent_csv="${3:-}"
  local path
  local -a exists_paths=()
  local -a absent_paths=()
  IFS=',' read -r -a exists_paths <<< "$exists_csv"
  IFS=',' read -r -a absent_paths <<< "$absent_csv"
  for path in "${exists_paths[@]-}"; do
    path="$(printf '%s' "$path" | xargs)"
    [ -z "$path" ] && continue
    qa_assert_json_path_exists "$file" "$path" || return 1
  done
  for path in "${absent_paths[@]-}"; do
    path="$(printf '%s' "$path" | xargs)"
    [ -z "$path" ] && continue
    qa_assert_json_path_absent "$file" "$path" || return 1
  done
  return 0
}

qa_assert_case_files() {
  local label="$1"
  local expectation="$2"
  local mode="$3"
  local json_path_exists="${4:-}"
  local json_path_absent="${5:-}"
  local error_code="${6:-}"
  local text_contains="${7:-}"
  local text_absent="${8:-}"

  case "$expectation" in
    success)
      if [ "$mode" = "dual" ] || [ "$mode" = "text" ]; then
        qa_assert_exit_code "$RESULTS_DIR/${label}_text.exit" 0 || return 1
        qa_assert_text_not_error_like "$RESULTS_DIR/${label}_text.out" || return 1
        qa_assert_text_contains "$RESULTS_DIR/${label}_text.out" "$text_contains" || return 1
        qa_assert_text_absent "$RESULTS_DIR/${label}_text.out" "$text_absent" || return 1
      fi
      if [ "$mode" = "dual" ] || [ "$mode" = "json" ]; then
        qa_assert_exit_code "$RESULTS_DIR/${label}_json.exit" 0 || return 1
        qa_assert_json_success "$RESULTS_DIR/${label}_json.out" >/dev/null 2>&1 || return 1
        qa_assert_json_stderr_clean "$RESULTS_DIR/${label}_json.err" || return 1
        qa_assert_json_paths "$RESULTS_DIR/${label}_json.out" "$json_path_exists" "$json_path_absent" || return 1
      fi
      ;;
    usage)
      if [ "$mode" = "dual" ] || [ "$mode" = "text" ]; then
        qa_assert_exit_code "$RESULTS_DIR/${label}_text.exit" 2 || return 1
        qa_assert_text_contains "$RESULTS_DIR/${label}_text.out" "$text_contains" || return 1
        qa_assert_text_absent "$RESULTS_DIR/${label}_text.out" "$text_absent" || return 1
      fi
      if [ "$mode" = "dual" ] || [ "$mode" = "json" ]; then
        qa_assert_exit_code "$RESULTS_DIR/${label}_json.exit" 2 || return 1
        qa_assert_json_error "$RESULTS_DIR/${label}_json.out" usage "$error_code" >/dev/null 2>&1 || return 1
        qa_assert_json_stderr_clean "$RESULTS_DIR/${label}_json.err" || return 1
        qa_assert_json_paths "$RESULTS_DIR/${label}_json.out" "$json_path_exists" "$json_path_absent" || return 1
      fi
      ;;
    execution)
      if [ "$mode" = "dual" ] || [ "$mode" = "text" ]; then
        qa_assert_exit_code "$RESULTS_DIR/${label}_text.exit" 1 || return 1
        qa_assert_text_contains "$RESULTS_DIR/${label}_text.out" "$text_contains" || return 1
        qa_assert_text_absent "$RESULTS_DIR/${label}_text.out" "$text_absent" || return 1
      fi
      if [ "$mode" = "dual" ] || [ "$mode" = "json" ]; then
        qa_assert_exit_code "$RESULTS_DIR/${label}_json.exit" 1 || return 1
        qa_assert_json_error "$RESULTS_DIR/${label}_json.out" execution "$error_code" >/dev/null 2>&1 || return 1
        qa_assert_json_stderr_clean "$RESULTS_DIR/${label}_json.err" || return 1
        qa_assert_json_paths "$RESULTS_DIR/${label}_json.out" "$json_path_exists" "$json_path_absent" || return 1
      fi
      ;;
    help_dual)
      qa_assert_exit_code "$RESULTS_DIR/${label}_text.exit" 0 || return 1
      qa_assert_exit_code "$RESULTS_DIR/${label}_json.exit" 0 || return 1
      qa_assert_text_contains "$RESULTS_DIR/${label}_text.out" "${text_contains:-Usage:,wallet-cli}" || return 1
      qa_assert_text_absent "$RESULTS_DIR/${label}_text.out" "${text_absent:-Error:}" || return 1
      qa_assert_json_success "$RESULTS_DIR/${label}_json.out" >/dev/null 2>&1 || return 1
      qa_assert_json_stderr_clean "$RESULTS_DIR/${label}_json.err" || return 1
      qa_assert_json_paths "$RESULTS_DIR/${label}_json.out" "${json_path_exists:-data.help}" "$json_path_absent" || return 1
      ;;
    help_text)
      qa_assert_exit_code "$RESULTS_DIR/${label}_text.exit" 0 || return 1
      qa_assert_text_contains "$RESULTS_DIR/${label}_text.out" "${text_contains:-Usage:,wallet-cli}" || return 1
      qa_assert_text_absent "$RESULTS_DIR/${label}_text.out" "${text_absent:-Error:}" || return 1
      ;;
    help_json)
      qa_assert_exit_code "$RESULTS_DIR/${label}_json.exit" 0 || return 1
      qa_assert_json_success "$RESULTS_DIR/${label}_json.out" >/dev/null 2>&1 || return 1
      qa_assert_json_stderr_clean "$RESULTS_DIR/${label}_json.err" || return 1
      qa_assert_json_paths "$RESULTS_DIR/${label}_json.out" "${json_path_exists:-data.help}" "$json_path_absent" || return 1
      ;;
    *)
      return 1
      ;;
  esac
  return 0
}
