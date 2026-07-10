# wallet-cli import

Import a wallet from an existing secret or device.

## Synopsis

```
wallet-cli import COMMAND
```

## Subcommands

| Command | Description |
|---|---|
| [`import mnemonic`](mnemonic.md) | Import a BIP39 mnemonic phrase |
| [`import private-key`](private-key.md) | Import a raw private key |
| `import ledger` | Register a Ledger account (watch-only locally; signs on device) — `wallet-cli import ledger --help` |
| `import watch` | Register a watch-only address (no secret) — `wallet-cli import watch --help` |

All secret-bearing variants take secrets via stdin flags or TTY prompt only — never argv/env. See [machine-interface → Secret handling](../../machine-interface.md#secret-handling).

## See also

[`create`](../create.md) · [`list`](../list.md) · [Getting started](../../guide/getting-started.md)
