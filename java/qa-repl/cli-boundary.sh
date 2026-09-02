#!/usr/bin/env bash
# The flip side of the REPL regression: with the standard CLI gone, the entry point
# must accept only `--version` / `--help` and point everything else at the TS CLI.
set -uo pipefail
JAR="${1:?usage: cli-boundary.sh <jar>}"
pass=0; fail=0
check() { # name expected_exit pattern args...
  local name="$1" want="$2" pat="$3"; shift 3
  local out; out="$(java -jar "$JAR" "$@" 2>&1)"; local code=$?
  if [[ "$code" == "$want" ]] && grep -Eqi -- "$pat" <<<"$out"; then
    echo "[PASS] $name (exit $code)"; ((pass++))
  else
    echo "[FAIL] $name (exit $code, want $want) output: ${out:0:200}"; ((fail++))
  fi
}
check "--version"        0 "wallet-cli *v?4\.13\.0" --version
check "--help"           0 "interactive wallet shell" --help
check "unknown-flag"     2 "standard cli has been removed" --output json
check "removed-command"  2 "standard cli has been removed" getbalance
check "removed-cmd-args" 2 "npx @tron-walletcli/wallet-cli" sendcoin T1 1
echo "TOTAL PASS=$pass FAIL=$fail"
[[ $fail -eq 0 ]]
