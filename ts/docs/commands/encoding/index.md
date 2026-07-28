# wallet-cli encoding

Local encoding conversion and validation.

## Synopsis

```
wallet-cli encoding COMMAND
```

## Subcommands

| Command | Description | Network |
|---|---|---|
| [`encoding convert`](convert.md) | Convert and validate address, hex, Base64, and Base58Check encodings | none |

## Why this exists

The same TRON identity has several textual spellings — base58 `T…`, the `41`-prefixed hex the
protocol actually uses, and the `0x…` EVM form — and TRON tooling mixes all three. Explorers,
contract ABIs, and node RPC responses each favour a different one, and a value copied from one
into another is a common, silent source of failure.

`encoding convert` resolves that locally: give it any of the forms and it prints all the
equivalents, verifying the checksum on the way.

## See also

[`address generate`](../address/generate.md) · [`contract call`](../contract/call.md) ·
[Accounts & HD](../../concepts/accounts-and-hd.md)
