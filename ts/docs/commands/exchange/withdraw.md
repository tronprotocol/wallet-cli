# wallet-cli exchange withdraw

Take liquidity out of a pair you created.

## Synopsis

```
wallet-cli exchange withdraw <id> --token <TRX|asset-id> (--amount <n> | --raw-amount <n>)
                             [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]] [--permission-id <n>] [options]
```

## Description

Removes liquidity from an exchange pair in proportion to its current reserves.

Like [`inject`](inject.md), this is **two-sided**: you name one side and its amount, the other side follows the ratio and is returned as well. **Only the account that created the pair may do this.**

**Odd amounts get rejected on chain for lack of precision.** The chain requires the proportional quotient to be near-exact: rounded to four decimal places it may exceed the whole-number result by no more than 0.01% of it. In practice, awkward amounts fail with `Not precise enough` — round to a cleaner number and try again. This one is left to the node rather than pre-checked locally, because which of two hardfork variants of the rule is active cannot be read from any RPC, and refusing a withdrawal the chain would have accepted is worse than one wasted bandwidth charge.

**By default the command returns at submission**; `--wait` blocks until confirmed.

## Arguments

| Argument | Description |
|---|---|
| `<id>` | **Required.** Exchange pair id |

## Options

| Option | Description |
|---|---|
| `--token <TRX\|asset-id>` | **Required.** The side you are specifying |
| `--amount <n>` | Amount for that side, in whole tokens. Exactly one of this or `--raw-amount` |
| `--raw-amount <n>` | Amount for that side, in minimal units. Exactly one of this or `--amount` |
| `--dry-run` | Estimate only, no signature/broadcast; excludes `--sign-only` / `--build-only` |
| `--sign-only` | Sign without broadcasting, output the signed hex; excludes `--dry-run` / `--build-only`; pairs with `--expiration` |
| `--build-only` | Build only, output the **unsigned** hex; excludes `--dry-run` / `--sign-only`; pairs with `--expiration` |
| `--expiration <ms>` | Transaction expiration in ms, up to `86400000` (24h); only with `--sign-only` or `--build-only`; omitted = node default (~60s) |
| `--permission-id <n>` | Permission group to sign with (0=owner, 1=witness, 2-9=active); default `0` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
echo "$PW" | wallet-cli exchange withdraw 12 --token TRX --amount 1000 \
  --wait --password-stdin --network tron:nile
```

## Errors

| Code | Meaning |
|---|---|
| `exchange_not_found` | No pair has that id |
| `not_exchange_creator` | Only the creating account can remove liquidity |
| `token_not_in_exchange` | That token is not one of the pair's two sides |
| `exchange_closed` | One side holds nothing |
| `insufficient_reserve` | The pair does not hold that much |
| `invalid_value` | The amount is not positive, or the other side works out to zero |
| `transaction_rejected` | The node refused it — `Not precise enough` means the amount does not divide the ratio cleanly |

## See also

[`exchange inject`](inject.md) · [`exchange show`](show.md) · [`exchange` group](index.md)
