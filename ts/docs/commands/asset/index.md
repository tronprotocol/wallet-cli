# wallet-cli asset

Issue and operate TRC10 tokens.

TRC10 is TRON's **chain-native** token type: the protocol itself tracks issuance, an ICO window and frozen supply, with no smart contract involved. That is why it is a group of its own — [`token`](../token/index.md) handles TRC20 contract tokens, and the two share almost no mechanics.

Two things shape everything in this group:

- **An account may issue exactly one TRC10, ever.** `asset issue` burns a fee that is not refunded, and once it lands the account can never issue again. Only the description, URL and the two free-bandwidth limits stay changeable; supply, price, ICO dates, precision and the frozen tranches are fixed permanently.
- **Transfer is not here.** Sending TRC10 is [`tx send`](../tx/send.md) with an asset id — the same command you use for everything else.

**Ledger cannot sign any of the write commands in this group.** The Ledger TRON app does not implement the TRC10 issuance contract types, so `issue`, `update`, `participate` and `unfreeze` require a software account and fail fast with `ledger_unsupported`. (TRC10 *transfer* via `tx send` does work on Ledger.)

## Synopsis

```
wallet-cli asset COMMAND
```

## Subcommands

| Command | Page | Description |
|---|---|---|
| `asset issue` | [issue.md](issue.md) | Issue a TRC10 and lock in its ICO terms |
| `asset update` | [update.md](update.md) | Update the four mutable fields of your TRC10 |
| `asset participate` | [participate.md](participate.md) | Buy into a TRC10's ICO at its fixed rate |
| `asset unfreeze` | [unfreeze.md](unfreeze.md) | Release matured frozen supply |
| `asset info` | [info.md](info.md) | Show one TRC10 in full |
| `asset list` | [list.md](list.md) | List TRC10 tokens, one page at a time |

## Units

Command input and text output use **whole tokens**. JSON and the chain use **minimal units** — whole tokens scaled by the asset's `precision`. A token with `precision: 6` and a supply of 1,000,000,000 has an on-chain `total_supply` of `1000000000000000`.

## See also

[`token`](../token/index.md) (TRC20) · [`tx send`](../tx/send.md) (TRC10 transfer) · [`exchange`](../exchange/index.md) (trading TRC10 against TRX)
