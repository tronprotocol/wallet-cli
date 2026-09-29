# wallet-cli sunpump

Create a token on a **SunPump bonding curve**, look tokens up, and trade them on their curve — before they have launched onto a DEX.

```
wallet-cli sunpump COMMAND
```

| Command | Page | What it does |
|---|---|---|
| `sunpump buy` | [buy.md](buy.md) | Spend TRX to buy a token on its curve |
| `sunpump sell` | [sell.md](sell.md) | Sell a token back to its curve for TRX |
| `sunpump launch` | [launch.md](launch.md) | Create a new token on the curve — **owned by a creator SunPump chooses, not by you** |
| `sunpump token-list` | [token-list.md](token-list.md) | List launchpad tokens, ranked or by creator |
| `sunpump token-info` | [token-info.md](token-info.md) | Full details of one token |
| `sunpump token-search` | [token-search.md](token-search.md) | Search tokens by symbol or name |

> **TRON mainnet only.** Availability is a config question, not a build one: a network gains this group when its `sunpump.launchpad` address is set, and only mainnet's is. On Nile or Shasta every command in the group fails with `unsupported_network_capability` (exit 2) and the message names the network that works. An EVM network fails earlier, on the family.

`buy` and `sell` sign and broadcast; `launch` creates a token through the SunPump service and signs nothing; the three queries read the launchpad service and need no account. The rest of this page is about trading.

## What a bonding curve is, as far as these commands are concerned

A SunPump token does not start life in a pool. It is minted and burned against a **curve contract** that quotes a price from the supply alone, so there is no counterparty, no liquidity depth and no price impact — the price moves with every trade, including yours, and a quote is only as good as the block it was read in.

When enough TRX has accumulated the token **launches**: the curve closes and the token moves to SunSwap. From then on it is [`sunswap swap`](../sunswap/swap.md)'s business, and these commands refuse it by name.

## The state gate

`buy` and `sell` both read the token's state **from the contract**, before pricing anything, and only one of four states may trade:

| State | What happens |
|---|---|
| `TRADING` | The trade proceeds |
| `READY_TO_LAUNCH` | `launchpad_trading_closed` — the threshold is reached and the curve is shut until the launch happens; nobody can hurry it |
| `LAUNCHED` | `launchpad_trading_closed`, with a pointer to `sunswap swap` |
| `NOT_EXIST` | `launchpad_token_not_found` — not a SunPump token on this network |

The two closed states get **different messages** because a reader needs a different thing from each: one is a wait, the other is a redirect.

The state is never taken from an API. A stale answer would send a transaction that must revert, and paying a fee to learn what a read would have told you for free is not a trade.

## The platform fee is not the chain's fee

SunPump charges **1% of the TRX, with a 0.01 TRX minimum**, on both sides. The minimum is what matters: a small trade pays far more than 1%, and the receipt says the rate it actually worked out to.

```
⚠️ Platform fee is 34.01% of this sell (0.01 TRX minimum).
```

It is reported **separately** from the energy fee, because they are different costs paid to different places. On a buy, `--trx` is the **total** — the platform fee comes out of it, not on top of it. On a sell, the fee comes out of the proceeds, so the minimum applies to what you **receive**.

## Defaults differ from the DEX on purpose

Default slippage here is **5%**, ten times [`sunswap swap`](../sunswap/swap.md)'s 0.5%. A curve's price moves with volume and these are meme-token markets; a DEX-sized tolerance would reject most fills. `--slippage` and `--min-out` are two ways of setting the same floor and **cannot be given together** — a caller who passed both would not know which they got, and neither wins silently.

## `--quote` costs nothing

`--quote` prices the trade from contract reads alone: **no account, no password, no transaction**, and it works on a machine with no wallet at all.

It publishes **no minimum and no slippage**. `--quote` refuses `--slippage`, so a floor here would come from a default the caller never chose, and nothing would ever enforce it because a quote produces no transaction. An agent reading one would believe it had protection it does not have.

## See also

[`sunswap swap`](../sunswap/swap.md) · [machine-interface.md](../../machine-interface.md)
