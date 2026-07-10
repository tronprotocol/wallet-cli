#!/bin/bash

qa_is_contract_label() {
  local label="$1"
  awk -F'|' -v case_label="$label" '$1 == case_label { found=1 } END { exit(found ? 0 : 1) }' \
    "$CONTRACTS_FILE"
}

qa_is_stateful_label() {
  local label="$1"
  qa_is_stateful_command "$label"
}

qa_generate_report() {
  local registered_count="$1"
  local smoke_count="$2"
  local excluded_count="$3"
  local missing_count="$4"
  local stale_count="$5"
  local contract_case_count="$6"

  local smoke_total=0 smoke_passed=0 smoke_failed=0 smoke_skipped=0
  local stateful_total=0 stateful_passed=0 stateful_failed=0 stateful_skipped=0
  local help_total=0 help_passed=0 help_failed=0 help_skipped=0
  local contract_total=0 contract_passed=0 contract_failed=0 contract_skipped=0
  local validated_supported=0 skipped_supported=0 overall_failures=0

  {
    echo "==============================================================="
    echo "  Standard CLI Contract Report"
    echo "==============================================================="
    echo
    echo "Registered commands: $registered_count"
    echo "Smoke-covered commands: $smoke_count"
    echo "Unsupported/excluded commands: $excluded_count"
    echo "Contract regression cases: $contract_case_count"
    echo "Missing manifest entries: $missing_count"
    echo "Stale manifest entries: $stale_count"
    echo
  } > "$REPORT_FILE"

  for result_file in "$RESULTS_DIR"/*.result; do
    [ -f "$result_file" ] || continue
    local label status bucket
    label="$(basename "$result_file" .result)"
    status="$(cat "$result_file")"

    if [[ "$label" == help__* ]]; then
      bucket="help"
    elif qa_is_contract_label "$label"; then
      bucket="contract"
    elif qa_is_stateful_label "$label"; then
      bucket="stateful"
    else
      bucket="smoke"
    fi

    case "$bucket" in
      help)
        help_total=$((help_total + 1))
        if [[ "$status" == PASS* ]]; then
          help_passed=$((help_passed + 1))
        elif [[ "$status" == SKIP* ]]; then
          help_skipped=$((help_skipped + 1))
        else
          help_failed=$((help_failed + 1))
          overall_failures=$((overall_failures + 1))
        fi
        ;;
      contract)
        contract_total=$((contract_total + 1))
        if [[ "$status" == PASS* ]]; then
          contract_passed=$((contract_passed + 1))
          echo "  [contract] ✓ $label" >> "$REPORT_FILE"
        elif [[ "$status" == SKIP* ]]; then
          contract_skipped=$((contract_skipped + 1))
          echo "  [contract] - $label ($status)" >> "$REPORT_FILE"
        else
          contract_failed=$((contract_failed + 1))
          overall_failures=$((overall_failures + 1))
          echo "  [contract] ✗ $label — $status" >> "$REPORT_FILE"
        fi
        ;;
      stateful)
        stateful_total=$((stateful_total + 1))
        if [[ "$status" == PASS* ]]; then
          stateful_passed=$((stateful_passed + 1))
          validated_supported=$((validated_supported + 1))
          echo "  [stateful] ✓ $label" >> "$REPORT_FILE"
        elif [[ "$status" == SKIP* ]]; then
          stateful_skipped=$((stateful_skipped + 1))
          skipped_supported=$((skipped_supported + 1))
          echo "  [stateful] - $label ($status)" >> "$REPORT_FILE"
        else
          stateful_failed=$((stateful_failed + 1))
          overall_failures=$((overall_failures + 1))
          echo "  [stateful] ✗ $label — $status" >> "$REPORT_FILE"
        fi
        ;;
      smoke)
        smoke_total=$((smoke_total + 1))
        if [[ "$status" == PASS* ]]; then
          smoke_passed=$((smoke_passed + 1))
          validated_supported=$((validated_supported + 1))
          echo "  [smoke] ✓ $label" >> "$REPORT_FILE"
        elif [[ "$status" == SKIP* ]]; then
          smoke_skipped=$((smoke_skipped + 1))
          skipped_supported=$((skipped_supported + 1))
          echo "  [smoke] - $label ($status)" >> "$REPORT_FILE"
        else
          smoke_failed=$((smoke_failed + 1))
          overall_failures=$((overall_failures + 1))
          echo "  [smoke] ✗ $label — $status" >> "$REPORT_FILE"
        fi
        ;;
    esac
  done

  {
    echo
    echo "---------------------------------------------------------------"
    echo "Validated supported commands: $validated_supported"
    echo "Skipped supported commands: $skipped_supported"
    echo "Smoke Cases: total=$smoke_total passed=$smoke_passed failed=$smoke_failed skipped=$smoke_skipped"
    echo "Stateful Cases: total=$stateful_total passed=$stateful_passed failed=$stateful_failed skipped=$stateful_skipped"
    echo "Help Cases: total=$help_total passed=$help_passed failed=$help_failed skipped=$help_skipped"
    echo "Contract Cases: total=$contract_total passed=$contract_passed failed=$contract_failed skipped=$contract_skipped"
    if [ "$missing_count" -eq 0 ] && [ "$stale_count" -eq 0 ] && [ "$overall_failures" -eq 0 ]; then
      echo "Overall Compliance: PASS"
    else
      echo "Overall Compliance: FAIL"
    fi
    echo "==============================================================="
  } >> "$REPORT_FILE"
}
