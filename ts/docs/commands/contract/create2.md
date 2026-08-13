# wallet-cli contract create2

Compute a TVM CREATE2 contract address locally.

## Synopsis

```
wallet-cli contract create2 --deployer <address> (--code <hex> | --code-file <path>) --salt <n>
```

## Description

No RPC, wallet, signature, or broadcast is involved. The input must be creation bytecode with encoded constructor arguments appended. The formula matches Java wallet-cli:

```
keccak256(deployer_21_bytes || salt_32_bytes || keccak256(creation_code))
```

The 21-byte result is obtained by replacing the first byte of hash slice `[11:32]` with `0x41`, then Base58Check encoding. Unlike Ethereum CREATE2 there is no `0xff`. Salt is a signed decimal Java `long`; its two's-complement 8 bytes occupy offsets 24–31 of a zeroed 32-byte value.

## Options

| Option | Description |
|---|---|
| `--deployer <address>` | Required TRON account or factory address |
| `--code <hex>` | Creation bytecode; whitespace and optional `0x` are stripped |
| `--code-file <path>` | Read creation bytecode from a file; exclusive with `--code` |
| `--salt <decimal>` | Required signed 64-bit decimal integer |

## Example

```bash
wallet-cli contract create2 --deployer TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --code 60006000 --salt 1 -o json
```

The example resolves to `TFVMEWMJCq5fCmADjNzuhKnUFHJkJBBFAW`.

## Output

Returns `deployerAddress`, decimal `salt`, zero-padded `saltHex`, `codeHash`, and Base58Check `address`.

## Exit status

`0` success · `2` `invalid_address`, `invalid_value`, or `file_not_found`.

## See also

[`contract deploy`](deploy.md) · [`contract info`](info.md)
