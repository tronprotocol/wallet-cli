#!/bin/bash

# ---- Per-case timeout support ----
QA_CASE_TIMEOUT="${QA_CASE_TIMEOUT:-120}"

if command -v timeout >/dev/null 2>&1; then
  _qa_timeout_cmd="timeout"
elif command -v gtimeout >/dev/null 2>&1; then
  _qa_timeout_cmd="gtimeout"
else
  _qa_timeout_cmd=""
fi

_qa_run_with_timeout() {
  local secs="$1"; shift
  if [ -n "$_qa_timeout_cmd" ]; then
    "$_qa_timeout_cmd" "$secs" "$@"
  else
    "$@" &
    local pid=$!
    ( sleep "$secs"; kill "$pid" 2>/dev/null ) &
    local watchdog=$!
    wait "$pid" 2>/dev/null; local rc=$?
    kill "$watchdog" 2>/dev/null; wait "$watchdog" 2>/dev/null
    return $rc
  fi
}

qa_manifest_line() {
  local command="$1"
  awk -F'|' -v cmd="$command" '$1 == cmd { print; exit }' "$MANIFEST_FILE"
}

qa_manifest_field() {
  local command="$1"
  local field="$2"
  qa_manifest_line "$command" | awk -F'|' -v idx="$field" '{ print $idx }'
}

qa_contract_line() {
  local label="$1"
  awk -F'|' -v case_label="$label" '$1 == case_label { print; exit }' "$CONTRACTS_FILE"
}

qa_contract_field() {
  local label="$1"
  local field="$2"
  qa_contract_line "$label" | awk -F'|' -v idx="$field" '{ print $idx }'
}

qa_case_type() {
  qa_manifest_field "$1" 2
}

qa_case_template() {
  qa_manifest_field "$1" 3
}

qa_case_requires() {
  qa_manifest_field "$1" 4
}

qa_case_args() {
  qa_manifest_field "$1" 5
}

qa_case_json_path_exists() {
  qa_manifest_field "$1" 6
}

qa_case_json_path_absent() {
  qa_manifest_field "$1" 7
}

qa_case_error_code() {
  qa_manifest_field "$1" 8
}

qa_case_text_contains() {
  qa_manifest_field "$1" 9
}

qa_case_preflight() {
  qa_manifest_field "$1" 10
}

qa_contract_template() {
  qa_contract_field "$1" 2
}

qa_contract_requires() {
  qa_contract_field "$1" 3
}

qa_contract_args_json() {
  qa_contract_field "$1" 4
}

qa_contract_expectation() {
  qa_contract_field "$1" 5
}

qa_contract_json_path_exists() {
  qa_contract_field "$1" 6
}

qa_contract_json_path_absent() {
  qa_contract_field "$1" 7
}

qa_contract_error_code() {
  qa_contract_field "$1" 8
}

qa_contract_text_contains() {
  qa_contract_field "$1" 9
}

qa_contract_text_absent() {
  qa_contract_field "$1" 10
}

qa_contract_env_mode() {
  qa_contract_field "$1" 11
}

qa_contract_stream_mode() {
  qa_contract_field "$1" 12
}

qa_contract_preflight() {
  qa_contract_field "$1" 13
}

qa_prepare_directories() {
  mkdir -p "$RESULTS_DIR" "$RUNTIME_DIR/templates" "$RUNTIME_DIR/workspaces"
}

qa_clean_runtime() {
  rm -rf "$RESULTS_DIR" "$RUNTIME_DIR"
  qa_prepare_directories
}

qa_import_template_wallet() {
  local template_dir="$1"
  local mode="$2"

  mkdir -p "$template_dir"
  (
    cd "$template_dir" || exit 1
    rm -rf Wallet Mnemonic
    case "$mode" in
      private-key)
        MASTER_PASSWORD="$MASTER_PASSWORD" TRON_TEST_PRIVATE_KEY="$PRIVATE_KEY" \
          java -cp "$WALLET_JAR" org.tron.qa.QASecretImporter private-key >/dev/null
        ;;
      mnemonic)
        MASTER_PASSWORD="$MASTER_PASSWORD" TRON_TEST_MNEMONIC="$MNEMONIC" \
          java -cp "$WALLET_JAR" org.tron.qa.QASecretImporter mnemonic >/dev/null
        ;;
      *)
        return 1
        ;;
    esac
  )
}

