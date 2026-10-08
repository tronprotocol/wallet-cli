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

The curve **pulls** the tokens, so the launchpad is approved first — and **for an unlimited amount**, unlike V2/V3 liquidity deposits, which approve exactly what they spend. The curve pulls on every sale and its contract is an upgradeable proxy that expects a standing allowance, so an exact approval would mean an approval transaction before every sale.

The dry run names the spender and the ceiling for what they are:

```
  Spender    TTfvyrAz86hbZk5iDpKD78pqLGgi8C7AAw
  Allowance  unlimited  (approval tx will be sent first; spender is an upgradeable proxy)
```

"unlimited" is the honest word for an allowance with no ceiling, and naming the spender as upgradeable is what makes granting it a decision rather than a formality.

The approval is sent **once per token**; later sales of the same token send none. It is a real grant to an upgradeable contract, which is why it is stated rather than buried.

The curve's quote is already **net**: the seller receives the quoted TRX, and the platform fee is paid to SunPump's fee address beside it. The gross is the two together. The floor applies to what you receive, not to the gross.

## Options

| Option | Description |
|---|---|
| `<token>` | **Required** positional. The token's contract address |
| `--amount <tokens>` | **Required.** Whole tokens to sell |
| `--quote` | Price only — no account, no password, no transaction. Excludes `--dry-run`, `--build-only`, `--slippage`, `--min-out`, `--wait` and `--wait-timeout` (`invalid_option`) |
| `--slippage <decimal>` | Tolerance, e.g. `0.05`. **Default 5%.** Excludes `--min-out` |
| `--min-out <base-units>` | Least TRX to accept, in SUN. Excludes `--slippage` |
| `--fee-limit <sun>` | Max energy fee to burn; default `100000000` |
| `--dry-run` / `--build-only` / `--wait` | See [machine-interface.md](../../machine-interface.md) |

## Example

```bash
wallet-cli sunpump sell TR4z4y8aoCqwjci2DJd5uquNpQVc9HUuaP --amount 1000 --quote --network tron
```

```console
⏳ Quote sunpump sell
  Token          BabyKnight (TR4z4y8aoCqwjci2DJd5uquNpQVc9HUuaP)
  Sell           1,000 BabyKnight
  Receive (est)  0.024242 TRX (after 0.01 TRX platform fee)

⚠️ Platform fee is 29.2% of this sell (0.01 TRX minimum).
```

Measured on mainnet, and the point of the warning: 1,000 tokens gross 0.034242 TRX, the fee floor takes 0.01 of it, and nearly a third of the sale goes to the platform. Whether that is worth doing is the caller's call — but not an unstated one. A sale large enough that the fee is the plain 1% shows no rate and no warning.

## A sale too small to pay the seller is refused

There are **two** ways a sale can be too small:

- the curve **will not price it** at all, and
- it prices it, but the seller would receive **nothing**.

Both end in the one thing a caller can act on: the smallest sale that pays the seller one SUN, read from the contract's own inverse quote.

```
this sale is too small: the curve will not price it. Sell at least 292065903216294733861
BabyKnight in base units
```

`invalid_amount`, exit 2. The minimum is in **base units**, because that is the figure the contract works in and rounding it to whole tokens would put the boundary on the wrong side. A sale above it is sent even when the fee floor takes most of the gross; the fee warning says how much.

## Account and balance are checked before signing

An account that is not activated on chain fails with `account_not_active`, whatever it holds. Otherwise the account must hold the full `--amount`, checked against its token balance before anything is approved. Short, it fails with `insufficient_token_balance` naming both figures in base units — so no approval is granted for a sale that cannot happen.

## Reading the JSON

`kind` is `sunpump-sell` in every mode.

- `tokensIn` — base units sold.
- `trxOutExpected` — SUN **net** of the platform fee, which is what arrives: the contract's quoted TRX, as quoted. `trxOutMinimum` is the floor applied to that net figure, absent from a quote.
- `platformFee` and `platformFeePercent` — SunPump's fee in SUN and its share of the gross (`trxOutExpected + platformFee`), separate from `fee`, the chain's estimate. `platformFeePercent` appears only when the 0.01 TRX floor pushed the rate above 1%.
- `tokenAddress`, `tokenSymbol`, `tokenDecimals` — read from the contract.
- `approvals` — the unlimited grant, with the spender named, when one is needed. Absent on a later sale of the same token, because the standing allowance already covers it.

## See also

[`sunpump buy`](buy.md) · [`sunswap swap`](../sunswap/swap.md) · [machine-interface.md](../../machine-interface.md)


Ledger accounts need **Custom contracts** and **Sign by Hash** allowed in the TRON app; see
[TRON app settings](../../guide/ledger.md#tron-app-settings). On hash-signing paths the device
displays hashes, not full transaction details; verify the CLI preview before approving. See
[Ledger signing and recovery](../../guide/ledger.md#hash-signing-and-recovery).


With `--wait`, a successful confirmed trade adds `trxOut` and `amountsEstimated: false` when the
transaction's transfers verify the net output to the account. Native TRX output excludes network
fees. Missing receipt evidence leaves the expected amount marked as estimated and emits a warning;
the CLI never substitutes an account balance difference. `platformFee` remains the quoted fee.
