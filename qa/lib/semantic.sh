#!/bin/bash

qa_filtered_text_stdout() {
  local file="$1"
  sed '/^User defined config file/d;/^$/d' "$file"
}

qa_json_validate() {
  local file="$1"
  local expectation="$2"
  local expected_exit="$3"

  python3 - <<'PY' "$file" "$expectation" "$expected_exit"
import json
import sys

path, expectation, expected_exit = sys.argv[1], sys.argv[2], int(sys.argv[3])
text = open(path, "r", encoding="utf-8").read()
if not text.strip():
    raise SystemExit("JSON stdout is empty")
try:
    payload = json.loads(text)
except Exception as exc:
    raise SystemExit(f"Invalid JSON envelope: {exc}")
if not isinstance(payload, dict):
    raise SystemExit("Top-level JSON must be an object")
if "success" not in payload or not isinstance(payload["success"], bool):
    raise SystemExit("JSON envelope missing boolean success field")
if payload["success"]:
    if "data" not in payload:
        raise SystemExit("JSON success envelope missing data")
    if expectation not in {"success"}:
        raise SystemExit("JSON reported success when failure was expected")
    if expected_exit != 0:
        raise SystemExit("JSON success must use exit code 0")
else:
    if "error" not in payload or "message" not in payload:
        raise SystemExit("JSON error envelope missing error/message")
    error = payload["error"]
    if expectation == "usage":
      if error != "usage_error":
        raise SystemExit(f"Expected usage_error, got: {error}")
      if expected_exit != 2:
        raise SystemExit("usage_error must use exit code 2")
    elif expectation == "execution":
      if error == "usage_error":
        raise SystemExit("Expected execution-style error, got usage_error")
      if expected_exit != 1:
        raise SystemExit("Execution error must use exit code 1")
    else:
      raise SystemExit("JSON reported failure when success was expected")
print("PASS")
PY
}

qa_expect_success() {
  local label="$1"
  local text_exit json_exit
  text_exit="$(cat "$RESULTS_DIR/${label}_text.exit")"
  json_exit="$(cat "$RESULTS_DIR/${label}_json.exit")"
  [ "$text_exit" = "0" ] || return 1
  [ "$json_exit" = "0" ] || return 1
  qa_json_validate "$RESULTS_DIR/${label}_json.out" success 0 >/dev/null 2>&1 || return 1

  local text_out
  text_out="$(qa_filtered_text_stdout "$RESULTS_DIR/${label}_text.out")"
  [ -n "$text_out" ] || return 1
  printf '%s' "$text_out" | grep -qi '^Error:' && return 1
  printf '%s' "$text_out" | grep -qi '^Usage:' && return 1
  return 0
}

qa_expect_usage_error() {
  local label="$1"
  local text_exit json_exit
  text_exit="$(cat "$RESULTS_DIR/${label}_text.exit")"
  json_exit="$(cat "$RESULTS_DIR/${label}_json.exit")"
  [ "$text_exit" = "2" ] || return 1
  [ "$json_exit" = "2" ] || return 1
  qa_json_validate "$RESULTS_DIR/${label}_json.out" usage 2 >/dev/null 2>&1 || return 1
  grep -q '^Error:' "$RESULTS_DIR/${label}_text.out"
}

qa_expect_execution_error() {
  local label="$1"
  local text_exit json_exit
  text_exit="$(cat "$RESULTS_DIR/${label}_text.exit")"
  json_exit="$(cat "$RESULTS_DIR/${label}_json.exit")"
  [ "$text_exit" = "1" ] || return 1
  [ "$json_exit" = "1" ] || return 1
  qa_json_validate "$RESULTS_DIR/${label}_json.out" execution 1 >/dev/null 2>&1 || return 1
  grep -q '^Error:' "$RESULTS_DIR/${label}_text.out"
}

qa_expect_help_success() {
  local label="$1"
  local text_exit
  text_exit="$(cat "$RESULTS_DIR/${label}_text.exit")"
  [ "$text_exit" = "0" ] || return 1
  local text_out
  text_out="$(qa_filtered_text_stdout "$RESULTS_DIR/${label}_text.out")"
  [ -n "$text_out" ] || return 1
  printf '%s' "$text_out" | grep -Eq 'Usage:|Description:|TRON Wallet CLI'
}
