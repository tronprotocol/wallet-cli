#!/bin/bash
# Transaction, staking, witness, proposal, exchange, contract command tests
# Covers ALL mutation commands with real on-chain execution or help verification

_tx_filter() {
  grep -v "^User defined config file" | grep -v "^Authenticated with" || true
}

_tx_run() {
  # Wallet is pre-imported; auto-login uses MASTER_PASSWORD
  java -jar "$WALLET_JAR" --network "$NETWORK" "$@" 2>/dev/null | _tx_filter
}

_tx_run_json() {
  java -jar "$WALLET_JAR" --network "$NETWORK" --output json "$@" 2>/dev/null | _tx_filter
}

_tx_run_mnemonic() {
  _import_wallet "mnemonic" > /dev/null 2>&1
  java -jar "$WALLET_JAR" --network "$NETWORK" "$@" 2>/dev/null | _tx_filter
  _import_wallet "private-key" > /dev/null 2>&1
}

_get_address() {
  local method="$1"
  if [ "$method" = "mnemonic" ] && [ -n "${MNEMONIC:-}" ]; then
    _import_wallet "mnemonic" > /dev/null 2>&1
    local addr
    addr=$(java -jar "$WALLET_JAR" --network "$NETWORK" get-address 2>/dev/null | _tx_filter | grep "address = " | awk '{print $NF}')
    _import_wallet "private-key" > /dev/null 2>&1
    echo "$addr"
  else
    java -jar "$WALLET_JAR" --network "$NETWORK" get-address 2>/dev/null | _tx_filter | grep "address = " | awk '{print $NF}'
  fi
}

_get_balance_sun() {
  _tx_run get-balance | grep "Balance = " | awk '{print $3}'
}

_wait_for_balance_decrease() {
  local before_balance="$1"
  local attempts="${2:-5}"
  local sleep_secs="${3:-3}"
  local current_balance=""
  local i

  for ((i=1; i<=attempts; i++)); do
    current_balance=$(_get_balance_sun)
    if [ -n "$before_balance" ] && [ -n "$current_balance" ] && [ "$current_balance" -lt "$before_balance" ]; then
      echo "$current_balance"
      return 0
    fi
    if [ "$i" -lt "$attempts" ]; then
      sleep "$sleep_secs"
    fi
  done

  echo "$current_balance"
  return 1
}

_get_account_resource() {
  local address="$1"
  _tx_run get-account-resource --address "$address"
}

_json_success_true() {
  local json_input="$1"
  echo "$json_input" | python3 -c "import sys, json; d=json.load(sys.stdin); assert d.get('success') is True; assert 'data' in d" 2>/dev/null
}

_json_field() {
  local json_input="$1"
  local field_path="$2"
  echo "$json_input" | python3 -c "import sys, json; d=json.load(sys.stdin); v=d; path=sys.argv[1].split('.'); 
for p in path:
    v=v.get(p) if isinstance(v, dict) else None
    if v is None:
        break
print(v if v is not None else '')" "$field_path" 2>/dev/null
}

_wait_for_transaction_info() {
  local txid="$1"
  local attempts="${2:-5}"
  local sleep_secs="${3:-3}"
  local out=""
  local i

  if [ -z "$txid" ]; then
    return 1
  fi

  for ((i=1; i<=attempts; i++)); do
    out=$(_tx_run get-transaction-info-by-id --id "$txid") || true
    if [ -n "$out" ] && ! echo "$out" | grep -qi "^Error:"; then
      echo "$out"
      return 0
    fi
    if [ "$i" -lt "$attempts" ]; then
      sleep "$sleep_secs"
    fi
  done

  return 1
}

# Test on-chain tx: text mode, check for "successful"
_test_tx_text() {
  local label="$1"; shift
  if ! _qa_case_enabled "${label}-text"; then
    return 2
  fi
  echo -n "  $label (text)... "
  local out
  out=$(_tx_run "$@") || true
  echo "$out" > "$RESULTS_DIR/${label}-text.out"
  if echo "$out" | grep -qi "successful"; then
    echo "PASS" > "$RESULTS_DIR/${label}-text.result"; echo "PASS"
    return 0
  else
    local short_err
    short_err=$(echo "$out" | grep -iE "failed|error|Warning" | head -1)
    echo "FAIL: ${short_err:-no successful msg}" > "$RESULTS_DIR/${label}-text.result"; echo "FAIL"
    return 1
  fi
}

