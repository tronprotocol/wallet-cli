# wallet-cli contract create2

Compute the address a CREATE2 deployment would land on.

## Synopsis

```
wallet-cli contract create2 --deployer <address> (--code <hex> | --code-file <path>) --salt <n> [options]
```

## Description

Pure local arithmetic: no node is contacted, nothing is broadcast, and no account or password is involved. The result is the same on every TRON network, so `--network` does not affect it.

**TRON's derivation is not Ethereum's** — do not compute it with an EVM calculator. The address is

```
sha3omit12( deployer (21 bytes, 0x41-prefixed) ‖ salt (32 bytes) ‖ keccak256(code) )
```

where `sha3omit12` takes bytes `[11:32]` of the keccak256 digest, overwrites the first byte with `0x41`, and Base58Check-encodes the result. There is no `0xff` prefix: the 21-byte `0x41`-prefixed deployer already separates the domain. The same deployer, salt, and code therefore yield different addresses on TRON and Ethereum.

**The code must be the creation bytecode with constructor arguments already appended** — not the runtime bytecode. One byte of difference in the constructor arguments gives an entirely different address. Creation bytecode usually runs to tens of thousands of characters, which is why `--code-file` exists; a `0x` prefix and any whitespace are stripped from either form.

`--salt` is a decimal integer (64-bit signed). It is placed in the low bytes of a 32-byte salt with the rest zero-filled; hex salts are not accepted.

Deploying with CREATE2 itself requires the chain to have TVM Constantinople enabled, but this command is arithmetic only and is not subject to that.

## Options

| Option | Description |
|---|---|
| `--deployer <address>` | **Required.** Address performing the CREATE2 — a factory contract or a plain account |
| `--code <hex>` | Creation bytecode, constructor arguments included. One of `--code` / `--code-file` |
| `--code-file <path>` | Read the creation bytecode from a file — preferred, since it is usually very long. One of `--code` / `--code-file` |
| `--salt <n>` | **Required.** Salt as a decimal integer, zero-padded to 32 bytes |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli contract create2 --deployer TQkXm4vN...5Zt7Uw --code-file ./MyToken.creation.hex --salt 1
```

```console
Contract address (CREATE2)
  Deployer   TQkXm4vN...5Zt7Uw
  Salt       1  (0x000000…0001)
  Code hash  c8f4a1...b91b
  Address    TXm5RQ7d...9kPa
```

Short bytecode can go inline instead:

```bash
wallet-cli contract create2 --deployer TQkXm4vN...5Zt7Uw --code 6080604052... --salt 255 -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"contract.create2","data":{"deployerAddress":"TQkXm4vN...","salt":255,"saltHex":"0x00000000000000000000000000000000000000000000000000000000000000ff","codeHash":"c8f4a1...b91b","address":"TWq8dK3n...2mHb"},"meta":{"durationMs":3,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `deployerAddress` | string | The deployer as given, base58 |
| `salt` | number | The salt as given, decimal |
| `saltHex` | string | The zero-padded 32 bytes that actually enter the hash |
| `codeHash` | string | `keccak256` of the creation bytecode |
| `address` | string | The resulting contract address, base58 |

This is a local command, so the envelope carries no `chain` block.

## Exit status

`0` success · `1` execution failure (`io_error` — `--code-file` cannot be read) · `2` usage error (`missing_option` — no `--deployer` / `--salt`, or neither code source; `invalid_option` — both `--code` and `--code-file`; `invalid_value` — malformed deployer address, non-hex code, or a salt outside the 64-bit signed range).

## See also

[`contract deploy`](deploy.md) · [`contract info`](info.md) · [`encoding convert`](../encoding/convert.md)
