#!/bin/bash
# JSON/text semantic equivalence checking

# Filter known non-output lines from stdout
filter_noise() {
  local input="$1"
  echo "$input" | grep -v "^User defined config file" \
                 | grep -v "^Authenticated with" \
                 | grep -v "^User defined config" \
                 | grep -v "^No wallet directory found — skipping auto-login" \
                 | grep -v "^No keystore files found — skipping auto-login" \
                 | grep -v "^MASTER_PASSWORD not set — skipping auto-login" \
                 | grep -v "^No active wallet selected — skipping auto-login" \
                 | grep -v "^$" || true
}

validate_json_envelope() {
  local json_output="$1"

  if ! command -v python3 &> /dev/null; then
    return 0
  fi

  echo "$json_output" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert isinstance(d, dict), 'top-level JSON must be an object'
assert 'success' in d, 'missing success field'
assert isinstance(d['success'], bool), 'success must be boolean'
if d['success']:
    assert 'data' in d, 'missing data field on success'
else:
    assert 'error' in d, 'missing error field on failure'
    assert 'message' in d, 'missing message field on failure'
" > /dev/null 2>&1
}

requires_strict_semantic_parity() {
  local cmd="$1"
  case "$cmd" in
    trigger-constant-contract|gas-free-info|gas-free-trace)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

# Verify JSON is valid and matches text semantically
check_json_text_parity() {
  local cmd="$1"
  local text_output="$2"
  local json_output="$3"
  local text_file=""
  local json_file=""

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

  if ! validate_json_envelope "$json_output"; then
    echo "FAIL: Invalid JSON envelope for $cmd"
    return 1
  fi

  if command -v python3 &> /dev/null; then
    local semantic_check
    local strict_semantic="0"
    if requires_strict_semantic_parity "$cmd"; then
      strict_semantic="1"
    fi
    text_file=$(mktemp)
    json_file=$(mktemp)
    printf '%s' "$text_output" > "$text_file"
    printf '%s' "$json_output" > "$json_file"
    semantic_check=$(TEXT_FILE="$text_file" JSON_FILE="$json_file" STRICT_SEMANTIC="$strict_semantic" python3 -c "
import json, os, re

def norm(value):
    return re.sub(r'[^a-z0-9]+', ' ', value.lower()).strip()

def try_parse_structured_text(text):
    text = text.strip()
    if not text:
        return None
    candidates = [text]
    for marker in ('Execution result =', 'GasFreeTrace result:', 'GasFreeTransfer result:'):
        if marker in text:
            candidates.append(text.split(marker, 1)[1].strip())
    for candidate in candidates:
        candidate = candidate.strip()
        if not candidate:
            continue
        start = min([i for i in (candidate.find('{'), candidate.find('[')) if i != -1], default=-1)
        if start == -1:
            continue
        candidate = candidate[start:]
        try:
            return json.loads(candidate)
        except Exception:
            continue
    return None

with open(os.environ['TEXT_FILE'], 'r', encoding='utf-8') as f:
    text = f.read()
with open(os.environ['JSON_FILE'], 'r', encoding='utf-8') as f:
    payload = json.load(f)
strict_semantic = os.environ.get('STRICT_SEMANTIC') == '1'
text_lower = text.lower()
success = payload.get('success')

if 'usage:' in text_lower and success:
    print('FAIL: Text output shows usage while JSON reports success')
    raise SystemExit

if text_lower.lstrip().startswith('error:') and success:
    print('FAIL: Text output shows error while JSON reports success')
    raise SystemExit

if success is True:
    data = payload.get('data')
    if isinstance(data, dict) and set(data.keys()) == {'message'} and isinstance(data.get('message'), str):
        msg = norm(data['message'])
        txt = norm(text)
        if msg and txt and msg not in txt and txt not in msg:
            print('FAIL: Text output does not match JSON message')
            raise SystemExit
    elif strict_semantic:
        parsed_text = try_parse_structured_text(text)
        if parsed_text is not None and parsed_text != data:
            print('FAIL: Text output does not semantically match JSON payload')
            raise SystemExit
elif success is False:
    msg = payload.get('message')
    txt = norm(text)
    msg_norm = norm(msg) if isinstance(msg, str) else ''
    if msg_norm and txt and msg_norm not in txt and 'error:' not in text_lower and 'usage:' not in text_lower:
        print('FAIL: Text error output does not match JSON error message')
        raise SystemExit

print('PASS')
" 2>/dev/null)
    rm -f "$text_file" "$json_file"
    if [ "$semantic_check" != "PASS" ]; then
      echo "${semantic_check:-FAIL: JSON/text semantic alignment failed for $cmd}"
      return 1
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
    actual=$(echo "$json" | python3 -c "import sys, json; data=json.load(sys.stdin); value=data
for key in sys.argv[1].split('.'):
    if isinstance(value, dict) and key in value:
        value = value[key]
    else:
        value = 'MISSING'
        break
print(value)" "$field" 2>/dev/null)
    if [ "$actual" = "$expected" ]; then
      return 0
    else
      return 1
    fi
  fi
  return 0
}