qa_clone_template() {
  local source_dir="$1"
  local target_dir="$2"
  rm -rf "$target_dir"
  mkdir -p "$target_dir"
  if [ -d "$source_dir" ]; then
    cp -R "$source_dir"/. "$target_dir"/ 2>/dev/null || true
  fi
}

qa_prepare_templates() {
  mkdir -p "$RUNTIME_DIR/templates/empty"
  if qa_has_private_key; then
    qa_import_template_wallet "$RUNTIME_DIR/templates/auth" private-key

    qa_clone_template "$RUNTIME_DIR/templates/auth" "$RUNTIME_DIR/templates/auth-external-wallet"
    mkdir -p "$RUNTIME_DIR/templates/auth-external-wallet/External"
    if ls "$RUNTIME_DIR/templates/auth-external-wallet/Wallet/"*.json >/dev/null 2>&1; then
      cp "$RUNTIME_DIR/templates/auth-external-wallet/Wallet/"*.json \
        "$RUNTIME_DIR/templates/auth-external-wallet/External/" 2>/dev/null || true
    fi

    qa_clone_template "$RUNTIME_DIR/templates/auth" "$RUNTIME_DIR/templates/auth-no-active"
    rm -f "$RUNTIME_DIR/templates/auth-no-active/Wallet/.active-wallet"

    qa_clone_template "$RUNTIME_DIR/templates/auth" "$RUNTIME_DIR/templates/auth-bad-active"
    mkdir -p "$RUNTIME_DIR/templates/auth-bad-active/Wallet"
    printf '{bad json\n' > "$RUNTIME_DIR/templates/auth-bad-active/Wallet/.active-wallet"
  fi
  if qa_has_mnemonic; then
    qa_import_template_wallet "$RUNTIME_DIR/templates/auth-mnemonic" mnemonic
  fi
}

qa_reset_workspace() {
  local label="$1"
  local template="$2"
  local workspace="$RUNTIME_DIR/workspaces/$label"

  rm -rf "$workspace"
  mkdir -p "$workspace"
  if [ -d "$RUNTIME_DIR/templates/$template" ]; then
    cp -R "$RUNTIME_DIR/templates/$template"/. "$workspace"/ 2>/dev/null || true
  fi
  echo "$workspace"
}

qa_seed_file() {
  echo "$RUNTIME_DIR/seeds.env"
}

qa_export_seeds() {
  qa_load_seeds
  export MY_ADDR FIRST_WALLET_ADDRESS FIRST_WALLET_NAME FIRST_WALLET_FILE
  export BLOCK_ID TX_ID WITNESS_ADDR MY_TRX_BALANCE
}

qa_load_seeds() {
  local seed_file
  seed_file="$(qa_seed_file)"
  if [ -f "$seed_file" ]; then
    # shellcheck disable=SC1090
    source "$seed_file"
  fi
}

qa_seed_value() {
  qa_load_seeds
  local key="$1"
  printf '%s' "${!key:-}"
}

qa_substitute_placeholders() {
  local text="$1"
  qa_load_seeds

  text="${text//\{\{NETWORK\}\}/$NETWORK}"
  text="${text//\{\{TARGET_ADDR\}\}/$TARGET_ADDR}"
  text="${text//\{\{USDT_NILE\}\}/$USDT_NILE}"
  text="${text//\{\{FAKE_ID_64\}\}/$FAKE_ID_64}"
  text="${text//\{\{PRIVATE_KEY\}\}/$PRIVATE_KEY}"
  text="${text//\{\{MNEMONIC\}\}/$MNEMONIC}"
  text="${text//\{\{MASTER_PASSWORD\}\}/$MASTER_PASSWORD}"
  text="${text//\{\{ALT_PASSWORD\}\}/$ALT_PASSWORD}"
  text="${text//\{\{MY_ADDR\}\}/${MY_ADDR:-}}"
  text="${text//\{\{FIRST_WALLET_ADDRESS\}\}/${FIRST_WALLET_ADDRESS:-}}"
  text="${text//\{\{BLOCK_ID\}\}/${BLOCK_ID:-}}"
  text="${text//\{\{TX_ID\}\}/${TX_ID:-}}"
  text="${text//\{\{WITNESS_ADDR\}\}/${WITNESS_ADDR:-}}"
  text="${text//\{\{FIRST_WALLET_NAME\}\}/${FIRST_WALLET_NAME:-}}"
  text="${text//\{\{FIRST_WALLET_FILE\}\}/${FIRST_WALLET_FILE:-}}"
  text="${text//\{\{MY_TRX_BALANCE\}\}/${MY_TRX_BALANCE:-}}"

  printf '%s' "$text"
}

