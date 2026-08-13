# wallet-cli address

Local keypair utilities that never touch the wallet or the network.

## Synopsis

```
wallet-cli address COMMAND
```

## Subcommands

| Command | Description | Network |
|---|---|---|
| [`address generate`](generate.md) | Generate a random TRON/EVM keypair locally | none |

## Why it is separate from `create`

[`create`](../create.md) and [`import`](../import/index.md) produce accounts the wallet **owns** —
encrypted on disk, unlockable, signable. `address generate` produces a bare keypair that the wallet
does not know about: nothing is added to the keystore, and the CLI cannot sign with it afterwards.

Use it when you need a key for something else (a test fixture, a cold address, a key you will hand
to another system). To sign with it here, import it afterwards with
[`import private-key`](../import/private-key.md).

## See also

[`create`](../create.md) · [`import private-key`](../import/private-key.md) ·
[`encoding convert`](../encoding/convert.md) · [Security model](../../concepts/security.md)
