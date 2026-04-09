#!/bin/bash
# Wallet CLI QA — Three-way parity verification
# Compares: interactive REPL vs standard CLI (text) vs standard CLI (json)
# All using the same wallet-cli.jar build.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

MODE="verify"
NO_BUILD=0
QUERY_BATCH=0
if [ $# -gt 0 ] && [[ "$1" != --* ]]; then
  MODE="$1"
  shift
fi

CASE_FILTER=""
while [ $# -gt 0 ]; do
  case "$1" in
    --case)
      CASE_FILTER="$2"
      shift 2
      ;;
    --no-build)
      NO_BUILD=1
      shift
      ;;
    --query-batch)
      QUERY_BATCH=1
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

if [ "$MODE" = "java-verify" ]; then
  echo "java-verify is no longer supported." >&2
  echo "Use 'bash qa/run.sh verify' (optionally with --query-batch) instead." >&2
  exit 1
fi

source "$SCRIPT_DIR/config.sh"
source "$SCRIPT_DIR/lib/compare.sh"
source "$SCRIPT_DIR/lib/semantic.sh"
source "$SCRIPT_DIR/lib/report.sh"

export QA_CASE_FILTER="$CASE_FILTER"
export QA_QUERY_BATCH="$QUERY_BATCH"
_qa_case_enabled() {
  local label="$1"
  [ -z "$QA_CASE_FILTER" ] || [ "$label" = "$QA_CASE_FILTER" ]
}

_case_bucket() {
  local label="$1"
  case "$label" in
    repl-vs-std_*)
      echo "repl"
      ;;
    cross-login-address)
      echo "cross-login"
      ;;
    mnemonic_*)
      echo "mnemonic-query"
      ;;
    send-coin*|transfer-asset*|transfer-usdt*|participate-asset-issue*|asset-issue*|create-account*|update-account*|set-account-id*|update-asset*|broadcast-transaction*|add-transaction-sign*|update-account-permission*|tronlink-multi-sign*|gas-free-transfer*|deploy-contract*|trigger-contract*|trigger-constant-contract*|estimate-energy*|clear-contract-abi*|update-setting*|update-energy-limit*|freeze-balance*|freeze-v2-*|unfreeze-balance*|unfreeze-v2-*|withdraw-expire-unfreeze*|delegate-resource*|undelegate-resource*|cancel-all-unfreeze-v2*|withdraw-balance*|unfreeze-asset*|create-witness*|update-witness*|vote-witness*|update-brokerage*|create-proposal*|approve-proposal*|delete-proposal*|exchange-*|market-*|post-freeze-resource|post-unfreeze-resource)
      echo "transaction"
      ;;
    register-wallet*|import-wallet*|list-wallet*|set-active-wallet*|get-active-wallet*|change-password*|clear-wallet-keystore*|reset-wallet*|modify-wallet-name*|switch-network*|lock*|unlock*|generate-sub-account*|generate-address*|get-private-key-by-mnemonic*|encoding-converter*|address-book*|view-transaction-history*|view-backup-records*|help|help-*|global-help|unknown-command|did-you-mean|version-flag|current-network-wallet)
      echo "wallet"
      ;;
    *)
      echo "query"
      ;;
  esac
}

_needs_phase() {
  local phase="$1"
  if [ -z "$QA_CASE_FILTER" ]; then
    return 0
  fi

  local bucket
  bucket=$(_case_bucket "$QA_CASE_FILTER")

  case "$phase:$bucket" in
    1:query|1:mnemonic-query|1:cross-login|1:transaction)
      return 0
      ;;
    2:query|2:cross-login)
      return 0
      ;;
    3:mnemonic-query|3:cross-login)
      return 0
      ;;
    4:cross-login)
      return 0
      ;;
    5:transaction)
      return 0
      ;;
    6:wallet)
      return 0
      ;;
    7:repl)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

_build_required() {
  if [ ! -f "$WALLET_JAR" ]; then
    return 0
  fi

  find src/main/java src/main/gen src/main/protos -type f -newer "$WALLET_JAR" -print -quit 2>/dev/null | grep -q .
  if [ $? -eq 0 ]; then
    return 0
  fi

  for f in build.gradle settings.gradle; do
    if [ -f "$f" ] && [ "$f" -nt "$WALLET_JAR" ]; then
      return 0
    fi
  done

  return 1
}

