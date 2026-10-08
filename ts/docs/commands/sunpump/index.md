# wallet-cli sunpump

Create and trade tokens on the SunPump bonding curve.

`buy` and `sell` sign and broadcast; `launch` creates a token through the SunPump service and signs nothing; the three queries read the launchpad service and need no account.

> **TRON mainnet only.** On Nile or Shasta every command in the group fails with `unsupported_network_capability` (exit 2), and the message names the network that works. On an EVM network they fail with `family_mismatch`.

The examples on these pages trade from accounts labelled `lp` and `jh`. Pass your own with `--account`, or leave it out to use the active account.

## Synopsis

```
wallet-cli sunpump COMMAND
```

## Subcommands

| Command | Page | Description |
|---|---|---|
| `sunpump buy` | [buy.md](buy.md) | Spend TRX to buy a token on its curve |
| `sunpump sell` | [sell.md](sell.md) | Sell a token back to its curve for TRX |
| `sunpump launch` | [launch.md](launch.md) | Create a new token on the curve — **owned by a creator SunPump chooses, not by you** |
| `sunpump token-list` | [token-list.md](token-list.md) | List launchpad tokens, ranked or by creator |
| `sunpump token-info` | [token-info.md](token-info.md) | Full details of one token |
| `sunpump token-search` | [token-search.md](token-search.md) | Search tokens by symbol or name |

## What a bonding curve is, as far as these commands are concerned

A SunPump token does not start life in a pool. It is minted and burned against a **curve contract** that quotes a price from the supply alone, so there is no counterparty and no liquidity depth — the price moves with every trade, including yours, and a quote is only as good as the block it was read in.

When enough TRX has accumulated the token **launches**: the curve closes and the token moves to SunSwap. From then on it is [`sunswap swap`](../sunswap/swap.md)'s business, and `buy` / `sell` refuse it by name.

## The state gate

`buy` and `sell` read the token's state **from the contract** before pricing anything:

| State | What happens |
|---|---|
| Trading | The trade proceeds |
| Ready to launch | `launchpad_trading_closed` — the threshold is reached and the curve is shut until the launch happens |
| Launched | `launchpad_trading_closed`, with a pointer to `sunswap swap` |
| Not a SunPump token | `launchpad_token_not_found` |

The two closed states get different messages: one is a wait, the other is a redirect.

## The platform fee is not the chain's fee

SunPump charges **1% of the TRX, with a 0.01 TRX minimum**, on both sides. The minimum is what matters: a small trade pays far more than 1%. When it does, the `--quote` and `--dry-run` output warn with the rate it actually worked out to, and JSON carries it as `platformFeePercent`:

```
⚠️ Platform fee is 25.38% of this sell (0.01 TRX minimum).
```

It is reported **separately** from the energy fee, because they are different costs paid to different places. On a buy, `--trx` is the **total** — the platform fee comes out of it. On a sell, the quoted TRX is already what you receive and the fee is paid beside it.

## Defaults differ from the DEX on purpose

Default slippage is **5%**, ten times [`sunswap swap`](../sunswap/swap.md)'s 0.5%: a curve's price moves with volume and these are meme-token markets. `--slippage` and `--min-out` are two ways of setting the same floor and **cannot be given together**.

## `--quote` costs nothing

`--quote` prices the trade from contract reads alone: **no account, no password, no transaction**. It publishes **no minimum and no slippage**, and refuses `--slippage`, `--min-out` and `--wait` — a quote sends no transaction, so a floor would never be enforced.

**Ledger** accounts need **Custom contracts** and **Sign by Hash** allowed in the TRON app — see [TRON app settings](../../guide/ledger.md#tron-app-settings).

## See also

[`sunswap`](../sunswap/index.md) · [machine-interface.md](../../machine-interface.md)
