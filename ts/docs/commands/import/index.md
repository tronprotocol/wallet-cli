# wallet-cli import

Import a wallet from an existing secret or device.

## Synopsis

```
wallet-cli import COMMAND
```

## Subcommands

| Command | Description | Families the account gets |
|---|---|---|
| [`import mnemonic`](mnemonic.md) | Import a BIP39 mnemonic phrase | TRON **and** EVM |
| [`import private-key`](private-key.md) | Import a raw private key | TRON **and** EVM |
| [`import keystore`](keystore.md) | Import a Web3 keystore file | TRON **and** EVM |
| [`import ledger`](ledger.md) | Register a Ledger account (watch-only locally; signs on device) | whichever `--app` selects |
| [`import watch`](watch.md) | Register a watch-only address (no secret) | whichever the address is |

A secret — a mnemonic, a private key, a keystore — is not tied to one chain: the **same key** produces a TRON address and an EVM address, so those three imports give you an account that works on both families. A Ledger account and a watch-only account are single-family, because a device app and a pasted address each name exactly one.

The three secret-bearing variants — `import mnemonic`, `import private-key`, `import keystore` — are **interactive-only**: every secret is read from a hidden TTY prompt. There are no `--mnemonic-stdin` / `--private-key-stdin` flags, and `--password-stdin` is rejected with `invalid_option`; without a terminal the command fails with `tty_required`. Secrets never touch argv or env. See [machine-interface → Secret handling](../../machine-interface.md#secret-handling).

## See also

[`create`](../create.md) · [`list`](../list.md) · [Getting started](../../guide/getting-started.md)