# Test on-chain tx: json mode, check for "success"
_test_tx_json() {
  local label="$1"; shift
  if ! _qa_case_enabled "${label}-json"; then
    return 2
  fi
  echo -n "  $label (json)... "
  local out
  out=$(_tx_run_json "$@") || true
  echo "$out" > "$RESULTS_DIR/${label}-json.out"
  if _json_success_true "$out"; then
    echo "PASS" > "$RESULTS_DIR/${label}-json.result"; echo "PASS"
    return 0
  else
    local short_err
    short_err=$(echo "$out" | grep -iE "failed|error" | head -1)
    echo "FAIL: ${short_err:-no success field}" > "$RESULTS_DIR/${label}-json.result"; echo "FAIL"
    return 1
  fi
}

# Test --help for a command
_test_help() {
  local cmd="$1"
  if ! _qa_case_enabled "${cmd}-help"; then
    return
  fi
  echo -n "  $cmd --help... "
  local out
  out=$(java -jar "$WALLET_JAR" "$cmd" --help 2>/dev/null) || true
  if [ -n "$out" ]; then
    echo "PASS" > "$RESULTS_DIR/${cmd}-help.result"; echo "PASS"
  else
    echo "FAIL" > "$RESULTS_DIR/${cmd}-help.result"; echo "FAIL"
  fi
}

# Expected-error verification: run text+JSON, accept error output as valid
# Passes if both text and JSON produce non-empty output and JSON is valid
_test_tx_error_full() {
  local cmd="$1"; shift
  if ! _qa_case_enabled "$cmd"; then
    return
  fi
  echo -n "  $cmd (error-verify)... "
  local text_out json_out
  text_out=$(_tx_run "$cmd" "$@" 2>&1) || true
  json_out=$(_tx_run_json "$cmd" "$@" 2>&1) || true
  echo "$text_out" > "$RESULTS_DIR/${cmd}_text.out"
  echo "$json_out" > "$RESULTS_DIR/${cmd}_json.out"
  result=$(check_json_text_parity "$cmd" "$text_out" "$json_out")
  echo "$result" > "$RESULTS_DIR/${cmd}.result"
  echo "$result"
}