qa_unresolved_placeholders() {
  local text="$1"
  (printf '%s' "$text" | grep -o '{{[^}]\+}}' || true) | tr '\n' ' ' | sed 's/[[:space:]]*$//'
}

qa_args_to_lines() {
  local args_string="$1"
  local substituted
  substituted="$(qa_substitute_placeholders "$args_string")"
  python3 - <<'PY' "$substituted"
import shlex
import sys

for item in shlex.split(sys.argv[1]):
    print(item)
PY
}

qa_args_json_to_lines() {
  local args_json="$1"
  local substituted
  substituted="$(qa_substitute_placeholders "$args_json")"
  python3 - <<'PY' "$substituted"
import json
import sys

value = json.loads(sys.argv[1])
if not isinstance(value, list):
    raise SystemExit("args_json must be a JSON array")
for item in value:
    if not isinstance(item, str):
        raise SystemExit("args_json entries must be strings")
    print(item)
PY
}

qa_resolve_case_to_file() {
  local kind="$1"
  local label="$2"
  local output_file="$3"
  QA_SEED_FILE="$(qa_seed_file)" python3 "$SCRIPT_DIR/lib/case_resolver.py" "$kind" "$label" > "$output_file"
}

qa_case_json_get() {
  local json_file="$1"
  local path="$2"
  python3 - <<'PY' "$json_file" "$path"
import json
import sys

payload = json.load(open(sys.argv[1], "r", encoding="utf-8"))
value = payload
for segment in [s for s in sys.argv[2].split(".") if s]:
    if isinstance(value, dict):
        value = value.get(segment)
    else:
        value = None
        break
if isinstance(value, list):
    print(",".join(str(item) for item in value))
elif value is None:
    print("")
else:
    print(value)
PY
}

qa_case_json_bool() {
  local json_file="$1"
  local path="$2"
  python3 - <<'PY' "$json_file" "$path"
import json
import sys

payload = json.load(open(sys.argv[1], "r", encoding="utf-8"))
value = payload
for segment in [s for s in sys.argv[2].split(".") if s]:
    value = value.get(segment) if isinstance(value, dict) else None
print("true" if value else "false")
PY
}

qa_case_json_write_lines() {
  local json_file="$1"
  local path="$2"
  local output_file="$3"
  python3 - <<'PY' "$json_file" "$path" "$output_file"
import json
import sys

payload = json.load(open(sys.argv[1], "r", encoding="utf-8"))
value = payload
for segment in [s for s in sys.argv[2].split(".") if s]:
    value = value.get(segment) if isinstance(value, dict) else None
with open(sys.argv[3], "w", encoding="utf-8") as out:
    if isinstance(value, list):
        for item in value:
            out.write(str(item))
            out.write("\n")
PY
}

qa_filtered_text_stdout() {
  local file="$1"
  sed '/^User defined config file/d;/^$/d' "$file"
}

# Filter known non-error noise from stderr before assertions.
# "Authenticated with wallet:" is an info-level message that formatter.info()
# intentionally prints to stderr (Unix convention: stderr = diagnostic channel,
# not just errors). It is suppressed in JSON and quiet modes but present in
# normal text mode, so we filter it here to keep qa_assert_text_stderr_clean
# focused on unexpected warnings/errors.
qa_filtered_stderr() {
  local file="$1"
  sed '/^$/d;/^Authenticated with wallet:/d' "$file"
}

qa_run_capture() {
  local workspace="$1"
  local label="$2"
  local suffix="$3"
  local env_mode="$4"
  shift 4

  local stdout_file="$RESULTS_DIR/${label}_${suffix}.out"
  local stderr_file="$RESULTS_DIR/${label}_${suffix}.err"
  local exit_file="$RESULTS_DIR/${label}_${suffix}.exit"
  local -a cmd
  cmd=(java -jar "$WALLET_JAR" "$@")

  local status
  if (
    cd "$workspace" || exit 98
    case "$env_mode" in
      ""|default)
        MASTER_PASSWORD="$MASTER_PASSWORD" \
          TRON_PRIVATE_KEY="$TRON_PRIVATE_KEY" \
          TRON_MNEMONIC="$TRON_MNEMONIC" \
          _qa_run_with_timeout "$QA_CASE_TIMEOUT" "${cmd[@]}" >"$stdout_file" 2>"$stderr_file"
        ;;
      no-password)
        unset MASTER_PASSWORD
        _qa_run_with_timeout "$QA_CASE_TIMEOUT" "${cmd[@]}" >"$stdout_file" 2>"$stderr_file"
        ;;
      *)
        echo "Unknown env mode: $env_mode" >&2
        exit 97
        ;;
    esac
  ); then
    status=0
  else
    status=$?
  fi
  printf '%s\n' "$status" > "$exit_file"
  return 0
}

