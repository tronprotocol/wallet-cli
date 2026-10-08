# wallet-cli sunpump buy

Spend TRX to buy a token on its SunPump bonding curve.

## Synopsis

```
wallet-cli sunpump buy <token> --trx <amount>
                       [--quote] [--slippage <decimal> | --min-out <base-units>]
                       [--fee-limit <sun>]
                       [--dry-run | --build-only | --wait [--wait-timeout <ms>]]
```

## Description

The TRX travels as the call's **value**, so **nothing is approved** — a buy needs no allowance, and there is no approval transaction ahead of it. That is the one structural difference from [`sunpump sell`](sell.md).

`--trx` is the **total**: SunPump's platform fee is taken out of it, not added to it. The [group page](index.md) explains the fee, the state gate and why the slippage default is 5%.

## Options

| Option | Description |
|---|---|
| `<token>` | **Required** positional. The token's contract address. A malformed one is `invalid_address` (exit 2), refused before any node call |
| `--trx <amount>` | **Required.** Whole TRX to spend, fee included |
| `--quote` | Price only — no account, no password, no transaction. Excludes `--dry-run`, `--build-only`, `--slippage`, `--min-out`, `--wait` and `--wait-timeout` (`invalid_option`) |
| `--slippage <decimal>` | Tolerance, e.g. `0.05`. **Default 5%.** Excludes `--min-out` |
| `--min-out <base-units>` | Least to accept, in the token's smallest unit. Excludes `--slippage` |
| `--fee-limit <sun>` | Max energy fee to burn; default `100000000`. The dry run's estimate is a **lower bound**, so a limit set from it can fail |
| `--dry-run` / `--build-only` / `--wait` | See [machine-interface.md](../../machine-interface.md) |

`--sign-only` is not offered in this group.

## Example

```bash
wallet-cli sunpump buy TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E --trx 1 --quote --network tron
```

```console
⏳ Quote sunpump buy
  Token          Justin (TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E)
  Spend          1 TRX (incl. 0.01 TRX platform fee)
  Receive (est)  25,125.337148 Justin
```

One TRX pays the **0.01 TRX minimum** fee rather than 1% of it — the fee is 1% here only above 1 TRX.

No minimum and no slippage appear, in the table or in the JSON, for the reason the [group page](index.md) gives.

## Account and balance are checked before signing

An account that is not activated on chain fails with `account_not_active`. Otherwise the account must hold the full `--trx`, checked against its native balance before the transaction is built. Short, it fails with `insufficient_balance` naming both figures in SUN.

The energy fee is **not** included in that check: it is paid in burned TRX or from the account's energy, the estimate is a lower bound, and adding an estimate to a requirement would refuse trades that would have succeeded.

## Reading the JSON

`kind` is `sunpump-buy` in every mode.

- `trxIn` — SUN spent, fee included.
- `tokensOutExpected` — base units the curve quoted; `tokensOutMinimum` is the enforced floor, absent from a quote.
- `platformFee` — SunPump's fee in SUN, with `platformFeePercent` beside it giving the rate it actually worked out to. Both are separate from `fee`, which is the chain's estimate.
- `tokenAddress`, `tokenSymbol`, `tokenDecimals` — read from the contract.
- `slippage` — only where a floor is actually enforced.

## See also

[`sunpump sell`](sell.md) · [`sunswap swap`](../sunswap/swap.md) · [machine-interface.md](../../machine-interface.md)


With `--wait`, a successful confirmed trade adds `tokensOut` and `amountsEstimated: false` when the
transaction's transfers verify the net output to the account. Native TRX output excludes network
fees. Missing receipt evidence leaves the expected amount marked as estimated and emits a warning;
the CLI never substitutes an account balance difference. `platformFee` remains the quoted fee.

Ledger accounts need **Custom contracts** and **Sign by Hash** allowed in the TRON app; see
[TRON app settings](../../guide/ledger.md#tron-app-settings).
