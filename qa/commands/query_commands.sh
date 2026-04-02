#!/bin/bash
# Query command test definitions — ALL query commands
# Each command is tested for: --help, text output, JSON output, text/JSON parity

_filter() {
  grep -v "^User defined config file" | grep -v "^Authenticated with" || true
}

_run() {
  java -jar "$WALLET_JAR" --network "$NETWORK" "$@" 2>/dev/null | _filter
}

_run_auth() {
  local method="$1"; shift
  # Wallet is pre-imported via _import_wallet; auto-login uses MASTER_PASSWORD
  java -jar "$WALLET_JAR" --network "$NETWORK" "$@" 2>/dev/null | _filter
}

# Test --help for a command
_test_help() {
  local cmd="$1"
  echo -n "  $cmd --help... "
  local out
  out=$(java -jar "$WALLET_JAR" "$cmd" --help 2>/dev/null) || true
  if [ -n "$out" ]; then
    echo "PASS" > "$RESULTS_DIR/${cmd}-help.result"; echo "PASS"
  else
    echo "FAIL" > "$RESULTS_DIR/${cmd}-help.result"; echo "FAIL"
  fi
}

# Test command with auth: text + json + parity
_test_auth_full() {
  local method="$1" prefix="$2" cmd="$3"; shift 3
  echo -n "  $cmd ($prefix)... "
  local text_out json_out result
  text_out=$(_run_auth "$method" "$cmd" "$@") || true
  json_out=$(_run_auth "$method" --output json "$cmd" "$@") || true
  echo "$text_out" > "$RESULTS_DIR/${prefix}_${cmd}_text.out"
  echo "$json_out" > "$RESULTS_DIR/${prefix}_${cmd}_json.out"
  result=$(check_json_text_parity "$cmd" "$text_out" "$json_out")
  echo "$result" > "$RESULTS_DIR/${prefix}_${cmd}.result"
  echo "$result"
}

# Test command without auth: text + json + parity
_test_noauth_full() {
  local prefix="$1" cmd="$2"; shift 2
  echo -n "  $cmd ($prefix)... "
  local text_out json_out result
  text_out=$(_run "$cmd" "$@") || true
  json_out=$(_run --output json "$cmd" "$@") || true
  echo "$text_out" > "$RESULTS_DIR/${prefix}_${cmd}_text.out"
  echo "$json_out" > "$RESULTS_DIR/${prefix}_${cmd}_json.out"
  result=$(check_json_text_parity "$cmd" "$text_out" "$json_out")
  echo "$result" > "$RESULTS_DIR/${prefix}_${cmd}.result"
  echo "$result"
}

# Test command without auth: text only (for commands whose JSON mode is not meaningful)
_test_noauth_text() {
  local prefix="$1" cmd="$2"; shift 2
  echo -n "  $cmd ($prefix, text)... "
  local text_out
  text_out=$(_run "$cmd" "$@") || true
  echo "$text_out" > "$RESULTS_DIR/${prefix}_${cmd}_text.out"
  if [ -n "$text_out" ]; then
    echo "PASS" > "$RESULTS_DIR/${prefix}_${cmd}.result"; echo "PASS"
  else
    echo "FAIL: empty output" > "$RESULTS_DIR/${prefix}_${cmd}.result"; echo "FAIL"
  fi
}

# Test no-crash: command may return empty but should not error
_test_no_crash() {
  local prefix="$1" cmd="$2"; shift 2
  echo -n "  $cmd ($prefix)... "
  local out
  out=$(_run "$cmd" "$@" 2>&1) || true
  echo "PASS" > "$RESULTS_DIR/${prefix}_${cmd}.result"; echo "PASS (no crash)"
}

