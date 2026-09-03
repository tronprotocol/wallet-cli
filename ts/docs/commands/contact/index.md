# wallet-cli contact

Manage the recipient contact book.

A purely local address book of recipients (name → address), stored in the config directory in plaintext with file mode **0600** (readable/writable only by your user). Each entry belongs to one chain family — `tron` or `evm`, detected from the address — so a name resolves only on networks of that family. Once a contact exists, its name can be used directly wherever a recipient is expected — [`tx send --to`](../tx/send.md) and [`gasfree transfer --to`](../gasfree/transfer.md).

## Synopsis

```
wallet-cli contact COMMAND
```

## Subcommands

| Command | Page | Description |
|---|---|---|
| `contact add` | [add.md](add.md) | Add a payee to the address book |
| `contact list` | [list.md](list.md) | List every contact |
| `contact remove` | [remove.md](remove.md) | Remove a contact |

## See also

[`token`](../token/index.md) — the token address book (same shape) · [`tx send`](../tx/send.md) · [Security](../../concepts/security.md)
