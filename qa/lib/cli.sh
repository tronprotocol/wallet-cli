#!/bin/bash

qa_manifest_line() {
  local command="$1"
  awk -F'|' -v cmd="$command" '$1 == cmd { print; exit }' "$MANIFEST_FILE"
}

qa_manifest_field() {
  local command="$1"
  local field="$2"
  qa_manifest_line "$command" | awk -F'|' -v idx="$field" '{ print $idx }'
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
        MASTER_PASSWORD="$MASTER_PASSWORD" TRON_TEST_APIKEY="$PRIVATE_KEY" \
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

qa_prepare_templates() {
  mkdir -p "$RUNTIME_DIR/templates/empty"
  if qa_has_private_key; then
    qa_import_template_wallet "$RUNTIME_DIR/templates/auth" private-key
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
  eval "printf '%s' \"\${$1:-}\""
}

qa_substitute_placeholders() {
  local args="$1"
  qa_load_seeds

  args="${args//\{\{NETWORK\}\}/$NETWORK}"
  args="${args//\{\{TARGET_ADDR\}\}/$TARGET_ADDR}"
  args="${args//\{\{USDT_NILE\}\}/$USDT_NILE}"
  args="${args//\{\{FAKE_ID_64\}\}/$FAKE_ID_64}"
  args="${args//\{\{PRIVATE_KEY\}\}/$PRIVATE_KEY}"
  args="${args//\{\{MNEMONIC\}\}/$MNEMONIC}"
  args="${args//\{\{MASTER_PASSWORD\}\}/$MASTER_PASSWORD}"
  args="${args//\{\{ALT_PASSWORD\}\}/$ALT_PASSWORD}"
  args="${args//\{\{MY_ADDR\}\}/${MY_ADDR:-}}"
  args="${args//\{\{FIRST_WALLET_ADDRESS\}\}/${FIRST_WALLET_ADDRESS:-}}"
  args="${args//\{\{BLOCK_ID\}\}/${BLOCK_ID:-}}"
  args="${args//\{\{TX_ID\}\}/${TX_ID:-}}"
  args="${args//\{\{WITNESS_ADDR\}\}/${WITNESS_ADDR:-}}"

  printf '%s' "$args"
}

qa_unresolved_placeholders() {
  local args="$1"
  (printf '%s' "$args" | grep -o '{{[^}]\+}}' || true) | tr '\n' ' ' | sed 's/[[:space:]]*$//'
}

qa_run_cli_capture() {
  local workspace="$1"
  local label="$2"
  local mode="$3"
  shift 3

  local stdout_file="$RESULTS_DIR/${label}_${mode}.out"
  local stderr_file="$RESULTS_DIR/${label}_${mode}.err"
  local exit_file="$RESULTS_DIR/${label}_${mode}.exit"
  local -a cmd

  cmd=(java -jar "$WALLET_JAR")
  if [ "$mode" = "json" ]; then
    cmd+=(--output json)
  fi
  cmd+=(--network "$NETWORK")
  cmd+=("$@")

  local status
  if (
    cd "$workspace" || exit 98
    MASTER_PASSWORD="$MASTER_PASSWORD" "${cmd[@]}" >"$stdout_file" 2>"$stderr_file"
  ); then
    status=0
  else
    status=$?
  fi
  printf '%s\n' "$status" > "$exit_file"
  return 0
}

qa_run_raw_capture() {
  local workspace="$1"
  local label="$2"
  shift 2

  local stdout_file="$RESULTS_DIR/${label}_text.out"
  local stderr_file="$RESULTS_DIR/${label}_text.err"
  local exit_file="$RESULTS_DIR/${label}_text.exit"
  local -a cmd
  cmd=(java -jar "$WALLET_JAR" "$@")

  local status
  if (
    cd "$workspace" || exit 98
    MASTER_PASSWORD="$MASTER_PASSWORD" "${cmd[@]}" >"$stdout_file" 2>"$stderr_file"
  ); then
    status=0
  else
    status=$?
  fi
  printf '%s\n' "$status" > "$exit_file"
  return 0
}

qa_write_result() {
  local label="$1"
  local status="$2"
  printf '%s\n' "$status" > "$RESULTS_DIR/${label}.result"
  printf '[%s] %s\n' "$label" "$status"
}

qa_prepare_seeds() {
  local seed_workspace auth_workspace seed_file
  seed_file="$(qa_seed_file)"
  : > "$seed_file"

  local my_addr="" first_wallet="" witness_addr=""
  if qa_has_private_key; then
    auth_workspace="$(qa_reset_workspace "_seed_auth" "auth")"
    qa_run_cli_capture "$auth_workspace" "_seed_get_address" text get-address
    qa_run_cli_capture "$auth_workspace" "_seed_list_wallet" json list-wallet
    qa_run_cli_capture "$auth_workspace" "_seed_list_witnesses" json list-witnesses

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
    witness_addr="$(grep -o 'T[A-Za-z0-9]\{33\}' "$RESULTS_DIR/_seed_list_witnesses_json.out" | head -1 || true)"
  fi

  seed_workspace="$(qa_reset_workspace "_seed_public" "empty")"
  qa_run_cli_capture "$seed_workspace" "_seed_blocks" json get-block-by-latest-num --count 10

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
    printf 'WITNESS_ADDR=%q\n' "$witness_addr"
    printf 'BLOCK_ID=%q\n' "$block_id"
    printf 'TX_ID=%q\n' "$tx_id"
  } >> "$seed_file"
}
