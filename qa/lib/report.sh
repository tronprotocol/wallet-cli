#!/bin/bash

qa_generate_report() {
  local registered_count="$1"
  local covered_count="$2"
  local excluded_count="$3"
  local missing_count="$4"
  local stale_count="$5"

  local total=0 passed=0 failed=0 skipped=0
  local help_total=0 help_passed=0 help_failed=0 help_skipped=0

  {
    echo "==============================================================="
    echo "  Standard CLI Contract Report"
    echo "==============================================================="
    echo
    echo "Registered commands: $registered_count"
    echo "Manifest-covered commands: $covered_count"
    echo "Excluded interactive commands: $excluded_count"
    echo "Compliant covered commands: $((covered_count - excluded_count))"
    echo "Missing manifest entries: $missing_count"
    echo "Stale manifest entries: $stale_count"
    echo
  } > "$REPORT_FILE"

  for result_file in "$RESULTS_DIR"/*.result; do
    [ -f "$result_file" ] || continue
    local cmd status
    cmd="$(basename "$result_file" .result)"
    status="$(cat "$result_file")"
    if [[ "$cmd" == help__* ]]; then
      help_total=$((help_total + 1))
      if [[ "$status" == PASS* ]]; then
        help_passed=$((help_passed + 1))
      elif [[ "$status" == SKIP* ]]; then
        help_skipped=$((help_skipped + 1))
      else
        help_failed=$((help_failed + 1))
      fi
      continue
    fi
    total=$((total + 1))
    if [[ "$status" == PASS* ]]; then
      passed=$((passed + 1))
      echo "  ✓ $cmd" >> "$REPORT_FILE"
    elif [[ "$status" == SKIP* ]]; then
      skipped=$((skipped + 1))
      echo "  - $cmd ($status)" >> "$REPORT_FILE"
    else
      failed=$((failed + 1))
      echo "  ✗ $cmd — $status" >> "$REPORT_FILE"
    fi
  done

  {
    echo
    echo "---------------------------------------------------------------"
    echo "Main Cases: total=$total passed=$passed failed=$failed skipped=$skipped"
    echo "Help Cases: total=$help_total passed=$help_passed failed=$help_failed skipped=$help_skipped"
    echo "==============================================================="
  } >> "$REPORT_FILE"
}
