# wallet-cli stake withdraw

Withdraw expired unfrozen TRX.

## Synopsis

```
wallet-cli stake withdraw [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]]
                          [--permission-id <n>] [options]
```

## Description

Claims every pending unstake whose waiting period has expired, moving the TRX back into the account's available balance. One call sweeps all expired entries — there is nothing to select. See what is currently withdrawable (and when the rest matures) with [`stake info`](info.md).

Withdrawing also frees up unstake slots (max 32 pending unstakes per account).

**By default the command returns at submission**; `--wait` blocks until confirmed. Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign — `--dry-run` and `--build-only` do not unlock the wallet and run without it. Watch-only accounts fail with `watch_only_no_signer` in a signing mode.

## Options

| Option | Description |
|---|---|
| `--dry-run` | Estimate only, no signature/broadcast; excludes `--sign-only` / `--build-only` |
| `--sign-only` | Sign without broadcasting, output the signed hex; excludes `--dry-run` / `--build-only`; pairs with `--expiration` |
| `--build-only` | Build only, output the **unsigned** hex; excludes `--dry-run` / `--sign-only`; pairs with `--expiration` |
| `--expiration <ms>` | Transaction expiration in ms, up to `86400000` (24h); only with `--sign-only` or `--build-only`; omitted = node default (~60s) |
| `--permission-id <n>` | Permission group to sign with (0=owner, 1=witness, 2–9=active); default `0` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin |

Plus the [global options](../index.md#global-options-every-command).

## Examples

In the examples, `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

Default — returns the **submitted** receipt:

```bash
echo "$PW" | wallet-cli stake withdraw --network tron:nile --password-stdin
```

```console
⏳ Withdrew expired TRX to balance
  TxID    e5f...
  Status  pending — not yet on-chain
! Track it: wallet-cli tx info --network tron:nile --txid e5f...
```

```bash
echo "$PW" | wallet-cli stake withdraw --network tron:nile --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"stake.withdraw","data":{"kind":"stake-withdraw","stage":"submitted","txId":"e5f..."},"meta":{"durationMs":15,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

Add `--wait` to block until confirmed:

```bash
echo "$PW" | wallet-cli stake withdraw --network tron:nile --wait --password-stdin
```

```console
✅ Withdrew expired TRX to balance
  TxID    e5f...
  Block   #68,763,120
  Status  success
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "stake-withdraw"`, `stage: "submitted"`, `txId` |
| `--wait` (confirmed) | above, plus `confirmed`, `blockNumber`, `feeSun`, `failed` |

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`watch_only_no_signer`, `auth_failed`, `rpc_error`, `timeout`) · `2` usage error.

## See also

[`stake unfreeze`](unfreeze.md) · [`stake info`](info.md) · [`reward withdraw`](../reward/withdraw.md) (voting rewards are a separate command)