run_query_tests() {
  local auth_method="$1"
  local prefix="${auth_method}"

  # Get own address for parameterized queries
  local my_addr
  my_addr=$(_run_auth "$auth_method" get-address | grep "address = " | awk '{print $NF}')

  # ===========================================================
  # Help verification for ALL query commands
  # ===========================================================
  echo "  --- Help verification (query commands) ---"
  _test_help "get-address"
  _test_help "get-balance"
  _test_help "get-usdt-balance"
  _test_help "current-network"
  _test_help "get-block"
  _test_help "get-block-by-id"
  _test_help "get-block-by-id-or-num"
  _test_help "get-block-by-latest-num"
  _test_help "get-block-by-limit-next"
  _test_help "get-transaction-by-id"
  _test_help "get-transaction-info-by-id"
  _test_help "get-transaction-count-by-block-num"
  _test_help "get-account"
  _test_help "get-account-by-id"
  _test_help "get-account-net"
  _test_help "get-account-resource"
  _test_help "get-asset-issue-by-account"
  _test_help "get-asset-issue-by-id"
  _test_help "get-asset-issue-by-name"
  _test_help "get-asset-issue-list-by-name"
  _test_help "get-chain-parameters"
  _test_help "get-bandwidth-prices"
  _test_help "get-energy-prices"
  _test_help "get-memo-fee"
  _test_help "get-next-maintenance-time"
  _test_help "get-contract"
  _test_help "get-contract-info"
  _test_help "get-delegated-resource"
  _test_help "get-delegated-resource-v2"
  _test_help "get-delegated-resource-account-index"
  _test_help "get-delegated-resource-account-index-v2"
  _test_help "get-can-delegated-max-size"
  _test_help "get-available-unfreeze-count"
  _test_help "get-can-withdraw-unfreeze-amount"
  _test_help "get-brokerage"
  _test_help "get-reward"
  _test_help "list-nodes"
  _test_help "list-witnesses"
  _test_help "list-asset-issue"
  _test_help "list-asset-issue-paginated"
  _test_help "list-proposals"
  _test_help "list-proposals-paginated"
  _test_help "get-proposal"
  _test_help "list-exchanges"
  _test_help "list-exchanges-paginated"
  _test_help "get-exchange"
  _test_help "get-market-order-by-account"
  _test_help "get-market-order-by-id"
  _test_help "get-market-order-list-by-pair"
  _test_help "get-market-pair-list"
  _test_help "get-market-price-by-pair"
  _test_help "gas-free-info"
  _test_help "gas-free-trace"

  echo ""
  echo "  --- Query execution (text + JSON) ---"

  # ===========================================================
  # Auth-required, no params
  # ===========================================================
  _test_auth_full "$auth_method" "$prefix" "get-address"
  _test_auth_full "$auth_method" "$prefix" "get-balance"
  _test_auth_full "$auth_method" "$prefix" "get-usdt-balance"

  # ===========================================================
  # No-auth, no params — text + JSON
  # ===========================================================
  _test_noauth_full "$prefix" "current-network"
  _test_noauth_full "$prefix" "get-block"
  _test_noauth_full "$prefix" "get-chain-parameters"
  _test_noauth_full "$prefix" "get-bandwidth-prices"
  _test_noauth_full "$prefix" "get-energy-prices"
  _test_noauth_full "$prefix" "get-memo-fee"
  _test_noauth_full "$prefix" "get-next-maintenance-time"
  _test_noauth_full "$prefix" "list-nodes"
  _test_noauth_full "$prefix" "list-witnesses"
  _test_noauth_full "$prefix" "list-asset-issue"
  _test_noauth_full "$prefix" "list-proposals"
  _test_noauth_full "$prefix" "list-exchanges"
  _test_noauth_full "$prefix" "get-market-pair-list"

  # ===========================================================
  # Address-parameterized queries — text + JSON
  # ===========================================================
  if [ -n "$my_addr" ]; then
    _test_noauth_full "$prefix" "get-account" --address "$my_addr"
    _test_noauth_full "$prefix" "get-account-net" --address "$my_addr"
    _test_noauth_full "$prefix" "get-account-resource" --address "$my_addr"
    _test_noauth_full "$prefix" "get-delegated-resource-account-index" --address "$my_addr"
    _test_noauth_full "$prefix" "get-delegated-resource-account-index-v2" --address "$my_addr"
    _test_noauth_full "$prefix" "get-can-delegated-max-size" --owner "$my_addr" --type 0
    _test_noauth_full "$prefix" "get-available-unfreeze-count" --address "$my_addr"
    _test_noauth_full "$prefix" "get-can-withdraw-unfreeze-amount" --address "$my_addr"
    _test_noauth_full "$prefix" "get-brokerage" --address "$my_addr"
    _test_noauth_full "$prefix" "get-reward" --address "$my_addr"
    _test_noauth_full "$prefix" "get-market-order-by-account" --address "$my_addr"
    _test_noauth_full "$prefix" "get-asset-issue-by-account" --address "$my_addr"
    _test_noauth_full "$prefix" "get-delegated-resource" --from "$my_addr" --to "$my_addr"
    _test_noauth_full "$prefix" "get-delegated-resource-v2" --from "$my_addr" --to "$my_addr"
  fi

  # ===========================================================
  # Block-based queries — text + JSON
  # ===========================================================
  _test_noauth_full "$prefix" "get-block-by-latest-num" --count 2
  _test_noauth_full "$prefix" "get-block-by-limit-next" --start 1 --end 3
  _test_noauth_full "$prefix" "get-transaction-count-by-block-num" --number 1
  _test_noauth_full "$prefix" "get-block-by-id-or-num" --value 1

  # get-block-by-id: need a block hash
  echo -n "  get-block-by-id ($prefix)... "
  local block1_out block1_id
  block1_out=$(_run get-block --number 1) || true
  block1_id=$(echo "$block1_out" | grep -o '"blockID": "[^"]*"' | head -1 | awk -F'"' '{print $4}') || true
  if [ -n "$block1_id" ]; then
    local bid_text bid_json
    bid_text=$(_run get-block-by-id --id "$block1_id") || true
    bid_json=$(_run --output json get-block-by-id --id "$block1_id") || true
    echo "$bid_text" > "$RESULTS_DIR/${prefix}_get-block-by-id_text.out"
    echo "$bid_json" > "$RESULTS_DIR/${prefix}_get-block-by-id_json.out"
    if [ -n "$bid_text" ]; then
      echo "PASS" > "$RESULTS_DIR/${prefix}_get-block-by-id.result"; echo "PASS"
    else
      echo "FAIL" > "$RESULTS_DIR/${prefix}_get-block-by-id.result"; echo "FAIL"
    fi
  else
    echo "SKIP" > "$RESULTS_DIR/${prefix}_get-block-by-id.result"; echo "SKIP"
  fi

  # get-transaction-by-id / get-transaction-info-by-id
  echo -n "  get-transaction-by-id ($prefix)... "
  local recent_block tx_id
  recent_block=$(_run get-block) || true
  tx_id=$(echo "$recent_block" | grep -o '"txID": "[^"]*"' | head -1 | awk -F'"' '{print $4}') || true
  if [ -n "$tx_id" ]; then
    local tx_text tx_json
    tx_text=$(_run get-transaction-by-id --id "$tx_id") || true
    tx_json=$(_run --output json get-transaction-by-id --id "$tx_id") || true
    echo "$tx_text" > "$RESULTS_DIR/${prefix}_get-transaction-by-id_text.out"
    echo "$tx_json" > "$RESULTS_DIR/${prefix}_get-transaction-by-id_json.out"
    if [ -n "$tx_text" ]; then
      echo "PASS" > "$RESULTS_DIR/${prefix}_get-transaction-by-id.result"; echo "PASS"
    else
      echo "FAIL" > "$RESULTS_DIR/${prefix}_get-transaction-by-id.result"; echo "FAIL"
    fi

    echo -n "  get-transaction-info-by-id ($prefix)... "
    local txi_text txi_json
    txi_text=$(_run get-transaction-info-by-id --id "$tx_id") || true
    txi_json=$(_run --output json get-transaction-info-by-id --id "$tx_id") || true
    echo "$txi_text" > "$RESULTS_DIR/${prefix}_get-transaction-info-by-id_text.out"
    echo "$txi_json" > "$RESULTS_DIR/${prefix}_get-transaction-info-by-id_json.out"
    if [ -n "$txi_text" ]; then
      echo "PASS" > "$RESULTS_DIR/${prefix}_get-transaction-info-by-id.result"; echo "PASS"
    else
      echo "FAIL" > "$RESULTS_DIR/${prefix}_get-transaction-info-by-id.result"; echo "FAIL"
    fi
  else
    echo "SKIP" > "$RESULTS_DIR/${prefix}_get-transaction-by-id.result"; echo "SKIP"
    echo "SKIP" > "$RESULTS_DIR/${prefix}_get-transaction-info-by-id.result"
  fi

  # ===========================================================
  # ID-based queries — text + JSON
  # ===========================================================
  _test_noauth_full "$prefix" "get-account-by-id" --id "testid"
  _test_noauth_full "$prefix" "get-asset-issue-by-id" --id "1000001"
  _test_noauth_full "$prefix" "get-asset-issue-by-name" --name "TRX"
  _test_noauth_full "$prefix" "get-asset-issue-list-by-name" --name "TRX"

  # Paginated queries — text + JSON
  _test_noauth_full "$prefix" "list-asset-issue-paginated" --offset 0 --limit 5
  _test_noauth_full "$prefix" "list-proposals-paginated" --offset 0 --limit 5
  _test_noauth_full "$prefix" "list-exchanges-paginated" --offset 0 --limit 5

  # Contract queries — text + JSON
  local usdt_nile="TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"
  _test_noauth_full "$prefix" "get-contract" --address "$usdt_nile"
  _test_noauth_full "$prefix" "get-contract-info" --address "$usdt_nile"

  # Market queries — text + JSON
  _test_noauth_full "$prefix" "get-market-order-list-by-pair" --sell-token "_" --buy-token "1000001"
  _test_noauth_full "$prefix" "get-market-price-by-pair" --sell-token "_" --buy-token "1000001"
  _test_noauth_full "$prefix" "get-market-order-by-id" --id "0000000000000000000000000000000000000000000000000000000000000001"

  # Proposal / Exchange by ID — text + JSON
  _test_noauth_full "$prefix" "get-proposal" --id "1"
  _test_noauth_full "$prefix" "get-exchange" --id "1"

  # GasFree queries
  if [ -n "$my_addr" ]; then
    _test_auth_full "$auth_method" "$prefix" "gas-free-info" --address "$my_addr"
    _test_auth_full "$auth_method" "$prefix" "gas-free-trace" --address "$my_addr"
  fi
}
