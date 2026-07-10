# wallet-cli stake unfreeze

Unstake TRX (UnfreezeBalanceV2).

## Synopsis

```
wallet-cli stake unfreeze --amount-sun <n> [--resource energy|bandwidth]
                          [--dry-run | --sign-only] [--wait [--wait-timeout <ms>]] [options]
```

## Description

Starts unstaking: the amount leaves the staked pool and enters a **redemption waiting period** before it can be claimed with [`stake withdraw`](withdraw.md). The corresponding resource allowance and voting power (TP) drop immediately — votes backed by the unstaked TRX lapse.

Stake 2.0 allows at most **32 pending unstakes** per account at a time; check remaining slots with [`stake info`](info.md). A pending unstake can be rolled back with [`stake cancel-unfreeze`](cancel-unfreeze.md).

**By default the command returns at submission**; `--wait` blocks until confirmed. Requires an account and the master password via `--password-stdin`; watch-only accounts fail with `watch_only_no_signer`.

## Options

| Option | Description |
|---|---|
| `--amount-sun <string>` | **Required.** Amount to unstake, in SUN |
| `--resource <energy\|bandwidth>` | Resource type to release (default `bandwidth`) |
| `--dry-run` | Estimate only, no signature/broadcast; excludes `--sign-only` |
| `--sign-only` | Sign without broadcasting; excludes `--dry-run` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin |

Plus the [global options](../index.md#global-options-every-command).

## Examples

Default — returns the **submitted** receipt:

```console
$ echo "$PW" | wallet-cli stake unfreeze --amount-sun 1000000000 --resource energy --network tron:nile --password-stdin
⏳ Unstaked 1,000 TRX
  TxID    d4e...
  Status  pending — not yet on-chain
! Track it: wallet-cli tx info --network tron:nile --txid d4e...
```

```console
$ echo "$PW" | wallet-cli stake unfreeze --amount-sun 1000000000 --resource energy --network tron:nile --password-stdin -o json
{"schema":"wallet-cli.result.v1","success":true,"command":"tron.stake.unfreeze","data":{"kind":"stake-unfreeze","stage":"submitted","txId":"d4e...","amountSun":"1000000000","resource":"energy"},"meta":{"durationMs":15,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

Add `--wait` to block until confirmed:

```console
$ echo "$PW" | wallet-cli stake unfreeze --amount-sun 1000000000 --resource energy --network tron:nile --wait --password-stdin
✅ Unstaked 1,000 TRX
  TxID    d4e...
  Block   #68,763,004
  Fee     0 TRX
  Status  success — withdrawable after the waiting period
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "stake-unfreeze"`, `stage: "submitted"`, `txId`, `amountSun` (string), `resource` |
| `--wait` (confirmed) | above, plus `confirmed`, `blockNumber`, `feeSun`, `failed` |

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`watch_only_no_signer`, `wrong_password`, `rpc_error`, `timeout`) · `2` usage error.

## See also

[`stake withdraw`](withdraw.md) · [`stake cancel-unfreeze`](cancel-unfreeze.md) · [`stake info`](info.md)