qa_run_cli_capture() {
  local workspace="$1"
  local label="$2"
  local mode="$3"
  local env_mode="${4:-default}"
  shift 4

  local -a argv
  argv=(--network "$NETWORK")
  if [ "$mode" = "json" ]; then
    argv+=(--output json)
  fi
  argv+=("$@")
  qa_run_capture "$workspace" "$label" "$mode" "$env_mode" "${argv[@]}"
}

qa_run_raw_capture() {
  local workspace="$1"
  local label="$2"
  local mode="$3"
  local env_mode="${4:-default}"
  shift 4
  qa_run_capture "$workspace" "$label" "$mode" "$env_mode" "$@"
}

qa_write_result() {
  local label="$1"
  local status="$2"
  printf '%s\n' "$status" > "$RESULTS_DIR/${label}.result"
  printf '[%s] %s\n' "$label" "$status"
}

qa_extract_json_field() {
  local file="$1"
  local path="$2"
  python3 - <<'PY' "$file" "$path"
import json
import sys

payload = json.load(open(sys.argv[1], "r", encoding="utf-8"))
segments = [segment for segment in sys.argv[2].split(".") if segment]
value = payload
for segment in segments:
    if isinstance(value, dict) and segment in value:
        value = value[segment]
        continue
    raise SystemExit(1)
if isinstance(value, (dict, list)):
    print(json.dumps(value, sort_keys=True))
elif value is None:
    print("null")
else:
    print(value)
PY
}

qa_json_path_exists_in_file() {
  local file="$1"
  local path="$2"
  qa_extract_json_field "$file" "$path" >/dev/null 2>&1
}

qa_json_field_equals() {
  local file="$1"
  local path="$2"
  local expected="$3"
  local actual
  actual="$(qa_extract_json_field "$file" "$path" 2>/dev/null)" || return 1
  [ "$actual" = "$expected" ]
}

qa_auth_wallet_available() {
  [ -f "$RUNTIME_DIR/templates/auth/Wallet/.active-wallet" ]
}

qa_is_stateful_command() {
  case "$(qa_case_type "$1")" in
    stateful-*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

qa_parse_named_long() {
  local option_name="$1"
  shift
  python3 - <<'PY' "$option_name" "$@"
import sys

name = sys.argv[1]
args = sys.argv[2:]
for i, token in enumerate(args):
    if token == name:
        if i + 1 < len(args):
            print(args[i + 1])
        sys.exit(0)
    if token.startswith(name + "="):
        print(token.split("=", 1)[1])
        sys.exit(0)
sys.exit(1)
PY
}

qa_parse_named_value() {
  local option_name="$1"
  shift
  python3 - <<'PY' "$option_name" "$@"
import sys

name = sys.argv[1]
args = sys.argv[2:]
for i, token in enumerate(args):
    if token == name:
        if i + 1 < len(args):
            print(args[i + 1])
        sys.exit(0)
    if token.startswith(name + "="):
        print(token.split("=", 1)[1])
        sys.exit(0)
sys.exit(1)
PY
}

qa_preflight_stateful_case() {
  local command="$1"
  shift

  if ! qa_auth_wallet_available; then
    echo "missing auth wallet seed"
    return 1
  fi
  if [ -z "$TARGET_ADDR" ]; then
    echo "missing target address"
    return 1
  fi

  qa_load_seeds
  case "$command" in
    send-coin|freeze-balance-v2)
      local required_amount current_balance
      required_amount="$(qa_parse_named_long --amount "$@" 2>/dev/null || true)"
      [ -n "$required_amount" ] || required_amount=1
      current_balance="${MY_TRX_BALANCE:-0}"
      if [ "$current_balance" -lt "$required_amount" ]; then
        echo "insufficient TRX balance"
        return 1
      fi
      ;;
    trigger-contract|transfer-usdt|unfreeze-balance-v2)
      if [ "${MY_TRX_BALANCE:-0}" -le 0 ]; then
        echo "missing TRX balance for fees"
        return 1
      fi
      ;;
  esac
  return 0
}

