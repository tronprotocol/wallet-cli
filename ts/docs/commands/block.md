# wallet-cli block

Get a block (latest if omitted).

## Synopsis

```
wallet-cli block [<number>] [options]
```

## Arguments

- `number` — block height to fetch; omit for the latest block

## Options

[Global options](index.md) only.

## Notes

Requires `--network` (or config.defaultNetwork).

## Examples

```bash
wallet-cli block --network tron:nile
```

```console
Number        #69,093,315
Time          2026-07-11 15:29:21 UTC
Transactions  212
```

```bash
wallet-cli block 69093315 --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"block","data":{"block":{"blockID":"0000000041e6a3c3…","block_header":{"raw_data":{"number":69093315,"txTrieRoot":"…","witness_address":"41…","parentHash":"…","version":31,"timestamp":1783783761000},"witness_signature":"…"},"transactions":[{…}]}},"meta":{"durationMs":126,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data.block` is the raw TRON block as returned by the node, unmodified. Its exact shape follows the node's block structure; the key fields are below (large hashes and the full transaction list are elided as `…` above).

| Field | Type | Meaning |
|---|---|---|
| `block.blockID` | string | Block hash |
| `block.block_header.raw_data.number` | number | Block height |
| `block.block_header.raw_data.timestamp` | number | Block time (ms since epoch, UTC) |
| `block.block_header.raw_data.witness_address` | string | Producing SR, hex (`41…`) |
| `block.transactions` | array | Transactions in the block (omitted when empty) |

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../machine-interface.md).

## See also

[Networks](../concepts/networks.md)
