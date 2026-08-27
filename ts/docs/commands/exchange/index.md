# wallet-cli exchange

TRON's protocol-level Bancor exchange.

Pairs trade **TRX against TRC10** — never TRC20 — and settle instantly against a bonding curve: no order book, no counterparty, no matching. Four properties differ from the AMMs most people are used to, and all four matter before you touch this group:

- **A pair is private to its creator.** Only the account that created a pair can inject or withdraw its liquidity, and that binding cannot be transferred. There are no LP tokens and no outside liquidity providers.
- **Anyone can trade**, though — trading is open even though liquidity is not.
- **The protocol charges no fee.** `trade`, `inject`, and `withdraw` cost bandwidth only; the one charge is `create`, which burns `getExchangeCreateFee`.
- **Human amounts are scaled by node-supplied decimals.** Every `--amount` / `--amounts` /
  `--min-received` is converted to base units using the TRC10 `precision` the node reports, so that
  value decides the quantity you sign. It is checked against the protocol range 0..6 and against the
  token id requested, but a wrong value inside that range cannot be caught locally. Use the
  `--raw-*` variants when the exact base-unit quantity matters — they are used verbatim.
- **TRX's token id on chain is the underscore `_`.** Write `TRX` (any case) or an asset id; `_` is accepted too. json shows what actually went on chain, so TRX appears there as `"_"`.

**Pricing follows the curve, not the ratio.** The ratio of the two reserves is a marginal quote — true only for a trade of size zero. A real trade moves along the curve, and the larger it is relative to the reserves, the worse the price it gets. That gap is the slippage, which is why [`exchange trade`](trade.md) always requires a floor (`--min-received` or `--slippage`), and why no command here prints a "price". To price a specific amount, run `exchange trade --dry-run` against the current reserves. Reserves are also capped by the chain parameter `getExchangeBalanceLimit`.

**Tokens are named by id only in this group** — `TRX` or a numeric asset id, never a token name. Pairs are written with a colon (`--pair TRX:1000123`, `--amounts 10000:500000`), and TRC10 names may legally contain colons, so allowing names would make `--pair` ambiguous. Resolve a name to its id with [`asset info <name>`](../asset/info.md).

**TRON only.** The Bancor exchange is built into the TRON protocol; every subcommand here fails with `family_mismatch` on an EVM network.

## Synopsis

```
wallet-cli exchange COMMAND
```

## Subcommands

| Command | Page | Description |
|---|---|---|
| `exchange create` | [create.md](create.md) | Create a pair and seed both sides |
| `exchange inject` | [inject.md](inject.md) | Add liquidity in proportion to reserves |
| `exchange withdraw` | [withdraw.md](withdraw.md) | Take liquidity out in proportion to reserves |
| `exchange trade` | [trade.md](trade.md) | Swap one side for the other |
| `exchange show` | [show.md](show.md) | One pair's creator, creation time, and reserves |
| `exchange list` | [list.md](list.md) | List every pair on chain |

## See also

[`asset`](../asset/index.md) · [`tx send`](../tx/send.md) · [`chain params`](../chain/params.md)