qa_run_preflight_json_query() {
  local field_path="$1"
  shift
  local token label workspace out_file value
  token="$(mktemp "$RUNTIME_DIR/preflight.XXXXXX")"
  rm -f "$token"
  label="$(basename "$token")"
  workspace="$(qa_reset_workspace "$label" "empty")"
  qa_run_cli_capture "$workspace" "$label" json default "$@" >/dev/null 2>&1 || true
  out_file="$RESULTS_DIR/${label}_json.out"
  value="$(qa_extract_json_field "$out_file" "$field_path" 2>/dev/null)" || {
    rm -rf "$workspace"
    rm -f "$RESULTS_DIR/${label}_json.out" "$RESULTS_DIR/${label}_json.err" "$RESULTS_DIR/${label}_json.exit"
    return 1
  }
  rm -rf "$workspace"
  rm -f "$RESULTS_DIR/${label}_json.out" "$RESULTS_DIR/${label}_json.err" "$RESULTS_DIR/${label}_json.exit"
  printf '%s\n' "$value"
}

qa_preflight_needs_witness_wallet() {
  qa_load_seeds
  [ -n "${MY_ADDR:-}" ] || return 1
  [ -n "${WITNESS_ADDR:-}" ] || return 1
  [ "$MY_ADDR" = "$WITNESS_ADDR" ]
}

qa_preflight_can_delegate_requested_amount() {
  local owner amount resource max_size
  owner="$(qa_parse_named_value --owner "$@" 2>/dev/null || true)"
  [ -n "$owner" ] || owner="${MY_ADDR:-}"
  amount="$(qa_parse_named_long --amount "$@" 2>/dev/null || true)"
  resource="$(qa_parse_named_long --resource "$@" 2>/dev/null || true)"
  [ -n "$owner" ] || return 1
  [ -n "$amount" ] || return 1
  [ -n "$resource" ] || return 1
  max_size="$(qa_run_preflight_json_query "data.max_size" get-can-delegated-max-size --owner "$owner" --type "$resource" 2>/dev/null)" || return 1
  [ "${max_size:-0}" -ge "$amount" ]
}

qa_preflight_has_undelegatable_requested_amount() {
  local owner receiver amount resource
  owner="$(qa_parse_named_value --owner "$@" 2>/dev/null || true)"
  receiver="$(qa_parse_named_value --receiver "$@" 2>/dev/null || true)"
  amount="$(qa_parse_named_long --amount "$@" 2>/dev/null || true)"
  resource="$(qa_parse_named_long --resource "$@" 2>/dev/null || true)"
  [ -n "$owner" ] || owner="${MY_ADDR:-}"
  [ -n "$owner" ] || return 1
  [ -n "$receiver" ] || return 1
  [ -n "$amount" ] || return 1
  [ -n "$resource" ] || return 1

  local token label workspace out_file available
  token="$(mktemp "$RUNTIME_DIR/preflight.XXXXXX")"
  rm -f "$token"
  label="$(basename "$token")"
  workspace="$(qa_reset_workspace "$label" "empty")"
  qa_run_cli_capture "$workspace" "$label" json default \
    get-delegated-resource-v2 --from "$owner" --to "$receiver" >/dev/null 2>&1 || true
  out_file="$RESULTS_DIR/${label}_json.out"
  available="$(python3 - <<'PY' "$out_file" "$resource"
import json, sys, time

path = sys.argv[1]
resource = int(sys.argv[2])
now = int(time.time() * 1000)

try:
    payload = json.load(open(path, "r", encoding="utf-8"))
except Exception:
    print(0)
    raise SystemExit(0)

data = payload.get("data", {})

def g(d, *keys):
    for k in keys:
        v = d.get(k)
        if v is not None:
            return v
    return 0

def walk(node):
    total = 0
    if isinstance(node, dict):
        bw = int(g(node, "frozen_balance_for_bandwidth", "frozenBalanceForBandwidth") or 0)
        en = int(g(node, "frozen_balance_for_energy", "frozenBalanceForEnergy") or 0)
        bw_expire = int(g(node, "expire_time_for_bandwidth", "expireTimeForBandwidth") or 0)
        en_expire = int(g(node, "expire_time_for_energy", "expireTimeForEnergy") or 0)
        if resource == 0 and bw:
            if bw_expire == 0 or bw_expire < now:
                total += bw
        if resource == 1 and en:
            if en_expire == 0 or en_expire < now:
                total += en
        for value in node.values():
            total += walk(value)
    elif isinstance(node, list):
        for item in node:
            total += walk(item)
    return total

print(walk(data))
PY
)" || available=0
  rm -rf "$workspace"
  rm -f "$RESULTS_DIR/${label}_json.out" "$RESULTS_DIR/${label}_json.err" "$RESULTS_DIR/${label}_json.exit"
  [ "${available:-0}" -ge "$amount" ]
}

