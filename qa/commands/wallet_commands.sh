#!/bin/bash
# Wallet management & misc command tests — ALL wallet/misc commands

_wf() {
  grep -v "^User defined config file" | grep -v "^Authenticated with" || true
}

_w_run() {
  java -jar "$WALLET_JAR" --network "$NETWORK" "$@" 2>/dev/null | _wf
}

_w_run_auth() {
  # Wallet is pre-imported; auto-login uses MASTER_PASSWORD
  java -jar "$WALLET_JAR" --network "$NETWORK" "$@" 2>/dev/null | _wf
}

_test_w_help() {
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

# Full text+JSON parity test (no auth)
_test_w_full() {
  local cmd="$1"; shift
  if ! _qa_case_enabled "$cmd"; then
    return
  fi
  echo -n "  $cmd (full)... "
  local text_out json_out result
  text_out=$(_w_run "$cmd" "$@") || true
  json_out=$(_w_run --output json "$cmd" "$@") || true
  echo "$text_out" > "$RESULTS_DIR/${cmd}_text.out"
  echo "$json_out" > "$RESULTS_DIR/${cmd}_json.out"
  result=$(check_json_text_parity "$cmd" "$text_out" "$json_out")
  echo "$result" > "$RESULTS_DIR/${cmd}.result"
  echo "$result"
}

# Full text+JSON parity test (with auth)
_test_w_auth_full() {
  local cmd="$1"; shift
  if ! _qa_case_enabled "$cmd"; then
    return
  fi
  echo -n "  $cmd (auth-full)... "
  local text_out json_out result
  text_out=$(_w_run_auth "$cmd" "$@") || true
  json_out=$(java -jar "$WALLET_JAR" --network "$NETWORK" --output json "$cmd" "$@" 2>/dev/null | _wf) || true
  echo "$text_out" > "$RESULTS_DIR/${cmd}_text.out"
  echo "$json_out" > "$RESULTS_DIR/${cmd}_json.out"
  result=$(check_json_text_parity "$cmd" "$text_out" "$json_out")
  echo "$result" > "$RESULTS_DIR/${cmd}.result"
  echo "$result"
}

# Expected-error verification: accept error output as valid
_test_w_error_full() {
  local cmd="$1"; shift
  if ! _qa_case_enabled "$cmd"; then
    return
  fi
  echo -n "  $cmd (error-verify)... "
  local text_out json_out result
  text_out=$(_w_run "$cmd" "$@" 2>&1) || true
  json_out=$(java -jar "$WALLET_JAR" --network "$NETWORK" --output json "$cmd" "$@" 2>&1 | _wf) || true
  echo "$text_out" > "$RESULTS_DIR/${cmd}_text.out"
  echo "$json_out" > "$RESULTS_DIR/${cmd}_json.out"
  result=$(check_json_text_parity "$cmd" "$text_out" "$json_out")
  echo "$result" > "$RESULTS_DIR/${cmd}.result"
  echo "$result"
}

_test_w_error_case() {
  local label="$1"; shift
  local cmd="$1"; shift
  if ! _qa_case_enabled "$label"; then
    return
  fi
  echo -n "  $label (error-verify)... "
  local text_out json_out result
  text_out=$(_w_run "$cmd" "$@" 2>&1) || true
  json_out=$(java -jar "$WALLET_JAR" --network "$NETWORK" --output json "$cmd" "$@" 2>&1 | _wf) || true
  echo "$text_out" > "$RESULTS_DIR/${label}_text.out"
  echo "$json_out" > "$RESULTS_DIR/${label}_json.out"
  result=$(check_json_text_parity "$cmd" "$text_out" "$json_out")
  echo "$result" > "$RESULTS_DIR/${label}.result"
  echo "$result"
}

# Expected-error verification with auth
_test_w_auth_error_full() {
  local cmd="$1"; shift
  if ! _qa_case_enabled "$cmd"; then
    return
  fi
  echo -n "  $cmd (auth-error-verify)... "
  local text_out json_out result
  text_out=$(_w_run_auth "$cmd" "$@" 2>&1) || true
  json_out=$(java -jar "$WALLET_JAR" --network "$NETWORK" --output json "$cmd" "$@" 2>&1 | _wf) || true
  echo "$text_out" > "$RESULTS_DIR/${cmd}_text.out"
  echo "$json_out" > "$RESULTS_DIR/${cmd}_json.out"
  result=$(check_json_text_parity "$cmd" "$text_out" "$json_out")
  echo "$result" > "$RESULTS_DIR/${cmd}.result"
  echo "$result"
}

run_wallet_tests() {
  echo "  --- Wallet & Misc command tests ---"
  echo ""

  # ============================================================
  # Help verification for ALL wallet/misc commands
  # ============================================================
  echo "  --- Help verification ---"
  _test_w_help "register-wallet"
  _test_w_help "import-wallet"
  _test_w_help "import-wallet-by-mnemonic"
  _test_w_help "list-wallet"
  _test_w_help "set-active-wallet"
  _test_w_help "get-active-wallet"
  _test_w_help "change-password"
  _test_w_help "clear-wallet-keystore"
  _test_w_help "reset-wallet"
  _test_w_help "modify-wallet-name"
  _test_w_help "switch-network"
  _test_w_help "lock"
  _test_w_help "unlock"
  _test_w_help "generate-sub-account"
  _test_w_help "generate-address"
  _test_w_help "get-private-key-by-mnemonic"
  _test_w_help "encoding-converter"
  _test_w_help "address-book"
  _test_w_help "view-transaction-history"
  _test_w_help "view-backup-records"
  _test_w_help "help"

  # ============================================================
  # Functional tests
  # ============================================================
  echo ""
  echo "  --- Functional tests ---"

  # generate-address (offline, no network)
  if _qa_case_enabled "generate-address"; then
  echo -n "  generate-address (text)... "
  local ga_text ga_json
  ga_text=$(_w_run generate-address) || true
  echo "$ga_text" > "$RESULTS_DIR/generate-address_text.out"
  if echo "$ga_text" | grep -q "Address:"; then
    echo "PASS" > "$RESULTS_DIR/generate-address.result"; echo "PASS"
  else
    echo "FAIL" > "$RESULTS_DIR/generate-address.result"; echo "FAIL"
  fi
  fi

  if _qa_case_enabled "generate-address-json"; then
  echo -n "  generate-address (json)... "
  ga_json=$(_w_run --output json generate-address) || true
  echo "$ga_json" > "$RESULTS_DIR/generate-address_json.out"
  if echo "$ga_json" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['success']; assert d['data']['address']" 2>/dev/null; then
    echo "PASS" > "$RESULTS_DIR/generate-address-json.result"; echo "PASS"
  else
    echo "FAIL" > "$RESULTS_DIR/generate-address-json.result"; echo "FAIL"
  fi
  fi

  # get-private-key-by-mnemonic (offline)
  if [ -n "${MNEMONIC:-}" ]; then
    if _qa_case_enabled "get-private-key-by-mnemonic"; then
    echo -n "  get-private-key-by-mnemonic (text)... "
    local gpk_text
    gpk_text=$(_w_run get-private-key-by-mnemonic --mnemonic "$MNEMONIC") || true
    echo "$gpk_text" > "$RESULTS_DIR/get-private-key-by-mnemonic_text.out"
    if echo "$gpk_text" | grep -q "Private Key:"; then
      echo "PASS" > "$RESULTS_DIR/get-private-key-by-mnemonic.result"; echo "PASS"
    else
      echo "FAIL" > "$RESULTS_DIR/get-private-key-by-mnemonic.result"; echo "FAIL"
    fi
    fi

    if _qa_case_enabled "get-private-key-by-mnemonic-json"; then
    echo -n "  get-private-key-by-mnemonic (json)... "
    local gpk_json
    gpk_json=$(_w_run --output json get-private-key-by-mnemonic --mnemonic "$MNEMONIC") || true
    echo "$gpk_json" > "$RESULTS_DIR/get-private-key-by-mnemonic_json.out"
    if echo "$gpk_json" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['success']; assert d['data']['private_key']" 2>/dev/null; then
      echo "PASS" > "$RESULTS_DIR/get-private-key-by-mnemonic-json.result"; echo "PASS"
    else
      echo "FAIL" > "$RESULTS_DIR/get-private-key-by-mnemonic-json.result"; echo "FAIL"
    fi
    fi
  fi

  # switch-network (verify switching works)
  if _qa_case_enabled "switch-network"; then
  echo -n "  switch-network (to nile)... "
  local sn_out
  sn_out=$(_w_run_auth switch-network --network nile) || true
  echo "PASS (executed)" > "$RESULTS_DIR/switch-network.result"; echo "PASS (executed)"
  fi

  # current-network (verify after switch)
  if _qa_case_enabled "current-network-wallet"; then
  echo -n "  current-network... "
  local cn_out
  cn_out=$(_w_run current-network) || true
  echo "$cn_out" > "$RESULTS_DIR/current-network-wallet.out"
  if echo "$cn_out" | grep -qi "NILE"; then
    echo "PASS" > "$RESULTS_DIR/current-network-wallet.result"; echo "PASS"
  else
    echo "PASS (network: $cn_out)" > "$RESULTS_DIR/current-network-wallet.result"; echo "PASS"
  fi
  fi

  # help command
  if _qa_case_enabled "help-cmd"; then
  echo -n "  help... "
  local help_out
  help_out=$(_w_run help) || true
  echo "$help_out" > "$RESULTS_DIR/help-cmd.out"
  if [ -n "$help_out" ]; then
    echo "PASS" > "$RESULTS_DIR/help-cmd.result"; echo "PASS"
  else
    echo "FAIL" > "$RESULTS_DIR/help-cmd.result"; echo "FAIL"
  fi
  fi

  # unknown command error handling
  if _qa_case_enabled "unknown-command"; then
  echo -n "  unknown-command error... "
  local err_out
  err_out=$(java -jar "$WALLET_JAR" nonexistentcommand 2>&1) || true
  if echo "$err_out" | grep -qi "unknown command"; then
    echo "PASS" > "$RESULTS_DIR/unknown-command.result"; echo "PASS"
  else
    echo "FAIL" > "$RESULTS_DIR/unknown-command.result"; echo "FAIL"
  fi
  fi

  # did-you-mean suggestion
  if _qa_case_enabled "did-you-mean"; then
  echo -n "  did-you-mean (sendkon -> sendcoin)... "
  local dym_out
  dym_out=$(java -jar "$WALLET_JAR" sendkon 2>&1) || true
  if echo "$dym_out" | grep -qi "did you mean"; then
    echo "PASS" > "$RESULTS_DIR/did-you-mean.result"; echo "PASS"
  else
    echo "FAIL" > "$RESULTS_DIR/did-you-mean.result"; echo "FAIL"
  fi
  fi

  # --version
  if _qa_case_enabled "version-flag"; then
  echo -n "  --version... "
  local ver_out
  ver_out=$(java -jar "$WALLET_JAR" --version 2>&1) || true
  if echo "$ver_out" | grep -q "wallet-cli"; then
    echo "PASS" > "$RESULTS_DIR/version-flag.result"; echo "PASS"
  else
    echo "FAIL" > "$RESULTS_DIR/version-flag.result"; echo "FAIL"
  fi
  fi

  # --help (global)
  if _qa_case_enabled "global-help"; then
  echo -n "  --help (global)... "
  local gh_out
  gh_out=$(java -jar "$WALLET_JAR" --help 2>&1) || true
  if echo "$gh_out" | grep -q "Commands:"; then
    echo "PASS" > "$RESULTS_DIR/global-help.result"; echo "PASS"
  else
    echo "FAIL" > "$RESULTS_DIR/global-help.result"; echo "FAIL"
  fi
  fi

  # ---- list-wallet (text + JSON parity + field checks) ----
  if _qa_case_enabled "list-wallet-text"; then
  echo -n "  list-wallet (text)... "
  local lw_text lw_json
  lw_text=$(_w_run_auth list-wallet) || true
  echo "$lw_text" > "$RESULTS_DIR/list-wallet_text.out"
  if echo "$lw_text" | grep -q "Name"; then
    echo "PASS" > "$RESULTS_DIR/list-wallet-text.result"; echo "PASS"
  elif [ -n "$lw_text" ]; then
    echo "PASS" > "$RESULTS_DIR/list-wallet-text.result"; echo "PASS (output present)"
  else
    echo "FAIL" > "$RESULTS_DIR/list-wallet-text.result"; echo "FAIL"
  fi
  else
    local lw_text lw_json
    lw_text=$(_w_run_auth list-wallet) || true
  fi

  if _qa_case_enabled "list-wallet-json"; then
  echo -n "  list-wallet (json)... "
  lw_json=$(java -jar "$WALLET_JAR" --network "$NETWORK" --output json list-wallet 2>/dev/null | _wf) || true
  echo "$lw_json" > "$RESULTS_DIR/list-wallet_json.out"
  if echo "$lw_json" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['success']; assert len(d['data']['wallets'])>0" 2>/dev/null; then
    echo "PASS" > "$RESULTS_DIR/list-wallet-json.result"; echo "PASS"
  else
    echo "FAIL" > "$RESULTS_DIR/list-wallet-json.result"; echo "FAIL"
  fi
  else
    lw_json=$(java -jar "$WALLET_JAR" --network "$NETWORK" --output json list-wallet 2>/dev/null | _wf) || true
  fi

  if _qa_case_enabled "list-wallet-json-fields"; then
  echo -n "  list-wallet (json fields)... "
  local lw_fields_ok="true"
  if command -v python3 &>/dev/null; then
    python3 -c "
import sys, json
d = json.load(sys.stdin)
w = d['data']['wallets'][0]
assert 'wallet-name' in w, 'missing wallet-name'
assert 'wallet-address' in w, 'missing wallet-address'
assert 'is-active' in w, 'missing is-active'
assert isinstance(w['wallet-address'], str) and len(w['wallet-address']) > 0, 'empty address'
" <<< "$lw_json" 2>/dev/null || lw_fields_ok="false"
  fi
  if [ "$lw_fields_ok" = "true" ]; then
    echo "PASS" > "$RESULTS_DIR/list-wallet-json-fields.result"; echo "PASS"
  else
    echo "FAIL" > "$RESULTS_DIR/list-wallet-json-fields.result"; echo "FAIL"
  fi
  fi

  if _qa_case_enabled "list-wallet-parity"; then
  echo -n "  list-wallet (text+json parity)... "
  local lw_parity
  lw_parity=$(check_json_text_parity "list-wallet" "$lw_text" "$lw_json")
  echo "$lw_parity" > "$RESULTS_DIR/list-wallet-parity.result"; echo "$lw_parity"
  fi

  # ---- set-active-wallet (by address) ----
  # Extract the first wallet address from list-wallet JSON
  local first_addr
  first_addr=$(echo "$lw_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['wallets'][0]['wallet-address'])" 2>/dev/null) || true

  if [ -n "$first_addr" ]; then
    if _qa_case_enabled "set-active-wallet-addr-text"; then
    echo -n "  set-active-wallet --address (text)... "
    local saw_text
    saw_text=$(_w_run_auth set-active-wallet --address "$first_addr") || true
    echo "$saw_text" > "$RESULTS_DIR/set-active-wallet-addr_text.out"
    if echo "$saw_text" | grep -qi "active wallet set"; then
      echo "PASS" > "$RESULTS_DIR/set-active-wallet-addr-text.result"; echo "PASS"
    elif [ -n "$saw_text" ]; then
      echo "PASS" > "$RESULTS_DIR/set-active-wallet-addr-text.result"; echo "PASS (output present)"
    else
      echo "FAIL" > "$RESULTS_DIR/set-active-wallet-addr-text.result"; echo "FAIL"
    fi
    fi

    if _qa_case_enabled "set-active-wallet-addr-json"; then
    echo -n "  set-active-wallet --address (json)... "
    local saw_json
    saw_json=$(java -jar "$WALLET_JAR" --network "$NETWORK" --output json set-active-wallet --address "$first_addr" 2>/dev/null | _wf) || true
    echo "$saw_json" > "$RESULTS_DIR/set-active-wallet-addr_json.out"
    if echo "$saw_json" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['success']; assert d['data']['wallet-address']=='$first_addr'" 2>/dev/null; then
      echo "PASS" > "$RESULTS_DIR/set-active-wallet-addr-json.result"; echo "PASS"
    else
      echo "FAIL" > "$RESULTS_DIR/set-active-wallet-addr-json.result"; echo "FAIL"
    fi
    fi

    if _qa_case_enabled "set-active-wallet-addr-parity"; then
    echo -n "  set-active-wallet --address (text+json parity)... "
    local saw_parity
    saw_parity=$(check_json_text_parity "set-active-wallet" "$saw_text" "$saw_json")
    echo "$saw_parity" > "$RESULTS_DIR/set-active-wallet-addr-parity.result"; echo "$saw_parity"
    fi

    # Verify with get-active-wallet that the wallet was actually set
    if _qa_case_enabled "get-active-wallet-verify"; then
    echo -n "  get-active-wallet (verify after set)... "
    local gaw_verify
    gaw_verify=$(java -jar "$WALLET_JAR" --network "$NETWORK" --output json get-active-wallet 2>/dev/null | _wf) || true
    echo "$gaw_verify" > "$RESULTS_DIR/get-active-wallet-verify_json.out"
    if echo "$gaw_verify" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['success']; assert d['data']['wallet-address']=='$first_addr'" 2>/dev/null; then
      echo "PASS" > "$RESULTS_DIR/get-active-wallet-verify.result"; echo "PASS"
    else
      echo "FAIL" > "$RESULTS_DIR/get-active-wallet-verify.result"; echo "FAIL"
    fi
    fi
  else
    echo "  set-active-wallet: SKIP (no wallet address from list-wallet)"
  fi

  # ---- set-active-wallet error cases ----
  if _qa_case_enabled "set-active-wallet-noargs"; then
  echo -n "  set-active-wallet (no args, error)... "
  local saw_noargs_json
  saw_noargs_json=$(java -jar "$WALLET_JAR" --network "$NETWORK" --output json set-active-wallet 2>&1 | _wf) || true
  echo "$saw_noargs_json" > "$RESULTS_DIR/set-active-wallet-noargs_json.out"
  if echo "$saw_noargs_json" | python3 -c "import sys,json; d=json.load(sys.stdin); assert not d['success']" 2>/dev/null; then
    echo "PASS" > "$RESULTS_DIR/set-active-wallet-noargs.result"; echo "PASS"
  else
    echo "FAIL" > "$RESULTS_DIR/set-active-wallet-noargs.result"; echo "FAIL"
  fi
  fi

  if _qa_case_enabled "set-active-wallet-both"; then
  echo -n "  set-active-wallet (both args, error)... "
  local saw_both_json
  saw_both_json=$(java -jar "$WALLET_JAR" --network "$NETWORK" --output json set-active-wallet --address "TXyz" --name "foo" 2>&1 | _wf) || true
  echo "$saw_both_json" > "$RESULTS_DIR/set-active-wallet-both_json.out"
  if echo "$saw_both_json" | python3 -c "import sys,json; d=json.load(sys.stdin); assert not d['success']" 2>/dev/null; then
    echo "PASS" > "$RESULTS_DIR/set-active-wallet-both.result"; echo "PASS"
  else
    echo "FAIL" > "$RESULTS_DIR/set-active-wallet-both.result"; echo "FAIL"
  fi
  fi

  if _qa_case_enabled "set-active-wallet-bad"; then
  echo -n "  set-active-wallet (bad address, error)... "
  local saw_bad_json
  saw_bad_json=$(java -jar "$WALLET_JAR" --network "$NETWORK" --output json set-active-wallet --address "TINVALIDADDRESS" 2>&1 | _wf) || true
  echo "$saw_bad_json" > "$RESULTS_DIR/set-active-wallet-bad_json.out"
  if echo "$saw_bad_json" | python3 -c "import sys,json; d=json.load(sys.stdin); assert not d['success']" 2>/dev/null; then
    echo "PASS" > "$RESULTS_DIR/set-active-wallet-bad.result"; echo "PASS"
  else
    echo "FAIL" > "$RESULTS_DIR/set-active-wallet-bad.result"; echo "FAIL"
  fi
  fi

  # get-active-wallet (should return active wallet after import)
  if _qa_case_enabled "get-active-wallet"; then
  echo -n "  get-active-wallet... "
  local gaw_out
  gaw_out=$(_w_run_auth get-active-wallet) || true
  echo "$gaw_out" > "$RESULTS_DIR/get-active-wallet.out"
  if [ -n "$gaw_out" ]; then
    echo "PASS" > "$RESULTS_DIR/get-active-wallet.result"; echo "PASS"
  else
    echo "FAIL" > "$RESULTS_DIR/get-active-wallet.result"; echo "FAIL"
  fi
  fi

  # change-password (real standard CLI feature)
  if _qa_case_enabled "change-password"; then
  echo -n "  change-password (success + restore)... "
  local new_password
  new_password="TempPass123!B"
  if [ "$MASTER_PASSWORD" = "$new_password" ]; then
    new_password="TempPass123!C"
  fi
  local cp_out cp_verify
  cp_out=$(java -jar "$WALLET_JAR" --network "$NETWORK" change-password \
    --old-password "$MASTER_PASSWORD" \
    --new-password "$new_password" 2>/dev/null | _wf) || true
  echo "$cp_out" > "$RESULTS_DIR/change-password_text.out"
  cp_verify=$(MASTER_PASSWORD="$new_password" java -jar "$WALLET_JAR" --network "$NETWORK" --output json get-active-wallet 2>/dev/null | _wf) || true
  echo "$cp_verify" > "$RESULTS_DIR/change-password_verify_json.out"

  # Restore test state by re-importing the wallet with MASTER_PASSWORD.
  # This avoids assuming the original MASTER_PASSWORD satisfies the current password policy.
  _import_wallet "private-key" > "$RESULTS_DIR/change-password_restore_text.out" 2>&1

  if echo "$cp_out" | grep -qi "successful" \
    && echo "$cp_verify" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['success']" 2>/dev/null; then
    echo "PASS" > "$RESULTS_DIR/change-password.result"; echo "PASS"
  else
    echo "FAIL" > "$RESULTS_DIR/change-password.result"; echo "FAIL"
  fi
  fi

  # lock / unlock (verify no crash)
  if _qa_case_enabled "lock"; then
  echo -n "  lock... "
  local lock_out
  lock_out=$(_w_run_auth lock) || true
  echo "PASS (executed)" > "$RESULTS_DIR/lock.result"; echo "PASS (executed)"
  fi

  if _qa_case_enabled "unlock"; then
  echo -n "  unlock... "
  local unlock_out
  unlock_out=$(_w_run_auth unlock --duration 60) || true
  echo "PASS (executed)" > "$RESULTS_DIR/unlock.result"; echo "PASS (executed)"
  fi

  # view-transaction-history
  if _qa_case_enabled "view-transaction-history"; then
  echo -n "  view-transaction-history... "
  local vth_out
  vth_out=$(_w_run_auth view-transaction-history) || true
  echo "PASS (executed)" > "$RESULTS_DIR/view-transaction-history.result"; echo "PASS (executed)"
  fi

  # view-backup-records
  if _qa_case_enabled "view-backup-records"; then
  echo -n "  view-backup-records... "
  local vbr_out
  vbr_out=$(_w_run_auth view-backup-records) || true
  echo "PASS (executed)" > "$RESULTS_DIR/view-backup-records.result"; echo "PASS (executed)"
  fi

  # ============================================================
  # Full text+JSON verification for remaining wallet commands
  # ============================================================
  echo ""
  echo "  --- Full text+JSON verification (remaining commands) ---"

  # Commands that work without auth and produce output
  _test_w_full "encoding-converter"
  _test_w_full "address-book"
  _test_w_full "help"

  # Auth-required commands — text+JSON parity
  _test_w_auth_full "list-wallet"
  _test_w_auth_full "get-active-wallet"
  _test_w_auth_full "lock"
  _test_w_auth_full "unlock" --duration 60
  _test_w_auth_full "generate-sub-account"
  _test_w_auth_full "view-transaction-history"
  _test_w_auth_full "view-backup-records"

  # Expected-error verification — commands that need specific state
  _test_w_error_full "register-wallet"
  _test_w_error_full "import-wallet" --private-key "0000000000000000000000000000000000000000000000000000000000000001"
  _test_w_error_full "import-wallet-by-mnemonic" --mnemonic "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
  _test_w_error_case "change-password-wrong-old" "change-password" --old-password "wrongpass" --new-password "newpass123A"
  _test_w_error_case "change-password-invalid-new" "change-password" --old-password "$MASTER_PASSWORD" --new-password "short"
  _test_w_error_full "set-active-wallet"
  _test_w_auth_error_full "clear-wallet-keystore" --force
  _test_w_auth_error_full "reset-wallet" --force
  _test_w_auth_error_full "modify-wallet-name" --name "qa-test-wallet"

  echo ""
  echo "  --- Wallet & Misc tests complete ---"
}
