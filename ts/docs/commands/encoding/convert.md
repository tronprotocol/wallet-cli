# wallet-cli encoding convert

Convert and validate address, hex, Base64, and Base58Check encodings.

## Synopsis

```
wallet-cli encoding convert <input> [options]
wallet-cli encoding convert --input <input> [options]
```

## Description

Auto-detects what you passed and prints every equivalent form. Runs entirely locally: no network,
no wallet, no unlock.

Detection is by shape, and falls into two families:

**Address / public key** — prints the TRON base58, TRON hex, and EVM forms:

| Input | Recognized as | Validated by |
|---|---|---|
| `T…` (base58, 26–41 chars) | `tron-base58` | Base58Check checksum |
| `41…` / `0x41…` (21 bytes hex) | `tron-hex` | length + prefix |
| `0x…` (20 bytes hex) | `evm` | EIP-55 checksum, when the input is mixed-case |
| `02…` / `03…` (33 bytes) or `04…` (65 bytes) | `public-key` | secp256k1 point validity |

**Generic bytes** — prints the hex, Base64, and Base58Check forms:

| Input | Recognized as |
|---|---|
| `[0-9a-f]+` / `0x…`, even number of digits | `hex` |
| Canonical Base58Check | `base58check` |
| Canonical Base64 | `base64` |

Checksums are enforced, not merely displayed. A base58 address with a typo fails
(`base58 checksum mismatch (typo in the address?)`), and a mixed-case EVM address whose EIP-55
capitalization does not match is rejected — an all-lowercase or all-uppercase EVM address carries no
checksum, so it is accepted and re-emitted in checksummed form.

### Private-key safety

A generic input that decodes to **exactly 32 bytes** is refused:

```console
error [invalid_value]: 32-byte input may be a private key and is not accepted on argv
```

32 bytes is the size of a secp256k1 private key, and argv is visible in the process list and shell
history. The command cannot tell a private key from any other 32-byte blob, so it declines the
whole class rather than risk leaking one. Decoded input is otherwise limited to 1 byte – 1 MiB.

## Arguments

- `input` — the value to convert (positional, or `--input <value>`)

> **Pass `0x…` values with `--input`.** A `0x`-prefixed value given *positionally* is interpreted as
> a number by the argv parser and rejected before it reaches the converter:
>
> ```console
> error [invalid_value]: invalid --input: Invalid input: expected string, received number
> ```
>
> `wallet-cli encoding convert --input 0x…` is unaffected, as is the un-prefixed `41…` hex form.

## Options

| Option | Description |
|---|---|
| `--input <string>` | The value to convert; equivalent to the positional, and required for `0x…` inputs |

Plus the [global options](../index.md#global-options-every-command).

## Examples

A TRON address, in every form:

```bash
wallet-cli encoding convert TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
```

```console
TRON      TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
TRON hex  41a614f803b6fd780986a42c78ec9c7f77e6ded13c
EVM       0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13C
```

The conversion is symmetric — feeding back the EVM form yields the same three rows:

```bash
wallet-cli encoding convert --input 0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13C
```

```console
TRON      TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
TRON hex  41a614f803b6fd780986a42c78ec9c7f77e6ded13c
EVM       0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13C
```

Generic bytes:

```bash
wallet-cli encoding convert deadbeef0102
```

```console
Hex          deadbeef0102
Base64       3q2+7wEC
Base58Check  DWcJPafcQr2coF
```

```bash
wallet-cli encoding convert TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"encoding.convert","data":{"input":"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t","inputType":"tron-base58","valid":true,"tron":"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t","tronHex":"41a614f803b6fd780986a42c78ec9c7f77e6ded13c","evm":"0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13C"},"meta":{"durationMs":47,"warnings":[]}}
```

## Output

`data` is a local result — no `chain` block. The shape depends on which family was detected;
`inputType` tells you which, so a consumer can branch on it.

Address / public-key inputs:

| Field | Type | Meaning |
|---|---|---|
| `input` | string | The value as passed |
| `inputType` | string | `tron-base58` \| `tron-hex` \| `evm` \| `public-key` |
| `valid` | boolean | Always `true` — invalid input is an error, not a `false` result |
| `tron` | string | TRON base58 address |
| `tronHex` | string | `41`-prefixed 21-byte hex address |
| `evm` | string | EIP-55 checksummed EVM address |

Generic inputs:

| Field | Type | Meaning |
|---|---|---|
| `input` | string | The value as passed |
| `inputType` | string | `hex` \| `base64` \| `base58check` |
| `valid` | boolean | Always `true` |
| `hex` | string | Lowercase hex, no `0x` prefix |
| `base64` | string | Canonical Base64 |
| `base58check` | string | Base58Check with a sha256 checksum |

## Exit status

`0` · `2` usage error — `invalid_value` for a checksum mismatch, an odd-length hex string, an
unrecognized encoding, a 32-byte input, empty input, or whitespace/control characters.

## See also

[`address generate`](../address/generate.md) · [`contract info`](../contract/info.md) ·
[`account info`](../account/info.md)