qa_preflight_has_available_unfreeze_v2_entry() {
  local owner
  owner="$(qa_parse_named_value --owner "$@" 2>/dev/null || true)"
  [ -n "$owner" ] || owner="${MY_ADDR:-}"
  [ -n "$owner" ] || return 1

  local token label workspace out_file has_entry
  token="$(mktemp "$RUNTIME_DIR/preflight.XXXXXX")"
  rm -f "$token"
  label="$(basename "$token")"
  workspace="$(qa_reset_workspace "$label" "empty")"
  qa_run_cli_capture "$workspace" "$label" json default \
    get-account --address "$owner" >/dev/null 2>&1 || true
  out_file="$RESULTS_DIR/${label}_json.out"
  has_entry="$(python3 - <<'PY' "$out_file"
import json, sys

try:
    payload = json.load(open(sys.argv[1], "r", encoding="utf-8"))
except Exception:
    print("false")
    raise SystemExit(0)

data = payload.get("data")

def walk(node):
    if isinstance(node, dict):
        for key, value in node.items():
            lowered = str(key).lower()
            if lowered in ("unfrozenv2", "unfrozenv2list"):
                if isinstance(value, list) and value:
                    return True
            if walk(value):
                return True
    elif isinstance(node, list):
        for item in node:
            if walk(item):
                return True
    return False

print("true" if walk(data) else "false")
PY
)" || has_entry=false
  rm -rf "$workspace"
  rm -f "$RESULTS_DIR/${label}_json.out" "$RESULTS_DIR/${label}_json.err" "$RESULTS_DIR/${label}_json.exit"
  [ "$has_entry" = "true" ]
}

qa_preflight_can_withdraw_witness_balance() {
  local owner
  owner="$(qa_parse_named_value --owner "$@" 2>/dev/null || true)"
  [ -n "$owner" ] || owner="${MY_ADDR:-}"
  [ -n "$owner" ] || return 1

  local token label workspace out_file can_withdraw
  token="$(mktemp "$RUNTIME_DIR/preflight.XXXXXX")"
  rm -f "$token"
  label="$(basename "$token")"
  workspace="$(qa_reset_workspace "$label" "empty")"
  qa_run_cli_capture "$workspace" "$label" json default \
    get-account --address "$owner" >/dev/null 2>&1 || true
  out_file="$RESULTS_DIR/${label}_json.out"
  can_withdraw="$(python3 - <<'PY' "$out_file"
import json, sys, time

try:
    payload = json.load(open(sys.argv[1], "r", encoding="utf-8"))
except Exception:
    print("false")
    raise SystemExit(0)

data = payload.get("data") if isinstance(payload, dict) else {}
if not isinstance(data, dict):
    print("false")
    raise SystemExit(0)

allowance = int(data.get("allowance", 0) or 0)
latest_withdraw_time = int(data.get("latest_withdraw_time", 0) or 0)
now = int(time.time() * 1000)
eligible_time = latest_withdraw_time <= 0 or now - latest_withdraw_time >= 24 * 60 * 60 * 1000
print("true" if data.get("is_witness") is True and allowance > 0 and eligible_time else "false")
PY
)" || can_withdraw=false
  rm -rf "$workspace"
  rm -f "$RESULTS_DIR/${label}_json.out" "$RESULTS_DIR/${label}_json.err" "$RESULTS_DIR/${label}_json.exit"
  [ "$can_withdraw" = "true" ]
}

