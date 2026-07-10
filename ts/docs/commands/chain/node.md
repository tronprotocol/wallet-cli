# wallet-cli chain node

Connected node status (version / sync / peers).

## Synopsis

```
wallet-cli chain node [options]
```

## Description

Shows the connected node's version, head/solid block heights, sync state, and peer counts. Its job in troubleshooting: separate "the node is out of sync" from "something is wrong with my transaction" before you start debugging the latter.

How the numbers are made: version, block heights, and peers come from the node's `getnodeinfo`; the "how long ago" freshness check compares the latest block header's timestamp with the local clock — a block age within 3 block intervals (TRON produces a block every 3 s, so 9 s) counts as `in sync`. Public gateways (e.g. TronGrid) may hide some fields (peers, machine info); those rows show `—` (json `null`).

## Options

No command-specific options; the [global options](../index.md#global-options-every-command) only (`--network`).

## Examples

```console
$ wallet-cli chain node --network tron:nile
Endpoint     https://api.trongrid.io
Version      java-tron 4.7.7
Head block   84,120,345  2026-07-05 15:47:33 (~2s ago — in sync)
Solid block  84,120,326  (19 blocks behind head)
Peers        30 connected / 27 active
```

```console
$ wallet-cli chain node --network tron:nile -o json
{"schema":"wallet-cli.result.v1","success":true,"command":"tron.chain.node","data":{"endpoint":"https://api.trongrid.io","version":"java-tron 4.7.7","p2pVersion":"11111","headBlock":{"number":84120345,"timestamp":1783237653000},"solidBlock":{"number":84120326},"lagBlocks":19,"inSync":true,"peers":{"connected":30,"active":27}},"meta":{"durationMs":24,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `endpoint` | string | Node URL queried |
| `version` | string | Node software version |
| `p2pVersion` | string | P2P protocol version |
| `headBlock` | object | Latest block `{number, timestamp}` |
| `solidBlock` | object | Solidified block `{number}` |
| `lagBlocks` | number | Head − solid block gap |
| `inSync` | boolean | Whether the head block is fresh (≤ 9 s old) |
| `peers` | object \| null | `{connected, active}`; `null` when the endpoint hides it |

## Exit status

`0` success · `1` execution failure (`rpc_error`, `timeout`) · `2` usage error.

## See also

[`chain params`](params.md) · [`networks`](../networks.md) · [Troubleshooting](../../troubleshooting.md)
