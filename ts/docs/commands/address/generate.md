# wallet-cli address generate

Generate a random TRON/EVM keypair locally, without adding it to the wallet.

## Synopsis

```
wallet-cli address generate [--out <path>] [--print-secret] [options]
```

## Description

Generates a secp256k1 keypair offline and derives both address encodings from the same public key:
the TRON base58 address and the EVM `0x` address. No network access, no wallet unlock, no keystore
write.

**The private key is not printed by default.** It is written to an exclusively-created `0600` file:

- `--out <path>` — write there. An existing file is **never** overwritten; the create is exclusive,
  so a collision fails rather than clobbering a key you already have.
- omitted — write to `<wallet-home>/generated/keypair-<tron-address>`.

`--print-secret` prints the key to stdout instead of writing a file. That puts the secret in your
terminal scrollback and, in `-o json`, in whatever consumes the envelope — use it only on an
offline machine.

The generated key is **not** in the wallet: `list`, `use`, and every signing command remain unaware
of it. Import it with [`import private-key`](../import/private-key.md) if you want to sign with it.

## Options

| Option | Description |
|---|---|
| `--out <path>` | Exclusive `0600` output path; existing files are never overwritten |
| `--print-secret` | Print the private key instead of writing it — use only offline |

Plus the [global options](../index.md#global-options-every-command). `--network` and `--account`
do not apply: the command is entirely local.

## Examples

```bash
wallet-cli address generate
```

```console
✅ Keypair generated (NOT stored in the wallet)
  TRON address  TB6dL8QunEyPUqX95PESxyZ2SHGeAQELW2
  EVM address   0x0C5f589E3C99Cc365ffb8af588241921f764dF66
  Private key   written to /Users/you/.wallet-cli/generated/keypair-TB6dL8QunEyPUqX95PESxyZ2SHGeAQELW2

! To sign with this key, import it: wallet-cli import private-key
```

Write to a specific location:

```bash
wallet-cli address generate --out /secure/usb/key.json
```

The secret file is JSON:

```json
{"version":1,"privateKey":"…","publicKey":"…","tron":"TB6dL8QunEyPUqX95PESxyZ2SHGeAQELW2","evm":"0x0C5f589E3C99Cc365ffb8af588241921f764dF66"}
```

JSON output — note that `privateKey` is absent unless `--print-secret` was given:

```bash
wallet-cli address generate -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"address.generate","data":{"tron":"TB6dL8QunEyPUqX95PESxyZ2SHGeAQELW2","evm":"0x0C5f589E3C99Cc365ffb8af588241921f764dF66","secretFile":"/Users/you/.wallet-cli/generated/keypair-TB6dL8QunEyPUqX95PESxyZ2SHGeAQELW2"},"meta":{"durationMs":21,"warnings":[]}}
```

## Output

`data` is a local result — no `chain` block.

| Field | Type | Meaning |
|---|---|---|
| `tron` | string | TRON base58 address |
| `evm` | string | EIP-55 checksummed EVM address from the same key |
| `secretFile` | string | Path the private key was written to (omitted with `--print-secret`) |
| `privateKey` | string | Raw private key hex — **only** with `--print-secret` |

## Exit status

`0` · `1` execution failure — `entropy_failure`, `file_exists` (refusing to overwrite an existing
keypair file), `io_error` · `2` usage error.

## See also

[`import private-key`](../import/private-key.md) · [`create`](../create.md) ·
[`encoding convert`](../encoding/convert.md) · [Security model](../../concepts/security.md)
