# Scripting wallet-cli

How to call wallet-cli from shell scripts and CI. This is the gentle version; the formal contract lives in [machine-interface.md](../machine-interface.md).

## The three habits

**1. Always `-o json`.** Text output is for eyeballs and may change; JSON is the contract. stdout carries exactly one JSON object per run:

```bash
wallet-cli account balance --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"account.balance","data":{"address":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","balance":"1976489000","decimals":6,"symbol":"TRX"},"meta":{"durationMs":1114,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

**2. Check the exit code, then `error.code`.** `0` success, `1` runtime failure, `2` you built the command wrong:

```bash
if out=$(wallet-cli account balance --network tron:nile -o json); then
  bal=$(jq -r '.data.balance' <<<"$out")     # raw SUN, as a *string*
else
  code=$(jq -r '.error.code' <<<"$out")      # e.g. timeout, rpc_error
fi
```

**3. Secrets via stdin, never argv.** Passwords/mnemonics/keys in arguments would end up in shell history and `ps` output:

```bash
printf '%s' "$PW" | wallet-cli tx send --to T... --amount 1 \
  --network tron:nile --password-stdin -o json
```

(`$PW` should come from your secret store, not from a file in the repo. Only one `*-stdin` flag per run.)

## Waiting for confirmation

`tx send` returns at submission. For scripts, the simplest safe form is `--wait`:

```bash
wallet-cli tx send --to T... --amount 1 --network tron:nile \
  --password-stdin --wait --wait-timeout 90000 -o json
```

Or decouple: capture `data.txId`, then poll [`tx status`](../commands/tx/status.md) until `data.state` is `confirmed` (abort on `failed`). The full four-state polling pattern, including the batch-operation rules, is in [machine-interface.md → Script safety](../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed).

## Sign here, broadcast there

`--sign-only` and `tx broadcast` split signing from submission, so the machine holding keys never needs chain access:

```bash
# on the signing machine
wallet-cli tx send --to T... --amount 1 --network tron:nile \
  --password-stdin --sign-only -o json | jq -c '.data.signed' > signed.json

# on the connected machine
wallet-cli tx broadcast --tx-stdin --network tron:nile -o json < signed.json
```

## Timeouts and retries

Every RPC/device call is bounded by `--timeout` (ms). On `error.code = "timeout"`, retrying with a larger value is safe for **read** commands; for `tx send`, first check `tx status` on the txid you may already have submitted — blind resend is how double-spends happen.

## See also

- [Machine interface](../machine-interface.md) — envelope schema, error codes, stability promise
- [Command reference](../commands/index.md) — each command's `data` payload
