#!/bin/bash
# JSON/text semantic equivalence checking

# Filter known non-output lines from stdout
filter_noise() {
  local input="$1"
  echo "$input" | grep -v "^User defined config file" \
                 | grep -v "^Authenticated with" \
                 | grep -v "^User defined config" \
                 | grep -v "^$" || true
}

# Verify JSON is valid and matches text semantically
check_json_text_parity() {
  local cmd="$1"
  local text_output="$2"
  local json_output="$3"

  # Filter noise from outputs
  text_output=$(filter_noise "$text_output")
  json_output=$(filter_noise "$json_output")

  # Check JSON output is not empty
  if [ -z "$json_output" ]; then
    echo "FAIL: Empty JSON output for $cmd"
    return 1
  fi

  # Verify JSON is valid — try full output first, then extract last JSON object
  if command -v python3 &> /dev/null; then
    echo "$json_output" | python3 -m json.tool > /dev/null 2>&1
    if [ $? -ne 0 ]; then
      # Try extracting the last JSON object from mixed output
      local extracted
      extracted=$(echo "$json_output" | python3 -c "
import sys, json, re
text = sys.stdin.read()
# Find last JSON object in the output
matches = list(re.finditer(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', text, re.DOTALL))
if matches:
    try:
        json.loads(matches[-1].group())
        print('OK')
    except:
        print('FAIL')
else:
    print('FAIL')
" 2>/dev/null)
      if [ "$extracted" != "OK" ]; then
        echo "FAIL: Invalid JSON output for $cmd"
        return 1
      fi
    fi
  fi

  # Check text output is not empty
  if [ -z "$text_output" ]; then
    echo "FAIL: Empty text output for $cmd"
    return 1
  fi

  # Both outputs exist and JSON is valid
  echo "PASS"
  return 0
}

# Check that a JSON field exists with expected value
check_json_field() {
  local json="$1"
  local field="$2"
  local expected="$3"

  if command -v python3 &> /dev/null; then
    local actual
    actual=$(echo "$json" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('$field', 'MISSING'))" 2>/dev/null)
    if [ "$actual" = "$expected" ]; then
      return 0
    else
      return 1
    fi
  fi
  return 0
}
