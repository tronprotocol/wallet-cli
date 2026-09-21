# wallet-cli typed-data

Sign EIP-712 / TIP-712 structured data.

## Synopsis

```
wallet-cli typed-data COMMAND
```

Runs on TRON and EVM networks. EIP-712 and TIP-712 are the same construction, so the same payload signs for either; the selected network decides which of the account's keys is used.

## Subcommands

| Command | Page | Description |
|---|---|---|
| `typed-data sign` | [sign.md](sign.md) | Sign EIP-712 / TIP-712 structured data |

## See also

[`message sign`](../message/sign.md) — sign a plain text message · [Security model](../../concepts/security.md)
