# wallet-cli sunpump sell

Sell a token back to its SunPump bonding curve for TRX.

## Synopsis

```
wallet-cli sunpump sell <token> --amount <tokens>
                        [--quote] [--slippage <decimal> | --min-out <base-units>]
                        [--fee-limit <sun>]
                        [--dry-run | --build-only | --wait [--wait-timeout <ms>]]
```

## Description

The curve **pulls** the tokens, so the launchpad is approved first — and **for an unlimited amount**, unlike the liquidity commands, which approve exactly what they spend. The curve pulls on every sale and its contract is an upgradeable proxy that expects a standing allowance, so an exact approval would mean an approval transaction before every sale.

The dry run names the spender and the ceiling for what they are:

```
  Spender    TTfvyrAz86hbZk5iDpKD78pqLGgi8C7AAw
  Allowance  unlimited  (approval tx will be sent first; spender is an upgradeable proxy)
```

"unlimited" is the honest word for an allowance with no ceiling, and naming the spender as upgradeable is what makes granting it a decision rather than a formality.

The approval is sent **once per token**; later sales of the same token send none. It is a real grant to an upgradeable contract, which is why it is stated rather than buried.

The platform fee comes out of the **proceeds**, so the floor applies to what you receive, not to the gross.

## Options

| Option | Description |
|---|---|
| `<token>` | **Required** positional. The token's contract address |
| `--amount <tokens>` | **Required.** Whole tokens to sell |
| `--quote` | Price only — no account, no password, no transaction. Excludes `--dry-run`, `--build-only` and `--slippage` |
| `--slippage <decimal>` | Tolerance, e.g. `0.05`. **Default 5%.** Excludes `--min-out` |
| `--min-out <base-units>` | Least TRX to accept, in SUN. Excludes `--slippage` |
| `--fee-limit <sun>` | Max energy fee to burn; default `100000000` |
| `--dry-run` / `--build-only` / `--wait` | See [machine-interface.md](../../machine-interface.md) |

## Example

```bash
wallet-cli sunpump sell TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E --amount 1000 --quote --network tron
```

```console
⏳ Quote sunpump sell
  Token          Justin (TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E)
  Sell           1,000 Justin
  Receive (est)  0.019401 TRX (after 0.01 TRX platform fee)

⚠️ Platform fee is 34.01% of this sell (0.01 TRX minimum).
```

Measured on mainnet, and the point of the warning: 1,000 tokens are worth 0.0294 TRX, the fee floor takes 0.01 of it, and a third of the sale goes to the platform. Whether that is worth doing is the caller's call — but not an unstated one.

## A sale too small to be worth sending is refused

There are **two** ways a sale can be too small, and they are different conditions:

- the curve **will not price it** at all, and
- it prices, but the **fee exceeds the proceeds** — nothing would arrive.

Both end in the one thing a caller can act on: the minimum, computed from the contract's own `minTxFee()` and an inverse quote.

```
this sale is too small: its 9401 SUN of proceeds would not cover the 10000 SUN platform
fee. Sell at least 507595914512855548755 Justin in base units
```

`invalid_amount`, exit 2. The minimum is in **base units**, because that is the figure the contract works in and rounding it to whole tokens would put the boundary on the wrong side.

## Balance is checked before signing

The account must hold the full `--amount`, checked against its token balance before anything is approved. Short, it fails with `insufficient_token_balance` naming both figures in base units — so no approval is granted for a sale that cannot happen.

## Reading the JSON

`kind` is `sunpump-sell` in every mode.

- `tokensIn` — base units sold.
- `trxOutExpected` — SUN **net** of the platform fee, which is what arrives; `trxOutMinimum` is the floor applied to that net figure, absent from a quote.
- `platformFee` and `platformFeePercent` — SunPump's fee in SUN and the rate it worked out to, separate from `fee`, the chain's estimate.
- `tokenAddress`, `tokenSymbol`, `tokenDecimals` — read from the contract.
- `approvals` — the unlimited grant, with the spender named, when one is needed. Absent on a later sale of the same token, because the standing allowance already covers it.

## See also

[`sunpump buy`](buy.md) · [`sunswap swap`](../sunswap/swap.md) · [machine-interface.md](../../machine-interface.md)


Ledger Permit2 signing and transaction hash fallback require **TRON app → Settings → Sign by Hash → Allowed**.
The device displays hashes on these paths, not full transaction details; verify the CLI preview
before approving. See [Ledger signing and recovery](../../guide/ledger.md#hash-signing-and-recovery).


With `--wait`, a successful confirmed trade adds `trxOut` and `amountsEstimated: false` when the
transaction's transfers verify the net output to the account. Native TRX output excludes network
fees. Missing receipt evidence leaves the expected amount marked as estimated and emits a warning;
the CLI never substitutes an account balance difference. `platformFee` remains the quoted fee.
