# wallet-cli asset update

Change the mutable fields of the TRC10 you issued.

## Synopsis

```
wallet-cli asset update [--description <s>] [--url <url>]
                        [--free-net-per-account <n>] [--public-free-net <n>]
                        [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]]
                        [--permission-id <n>] [options]
```

## Description

There is no token argument: the command always targets the TRC10 issued by the signing account. An account that has not issued one fails with `not_an_issuer`.

**Only four fields can ever change** — description, URL, free bandwidth per holder, and the shared free-bandwidth pool. Supply, precision, ICO rate, ICO window, and frozen tranches were fixed at issuance and the chain offers no way to alter them.

Pass only the fields you are changing. The others are read from chain and written back unchanged, so nothing is silently cleared; at least one field is required. The receipt shows all four as they now stand.

**By default the command returns at submission** (`stage: "submitted"`), not confirmation — add `--wait` to block until confirmed/failed. Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign — `--dry-run` and `--build-only` do not unlock the wallet and run without it. Watch-only accounts fail with `watch_only_no_signer` in a signing mode.

## Options

| Option | Description |
|---|---|
| `--description <s>` | New description, ≤ 200 bytes (unchanged if omitted) |
| `--url <url>` | New project page, non-empty, ≤ 256 bytes (unchanged if omitted) |
| `--free-net-per-account <n>` | Free bandwidth each holder may use (unchanged if omitted) |
| `--public-free-net <n>` | Shared free-bandwidth pool for holders (unchanged if omitted) |
| `--dry-run` | Build and estimate only, no signature/broadcast; excludes `--sign-only` / `--build-only` |
| `--sign-only` | Sign without broadcasting, output the signed hex; excludes `--dry-run` / `--build-only`; pairs with `--expiration` |
| `--build-only` | Build only, output the **unsigned** hex; excludes `--dry-run` / `--sign-only`; pairs with `--expiration` |
| `--expiration <ms>` | Transaction expiration in ms, up to `86400000` (24h); only with `--sign-only` or `--build-only`; omitted = node default (~60s) |
| `--permission-id <n>` | Permission group to sign with (0=owner, 1=witness, 2-9=active); default `0` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin (fd 0) |

Plus the [global options](../index.md#global-options-every-command).

## Examples

In the examples, `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

```bash
echo "$PW" | wallet-cli asset update --url https://mytoken.io/v2 --network tron:nile --wait --password-stdin
```

```console
✅ Asset updated
  Asset             MyToken  (id 1000123)
  Issuer            TQkXm4vN...5Zt7Uw (main)
  Url               https://mytoken.io/v2
  Description       Demo TRC10
  Free net/account  0
  Public free net   0
  TxID              9e3...
  Block             57,883,190
  Fee               0 TRX  (295 bandwidth)
  Status            success
```

```bash
echo "$PW" | wallet-cli asset update --url https://mytoken.io/v2 --network tron:nile --wait --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"asset.update","data":{"kind":"asset-update","stage":"confirmed","txId":"9e3...","confirmed":true,"blockNumber":57883190,"failed":false,"assetId":"1000123","name":"MyToken","issuerAddress":"TQkXm4vN...","url":"https://mytoken.io/v2","description":"Demo TRC10","freeAssetNetLimit":0,"publicFreeAssetNetLimit":0,"feeSun":0,"resource":{"netUsage":295,"netFeeSun":0,"energyUsage":0,"energyFeeSun":0}},"meta":{"durationMs":6480,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "asset-update"`, `stage: "submitted"`, `txId`, `assetId`, `name`, `issuerAddress`, and the four fields as submitted |
| `--wait` (confirmed) | above, plus `stage: "confirmed"`, `confirmed` (boolean), `blockNumber`, `feeSun`, `resource`, `failed` |

The four fields are `url`, `description`, `freeAssetNetLimit`, and `publicFreeAssetNetLimit` — always all four, including the ones read back unchanged.

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`not_an_issuer` — this account has not issued a TRC10, `watch_only_no_signer`, `auth_failed`) · `2` usage error (`missing_option` — no field given; `invalid_value` — URL or description too long, bandwidth limits out of range).

## See also

[`asset issue`](issue.md) · [`asset info`](info.md) · [Script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed)
