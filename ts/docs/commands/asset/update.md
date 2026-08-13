# wallet-cli asset update

Update the mutable fields of the TRC10 you issued.

## Synopsis

```
wallet-cli asset update [--description <s>] [--url <url>]
                        [--free-net-per-account <n>] [--public-free-net <n>]
                        [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]] [--permission-id <n>] [options]
```

## Description

Updates the only four fields of a TRC10 that can ever change: its description, its URL, and the two free-bandwidth limits.

There is **no token argument** — the command always targets the token issued by the signing account. Supply, ICO price, ICO dates, precision and the frozen tranches were fixed at issuance and have no modification path on chain; changing them means issuing a new token from a different account.

**Pass only the fields you want to change.** The chain overwrites all four in one operation, so anything you omit is read back from the current on-chain record and rewritten unchanged — omitting `--description` will not blank it. At least one field is required, or there would be nothing to do.

**By default the command returns at submission**; `--wait` blocks until confirmed.

**Ledger accounts are refused** (`ledger_unsupported`): the Ledger TRON app cannot decode `UpdateAssetContract`.

## Options

| Option | Description |
|---|---|
| `--description <string>` | New description, up to 200 bytes |
| `--url <string>` | New project page; must not be empty, up to 256 bytes |
| `--free-net-per-account <n>` | Free bandwidth each holder may use |
| `--public-free-net <n>` | Shared free bandwidth pool for holders |
| `--dry-run` | Estimate only, no signature/broadcast; excludes `--sign-only` / `--build-only` |
| `--sign-only` | Sign without broadcasting, output the signed hex; excludes `--dry-run` / `--build-only`; pairs with `--expiration` |
| `--build-only` | Build only, output the **unsigned** hex; excludes `--dry-run` / `--sign-only`; pairs with `--expiration` |
| `--expiration <ms>` | Transaction expiration in ms, up to `86400000` (24h); only with `--sign-only` or `--build-only`; omitted = node default (~60s) |
| `--permission-id <n>` | Permission group to sign with (0=owner, 1=witness, 2-9=active); default `0` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin |

Plus the [global options](../index.md#global-options-every-command).

## Examples

Change only the URL; the other three keep their current values:

```bash
echo "$PW" | wallet-cli asset update --url https://mytoken.io/v2 \
  --wait --password-stdin --network tron:nile
```

Raise both bandwidth allowances at once:

```bash
echo "$PW" | wallet-cli asset update --free-net-per-account 1000 --public-free-net 10000 \
  --wait --password-stdin --network tron:nile
```

## Errors

| Code | Meaning |
|---|---|
| `not_an_issuer` | This account has not issued a TRC10 |
| `invalid_value` | No field given, or URL/description out of bounds |
| `ledger_unsupported` | The account is Ledger-backed; use a software account |
| `watch_only_no_signer` | The account cannot sign |
| `transaction_rejected` | The node refused it — the message carries its reason |

## See also

[`asset issue`](issue.md) · [`asset info`](info.md) · [`asset` group](index.md)
