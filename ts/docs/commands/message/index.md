# wallet-cli message

Sign arbitrary messages.

## Synopsis

```
wallet-cli message COMMAND
```

## Subcommands

| Command | Page | Description | Networks |
|---|---|---|---|
| `message sign` | [sign.md](sign.md) | Sign an arbitrary message (TIP-191/V2 · EIP-191) | TRON, EVM |

Signing is local — no node is contacted. The selected network chooses which of the account's keys signs and which address is reported.

## See also

[Security model](../../concepts/security.md)
