# Scripting wallet-cli

How to call wallet-cli from shell scripts and CI. This is the gentle version; the formal contract lives in [machine-interface.md](../machine-interface.md).

## Discovering the surface

Before hard-coding anything, ask the CLI what it supports. One call returns every command, its flags as JSON Schema, which chain families it serves, and the complete error-code index:

```bash
wallet-cli --json-schema | jq '.commands[] | select(.id == "tx.send") | {families, examples}'
wallet-cli --json-schema | jq '.errorCodes'
```

Prefer this to scraping `--help`; the catalog is the same source the parser and the help text are generated from.

## The three habits

**1. Always `-o json`.** Text output is for eyeballs and may change; JSON is the contract. stdout carries exactly one JSON object per run:

```bash
wallet-cli account balance --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"account.balance","data":{"address":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","balance":"1976489000","decimals":6,"symbol":"TRX"},"meta":{"durationMs":1114,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

**2. Check the exit code, then `error.code`.** `0` success, `1` runtime failure, `2` you built the command wrong. Two of the exit-`2` codes are worth handling by name when a script switches networks: `family_mismatch` (this command or account does not belong to the selected network's chain) and `invalid_option` (a flag that belongs to the other family):

```bash
if out=$(wallet-cli account balance --network tron:nile -o json); then
  bal=$(jq -r '.data.balance' <<<"$out")     # raw SUN, as a *string*
else
  code=$(jq -r '.error.code' <<<"$out")      # e.g. timeout, rpc_error
fi
```

**3. Secrets via stdin, never argv.** Passwords/mnemonics/keys in arguments would end up in shell history and `ps` output. wallet-cli does not read dedicated secret environment variables either:

```bash
printf '%s' "$PW" | wallet-cli tx send --to T... --amount 1 \
  --network tron:nile --password-stdin -o json
```

(`$PW` should come from your secret store as a short-lived shell variable for this pipe, not from a file in the repo and not from a long-lived `export`. Only one `*-stdin` flag per run.)

## Waiting for confirmation

`tx send` returns at submission. For scripts, the simplest safe form is `--wait`:

```bash
wallet-cli tx send --to T... --amount 1 --network tron:nile \
  --password-stdin --wait --wait-timeout 90000 -o json
```

Or decouple: capture `data.txId`, then poll [`tx status`](../commands/tx/status.md) until `data.state` is `confirmed` (abort on `failed`). The full four-state polling pattern, including the batch-operation rules, is in [machine-interface.md → Script safety](../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed).

## Sign here, broadcast there

`--sign-only` separates signing from broadcast, but it still builds and estimates through the selected RPC endpoint before signing. For a signing machine with no chain access, build unsigned hex online, sign that artifact offline, then broadcast from an online machine:

```bash
# on the connected build machine
wallet-cli tx send --to T... --amount 1 --network tron:nile \
  --build-only -o json | jq -r '.data.hex' > unsigned.hex

# on the offline signing machine
printf '%s' "$PW" | wallet-cli tx sign --file unsigned.hex --network tron:nile \
  --offline --password-stdin --out signed.hex

# on the connected machine
wallet-cli tx broadcast --file signed.hex --network tron:nile -o json
```

The **hex** form above works on both chain families — protobuf on TRON, RLP on EVM. If the signing machine does have RPC access and you only want to withhold broadcast, `tx send --sign-only` emits signed hex directly.

TRON also accepts signed transaction JSON, but JSON must go through `--transaction` or `--tx-stdin`; `--file` and `--hex` are hex-only:

```bash
wallet-cli tx send ... --sign-only -o json | jq -c '.data.signed' > signed.json
wallet-cli tx broadcast --tx-stdin --network tron:nile -o json < signed.json
```

`--transaction` and `--tx-stdin` are tagged `(tron only)`; on an EVM network they fail with `invalid_option`. Prefer `--file` / `--hex` in scripts that may target either.

## Timeouts and retries

Every RPC/device call is bounded by `--timeout` (ms). On `error.code = "timeout"`, retrying with a larger value is safe for **read** commands; for `tx send`, first check `tx status` on the txid you may already have submitted — blind resend is how double-spends happen.

## See also

- [Machine interface](../machine-interface.md) — envelope schema, error codes, stability promise
- [Command reference](../commands/index.md) — each command's `data` payload, and [which commands run on which networks](../commands/index.md#which-commands-run-on-which-networks)
