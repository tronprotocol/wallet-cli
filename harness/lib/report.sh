#!/bin/bash
# Report generation

generate_report() {
  local results_dir="$1"
  local report_file="$2"

  local total=0 passed=0 failed=0 skipped=0

  cat > "$report_file" << 'HEADER'
═══════════════════════════════════════════════════════════════
  Wallet CLI Harness — Full Parity Report
═══════════════════════════════════════════════════════════════

HEADER

  for result_file in "$results_dir"/*.result; do
    [ -f "$result_file" ] || continue
    total=$((total + 1))
    status=$(cat "$result_file")
    cmd=$(basename "$result_file" .result)
    if echo "$status" | grep -q "^PASS"; then
      passed=$((passed + 1))
      echo "  ✓ $cmd" >> "$report_file"
    elif echo "$status" | grep -q "^SKIP"; then
      skipped=$((skipped + 1))
      echo "  - $cmd (skipped)" >> "$report_file"
    else
      failed=$((failed + 1))
      echo "  ✗ $cmd — $status" >> "$report_file"
    fi
  done

  echo "" >> "$report_file"
  echo "───────────────────────────────────────────────────────────────" >> "$report_file"
  echo "  Total: $total  Passed: $passed  Failed: $failed  Skipped: $skipped" >> "$report_file"
  echo "═══════════════════════════════════════════════════════════════" >> "$report_file"
}
