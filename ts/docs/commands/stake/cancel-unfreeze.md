# wallet-cli stake cancel-unfreeze

Cancel all pending unstakes (roll back to frozen).

## Synopsis

```
wallet-cli stake cancel-unfreeze [--dry-run | --sign-only | --build-only] [--wait [--wait-timeout <ms>]] [options]
```

## Description

Cancels **every** unstake still in its waiting period and rolls those amounts back to staked — resource allowance and voting power return accordingly. It is all-or-nothing: TRON has no per-entry cancel. Any entries that have already expired are withdrawn to balance as part of the same transaction.

**By default the command returns at submission**; `--wait` blocks until confirmed. Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign — `--dry-run` and `--build-only` do not unlock the wallet and run without it. Watch-only accounts fail with `watch_only_no_signer` in a signing mode.

## Options

| Option | Description |
|---|---|
| `--dry-run` | Estimate only, no signature/broadcast |
| `--sign-only` | Sign without broadcasting |
| `--build-only` | Build and output the unsigned transaction hex **without unlocking** — the entry point for [multi-party or offline signing](../tx/index.md) |
| `--permission-id <0-9>` | TRON permission group id used to authorize this transaction (default `0`) |
| `--expiration <ms>` | Expiration duration in ms (1–86400000); only with `--sign-only` / `--build-only` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin |

`--dry-run`, `--sign-only`, and `--build-only` are mutually exclusive.

Plus the [global options](../index.md#global-options-every-command).

## Examples

In the examples, `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

Default — returns the **submitted** receipt:

```bash
echo "$PW" | wallet-cli stake cancel-unfreeze --network tron:nile --password-stdin
```

```console
⏳ Cancelled pending unstakes
  TxID    9ec...
  Status  pending — not yet on-chain
! Track it: wallet-cli tx info --network tron:nile --txid 9ec...
```

```bash
echo "$PW" | wallet-cli stake cancel-unfreeze --network tron:nile --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"stake.cancel-unfreeze","data":{"kind":"stake-cancel","stage":"submitted","txId":"9ec..."},"meta":{"durationMs":15,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

Add `--wait` to block until confirmed:

```bash
echo "$PW" | wallet-cli stake cancel-unfreeze --network tron:nile --wait --password-stdin
```

```console
✅ Cancelled pending unstakes
  TxID    d3b...
  Block   #68,762,990
  Fee     0.25 TRX
  Status  success
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "stake-cancel"`, `stage: "submitted"`, `txId` |
| `--wait` (confirmed) | above, plus `confirmed`, `blockNumber`, `feeSun`, `failed` |

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`watch_only_no_signer`, `auth_failed`, `rpc_error`, `timeout`) · `2` usage error.

## See also

[`stake unfreeze`](unfreeze.md) · [`stake info`](info.md)
