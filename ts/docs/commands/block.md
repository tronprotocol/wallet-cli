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

Requires `--network` (or config.defaultNetwork). Works on TRON and EVM networks; the block number is the selected chain's own height.

## Examples

```bash
wallet-cli block --network tron:nile
```

```console
Number        #70,433,745
Time          2026-08-27 08:17:54 UTC
Transactions  5
```

```bash
wallet-cli block 70433745 --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"block","data":{"block":{"blockID":"0000000041e6a3c3…","block_header":{"raw_data":{"number":69093315,"txTrieRoot":"…","witness_address":"41…","parentHash":"…","version":31,"timestamp":1783783761000},"witness_signature":"…"},"transactions":[{…}]}},"meta":{"durationMs":126,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

On an EVM network the text summary carries the gas and fee figures a block actually has:

```bash
wallet-cli block --network evm:11155111
```

```console
Number        #11,576,585
Hash          0xfbebc32aba432b2ae721b062cf40d2cb685f1ba617f0f5d3fc8e768b53a8d820
Parent hash   0x222ceb99e43496964a36be6ee98137f4ca51d4e2d88a25c56bf48007d57ec0bd
Time          2026-08-27 08:06:24 UTC
Transactions  197
Gas used      18,543,035 / 60,000,000
Base fee      1.119025 gwei
```

## Output

`data.block` is the raw block as returned by the node, unmodified — a TRON block object on TRON, an `eth_getBlockByNumber` result on EVM. Its exact shape follows the node's block structure, so **only the text summary is normalized across families**; the key fields are below (large hashes and the full transaction list are elided as `…` above).

TRON:

| Field | Type | Meaning |
|---|---|---|
| `block.blockID` | string | Block hash |
| `block.block_header.raw_data.number` | number | Block height |
| `block.block_header.raw_data.timestamp` | number | Block time (ms since epoch, UTC) |
| `block.block_header.raw_data.witness_address` | string | Producing SR, hex (`41…`) |
| `block.transactions` | array | Transactions in the block (omitted when empty) |

EVM — the node's own hex QUANTITY encoding throughout:

| Field | Type | Meaning |
|---|---|---|
| `block.hash` / `block.parentHash` | string | Block and parent hash |
| `block.number` | string | Block height, hex (`"0xb0a509"`) |
| `block.timestamp` | string | Block time, hex seconds since epoch |
| `block.gasUsed` / `block.gasLimit` | string | Gas consumed and authorised, hex |
| `block.baseFeePerGas` | string | Base fee per gas, hex wei |
| `block.miner` | string | Address credited with the block |
| `block.transactions` | array | Transaction hashes, or full objects, as the node returns them |

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../machine-interface.md).

## See also

[Networks](../concepts/networks.md)