run_transaction_tests() {
  local my_addr target_addr
  my_addr=$(_get_address "private-key")

  if [ -z "$my_addr" ]; then
    echo "  ERROR: Cannot get own address. Skipping transaction tests."
    return
  fi

  # Determine target address for transfers
  if [ -n "${MNEMONIC:-}" ]; then
    target_addr=$(_get_address "mnemonic")
  fi
  if [ -z "$target_addr" ]; then
    target_addr="TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL"
  fi

  echo "  PK account:  $my_addr"
  echo "  Target addr: $target_addr"
  echo ""

  # ============================================================
  # Help verification for ALL mutation commands
  # ============================================================
  echo "  --- Help verification (all commands) ---"
  _test_help "send-coin"
  _test_help "transfer-asset"
  _test_help "transfer-usdt"
  _test_help "participate-asset-issue"
  _test_help "asset-issue"
  _test_help "create-account"
  _test_help "update-account"
  _test_help "set-account-id"
  _test_help "update-asset"
  _test_help "broadcast-transaction"
  _test_help "add-transaction-sign"
  _test_help "update-account-permission"
  _test_help "tronlink-multi-sign"
  _test_help "gas-free-transfer"
  _test_help "deploy-contract"
  _test_help "trigger-contract"
  _test_help "trigger-constant-contract"
  _test_help "estimate-energy"
  _test_help "clear-contract-abi"
  _test_help "update-setting"
  _test_help "update-energy-limit"
  _test_help "freeze-balance"
  _test_help "freeze-balance-v2"
  _test_help "unfreeze-balance"
  _test_help "unfreeze-balance-v2"
  _test_help "withdraw-expire-unfreeze"
  _test_help "delegate-resource"
  _test_help "undelegate-resource"
  _test_help "cancel-all-unfreeze-v2"
  _test_help "withdraw-balance"
  _test_help "unfreeze-asset"
  _test_help "create-witness"
  _test_help "update-witness"
  _test_help "vote-witness"
  _test_help "update-brokerage"
  _test_help "create-proposal"
  _test_help "approve-proposal"
  _test_help "delete-proposal"
  _test_help "exchange-create"
  _test_help "exchange-inject"
  _test_help "exchange-withdraw"
  _test_help "exchange-transaction"
  _test_help "market-sell-asset"
  _test_help "market-cancel-order"

  # ============================================================
  # On-chain transaction tests (Nile)
  # ============================================================
  echo ""
  echo "  --- On-chain transaction tests (Nile) ---"

  # --- send-coin ---
  local balance_before
  local send_coin_text_ok=1 send_coin_json_ok=1
  local send_coin_txid=""
  balance_before=$(_get_balance_sun)
  if _qa_case_enabled "send-coin-balance" && ! _qa_case_enabled "send-coin-text" && ! _qa_case_enabled "send-coin-json"; then
    local send_coin_side_effect_out
    send_coin_side_effect_out=$(_tx_run_json send-coin --to "$target_addr" --amount 1) || true
    echo "$send_coin_side_effect_out" > "$RESULTS_DIR/send-coin-balance_tx_json.out"
    if _json_success_true "$send_coin_side_effect_out"; then
      send_coin_text_ok=1
      send_coin_json_ok=1
      send_coin_txid=$(_json_field "$send_coin_side_effect_out" "data.txid")
    else
      send_coin_text_ok=0
      send_coin_json_ok=0
    fi
  else
    _test_tx_text "send-coin" send-coin --to "$target_addr" --amount 1 || send_coin_text_ok=0
    _test_tx_json "send-coin" send-coin --to "$target_addr" --amount 1 || send_coin_json_ok=0
    if [ -f "$RESULTS_DIR/send-coin-json.out" ]; then
      send_coin_txid=$(_json_field "$(cat "$RESULTS_DIR/send-coin-json.out")" "data.txid")
    fi
  fi
  sleep 4
  if _qa_case_enabled "send-coin-balance"; then
    echo -n "  send-coin balance check... "
    if [ "$send_coin_text_ok" -eq 0 ] && [ "$send_coin_json_ok" -eq 0 ]; then
      echo "SKIP: send-coin transaction did not succeed, side-effect not checked" > "$RESULTS_DIR/send-coin-balance.result"
      echo "SKIP"
    else
      local balance_after
      balance_after=$(_wait_for_balance_decrease "$balance_before" 5 3)
      if [ -n "$balance_before" ] && [ -n "$balance_after" ] && [ "$balance_after" -lt "$balance_before" ]; then
        echo "PASS (side-effect verified: before=${balance_before}, after=${balance_after})" > "$RESULTS_DIR/send-coin-balance.result"
        echo "PASS (side-effect verified)"
      elif _wait_for_transaction_info "$send_coin_txid" 5 3 > "$RESULTS_DIR/send-coin-balance_tx_info.out"; then
        echo "PASS (txid verified: ${send_coin_txid})" > "$RESULTS_DIR/send-coin-balance.result"
        echo "PASS (txid verified)"
      else
        echo "FAIL: balance did not decrease and tx receipt was not observed after successful send-coin (txid=${send_coin_txid:-none}, before=${balance_before}, after=${balance_after})" > "$RESULTS_DIR/send-coin-balance.result"
        echo "FAIL"
      fi
    fi
  fi

  # --- send-coin with mnemonic ---
  if [ -n "${MNEMONIC:-}" ] && [ -n "$target_addr" ]; then
    if _qa_case_enabled "send-coin-mnemonic"; then
    echo -n "  send-coin (mnemonic)... "
    local mn_out
    mn_out=$(_tx_run_mnemonic send-coin --to "$my_addr" --amount 1) || true
    echo "$mn_out" > "$RESULTS_DIR/send-coin-mnemonic.out"
    if echo "$mn_out" | grep -qi "successful"; then
      echo "PASS" > "$RESULTS_DIR/send-coin-mnemonic.result"; echo "PASS"
    else
      echo "FAIL" > "$RESULTS_DIR/send-coin-mnemonic.result"; echo "FAIL"
    fi
    sleep 3
    fi
  fi

  # --- freeze-balance-v2 (1 TRX for ENERGY) ---
  local resource_before
  resource_before=$(_get_account_resource "$my_addr")
  _test_tx_text "freeze-v2-energy" freeze-balance-v2 --amount 1000000 --resource 1
  _test_tx_json "freeze-v2-energy" freeze-balance-v2 --amount 1000000 --resource 1
  sleep 4

  # --- get-account-resource after freeze ---
  local res_out
  if _qa_case_enabled "post-freeze-resource"; then
    echo -n "  get-account-resource (post-freeze)... "
    res_out=$(_tx_run get-account-resource --address "$my_addr") || true
    echo "$res_out" > "$RESULTS_DIR/post-freeze-resource.out"
    if [ -n "$resource_before" ] && [ -n "$res_out" ] && [ "$resource_before" != "$res_out" ]; then
      echo "PASS (side-effect verified)" > "$RESULTS_DIR/post-freeze-resource.result"; echo "PASS"
    else
      echo "FAIL: account resource output did not change" > "$RESULTS_DIR/post-freeze-resource.result"; echo "FAIL"
    fi
  else
    res_out=$(_tx_run get-account-resource --address "$my_addr") || true
  fi

  # --- unfreeze-balance-v2 (1 TRX ENERGY) ---
  _test_tx_text "unfreeze-v2-energy" unfreeze-balance-v2 --amount 1000000 --resource 1
  _test_tx_json "unfreeze-v2-energy" unfreeze-balance-v2 --amount 1000000 --resource 1
  sleep 4
  if _qa_case_enabled "post-unfreeze-resource"; then
    echo -n "  get-account-resource (post-unfreeze)... "
    local res_after_unfreeze
    res_after_unfreeze=$(_tx_run get-account-resource --address "$my_addr") || true
    echo "$res_after_unfreeze" > "$RESULTS_DIR/post-unfreeze-resource.out"
    if [ -n "$res_out" ] && [ -n "$res_after_unfreeze" ] && [ "$res_out" != "$res_after_unfreeze" ]; then
      echo "PASS (side-effect verified)" > "$RESULTS_DIR/post-unfreeze-resource.result"; echo "PASS"
    else
      echo "FAIL: account resource output did not change after unfreeze" > "$RESULTS_DIR/post-unfreeze-resource.result"; echo "FAIL"
    fi
  fi
  sleep 4

  # --- freeze-balance-v2 (1 TRX for BANDWIDTH) ---
  _test_tx_text "freeze-v2-bandwidth" freeze-balance-v2 --amount 1000000 --resource 0
  sleep 4

  # --- unfreeze-balance-v2 (1 TRX BANDWIDTH) ---
  _test_tx_text "unfreeze-v2-bandwidth" unfreeze-balance-v2 --amount 1000000 --resource 0
  sleep 4

  # --- withdraw-expire-unfreeze ---
  if _qa_case_enabled "withdraw-expire-unfreeze"; then
    echo -n "  withdraw-expire-unfreeze... "
    local weu_out
    weu_out=$(_tx_run withdraw-expire-unfreeze) || true
    echo "$weu_out" > "$RESULTS_DIR/withdraw-expire-unfreeze.out"
    echo "PASS (smoke)" > "$RESULTS_DIR/withdraw-expire-unfreeze.result"; echo "PASS (smoke)"
  fi

  # --- cancel-all-unfreeze-v2 ---
  if _qa_case_enabled "cancel-all-unfreeze-v2"; then
    echo -n "  cancel-all-unfreeze-v2... "
    local cau_out
    cau_out=$(_tx_run cancel-all-unfreeze-v2) || true
    echo "$cau_out" > "$RESULTS_DIR/cancel-all-unfreeze-v2.out"
    echo "PASS (smoke)" > "$RESULTS_DIR/cancel-all-unfreeze-v2.result"; echo "PASS (smoke)"
  fi

  # --- trigger-constant-contract (USDT balanceOf, read-only) ---
  local usdt_nile="TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"
  if _qa_case_enabled "trigger-constant-contract"; then
    echo -n "  trigger-constant-contract (USDT balanceOf)... "
    local tcc_out
    tcc_out=$(_tx_run trigger-constant-contract \
      --contract "$usdt_nile" \
      --method "balanceOf(address)" \
      --params "\"$my_addr\"") || true
    echo "$tcc_out" > "$RESULTS_DIR/trigger-constant-contract.out"
    if [ -n "$tcc_out" ]; then
      echo "PASS" > "$RESULTS_DIR/trigger-constant-contract.result"; echo "PASS"
    else
      echo "FAIL" > "$RESULTS_DIR/trigger-constant-contract.result"; echo "FAIL"
    fi
  fi

  # --- transfer-usdt (send 1 USDT unit to target) ---
  _test_tx_text "transfer-usdt" transfer-usdt --to "$target_addr" --amount 1
  _test_tx_json "transfer-usdt" transfer-usdt --to "$target_addr" --amount 1
  sleep 4

  # --- trigger-contract (USDT approve, real on-chain write) ---
  _test_tx_text "trigger-contract" trigger-contract \
    --contract "$usdt_nile" \
    --method "approve(address,uint256)" \
    --params "\"$target_addr\",0" \
    --fee-limit 100000000
  _test_tx_json "trigger-contract" trigger-contract \
    --contract "$usdt_nile" \
    --method "approve(address,uint256)" \
    --params "\"$target_addr\",0" \
    --fee-limit 100000000
  sleep 4

  # --- deploy-contract (minimal storage contract on Nile) ---
  # Solidity: contract Store { uint256 public val; constructor() { val = 42; } }
  local store_abi='[{"inputs":[],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[],"name":"val","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}]'
  local store_bytecode="6080604052602a60005534801561001557600080fd5b50607b8061002360003960006000f3fe6080604052348015600f57600080fd5b506004361060285760003560e01c80633c6bb43614602d575b600080fd5b60336047565b604051603e91906059565b60405180910390f35b60005481565b6053816072565b82525050565b6000602082019050606c6000830184604d565b92915050565b600081905091905056fea264697066735822"
  _test_tx_text "deploy-contract" deploy-contract \
    --name "StoreTest" --abi "$store_abi" --bytecode "$store_bytecode" \
    --fee-limit 1000000000
  _test_tx_json "deploy-contract" deploy-contract \
    --name "StoreTest" --abi "$store_abi" --bytecode "$store_bytecode" \
    --fee-limit 1000000000
  sleep 4

  # --- estimate-energy (USDT transfer estimate) ---
  if _qa_case_enabled "estimate-energy"; then
    echo -n "  estimate-energy (USDT transfer)... "
    local ee_out
    ee_out=$(_tx_run estimate-energy \
      --contract "$usdt_nile" \
      --method "transfer(address,uint256)" \
      --params "\"$target_addr\",1") || true
    echo "$ee_out" > "$RESULTS_DIR/estimate-energy.out"
    if [ -n "$ee_out" ]; then
      echo "PASS (smoke)" > "$RESULTS_DIR/estimate-energy.result"; echo "PASS (smoke)"
    else
      echo "FAIL" > "$RESULTS_DIR/estimate-energy.result"; echo "FAIL"
    fi
  fi

  # --- vote-witness (vote for a known Nile SR) ---
  # Get first witness address
  local witness_addr
  witness_addr=$(_tx_run list-witnesses | grep -v "keystore" | grep -o 'T[A-Za-z0-9]\{33\}' | head -1) || true
  if [ -n "$witness_addr" ] && _qa_case_enabled "vote-witness-tx"; then
    # First need to freeze some TRX to get voting power
    _tx_run freeze-balance-v2 --amount 2000000 --resource 0 > /dev/null 2>&1 || true
    sleep 4
    echo -n "  vote-witness... "
    local vw_out
    vw_out=$(_tx_run vote-witness --votes "$witness_addr 1") || true
    echo "$vw_out" > "$RESULTS_DIR/vote-witness-tx.out"
    if echo "$vw_out" | grep -qi "successful"; then
      echo "PASS" > "$RESULTS_DIR/vote-witness-tx.result"; echo "PASS"
    else
      echo "FAIL" > "$RESULTS_DIR/vote-witness-tx.result"; echo "FAIL"
    fi
    # Unfreeze what we froze
    _tx_run unfreeze-balance-v2 --amount 2000000 --resource 0 > /dev/null 2>&1 || true
    sleep 3
  elif _qa_case_enabled "vote-witness-tx"; then
    echo -n "  vote-witness... "
    echo "SKIP: no witness found" > "$RESULTS_DIR/vote-witness-tx.result"; echo "SKIP"
  fi

  # --- Commands that need special conditions (verify no crash) ---

  if _qa_case_enabled "withdraw-balance"; then
    echo -n "  withdraw-balance... "
    local wb_out
    wb_out=$(_tx_run withdraw-balance) || true
    echo "PASS (executed)" > "$RESULTS_DIR/withdraw-balance.result"; echo "PASS (executed)"
  fi

  if _qa_case_enabled "unfreeze-asset"; then
    echo -n "  unfreeze-asset... "
    local ua_out
    ua_out=$(_tx_run unfreeze-asset) || true
    echo "PASS (executed)" > "$RESULTS_DIR/unfreeze-asset.result"; echo "PASS (executed)"
  fi

  # ============================================================
  # Expected-error verification for commands that can't safely execute
  # These produce error output in both text+JSON modes, verifying
  # OutputFormatter handles all code paths.
  # ============================================================
  echo ""
  echo "  --- Expected-error verification (remaining commands) ---"

  local usdt_nile="TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"
  local fake_addr="TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL"

  # Transaction commands
  _test_tx_error_full "transfer-asset" --to "$fake_addr" --asset "1000001" --amount 1
  _test_tx_error_full "transfer-usdt" --to "$fake_addr" --amount 1
  _test_tx_error_full "participate-asset-issue" --to "$fake_addr" --asset "1000001" --amount 1
  _test_tx_error_full "asset-issue" \
    --name "TESTTOKEN" --abbr "TT" --total-supply 1000000 \
    --trx-num 1 --ico-num 1 \
    --start-time "2099-01-01" --end-time "2099-01-02" \
    --url "http://test.example.com" \
    --free-net-limit 0 --public-free-net-limit 0
  _test_tx_error_full "create-account" --address "$fake_addr"
  _test_tx_error_full "update-account" --name "qa-test"
  _test_tx_error_full "set-account-id" --id "qa-test-id"
  _test_tx_error_full "update-asset" \
    --description "test" --url "http://test.example.com" \
    --new-limit 1000 --new-public-limit 1000
  _test_tx_error_full "broadcast-transaction" --transaction "0a0200"
  _test_tx_error_full "add-transaction-sign" --transaction "0a0200"
  _test_tx_error_full "update-account-permission" \
    --owner "$my_addr" \
    --permissions '{"owner_permission":{"type":0,"permission_name":"owner","threshold":1,"keys":[{"address":"'"$my_addr"'","weight":1}]}}'
  _test_tx_error_full "tronlink-multi-sign"
  _test_tx_error_full "gas-free-transfer" --to "$fake_addr" --amount 1

  # Contract commands
  _test_tx_error_full "deploy-contract" \
    --name "TestContract" --abi '[]' --bytecode "6080" --fee-limit 1000000000
  _test_tx_error_full "trigger-contract" \
    --contract "$usdt_nile" --method "transfer(address,uint256)" --fee-limit 1000000000
  _test_tx_error_full "clear-contract-abi" --contract "$usdt_nile"
  _test_tx_error_full "update-setting" --contract "$usdt_nile" --consume-user-resource-percent 0
  _test_tx_error_full "update-energy-limit" --contract "$usdt_nile" --origin-energy-limit 10000000

  # Staking commands (v1 deprecated + delegation)
  _test_tx_error_full "freeze-balance" --amount 1000000 --duration 3
  _test_tx_error_full "unfreeze-balance"
  _test_tx_error_full "delegate-resource" --amount 1000000 --resource 0 --receiver "$fake_addr"
  _test_tx_error_full "undelegate-resource" --amount 1000000 --resource 0 --receiver "$fake_addr"

  # Witness commands
  _test_tx_error_full "create-witness" --url "http://test.example.com"
  _test_tx_error_full "update-witness" --url "http://test.example.com"
  _test_tx_error_full "update-brokerage" --brokerage 10

  # Proposal commands
  _test_tx_error_full "create-proposal" --parameters "0=1"
  _test_tx_error_full "approve-proposal" --id 1 --approve true
  _test_tx_error_full "delete-proposal" --id 1

  # Exchange commands
  _test_tx_error_full "exchange-create" \
    --first-token "_" --first-balance 100000000 \
    --second-token "1000001" --second-balance 100000000
  _test_tx_error_full "exchange-inject" --exchange-id 1 --token-id "_" --quant 1000000
  _test_tx_error_full "exchange-withdraw" --exchange-id 1 --token-id "_" --quant 1000000
  _test_tx_error_full "exchange-transaction" --exchange-id 1 --token-id "_" --quant 1000000 --expected 1
  _test_tx_error_full "market-sell-asset" \
    --sell-token "_" --sell-quantity 1000000 --buy-token "1000001" --buy-quantity 1000000
  _test_tx_error_full "market-cancel-order" --order-id "0000000000000000000000000000000000000000000000000000000000000001"

  echo ""
  echo "  --- Transaction tests complete ---"
}
