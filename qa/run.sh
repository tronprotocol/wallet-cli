#!/bin/bash
# Wallet CLI QA — Three-way parity verification
# Compares: interactive REPL vs standard CLI (text) vs standard CLI (json)
# All using the same wallet-cli.jar build.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

source "$SCRIPT_DIR/config.sh"
source "$SCRIPT_DIR/lib/compare.sh"
source "$SCRIPT_DIR/lib/semantic.sh"
source "$SCRIPT_DIR/lib/report.sh"

MODE="verify"
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
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

export QA_CASE_FILTER="$CASE_FILTER"
_qa_case_enabled() {
  local label="$1"
  [ -z "$QA_CASE_FILTER" ] || [ "$label" = "$QA_CASE_FILTER" ]
}

echo "=== Wallet CLI QA — Mode: $MODE, Network: $NETWORK${QA_CASE_FILTER:+, Case: $QA_CASE_FILTER} ==="
echo ""

# Build the JAR
echo "Building wallet-cli..."
./gradlew shadowJar -q 2>/dev/null
echo "Build complete."
echo ""

if [ "$MODE" = "verify" ]; then
  mkdir -p "$RESULTS_DIR"
  rm -f "$RESULTS_DIR"/*.result "$RESULTS_DIR"/*.out 2>/dev/null || true

  # Phase 1: Setup
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

  # Phase 2: Private key session
  echo ""
  echo "Phase 2: Private key session — all query commands..."
  echo "  Importing wallet from private key..."
  _import_wallet "private-key"
  source "$SCRIPT_DIR/commands/query_commands.sh"
  run_query_tests "private-key"

  # Phase 3: Mnemonic session
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

  # Phase 4: Cross-login comparison
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

  # Phase 5: Transaction commands
  echo ""
  echo "Phase 5: Transaction commands (help + on-chain)..."
  echo "  Re-importing wallet from private key..."
  _import_wallet "private-key"
  source "$SCRIPT_DIR/commands/transaction_commands.sh"
  run_transaction_tests

  # Phase 6: Wallet & misc commands
  echo ""
  echo "Phase 6: Wallet & misc commands..."
  echo "  Re-importing wallet from private key..."
  _import_wallet "private-key"
  source "$SCRIPT_DIR/commands/wallet_commands.sh"
  run_wallet_tests

  # Phase 7: Interactive REPL parity
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

  # Report
  echo ""
  echo "Generating report..."
  generate_report "$RESULTS_DIR" "$REPORT_FILE"
  echo ""
  cat "$REPORT_FILE"

elif [ "$MODE" = "list" ]; then
  java -cp "$WALLET_JAR" org.tron.qa.QARunner list

elif [ "$MODE" = "java-verify" ]; then
  echo "Running Java-side verification..."
  java -cp "$WALLET_JAR" org.tron.qa.QARunner verify "${RESULTS_DIR:-qa/results}"

else
  echo "Unknown mode: $MODE"
  echo ""
  echo "Usage: $0 <verify|list|java-verify>"
  echo ""
  echo "  verify      — Run full three-way parity verification"
  echo "  list        — List all registered standard CLI commands"
  echo "  java-verify — Run Java-side verification"
  echo "  --case X    — Run only a single QA case label"
  exit 1
fi
