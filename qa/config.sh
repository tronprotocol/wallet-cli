#!/bin/bash
# QA configuration — loads from environment variables

NETWORK="${TRON_NETWORK:-nile}"
PRIVATE_KEY="${TRON_TEST_APIKEY}"
MNEMONIC="${TRON_TEST_MNEMONIC:-}"
MASTER_PASSWORD="${MASTER_PASSWORD:-testpassword123A}"
WALLET_JAR="build/libs/wallet-cli.jar"
RESULTS_DIR="qa/results"
REPORT_FILE="qa/report.txt"

if [ -z "$PRIVATE_KEY" ]; then
  echo "TRON_TEST_APIKEY not set. Please enter your Nile testnet private key:"
  read -r PRIVATE_KEY
fi

if [ -z "$MNEMONIC" ]; then
  echo "TRON_TEST_MNEMONIC not set (optional). Mnemonic tests will be skipped."
fi

export MASTER_PASSWORD
export TRON_TEST_APIKEY="$PRIVATE_KEY"
export TRON_TEST_MNEMONIC="$MNEMONIC"
export TRON_PRIVATE_KEY="$PRIVATE_KEY"
export TRON_MNEMONIC="$MNEMONIC"

# Import wallet from private key so standard CLI can auto-login from keystore
_import_wallet() {
  local method="$1"
  # Clean existing wallet
  rm -rf Wallet/ 2>/dev/null
  if [ "$method" = "private-key" ]; then
    MASTER_PASSWORD="$MASTER_PASSWORD" \
      TRON_TEST_APIKEY="$PRIVATE_KEY" \
      java -cp "$WALLET_JAR" org.tron.qa.QASecretImporter private-key 2>/dev/null \
      | grep -v "^User defined" || true
  elif [ "$method" = "mnemonic" ] && [ -n "$MNEMONIC" ]; then
    MASTER_PASSWORD="$MASTER_PASSWORD" \
      TRON_TEST_MNEMONIC="$MNEMONIC" \
      java -cp "$WALLET_JAR" org.tron.qa.QASecretImporter mnemonic 2>/dev/null \
      | grep -v "^User defined" || true
  fi
}