qa_preflight_check() {
  local spec_csv="$1"
  shift
  local -a argv=("$@")
  local item threshold required_amount
  local -a specs=()
  qa_load_seeds
  IFS=',' read -r -a specs <<< "$spec_csv"
  for item in "${specs[@]-}"; do
    item="$(printf '%s' "$item" | xargs)"
    [ -z "$item" ] && continue
    case "$item" in
      none)
        ;;
      needs_auth_wallet)
        qa_auth_wallet_available || { echo "missing auth wallet seed"; return 1; }
        ;;
      needs_target_addr)
        [ -n "$TARGET_ADDR" ] || { echo "missing target address"; return 1; }
        ;;
      needs_block_seed)
        [ -n "${BLOCK_ID:-}" ] || { echo "missing block seed"; return 1; }
        ;;
      needs_tx_seed)
        [ -n "${TX_ID:-}" ] || { echo "missing tx seed"; return 1; }
        ;;
      needs_positive_trx_balance)
        [ "${MY_TRX_BALANCE:-0}" -gt 0 ] || { echo "missing TRX balance"; return 1; }
        ;;
      needs_witness_wallet)
        qa_preflight_needs_witness_wallet || { echo "auth wallet is not a witness"; return 1; }
        ;;
      needs_delegatable_resource)
        qa_preflight_can_delegate_requested_amount "${argv[@]}" \
          || { echo "delegatable resource below requested amount"; return 1; }
        ;;
      needs_undelegatable_resource)
        qa_preflight_has_undelegatable_requested_amount "${argv[@]}" \
          || { echo "undelegatable resource below requested amount"; return 1; }
        ;;
      needs_available_unfreeze_v2)
        qa_preflight_has_available_unfreeze_v2_entry "${argv[@]}" \
          || { echo "no cancelable unfreezeV2 entries available"; return 1; }
        ;;
      needs_withdrawable_witness_balance)
        qa_preflight_can_withdraw_witness_balance "${argv[@]}" \
          || { echo "no currently withdrawable witness balance"; return 1; }
        ;;
      needs_trx_balance_at_least:*)
        threshold="${item#needs_trx_balance_at_least:}"
        [ "${MY_TRX_BALANCE:-0}" -ge "$threshold" ] || { echo "TRX balance below $threshold"; return 1; }
        ;;
      legacy_stateful)
        qa_preflight_stateful_case "${argv[@]}" || return 1
        ;;
      *)
        echo "unknown preflight $item"
        return 1
        ;;
    esac
  done
  return 0
}

qa_prepare_seeds() {
  local seed_workspace auth_workspace seed_file
  seed_file="$(qa_seed_file)"
  : > "$seed_file"

  local my_addr="" first_wallet="" first_wallet_name="" first_wallet_file="" witness_addr="" my_trx_balance="0"
  if qa_has_private_key; then
    auth_workspace="$(qa_reset_workspace "_seed_auth" "auth")"
    qa_run_cli_capture "$auth_workspace" "_seed_get_address" text default get-address
    qa_run_cli_capture "$auth_workspace" "_seed_list_wallet" json default list-wallet
    qa_run_cli_capture "$auth_workspace" "_seed_list_witnesses" json default list-witnesses
    qa_run_cli_capture "$auth_workspace" "_seed_get_balance" json default get-balance

    my_addr="$(grep -o 'T[A-Za-z0-9]\{33\}' "$RESULTS_DIR/_seed_get_address_text.out" | head -1 || true)"
    first_wallet="$(python3 - <<'PY' "$RESULTS_DIR/_seed_list_wallet_json.out"
import json, sys
try:
    data = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
    wallets = data.get('data', {}).get('wallets', [])
    print(wallets[0].get('wallet-address', '') if wallets else '')
except Exception:
    print('')
PY
)"
    first_wallet_name="$(python3 - <<'PY' "$RESULTS_DIR/_seed_list_wallet_json.out"
import json, sys
try:
    data = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
    wallets = data.get('data', {}).get('wallets', [])
    print(wallets[0].get('wallet-name', '') if wallets else '')
except Exception:
    print('')
PY
)"
    if [ -n "$my_addr" ] && grep -q "$my_addr" "$RESULTS_DIR/_seed_list_witnesses_json.out"; then
      witness_addr="$my_addr"
    else
      witness_addr=""
    fi
    my_trx_balance="$(python3 - <<'PY' "$RESULTS_DIR/_seed_get_balance_json.out"
import json, sys
try:
    data = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
    payload = data.get('data', {})
    balance = payload.get('balance_sun')
    if balance is None:
        balance = payload.get('balance')
    print(int(balance) if balance is not None else 0)
except Exception:
    print(0)
