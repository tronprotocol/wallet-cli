#!/usr/bin/env bash
set -euo pipefail

CLI="${CLI:-./gradlew -q run}"

run_cli() {
  # shellcheck disable=SC2206
  local cli_parts=($CLI)
  "${cli_parts[@]}" --args="$*"
}

run_cli "--output json --network main alias-resolve --name USDT --type TOKEN" \
  | grep -q '"address": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"'

run_cli "--network main alias-list --type TOKEN" \
  | grep -q 'USDT'

if run_cli "--network main alias-add --name USDT --type TOKEN --address TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" >/tmp/wallet-cli-alias.out 2>&1; then
  echo "expected built-in alias override to fail" >&2
  exit 1
fi
grep -q 'built in' /tmp/wallet-cli-alias.out

echo "alias QA passed"
