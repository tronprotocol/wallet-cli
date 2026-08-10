# wallet-cli exchange create

Create a Bancor pair and seed both sides.

## Synopsis

```
wallet-cli exchange create --pair <a>:<b> (--amounts <a>:<b> | --raw-amounts <a>:<b>)
                           [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]] [--permission-id <n>] [options]
```

## Description

Creates a Bancor exchange pair and seeds it with liquidity on both sides in one transaction.

**Irreversible in one respect:** the creating account is the **only** account that can ever inject or withdraw this pair's liquidity, and the chain has no path to transfer that. Create with the wrong account and the liquidity is reachable only from that account. The creation fee is burned on top of both initial amounts leaving your balance.

Either side may be TRX or a TRC10 id, and the two must differ. **Sides keep the order you type** — `--pair TRX:1000123` puts TRX first on chain, `--pair 1000123:TRX` puts it second. Both orders are valid; the pair reads the same either way.

The **ratio of the two initial amounts is the pair's starting price**. `--pair TRX:1000123 --amounts 10000:500000` opens a pair quoting roughly 1 TRX ≈ 50 units of token 1000123. Every trade thereafter moves it.

**By default the command returns at submission**; `--wait` blocks until confirmed. **The exchange id is assigned by the chain**, so it appears only once confirmed — without `--wait` you get the txid and no `exchangeId`.

## Options

| Option | Description |
|---|---|
| `--pair <a>:<b>` | **Required.** The two sides — `TRX` or a numeric TRC10 id; they must differ |
| `--amounts <a>:<b>` | Amount for each side, in whole tokens, in `--pair` order. Exactly one of this or `--raw-amounts` |
| `--raw-amounts <a>:<b>` | Amount for each side, in minimal units. Exactly one of this or `--amounts` |
| `--dry-run` | Estimate only, no signature/broadcast; excludes `--sign-only` / `--build-only` |
| `--sign-only` | Sign without broadcasting, output the signed hex; excludes `--dry-run` / `--build-only`; pairs with `--expiration` |
| `--build-only` | Build only, output the **unsigned** hex; excludes `--dry-run` / `--sign-only`; pairs with `--expiration` |
| `--expiration <ms>` | Transaction expiration in ms, up to `86400000` (24h); only with `--sign-only` or `--build-only`; omitted = node default (~60s) |
| `--permission-id <n>` | Permission group to sign with (0=owner, 1=witness, 2-9=active); default `0` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin |

Plus the [global options](../index.md#global-options-every-command).

## Examples

Preview first — this one burns a fee:

```bash
echo "$PW" | wallet-cli exchange create --pair TRX:1000123 --amounts 10000:500000 \
  --dry-run --password-stdin --network tron:nile
```

Create and wait for the id:

```bash
echo "$PW" | wallet-cli exchange create --pair TRX:1000123 --amounts 10000:500000 \
  --wait --password-stdin --network tron:nile
```

## Errors

| Code | Meaning |
|---|---|
| `same_token` | Both sides name the same token |
| `invalid_value` | A side is not a token id, or an amount is not positive |
| `invalid_option` | Neither or both of `--amounts` / `--raw-amounts` |
| `asset_not_found` | A TRC10 id in the pair does not exist |
| `watch_only_no_signer` | The account cannot sign |
| `transaction_rejected` | The node refused it — e.g. not enough TRX for the fee, or a reserve limit |

## See also

[`exchange inject`](inject.md) · [`exchange show`](show.md) · [`exchange` group](index.md)