PY
)"
    first_wallet_file="$(find "$RUNTIME_DIR/templates/auth/Wallet" -maxdepth 1 -type f -name '*.json' | sort | head -1 | sed "s|$RUNTIME_DIR/templates/auth/Wallet/||" || true)"

    # Auto-create witness if not already one and balance is sufficient (9999 TRX = 9999000000 SUN)
    if [ -z "$witness_addr" ] && [ -n "$my_addr" ] && [ "$my_trx_balance" -ge 9999000000 ]; then
      echo "  Creating witness for test account $my_addr ..."
      qa_run_cli_capture "$auth_workspace" "_seed_create_witness" json default \
        create-witness --url "http://qa-witness.example.com"
      local cw_success
      cw_success="$(qa_extract_json_field "$RESULTS_DIR/_seed_create_witness_json.out" "success" 2>/dev/null || true)"
      if [ "$cw_success" = "true" ] || [ "$cw_success" = "True" ]; then
        echo "  Witness created successfully."
        witness_addr="$my_addr"
        # Re-query balance after spending 9999 TRX
        qa_run_cli_capture "$auth_workspace" "_seed_get_balance" json default get-balance
        my_trx_balance="$(python3 - <<'PY' "$RESULTS_DIR/_seed_get_balance_json.out"
import json, sys
try:
    data = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
    payload = data.get('data', {})
    balance = payload.get('balance_sun')
    if balance is None:
        balance = payload.get('balance')
    print(int(balance) if balance is not None else 0)
except Exception:
    print(0)
PY
)"
      else
        echo "  WARNING: create-witness failed (account may lack funds or chain rejected it)." >&2
      fi
    elif [ -z "$witness_addr" ] && [ -n "$my_addr" ]; then
      echo "  Skipping witness creation: TRX balance ($my_trx_balance SUN) < 9999000000 SUN required."
    fi

    # Auto-freeze bandwidth (resource 0) so delegate-resource test can pass
    if [ -n "$my_addr" ] && [ "$my_trx_balance" -ge 2000000 ]; then
      local bw_max_size
      bw_max_size="$(qa_run_preflight_json_query "data.max_size" \
        get-can-delegated-max-size --owner "$my_addr" --type 0 2>/dev/null)" || bw_max_size=0
      if [ "${bw_max_size:-0}" -lt 1000000 ]; then
        echo "  Freezing 2 TRX for bandwidth (delegatable bandwidth: ${bw_max_size:-0} < 1000000) ..."
        qa_run_cli_capture "$auth_workspace" "_seed_freeze_bw" json default \
          freeze-balance-v2 --amount 2000000 --resource 0
        local fb_success
        fb_success="$(qa_extract_json_field "$RESULTS_DIR/_seed_freeze_bw_json.out" "success" 2>/dev/null || true)"
        if [ "$fb_success" = "true" ] || [ "$fb_success" = "True" ]; then
          echo "  Bandwidth frozen successfully."
          # Re-query balance after freezing
          qa_run_cli_capture "$auth_workspace" "_seed_get_balance" json default get-balance
          my_trx_balance="$(python3 - <<'PY' "$RESULTS_DIR/_seed_get_balance_json.out"
import json, sys
try:
    data = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
    payload = data.get('data', {})
    balance = payload.get('balance_sun')
    if balance is None:
        balance = payload.get('balance')
    print(int(balance) if balance is not None else 0)
except Exception:
    print(0)
PY
)"
        else
          echo "  WARNING: freeze-balance-v2 for bandwidth failed." >&2
        fi
      fi
    fi
  fi

  seed_workspace="$(qa_reset_workspace "_seed_public" "empty")"
  qa_run_cli_capture "$seed_workspace" "_seed_blocks" json default get-block-by-latest-num --count 10

  local block_id tx_id
  block_id="$(python3 - <<'PY' "$RESULTS_DIR/_seed_blocks_json.out"
import json, sys
try:
    data = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
    payload = data.get('data', {})
    result = payload.get('result')
    blocks = result if isinstance(result, list) else payload.get('block', [])
    if isinstance(blocks, list) and blocks:
        print(blocks[0].get('blockid', ''))
    else:
        print('')
except Exception:
    print('')
PY
)"
  tx_id="$(grep -o '"txid"[[:space:]]*:[[:space:]]*"[^"]*"' "$RESULTS_DIR/_seed_blocks_json.out" | head -1 | awk -F'"' '{print $4}' || true)"

  {
    printf 'MY_ADDR=%q\n' "$my_addr"
    printf 'FIRST_WALLET_ADDRESS=%q\n' "$first_wallet"
    printf 'FIRST_WALLET_NAME=%q\n' "$first_wallet_name"
    printf 'FIRST_WALLET_FILE=%q\n' "$first_wallet_file"
    printf 'WITNESS_ADDR=%q\n' "$witness_addr"
    printf 'BLOCK_ID=%q\n' "$block_id"
    printf 'TX_ID=%q\n' "$tx_id"
    printf 'MY_TRX_BALANCE=%q\n' "$my_trx_balance"
  } >> "$seed_file"
}
