# wallet-cli stake cancel-unfreeze

Cancel all pending unstakes (roll back to frozen).

## Synopsis

```
wallet-cli stake cancel-unfreeze [--dry-run | --sign-only] [--wait [--wait-timeout <ms>]] [options]
```

## Description

Cancels **every** unstake still in its waiting period and rolls those amounts back to staked — resource allowance and voting power return accordingly. It is all-or-nothing: TRON has no per-entry cancel. Any entries that have already expired are withdrawn to balance as part of the same transaction.

**By default the command returns at submission**; `--wait` blocks until confirmed. Requires an account and the master password via `--password-stdin`; watch-only accounts fail with `watch_only_no_signer`.

## Options

| Option | Description |
|---|---|
| `--dry-run` | Estimate only, no signature/broadcast; excludes `--sign-only` |
| `--sign-only` | Sign without broadcasting; excludes `--dry-run` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin |

Plus the [global options](../index.md#global-options-every-command).

## Examples

In the examples, `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

Default — returns the **submitted** receipt:

```console
$ echo "$PW" | wallet-cli stake cancel-unfreeze --network tron:nile --password-stdin
⏳ Cancelled pending unstakes
  TxID    9ec...
  Status  pending — not yet on-chain
! Track it: wallet-cli tx info --network tron:nile --txid 9ec...
```

```console
$ echo "$PW" | wallet-cli stake cancel-unfreeze --network tron:nile --password-stdin -o json
{"schema":"wallet-cli.result.v1","success":true,"command":"tron.stake.cancel-unfreeze","data":{"kind":"stake-cancel","stage":"submitted","txId":"9ec..."},"meta":{"durationMs":15,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

Add `--wait` to block until confirmed:

```console
$ echo "$PW" | wallet-cli stake cancel-unfreeze --network tron:nile --wait --password-stdin
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
