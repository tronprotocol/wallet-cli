# wallet-cli token

Manage the token address book and query tokens.

## Synopsis

```
wallet-cli token COMMAND
```

## Subcommands

| Command | Page | Description |
|---|---|---|
| `token balance` | [balance.md](balance.md) | Show a single token balance (--contract / --asset-id) |
| `token info` | [info.md](info.md) | Show token metadata (name/symbol/decimals/totalSupply) |
| `token add` | [add.md](add.md) | Add a token to the address book (fetches symbol/decimals) |
| `token list` | [list.md](list.md) | List the address book (official + user) |
| `token remove` | [remove.md](remove.md) | Remove a user-added token |

## See also

[Sending tokens](../../guide/send-tokens.md) · [`tx send`](../tx/send.md)
