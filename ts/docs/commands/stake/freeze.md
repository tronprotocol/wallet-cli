# wallet-cli stake freeze

Stake TRX for energy/bandwidth.

## Synopsis

```
wallet-cli stake freeze --amount-sun <n> [--resource energy|bandwidth]
                        [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]] [--permission-id <n>] [options]
```

## Description

Stakes TRX from the active account's balance (Stake 2.0) in exchange for a steady allowance of the chosen resource — `energy` (smart-contract execution) or `bandwidth` (transaction bytes, the default). Staking also grants voting power: 1 staked TRX = 1 TP, spendable via [`vote cast`](../vote/cast.md).

Amount is in SUN (1 TRX = 1,000,000 SUN). Staked TRX stays yours; to get it back, [`stake unfreeze`](unfreeze.md) and, after the waiting period, [`stake withdraw`](withdraw.md).

**By default the command returns at submission**; `--wait` blocks until confirmed. Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign — `--dry-run` and `--build-only` do not unlock the wallet and run without it. Watch-only accounts fail with `watch_only_no_signer` in a signing mode.

## Options

| Option | Description |
|---|---|
| `--amount-sun <string>` | **Required.** Amount to stake, in SUN |
| `--resource <energy\|bandwidth>` | Resource type to obtain (default `bandwidth`) |
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

Default — stake 1,000 TRX for energy, returns the **submitted** receipt:

```bash
echo "$PW" | wallet-cli stake freeze --amount-sun 1000000000 --resource energy --network tron:nile --password-stdin
```

```console
⏳ Staked 1,000 TRX for energy
  TxID    c3d...
  Status  pending — not yet on-chain
! Track it: wallet-cli tx info --network tron:nile --txid c3d...
```

```bash
echo "$PW" | wallet-cli stake freeze --amount-sun 1000000000 --resource energy --network tron:nile --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"stake.freeze","data":{"kind":"stake-freeze","stage":"submitted","txId":"c3d...","amountSun":"1000000000","resource":"energy"},"meta":{"durationMs":15,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

Add `--wait` to block until confirmed:

```bash
echo "$PW" | wallet-cli stake freeze --amount-sun 1000000000 --resource energy --network tron:nile --wait --password-stdin
```

```console
✅ Staked 1,000 TRX for energy
  TxID    c3d...
  Block   #68,762,990
  Status  success
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "stake-freeze"`, `stage: "submitted"`, `txId`, `amountSun` (string), `resource` |
| `--wait` (confirmed) | above, plus `confirmed`, `blockNumber`, `feeSun`, `failed` |

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`watch_only_no_signer`, `auth_failed`, `rpc_error`, `timeout`) · `2` usage error.

## See also

[`stake info`](info.md) · [`stake unfreeze`](unfreeze.md) · [`stake delegate`](delegate.md) · [Staking guide](../../guide/stake-and-resources.md)
