# wallet-cli address generate

Generate a random keypair locally (not stored in the wallet).

## Synopsis

```
wallet-cli address generate [--out <path>] [--print-secret]
```

## Description

Generates a random keypair locally (works offline) and prints its TRON and EVM addresses. The private key is **not** stored in the wallet and does not enter the keystore.

By default the private key is written to a `0600` file — the terminal shows only the addresses and the file path, keeping the secret off the screen, out of pipes, and out of an AI session (the same discipline as [`backup`](../backup.md)). Pass `--print-secret` to print the key to stdout instead (for offline transcription); the text output then carries a `!` warning.

This produces a bare key for a one-off address, testing, or import into another system. For a normal account — an HD wallet in the keystore, with derivation — use [`create`](../create.md). To sign with a generated key, import it with [`import private-key`](../import/private-key.md).

## Options

| Option | Description |
|---|---|
| `--out <path>` | File to write the keypair to (mode `0600`); refuses to overwrite an existing file. Default: `<wallet-cli-root>/generated/keypair-<address>` |
| `--print-secret` | ⚠️ Print the private key to stdout instead of writing a file (use offline) |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli address generate
```

```console
✅ Keypair generated (NOT stored in the wallet)
  TRON address  TNewAddr9k2fP7cW4bXm1sV8dRj6eL3aQz
  EVM address   0x8a41C3b9E2d07f6A5B14c8D9e0F27a3B6c5D48E1
  Private key   written to <wallet-cli-root>/generated/keypair-TNewAddr9k2fP7cW4bXm1sV8dRj6eL3aQz

! To sign with this key, import it: wallet-cli import private-key
```

The private key never appears in JSON output (unless `--print-secret`):

```bash
wallet-cli address generate -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"address.generate","data":{"tron":"TNewAddr9k2fP7cW4bXm1sV8dRj6eL3aQz","evm":"0x8a41C3b9E2d07f6A5B14c8D9e0F27a3B6c5D48E1","secretFile":"<wallet-cli-root>/generated/keypair-TNewAddr9k2fP7cW4bXm1sV8dRj6eL3aQz"},"meta":{"durationMs":8,"warnings":[]}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `tron` | string | TRON base58 address |
| `evm` | string | EVM `0x` address (EIP-55) |
| `secretFile` | string | Path the private key was written to (absent with `--print-secret`) |

## Exit status

`0` success · `1` execution failure (`io_error`, `output_exists` — the `--out` target already exists and is never overwritten, `entropy_failure` — the system CSPRNG was unavailable) · `2` usage error (`invalid_value`).

## See also

[`create`](../create.md) · [`import private-key`](../import/private-key.md) · [`encoding convert`](../encoding/convert.md)
