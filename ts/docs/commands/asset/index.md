# wallet-cli asset

Issue and manage TRC10 tokens.

TRC10 is TRON's **chain-native** token standard: issuance, the ICO sale, and frozen supply are protocol features, not contract code. That is what separates this group from [`token`](../token/index.md), which deals in TRC20 contract tokens — and from [`contract`](../contract/index.md), since a TRC10 has no contract at all.

Four facts shape everything here:

- **One token per account, for life.** An account that has issued a TRC10 can never issue another. Getting it wrong means starting over with a different account.
- **Issuance is final.** The issuance fee is burned, and only the description, URL, and the two free-bandwidth limits stay editable afterwards ([`asset update`](update.md)). Supply, precision, ICO rate, ICO window, and frozen tranches are fixed at issuance — the chain has no way to change them.
- **Participation is the ICO, not a market.** [`asset participate`](participate.md) buys from the issuance at the fixed rate set when the token was created, inside its funding window. There is no order book here; TRX↔TRC10 trading lives in [`exchange`](../exchange/index.md).
- **Transfers are not in this group.** Send a TRC10 with [`tx send --asset-id <id>`](../tx/send.md), the same as any other token.

Amounts on the command line and in text output are in **whole tokens**; json carries the on-chain raw value (whole tokens × 10^precision).

**TRON only.** TRC10 is a TRON protocol feature with no EVM counterpart; every subcommand here fails with `family_mismatch` on an EVM network.

## Synopsis

```
wallet-cli asset COMMAND
```

## Subcommands

| Command | Page | Description |
|---|---|---|
| `asset issue` | [issue.md](issue.md) | Issue a TRC10 and lock in its ICO terms |
| `asset update` | [update.md](update.md) | Change the four mutable fields |
| `asset participate` | [participate.md](participate.md) | Buy into a token's ICO with TRX |
| `asset unfreeze` | [unfreeze.md](unfreeze.md) | Release matured frozen supply |
| `asset info` | [info.md](info.md) | Full detail of one TRC10 |
| `asset list` | [list.md](list.md) | List every TRC10 on chain |

## See also

[`tx send`](../tx/send.md) · [`token info`](../token/info.md) · [`exchange`](../exchange/index.md)
