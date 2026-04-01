#!/bin/bash
# Harness configuration — loads from environment variables

NETWORK="${TRON_NETWORK:-nile}"
PRIVATE_KEY="${TRON_TEST_APIKEY}"
MNEMONIC="${TRON_TEST_MNEMONIC:-}"
MASTER_PASSWORD="${MASTER_PASSWORD:-testpassword123A}"
WALLET_JAR="build/libs/wallet-cli.jar"
RESULTS_DIR="harness/results"
REPORT_FILE="harness/report.txt"

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
