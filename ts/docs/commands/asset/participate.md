# wallet-cli asset participate

Buy into a TRC10's ICO at its fixed rate.

## Synopsis

```
wallet-cli asset participate <asset> --pay <trx>
                             [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]] [--permission-id <n>] [options]
```

## Description

Buys tokens directly from an issuer during its ICO window, at the rate fixed when the token was issued. This is **participation in the issuance**, not a market trade — there is no counterparty, no order book and no price discovery. To trade a TRC10 against TRX at a market-ish price, see [`exchange trade`](../exchange/trade.md).

**`--pay` is the TRX you spend, not the tokens you receive.** The chain computes `floor(pay × num ÷ trx_num)` — multiply first, then truncate — and transfers your TRX in full, so a truncated remainder is not refunded. Paying too little to buy even one minimal unit is rejected before broadcast rather than sent and wasted.

The issuer's address is resolved from the token automatically; you never pass it.

`<asset>` is a token id or a name. A purely numeric value is read as an id. Names are not unique on chain — a name matching more than one token is rejected with `ambiguous_asset_name` and the matching ids, so re-run with the id.

**By default the command returns at submission**; `--wait` blocks until confirmed. The received amount is exact integer arithmetic from the token's fixed rate, so it is reported in both cases.

**Ledger accounts are refused** (`ledger_unsupported`): the Ledger TRON app cannot decode `ParticipateAssetIssueContract`.

## Arguments

| Argument | Description |
|---|---|
| `<asset>` | **Required.** Token id or name; a numeric value is read as the id |

## Options

| Option | Description |
|---|---|
| `--pay <string>` | **Required.** TRX to spend — not the number of tokens |
| `--dry-run` | Estimate only, no signature/broadcast; excludes `--sign-only` / `--build-only` |
| `--sign-only` | Sign without broadcasting, output the signed hex; excludes `--dry-run` / `--build-only`; pairs with `--expiration` |
| `--build-only` | Build only, output the **unsigned** hex; excludes `--dry-run` / `--sign-only`; pairs with `--expiration` |
| `--expiration <ms>` | Transaction expiration in ms, up to `86400000` (24h); only with `--sign-only` or `--build-only`; omitted = node default (~60s) |
| `--permission-id <n>` | Permission group to sign with (0=owner, 1=witness, 2-9=active); default `0` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin |

Plus the [global options](../index.md#global-options-every-command).

## Examples

Spend 100 TRX on token 1000124:

```bash
echo "$PW" | wallet-cli asset participate 1000124 --pay 100 \
  --wait --password-stdin --network tron:nile
```

Check what you would get before committing:

```bash
echo "$PW" | wallet-cli asset participate 1000124 --pay 100 \
  --dry-run --password-stdin --network tron:nile
```

## Errors

| Code | Meaning |
|---|---|
| `asset_not_found` | No TRC10 matches that id or name |
| `ambiguous_asset_name` | The name matches several tokens; `details.assetIds` lists them |
| `not_in_ico_window` | The funding window has not opened, or has closed |
| `self_participation` | An issuer cannot buy into its own ICO |
| `invalid_value` | `--pay` is not positive, or too small to buy one unit |
| `ledger_unsupported` | The account is Ledger-backed; use a software account |
| `watch_only_no_signer` | The account cannot sign |
| `transaction_rejected` | The node refused it — e.g. the issuer has run out of sellable supply |

## See also

[`asset info`](info.md) · [`exchange trade`](../exchange/trade.md) · [`asset` group](index.md)
