# wallet-cli asset issue

Issue a TRC10 token and lock in its ICO terms.

## Synopsis

```
wallet-cli asset issue --name <name> --supply <n> --price <trx>:<tokens>
                       --start <datetime> --end <datetime> --url <url>
                       [--abbr <s>] [--precision <0-6>] [--description <s>]
                       [--free-net-per-account <n>] [--public-free-net <n>]
                       [--freeze <amount>:<days> ...]
                       [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]] [--permission-id <n>] [options]
```

## Description

Issues a TRC10 token and fixes its ICO terms in the same transaction.

**This is irreversible in two ways.** The issuance fee is burned and never refunded, and an account can only ever issue **one** TRC10 — get it wrong and your only option is a different account. There is no confirmation prompt (it would break scripted use); preview with `--dry-run` instead.

Only `--description`, `--url`, `--free-net-per-account` and `--public-free-net` can be changed afterwards, via [`asset update`](update.md). Supply, price, ICO dates, precision and the frozen tranches have no on-chain modification path at all.

**`--price` is converted using `--precision`.** On chain the rate is a pair of int32s meaning "`trx_num` sun buys `num` minimal units", so the same `--price 1:100` stores as `trx_num=1, num=100` at `--precision 6` but `trx_num=10000, num=1` at `--precision 0`. The CLI reduces the fraction to lowest terms and refuses the issuance if either side no longer fits in an int32 — a silently truncated rate would misprice the token permanently.

`--start` and `--end` are always read as **UTC**, so they mean the same thing on any machine. A bare date is midnight UTC, which means the earliest date-only `--start` is tomorrow; pass a time to open the sale today.

Chain limits we cannot read are not pre-checked. The node exposes no RPC for the maximum tranche count, the tranche day bounds or the daily bandwidth limit, so those are left to the node to reject — which costs nothing, because a rejected transaction never enters a block and burns no fee.

**By default the command returns at submission**; `--wait` blocks until confirmed. **The asset id is assigned by the chain**, so it only appears in the receipt once confirmed — without `--wait` the response carries the txid and no `assetId`.

**Ledger accounts are refused** (`ledger_unsupported`): the Ledger TRON app cannot decode `AssetIssueContract`.

## Options

| Option | Description |
|---|---|
| `--name <string>` | **Required.** Token name, 1–32 visible ASCII characters — no spaces, no non-ASCII |
| `--supply <string>` | **Required.** Total supply, in whole tokens |
| `--price <trx>:<tokens>` | **Required.** ICO rate in whole TRX to whole tokens, e.g. `1:100` |
| `--start <datetime>` | **Required.** ICO start, `YYYY-MM-DD` or `"YYYY-MM-DD HH:mm:ss"`, read as UTC; must be in the future |
| `--end <datetime>` | **Required.** ICO end, same format, must be after `--start` |
| `--url <string>` | **Required.** Project page; must not be empty, up to 256 bytes |
| `--abbr <string>` | Token abbreviation; same character rules as `--name` |
| `--precision <0-6>` | Decimal places (default `0`) |
| `--description <string>` | Short description, up to 200 bytes |
| `--free-net-per-account <n>` | Free bandwidth each holder may use |
| `--public-free-net <n>` | Shared free bandwidth pool for holders |
| `--freeze <amount>:<days>` | Frozen tranche, amount in whole tokens; repeatable for multiple tranches |
| `--dry-run` | Estimate only, no signature/broadcast; excludes `--sign-only` / `--build-only` |
| `--sign-only` | Sign without broadcasting, output the signed hex; excludes `--dry-run` / `--build-only`; pairs with `--expiration` |
| `--build-only` | Build only, output the **unsigned** hex; excludes `--dry-run` / `--sign-only`; pairs with `--expiration` |
| `--expiration <ms>` | Transaction expiration in ms, up to `86400000` (24h); only with `--sign-only` or `--build-only`; omitted = node default (~60s) |
| `--permission-id <n>` | Permission group to sign with (0=owner, 1=witness, 2-9=active); default `0` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin |

Plus the [global options](../index.md#global-options-every-command).

## Examples

In the examples, `$PW` is your master password, fed on stdin via `--password-stdin`.

Preview before spending anything — always do this first:

```bash
echo "$PW" | wallet-cli asset issue --name MyToken --abbr MTK --supply 1000000000 \
  --price 1:100 --precision 6 --start 2026-08-01 --end 2026-08-31 \
  --url https://mytoken.io --dry-run --password-stdin --network tron:nile
```

Issue with two frozen tranches, waiting for the id:

```bash
echo "$PW" | wallet-cli asset issue --name MyToken --abbr MTK --supply 1000000000 \
  --price 1:100 --precision 6 --start 2026-08-01 --end 2026-08-31 \
  --url https://mytoken.io --description "Demo TRC10" \
  --freeze 100000000:30 --freeze 50000000:90 \
  --wait --password-stdin --network tron:nile
```

## Errors

| Code | Meaning |
|---|---|
| `already_issued_asset` | This account has already issued a TRC10 |
| `invalid_asset_name` | `--name` / `--abbr` is not 1–32 visible ASCII characters |
| `invalid_value` | Price, precision, dates, byte lengths or tranche syntax out of range |
| `ledger_unsupported` | The account is Ledger-backed; use a software account |
| `watch_only_no_signer` | The account cannot sign |
| `transaction_rejected` | The node refused it — the message carries its reason |

## See also

[`asset update`](update.md) · [`asset info`](info.md) · [`asset` group](index.md)
