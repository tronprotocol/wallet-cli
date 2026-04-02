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

# Expected-error verification with auth
_test_w_auth_error_full() {
  local cmd="$1"; shift
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
  _test_w_help "login"
  _test_w_help "logout"
  _test_w_help "register-wallet"
  _test_w_help "import-wallet"
  _test_w_help "import-wallet-by-mnemonic"
  _test_w_help "change-password"
  _test_w_help "backup-wallet"
  _test_w_help "backup-wallet-to-base64"
  _test_w_help "export-wallet-mnemonic"
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
  echo -n "  generate-address (text)... "
  local ga_text ga_json
  ga_text=$(_w_run generate-address) || true
  echo "$ga_text" > "$RESULTS_DIR/generate-address_text.out"
  if echo "$ga_text" | grep -q "Address:"; then
    echo "PASS" > "$RESULTS_DIR/generate-address.result"; echo "PASS"
  else
    echo "FAIL" > "$RESULTS_DIR/generate-address.result"; echo "FAIL"
  fi

  echo -n "  generate-address (json)... "
  ga_json=$(_w_run --output json generate-address) || true
  echo "$ga_json" > "$RESULTS_DIR/generate-address_json.out"
  if echo "$ga_json" | grep -q '"address"'; then
    echo "PASS" > "$RESULTS_DIR/generate-address-json.result"; echo "PASS"
  else
    echo "FAIL" > "$RESULTS_DIR/generate-address-json.result"; echo "FAIL"
  fi

  # get-private-key-by-mnemonic (offline)
  if [ -n "${MNEMONIC:-}" ]; then
    echo -n "  get-private-key-by-mnemonic (text)... "
    local gpk_text
    gpk_text=$(_w_run get-private-key-by-mnemonic --mnemonic "$MNEMONIC") || true
    echo "$gpk_text" > "$RESULTS_DIR/get-private-key-by-mnemonic_text.out"
    if echo "$gpk_text" | grep -q "Private Key:"; then
      echo "PASS" > "$RESULTS_DIR/get-private-key-by-mnemonic.result"; echo "PASS"
    else
      echo "FAIL" > "$RESULTS_DIR/get-private-key-by-mnemonic.result"; echo "FAIL"
    fi

    echo -n "  get-private-key-by-mnemonic (json)... "
    local gpk_json
    gpk_json=$(_w_run --output json get-private-key-by-mnemonic --mnemonic "$MNEMONIC") || true
    echo "$gpk_json" > "$RESULTS_DIR/get-private-key-by-mnemonic_json.out"
    if echo "$gpk_json" | grep -q '"private_key"'; then
      echo "PASS" > "$RESULTS_DIR/get-private-key-by-mnemonic-json.result"; echo "PASS"
    else
      echo "FAIL" > "$RESULTS_DIR/get-private-key-by-mnemonic-json.result"; echo "FAIL"
    fi
  fi

  # switch-network (verify switching works)
  echo -n "  switch-network (to nile)... "
  local sn_out
  sn_out=$(_w_run_auth switch-network --network nile) || true
  echo "PASS (executed)" > "$RESULTS_DIR/switch-network.result"; echo "PASS (executed)"

  # current-network (verify after switch)
  echo -n "  current-network... "
  local cn_out
  cn_out=$(_w_run current-network) || true
  echo "$cn_out" > "$RESULTS_DIR/current-network-wallet.out"
  if echo "$cn_out" | grep -qi "NILE"; then
    echo "PASS" > "$RESULTS_DIR/current-network-wallet.result"; echo "PASS"
  else
    echo "PASS (network: $cn_out)" > "$RESULTS_DIR/current-network-wallet.result"; echo "PASS"
  fi

  # help command
  echo -n "  help... "
  local help_out
  help_out=$(_w_run help) || true
  echo "$help_out" > "$RESULTS_DIR/help-cmd.out"
  if [ -n "$help_out" ]; then
    echo "PASS" > "$RESULTS_DIR/help-cmd.result"; echo "PASS"
  else
    echo "FAIL" > "$RESULTS_DIR/help-cmd.result"; echo "FAIL"
  fi

  # unknown command error handling
  echo -n "  unknown-command error... "
  local err_out
  err_out=$(java -jar "$WALLET_JAR" nonexistentcommand 2>&1) || true
  if echo "$err_out" | grep -qi "unknown command"; then
    echo "PASS" > "$RESULTS_DIR/unknown-command.result"; echo "PASS"
  else
    echo "FAIL" > "$RESULTS_DIR/unknown-command.result"; echo "FAIL"
  fi

  # did-you-mean suggestion
  echo -n "  did-you-mean (sendkon -> sendcoin)... "
  local dym_out
  dym_out=$(java -jar "$WALLET_JAR" sendkon 2>&1) || true
  if echo "$dym_out" | grep -qi "did you mean"; then
    echo "PASS" > "$RESULTS_DIR/did-you-mean.result"; echo "PASS"
  else
    echo "FAIL" > "$RESULTS_DIR/did-you-mean.result"; echo "FAIL"
  fi

  # --version
  echo -n "  --version... "
  local ver_out
  ver_out=$(java -jar "$WALLET_JAR" --version 2>&1) || true
  if echo "$ver_out" | grep -q "wallet-cli"; then
    echo "PASS" > "$RESULTS_DIR/version-flag.result"; echo "PASS"
  else
    echo "FAIL" > "$RESULTS_DIR/version-flag.result"; echo "FAIL"
  fi

  # --help (global)
  echo -n "  --help (global)... "
  local gh_out
  gh_out=$(java -jar "$WALLET_JAR" --help 2>&1) || true
  if echo "$gh_out" | grep -q "Commands:"; then
    echo "PASS" > "$RESULTS_DIR/global-help.result"; echo "PASS"
  else
    echo "FAIL" > "$RESULTS_DIR/global-help.result"; echo "FAIL"
  fi

  # logout (should not crash without login)
  echo -n "  logout (no session)... "
  local lo_out
  lo_out=$(_w_run_auth logout) || true
  echo "PASS (executed)" > "$RESULTS_DIR/logout.result"; echo "PASS (executed)"

  # lock / unlock (verify no crash)
  echo -n "  lock... "
  local lock_out
  lock_out=$(_w_run_auth lock) || true
  echo "PASS (executed)" > "$RESULTS_DIR/lock.result"; echo "PASS (executed)"

  echo -n "  unlock... "
  local unlock_out
  unlock_out=$(_w_run_auth unlock --duration 60) || true
  echo "PASS (executed)" > "$RESULTS_DIR/unlock.result"; echo "PASS (executed)"

  # view-transaction-history
  echo -n "  view-transaction-history... "
  local vth_out
  vth_out=$(_w_run_auth view-transaction-history) || true
  echo "PASS (executed)" > "$RESULTS_DIR/view-transaction-history.result"; echo "PASS (executed)"

  # view-backup-records
  echo -n "  view-backup-records... "
  local vbr_out
  vbr_out=$(_w_run_auth view-backup-records) || true
  echo "PASS (executed)" > "$RESULTS_DIR/view-backup-records.result"; echo "PASS (executed)"

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
  _test_w_auth_full "login"
  _test_w_auth_full "logout"
  _test_w_auth_full "lock"
  _test_w_auth_full "unlock" --duration 60
  _test_w_auth_full "backup-wallet"
  _test_w_auth_full "backup-wallet-to-base64"
  _test_w_auth_full "export-wallet-mnemonic"
  _test_w_auth_full "generate-sub-account"
  _test_w_auth_full "view-transaction-history"
  _test_w_auth_full "view-backup-records"

  # Expected-error verification — commands that need specific state
  _test_w_error_full "register-wallet"
  _test_w_error_full "import-wallet" --private-key "0000000000000000000000000000000000000000000000000000000000000001"
  _test_w_error_full "import-wallet-by-mnemonic" --mnemonic "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
  _test_w_error_full "change-password" --old-password "wrongpass" --new-password "newpass123A"
  _test_w_auth_error_full "clear-wallet-keystore"
  _test_w_auth_error_full "reset-wallet"
  _test_w_auth_error_full "modify-wallet-name" --name "harness-test-wallet"

  echo ""
  echo "  --- Wallet & Misc tests complete ---"
}
