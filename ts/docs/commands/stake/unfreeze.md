# wallet-cli stake unfreeze

Unstake TRX.

## Synopsis

```
wallet-cli stake unfreeze --amount-sun <n> [--resource energy|bandwidth]
                          [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]] [--permission-id <n>] [options]
```

## Description

Starts unstaking: the amount leaves the staked pool and enters a **redemption waiting period** before it can be claimed with [`stake withdraw`](withdraw.md). The corresponding resource allowance and voting power (TP) drop immediately — votes backed by the unstaked TRX lapse.

Stake 2.0 allows at most **32 pending unstakes** per account at a time; check remaining slots with [`stake info`](info.md). A pending unstake can be rolled back with [`stake cancel-unfreeze`](cancel-unfreeze.md).

**By default the command returns at submission**; `--wait` blocks until confirmed. Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign — `--dry-run` and `--build-only` do not unlock the wallet and run without it. Watch-only accounts fail with `watch_only_no_signer` in a signing mode.

## Options

| Option | Description |
|---|---|
| `--amount-sun <string>` | **Required.** Amount to unstake, in SUN |
| `--resource <energy\|bandwidth>` | Resource type to release (default `bandwidth`) |
| `--dry-run` | Estimate only, no signature/broadcast; excludes `--sign-only` / `--build-only` |
| `--sign-only` | Sign without broadcasting, output the signed hex; excludes `--dry-run` / `--build-only`; pairs with `--expiration` |
| `--build-only` | Build only, output the **unsigned** hex; excludes `--dry-run` / `--sign-only`; pairs with `--expiration` |
| `--expiration <ms>` | Transaction expiration in ms, up to `86400000` (24h); only with `--sign-only` or `--build-only`; omitted = node default (~60s) |
| `--permission-id <n>` | Permission group to sign with (0=owner, 1=witness, 2-9=active); default `0` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin |

Plus the [global options](../index.md#global-options-every-command).

## Examples

In the examples, `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

Default — returns the **submitted** receipt:

```bash
echo "$PW" | wallet-cli stake unfreeze --amount-sun 1000000000 --resource energy --network tron:nile --password-stdin
```

```console
⏳ Unstaked 1,000 TRX
  TxID    d4e...
  Status  pending — not yet on-chain
! Track it: wallet-cli tx info --network tron:nile --txid d4e...
```

```bash
echo "$PW" | wallet-cli stake unfreeze --amount-sun 1000000000 --resource energy --network tron:nile --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"stake.unfreeze","data":{"kind":"stake-unfreeze","stage":"submitted","txId":"d4e...","amountSun":"1000000000","resource":"energy"},"meta":{"durationMs":15,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

Add `--wait` to block until confirmed:

```bash
echo "$PW" | wallet-cli stake unfreeze --amount-sun 1000000000 --resource energy --network tron:nile --wait --password-stdin
```

```console
✅ Unstaked 1,000 TRX
  TxID    d4e...
  Block   #68,763,004
  Status  success — withdrawable after the waiting period
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "stake-unfreeze"`, `stage: "submitted"`, `txId`, `amountSun` (string), `resource` |
| `--wait` (confirmed) | above, plus `confirmed`, `blockNumber`, `feeSun`, `failed` |

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`watch_only_no_signer`, `auth_failed`, `rpc_error`, `timeout`) · `2` usage error.

## See also

[`stake withdraw`](withdraw.md) · [`stake cancel-unfreeze`](cancel-unfreeze.md) · [`stake info`](info.md)
