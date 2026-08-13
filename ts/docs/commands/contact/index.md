# wallet-cli contact

Manage the recipient contact book.

A purely local address book of recipients (name → address), stored in the config directory in plaintext with file mode **0600** (readable/writable only by your user). Entries are grouped by chain family (all `tron` today). Once a contact exists, its name can be used directly wherever a recipient is expected — [`tx send --to`](../tx/send.md) and [`gasfree transfer --to`](../gasfree/transfer.md).

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
