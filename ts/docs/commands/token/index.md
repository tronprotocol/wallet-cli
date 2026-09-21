# wallet-cli token

Manage the token address book and query tokens.

## Synopsis

```
wallet-cli token COMMAND
```

## Networks

All five subcommands run on TRON and EVM networks alike — TRC20/TRC10 on TRON, ERC20 on EVM. The book is stored per **network + account**, so the same command lists different tokens on `tron:3448148188` and `eip155:11155111`. Only `--asset-id` (TRC10) is TRON-only: help tags it `(TRON only)`, and passing it on an EVM network fails with `invalid_option` before any node call.

## Subcommands

| Command | Page | Description |
|---|---|---|
| `token balance` | [balance.md](balance.md) | Show a single token balance (`--contract` / `--asset-id`) |
| `token info` | [info.md](info.md) | Show token metadata from the chain |
| `token add` | [add.md](add.md) | Add a token to the address book, fetching its metadata |
| `token list` | [list.md](list.md) | List the address book (official + user) |
| `token remove` | [remove.md](remove.md) | Remove a user-added token |

## See also

[Sending tokens](../../guide/send-tokens.md) · [`tx send`](../tx/send.md)