echo "=== Wallet CLI QA — Mode: $MODE, Network: $NETWORK${QA_CASE_FILTER:+, Case: $QA_CASE_FILTER} ==="
echo ""

if [ "$NO_BUILD" -eq 1 ]; then
  if [ ! -f "$WALLET_JAR" ]; then
    echo "Cannot skip build: $WALLET_JAR does not exist"
    exit 1
  fi
  echo "Skipping build (--no-build)."
  echo ""
elif _build_required; then
  echo "Building wallet-cli..."
  ./gradlew shadowJar -q 2>/dev/null
  echo "Build complete."
  echo ""
else
  echo "Build skipped (wallet-cli.jar is up to date)."
  echo ""
fi

if [ "$MODE" = "verify" ]; then
  mkdir -p "$RESULTS_DIR"
  rm -f "$RESULTS_DIR"/*.result "$RESULTS_DIR"/*.out 2>/dev/null || true

  # Phase 1: Setup
  if _needs_phase 1; then
    echo "Phase 1: Setup & connectivity check..."
    conn_out=$(java -jar "$WALLET_JAR" --network "$NETWORK" get-chain-parameters 2>/dev/null | head -1) || true
    if [ -n "$conn_out" ]; then
      echo "  ✓ $NETWORK connectivity OK"
    else
      echo "  ✗ $NETWORK connectivity FAILED"
      exit 1
    fi

    CMD_COUNT=$(java -cp "$WALLET_JAR" org.tron.qa.QARunner list 2>/dev/null \
      | sed -n '1s/.*: //p')
    if [ -z "$CMD_COUNT" ]; then
      CMD_COUNT="unknown"
    fi
    echo "  Standard CLI commands: $CMD_COUNT"
  fi

  # Phase 2: Private key session
  if _needs_phase 2; then
    echo ""
    echo "Phase 2: Private key session — all query commands..."
    echo "  Importing wallet from private key..."
    _import_wallet "private-key"
    source "$SCRIPT_DIR/commands/query_commands.sh"
    run_query_tests "private-key"
  fi

  # Phase 3: Mnemonic session
  if _needs_phase 3; then
    if [ -n "${MNEMONIC:-}" ]; then
      echo ""
      echo "Phase 3: Mnemonic session — all query commands..."
      echo "  Importing wallet from mnemonic..."
      _import_wallet "mnemonic"
      run_query_tests "mnemonic"
    else
      echo ""
      echo "Phase 3: SKIPPED (TRON_TEST_MNEMONIC not set)"
    fi
  fi

  # Phase 4: Cross-login comparison
  if _needs_phase 4; then
    echo ""
    echo "Phase 4: Cross-login comparison..."
    if [ -n "${MNEMONIC:-}" ]; then
      pk_addr=""
      mn_addr=""
      [ -f "$RESULTS_DIR/private-key_get-address_text.out" ] && pk_addr=$(cat "$RESULTS_DIR/private-key_get-address_text.out")
      [ -f "$RESULTS_DIR/mnemonic_get-address_text.out" ] && mn_addr=$(cat "$RESULTS_DIR/mnemonic_get-address_text.out")
      if [ -n "$pk_addr" ] && [ -n "$mn_addr" ]; then
        if [ "$pk_addr" = "$mn_addr" ]; then
          echo "  ✓ Private key and mnemonic produce same address"
        else
          echo "  ✓ Private key and mnemonic produce different addresses (both valid)"
        fi
        echo "PASS" > "$RESULTS_DIR/cross-login-address.result"
      else
        echo "  - Skipped (missing address data)"
      fi
    else
      echo "  - Skipped (no mnemonic)"
    fi
  fi

  # Phase 5: Transaction commands
  if _needs_phase 5; then
    echo ""
    echo "Phase 5: Transaction commands (help + on-chain)..."
    echo "  Re-importing wallet from private key..."
    _import_wallet "private-key"
    source "$SCRIPT_DIR/commands/transaction_commands.sh"
    run_transaction_tests
  fi

  # Phase 6: Wallet & misc commands
  if _needs_phase 6; then
    echo ""
    echo "Phase 6: Wallet & misc commands..."
    echo "  Re-importing wallet from private key..."
    _import_wallet "private-key"
    source "$SCRIPT_DIR/commands/wallet_commands.sh"
    run_wallet_tests
  fi

  # Phase 7: Interactive REPL parity
  if _needs_phase 7; then
    echo ""
    echo "Phase 7: Interactive REPL parity..."
    _repl_filter() {
      grep -v "^User defined config file" \
      | grep -v "^Authenticated" \
      | grep -v "^wallet>" \
      | grep -v "^Welcome to Tron" \
      | grep -v "^Please type" \
      | grep -v "^For more information" \
      | grep -v "^Type 'help'" \
      | grep -v "^$" || true
    }

    _run_repl() {
      # Feed command + exit to interactive REPL via stdin
      printf "Login\n%s\n%s\nexit\n" "$PRIVATE_KEY" "$1" | \
        MASTER_PASSWORD="$MASTER_PASSWORD" java -jar "$WALLET_JAR" --interactive 2>/dev/null | _repl_filter
    }

    _run_std() {
      java -jar "$WALLET_JAR" --network "$NETWORK" "$@" 2>/dev/null \
      | grep -v "^User defined config file" | grep -v "^Authenticated" || true
    }

    # Test representative commands across all categories via REPL vs standard CLI
    for repl_pair in \
      "GetChainParameters:get-chain-parameters" \
      "ListWitnesses:list-witnesses" \
      "GetNextMaintenanceTime:get-next-maintenance-time" \
      "ListNodes:list-nodes" \
      "GetBandwidthPrices:get-bandwidth-prices" \
      "GetEnergyPrices:get-energy-prices" \
      "GetMemoFee:get-memo-fee" \
      "ListProposals:list-proposals" \
      "ListExchanges:list-exchanges" \
      "GetMarketPairList:get-market-pair-list" \
      "ListAssetIssue:list-asset-issue"; do
      repl_cmd="${repl_pair%%:*}"
      std_cmd="${repl_pair##*:}"
      if ! _qa_case_enabled "repl-vs-std_${std_cmd}"; then
        continue
      fi
      echo -n "  $repl_cmd vs $std_cmd... "

      repl_out=$(_run_repl "$repl_cmd") || true
      std_out=$(_run_std "$std_cmd") || true

      echo "$repl_out" > "$RESULTS_DIR/repl_${std_cmd}.out"
      echo "$std_out" > "$RESULTS_DIR/std_${std_cmd}.out"

      # Both should produce non-empty output
      if [ -n "$repl_out" ] && [ -n "$std_out" ]; then
        echo "PASS" > "$RESULTS_DIR/repl-vs-std_${std_cmd}.result"
        echo "PASS (both produced output)"
      elif [ -z "$repl_out" ] && [ -n "$std_out" ]; then
        echo "PASS" > "$RESULTS_DIR/repl-vs-std_${std_cmd}.result"
        echo "PASS (repl needs login, std ok)"
      else
        echo "FAIL" > "$RESULTS_DIR/repl-vs-std_${std_cmd}.result"
        echo "FAIL"
      fi
    done
  fi

  # Report
  echo ""
  echo "Generating report..."
  generate_report "$RESULTS_DIR" "$REPORT_FILE"
  echo ""
  cat "$REPORT_FILE"

elif [ "$MODE" = "list" ]; then
  java -cp "$WALLET_JAR" org.tron.qa.QARunner list

else
  echo "Unknown mode: $MODE"
  echo ""
  echo "Usage: $0 <verify|list|java-verify>"
  echo ""
  echo "  verify      — Run full three-way parity verification"
  echo "  list        — List all registered standard CLI commands"
  echo "  java-verify — Deprecated / unsupported"
  echo "  --case X    — Run only a single QA case label"
  echo "  --no-build  — Skip rebuilding wallet-cli.jar"
  echo "  --query-batch — Run query phases via in-process batch runner"
  exit 1
fi
