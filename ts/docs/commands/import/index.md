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
| [`import keystore`](keystore.md) | Import an account from a Web3 keystore file |
| [`import ledger`](ledger.md) | Register a Ledger account (watch-only locally; signs on the device) |
| [`import watch`](watch.md) | Register a watch-only address; no secret is stored |

The three secret-bearing variants — `import mnemonic`, `import private-key`, `import keystore` — are **interactive-only**: every secret is read from a hidden TTY prompt. There are no `--mnemonic-stdin` / `--private-key-stdin` flags, `--password-stdin` is rejected with `invalid_option`, and without a terminal the command fails with `tty_required`. Secrets never touch argv or the environment. See [machine-interface → Secret handling](../../machine-interface.md#secret-handling).

An imported **secret** is not tied to a chain: a mnemonic, a private key or a keystore gives the account both a TRON and an EVM address. An imported **address or device app** is: `import watch` takes the family of the address you paste, and `import ledger` the family its `--app` selects, so those accounts work on one family only. See [Accounts and HD wallets](../../concepts/accounts-and-hd.md).

## See also

[`create`](../create.md) · [`list`](../list.md) · [Getting started](../../guide/getting-started.md)
