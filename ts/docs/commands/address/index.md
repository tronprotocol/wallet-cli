# wallet-cli address

Generate a random keypair (local, not stored).

A purely local tool group — it never touches the node. The generated key is **not** stored in the wallet; to sign with it, import it with [`import private-key`](../import/private-key.md).

## Synopsis

```
wallet-cli address COMMAND
```

## Subcommands

| Command | Page | Description |
|---|---|---|
| `address generate` | [generate.md](generate.md) | Generate a random keypair, printing the TRON and EVM addresses |

## See also

[`encoding convert`](../encoding/convert.md) · [`create`](../create.md) · [`import private-key`](../import/private-key.md)
