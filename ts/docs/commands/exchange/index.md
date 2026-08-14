# wallet-cli exchange

Trade TRX and TRC10 on TRON's built-in Bancor market maker.

TRON carries an automatic market maker at **protocol level**: no order book, no counterparty, no matching. A pair holds two reserves, and price follows a curve between them. It trades TRX and TRC10 only — TRC20 contract tokens are not eligible.

## Four things that run against intuition

- **Only the creator can inject or withdraw.** A pair is one account's private market-making position, not a pool anyone can join, and the binding cannot be transferred. Create with the wrong account and that liquidity is reachable only from that account, forever.
- **TRX's on-chain token id is `_`.** We accept `TRX` in any case, the literal `_`, or a numeric TRC10 id.
- **`--min-received` is a floor, not an expectation.** If the trade would return less, it reverts and you lose only bandwidth.
- **The protocol takes no fee.** `inject`, `withdraw` and `trade` cost bandwidth only; just `create` burns a fee.
- **Human amounts are scaled by node-supplied decimals.** Every `--amount` / `--amounts` /
  `--min-received` is converted to base units using the TRC10 `precision` the node reports, so that
  value decides the quantity you sign. It is checked against the protocol range 0..6 and against the
  token id requested, but a wrong value inside that range cannot be caught locally. Use the
  `--raw-*` variants when the exact base-unit quantity matters — they are used verbatim.

## Pricing

The reserve ratio is a **quoted rate, not a fill price**. Every trade with size moves along the curve and gets less than the ratio suggests — that gap is price impact, and it grows with size relative to the reserves. `exchange show` tells you how deep a pair is; `exchange trade --dry-run` prices a specific amount.

Our price prediction is an **estimate**. It reproduces java-tron's own arithmetic, but the chain evaluates it with Java's `StrictMath.pow`, which JavaScript does not guarantee to match bit-for-bit. So it derives the `--slippage` floor and the `--dry-run` preview, and is never a reason to refuse a transaction.

## Synopsis

```
wallet-cli exchange COMMAND
```

## Subcommands

| Command | Page | Description |
|---|---|---|
| `exchange create` | [create.md](create.md) | Create a pair and seed both sides |
| `exchange inject` | [inject.md](inject.md) | Add liquidity to a pair you created |
| `exchange withdraw` | [withdraw.md](withdraw.md) | Take liquidity out of a pair you created |
| `exchange trade` | [trade.md](trade.md) | Swap one side for the other |
| `exchange show` | [show.md](show.md) | Show one pair |
| `exchange list` | [list.md](list.md) | List pairs, one page at a time |

## Token ids, never names

Every token argument here takes `TRX` or a numeric TRC10 id. Names are refused on purpose: a TRC10 name may legally contain `:`, which would make `--pair A:B:1000123` ambiguous. Look an id up with [`asset info <name>`](../asset/info.md).

## See also

[`asset`](../asset/index.md) (TRC10 issuance) · [`tx send`](../tx/send.md)
