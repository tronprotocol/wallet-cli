# wallet-cli typed-data

Sign EIP-712 / TIP-712 structured data.

## Synopsis

```
wallet-cli typed-data COMMAND
```

## Subcommands

| Command | Page | Description | Networks |
|---|---|---|---|
| `typed-data sign` | [sign.md](sign.md) | Sign EIP-712 / TIP-712 structured data | TRON, EVM |

Signing is local — no node is contacted. The selected network chooses which of the account's keys signs and which address is reported.

## See also

[`message sign`](../message/sign.md) — sign a plain text message · [Security model](../../concepts/security.md)
