# wallet-cli encoding convert

Auto-detect an input and print every equivalent representation.

## Synopsis

```
wallet-cli encoding convert <input>
```

## Description

Auto-detects the input's encoding, prints every equivalent representation, and validates checksums. It routes automatically by whether the input is address-shaped, into one of two families:

- **Address family** — a TRON base58 address, a TRON 41-hex address, an EVM `0x` address, or a public key hex, printed as all its address forms. A TRON address and an EVM address are two encodings of the **same 20-byte public-key hash**: `TRON` is base58check (with the `0x41` prefix), `TRON hex` is `41` + those 20 bytes (21 raw bytes), and `EVM` is `0x` + the same 20 bytes in EIP-55 mixed case. So the `TRON hex` and `EVM` forms share the same middle 20 bytes — the difference is only the `41` prefix and the encoding. A public key (65-byte uncompressed or 33-byte compressed) is first keccak-hashed to its last 20 bytes, then encoded.
- **Encoding family** — any non-address-shaped byte string (arbitrary hex / Base64 / Base58Check) is printed as its `Hex`, `Base64`, and `Base58Check` forms (the Base58Check output carries a 4-byte checksum).

Purely local — no node access. Private keys and mnemonics are **not** accepted: a secret passed on the command line would leak into shell history and the process list. To get an address from a private key, import it with [`import private-key`](../import/private-key.md).

## Options

No command-specific options; `input` is a positional argument. Purely local, so no `--network`. Plus the [global options](../index.md#global-options-every-command).

## Examples

A TRON address prints all its address forms:

```bash
wallet-cli encoding convert TBhCfAytTEh52WFL6HYr64i2nmc3u3TCUp
```

```console
TRON      TBhCfAytTEh52WFL6HYr64i2nmc3u3TCUp
TRON hex  4112e94f5a3c88b17d2f6e0b9a45cd310f8e7a6d29
EVM       0x12E94f5a3c88b17d2F6E0b9a45Cd310f8E7a6D29
```

```bash
wallet-cli encoding convert TBhCfAytTEh52WFL6HYr64i2nmc3u3TCUp -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"encoding.convert","data":{"input":"TBhCfAytTEh52WFL6HYr64i2nmc3u3TCUp","inputType":"tron-base58","valid":true,"tron":"TBhCfAytTEh52WFL6HYr64i2nmc3u3TCUp","tronHex":"4112e94f5a3c88b17d2f6e0b9a45cd310f8e7a6d29","evm":"0x12E94f5a3c88b17d2F6E0b9a45Cd310f8E7a6D29"},"meta":{"durationMs":2,"warnings":[]}}
```

A public key hex resolves to the same address:

```bash
wallet-cli encoding convert 04a1b2c3d4e5...f6a7b8c9d0
```

```console
TRON      TBhCfAytTEh52WFL6HYr64i2nmc3u3TCUp
TRON hex  4112e94f5a3c88b17d2f6e0b9a45cd310f8e7a6d29
EVM       0x12E94f5a3c88b17d2F6E0b9a45Cd310f8E7a6D29
```

A non-address-shaped input converts across encodings, in both directions:

```bash
wallet-cli encoding convert deadbeef0102
```

```console
Hex          deadbeef0102
Base64       3q2+7wEC
Base58Check  DWcJPafcQr2coF
```

```bash
wallet-cli encoding convert 3q2+7wEC      # Base64 back to hex
```

```console
Hex          deadbeef0102
Base64       3q2+7wEC
Base58Check  DWcJPafcQr2coF
```

A checksum failure reports the reason:

```bash
wallet-cli encoding convert TBhCfAytTEh52WFL6HYr64i2nmc3u3TCUX
```

```console
error [invalid_value]: base58 checksum mismatch (typo in the address?)
```

## Output

`data` shape depends on the input family:

| Family | Fields |
|---|---|
| address | `input`, `inputType` (`tron-base58` / `tron-hex` / `evm` / `public-key`), `valid`, `tron`, `tronHex`, `evm` |
| encoding | `input`, `inputType` (`hex` / `base64` / `base58check`), `valid`, `hex`, `base64`, `base58check` |

## Exit status

`0` success · `2` usage error (`invalid_value` — unrecognized input or checksum mismatch; the text gives the specific reason).

## See also

[`address generate`](../address/generate.md) · [`import private-key`](../import/private-key.md)
