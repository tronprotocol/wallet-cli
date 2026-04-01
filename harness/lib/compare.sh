#!/bin/bash
# Output comparison utilities

# Strip ANSI codes, trailing whitespace, and blank lines
normalize_output() {
  local input="$1"
  echo "$input" | sed 's/\x1b\[[0-9;]*m//g' | sed 's/[[:space:]]*$//' | sed '/^$/d'
}

# Compare two outputs; returns 0 if match, 1 if mismatch
compare_outputs() {
  local label="$1"
  local expected="$2"
  local actual="$3"

  local norm_expected
  norm_expected=$(normalize_output "$expected")
  local norm_actual
  norm_actual=$(normalize_output "$actual")

  if [ "$norm_expected" = "$norm_actual" ]; then
    echo "PASS"
    return 0
  else
    echo "MISMATCH"
    diff <(echo "$norm_expected") <(echo "$norm_actual") > "/tmp/harness_diff_${label}.txt" 2>&1
    return 1
  fi
}
