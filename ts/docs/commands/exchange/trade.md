# wallet-cli exchange trade

Swap one side of a pair for the other.

## Synopsis

```
wallet-cli exchange trade <id> --sell <TRX|asset-id> (--amount <n> | --raw-amount <n>)
                          [--min-received <n> | --raw-min-received <n> | --slippage <percent>]
                          [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]] [--permission-id <n>] [options]
```

## Description

Sells one side of an exchange pair for the other, priced along the Bancor curve. It settles immediately, needs no counterparty, and **anyone may trade** — unlike liquidity operations, this is not restricted to the creator. The protocol charges no fee; only bandwidth is spent.

### Slippage protection

`--min-received` is a **floor, not an expected return**. If the trade would return less than it, the whole trade reverts on chain and you lose only bandwidth. It is the only defence against the price moving between the moment you sign and the moment the transaction lands.

`--slippage` is the convenient form: the CLI reads the current reserves, predicts the return, subtracts your percentage and sends the result as the floor. What goes on chain is always an absolute number.

**With none of the three flags there is no slippage protection.** The protocol has no "unprotected" mode — `expected` must be positive — so this sends `expected = 1`, meaning "accept any non-zero return at any price". The response carries a `meta.warnings` entry saying so. That is a real risk on a thin pair; pass `--slippage` unless you mean it.

A derived floor is anchored to the reserves **at build time**, on every execution path including `--sign-only` and `--build-only`. That is a deliberate commitment — "no worse than N% below what this was worth when I built it" — which is what signing anything in advance means.

### Pricing is an estimate

The predicted return reproduces java-tron's own arithmetic, but the chain evaluates it with Java's `StrictMath.pow`, which JavaScript does not guarantee to match to the last unit. It is therefore used to derive floors and previews, never to refuse a trade. Use `--dry-run` to price a specific amount at the current reserves.

**By default the command returns at submission**; `--wait` blocks until confirmed. The realised return comes from the transaction receipt, so before confirmation the receipt shows an estimated return rather than a settled one.

## Arguments

| Argument | Description |
|---|---|
| `<id>` | **Required.** Exchange pair id |

## Options

| Option | Description |
|---|---|
| `--sell <TRX\|asset-id>` | **Required.** The side you are selling; the other is what you buy |
| `--amount <n>` | How much to sell, in whole tokens. Exactly one of this or `--raw-amount` |
| `--raw-amount <n>` | How much to sell, in minimal units. Exactly one of this or `--amount` |
| `--min-received <n>` | Lowest acceptable return, in whole tokens; at most one of the three floor flags |
| `--raw-min-received <n>` | Lowest acceptable return, in minimal units; at most one of the three floor flags |
| `--slippage <percent>` | Derive the floor from current reserves less this percentage, `0 < p < 100`; at most one of the three floor flags |
| `--dry-run` | Estimate only, no signature/broadcast; excludes `--sign-only` / `--build-only` |
| `--sign-only` | Sign without broadcasting, output the signed hex; excludes `--dry-run` / `--build-only`; pairs with `--expiration` |
| `--build-only` | Build only, output the **unsigned** hex; excludes `--dry-run` / `--sign-only`; pairs with `--expiration` |
| `--expiration <ms>` | Transaction expiration in ms, up to `86400000` (24h); only with `--sign-only` or `--build-only`; omitted = node default (~60s) |
| `--permission-id <n>` | Permission group to sign with (0=owner, 1=witness, 2-9=active); default `0` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin |

Plus the [global options](../index.md#global-options-every-command).

## Examples

Price it first:

```bash
echo "$PW" | wallet-cli exchange trade 12 --sell TRX --amount 100 --slippage 1 \
  --dry-run --password-stdin --network tron:nile
```

Trade with a 1% floor:

```bash
echo "$PW" | wallet-cli exchange trade 12 --sell TRX --amount 100 --slippage 1 \
  --wait --password-stdin --network tron:nile
```

Trade with an absolute floor you chose:

```bash
echo "$PW" | wallet-cli exchange trade 12 --sell TRX --amount 100 --min-received 4900 \
  --wait --password-stdin --network tron:nile
```

## Errors

| Code | Meaning |
|---|---|
| `exchange_not_found` | No pair has that id |
| `token_not_in_exchange` | That token is not one of the pair's two sides |
| `exchange_closed` | One side holds nothing |
| `invalid_value` | The amount is not positive, `--slippage` is outside `(0, 100)`, or the trade is too small to return anything |
| `invalid_option` | More than one floor flag, or neither/both amount flags |
| `transaction_rejected` | The node refused it — `token required must greater than expected` means the floor was not met |

## See also

[`exchange show`](show.md) · [`exchange` group](index.md)
