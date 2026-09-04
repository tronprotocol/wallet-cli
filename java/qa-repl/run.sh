#!/usr/bin/env bash
# Drive the REPL regression against a built wallet-cli.jar.
#   ./run.sh <jar> <label>
set -uo pipefail
JAR_PATH="${1:?usage: run.sh <jar> <label>}"
LABEL="${2:-run}"
ENV_FILE="${ENV_FILE:-$(cd "$(dirname "$0")/../.." && pwd)/ts/.private/.env.test}"
OUT_DIR="${OUT_DIR:-$(mktemp -d)}/$LABEL"
mkdir -p "$OUT_DIR"

set -a; . "$ENV_FILE"; set +a
cd "$OUT_DIR"
TERM=dumb JAR="$JAR_PATH" REPL_LOG="$OUT_DIR/full.log" \
  expect -f "$(cd "$(dirname "$0")" && pwd)/regression.exp" > "$OUT_DIR/result.txt" 2>&1
STATUS=$?
grep -E '^\[(PASS|FAIL)\]|^  |^TOTAL|^FAILED' "$OUT_DIR/result.txt"
echo "log: $OUT_DIR/full.log"
exit $STATUS
