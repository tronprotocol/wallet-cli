# wallet-cli token

Manage the token address book and query tokens. TRON and EVM.

## Synopsis

```
wallet-cli token COMMAND
```

## Subcommands

| Command | Page | Description |
|---|---|---|
| `token balance` | [balance.md](balance.md) | Show a single token balance |
| `token info` | [info.md](info.md) | Show token metadata |
| `token add` | [add.md](add.md) | Add a token to the address book |
| `token list` | [list.md](list.md) | List the address book (official + user) |
| `token remove` | [remove.md](remove.md) | Remove a user-added token |

Every subcommand runs on both TRON and EVM networks. `--contract` takes a TRC20 address on TRON and an ERC20 address on EVM; `--asset-id` (TRC10) is TRON-only and is rejected with `invalid_option` elsewhere. The address book is scoped to **network + account**, so it is a different book per network.

## See also

[Sending tokens](../../guide/send-tokens.md) · [`tx send`](../tx/send.md)
