# wallet-cli exchange inject

Add liquidity to a pair you created.

## Synopsis

```
wallet-cli exchange inject <id> --token <TRX|asset-id> (--amount <n> | --raw-amount <n>)
                           [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]] [--permission-id <n>] [options]
```

## Description

Adds liquidity to an exchange pair in proportion to its current reserves.

**Injection is two-sided.** You name one side and its amount; the chain computes the other side from the current ratio and debits that as well. You therefore need enough of **both** tokens — having plenty of one is not enough. The other side is `floor(otherReserve x amount / thisReserve)`, exact integer arithmetic, and the CLI refuses before broadcast when that works out to zero.

**Only the account that created the pair may do this**, and the binding cannot be moved.

Adding liquidity proportionally does not move the price; it deepens the pair, which reduces the price impact of later trades.

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

Add 1,000 TRX and whatever the ratio requires of the other side:

```bash
echo "$PW" | wallet-cli exchange inject 12 --token TRX --amount 1000 \
  --wait --password-stdin --network tron:nile
```

See what the other side would cost, without sending anything:

```bash
echo "$PW" | wallet-cli exchange inject 12 --token TRX --amount 1000 \
  --dry-run --password-stdin --network tron:nile
```

## Errors

| Code | Meaning |
|---|---|
| `exchange_not_found` | No pair has that id |
| `not_exchange_creator` | Only the creating account can add liquidity |
| `token_not_in_exchange` | That token is not one of the pair's two sides |
| `exchange_closed` | One side holds nothing |
| `invalid_value` | The amount is not positive, or the other side works out to zero |
| `transaction_rejected` | The node refused it — e.g. not enough of either token |

## See also

[`exchange withdraw`](withdraw.md) · [`exchange show`](show.md) · [`exchange` group](index.md)
