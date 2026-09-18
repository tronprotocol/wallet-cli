# wallet-cli contact

Manage the recipient contact book.

A purely local address book of recipients (name → address), stored in the config directory in plaintext with file mode **0600** (readable/writable only by your user). An address is validated against the family it belongs to — `T…` is TRON, `0x…` is EVM — and both can live in the same book. The family is not part of a contact record — the address already says which chain it is — but it does govern lookup: a name resolves only on networks of the family its address belongs to. Once a contact exists, its name can be used directly wherever a recipient is expected — [`tx send --to`](../tx/send.md) and [`gasfree transfer --to`](../gasfree/transfer.md).

## Synopsis

```
wallet-cli contact COMMAND
```

## Subcommands

| Command | Page | Description |
|---|---|---|
| `contact add` | [add.md](add.md) | Add a recipient |
| `contact list` | [list.md](list.md) | List recipients |
| `contact remove` | [remove.md](remove.md) | Remove a recipient |

## See also

[`token`](../token/index.md) — the token address book (same shape) · [`tx send`](../tx/send.md) · [Security](../../concepts/security.md)
