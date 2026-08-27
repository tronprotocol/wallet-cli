# wallet-cli chain node

Connected node status.

## Synopsis

```
wallet-cli chain node [options]
```

## Description

Shows the connected node's version, head/solid block heights, sync state, and peer counts, on TRON and EVM networks alike. Its job in troubleshooting: separate "the node is out of sync" from "something is wrong with my transaction" before you start debugging the latter.

How the numbers are made: on TRON, version, block heights and peers come from the node's `getnodeinfo`, and the sync verdict is a freshness check — the head block header's timestamp against the local clock, within 3 block intervals (TRON produces a block every 3 s, so 9 s). On EVM the fields come from `web3_clientVersion`, `eth_chainId`, `eth_syncing`, `net_peerCount` and the latest block, and the verdict is the node's own `eth_syncing` answer rather than a guess from timestamps — the text `Syncing` row is that same verdict read the other way round. Public gateways (TronGrid, public RPC providers) may hide some fields (peers, machine info); those rows show `—` (json `null`).

The `endpoint` is reported as a **host only**, never the full URL — a commercial RPC endpoint often carries its API key in the path, and this is output people paste into issues and CI logs. Read the full value with `config networks.<id>.httpEndpoint`.

## Options

No command-specific options; the [global options](../index.md#global-options-every-command) only (`--network`).

## Examples

```bash
wallet-cli chain node --network tron:nile
```

```console
Endpoint     nile.trongrid.io
Version      java-tron 4.8.2.1.PQ1_build1
Head block   #70,433,707  2026-08-27 08:16:00 (~4s ago — in sync)
Solid block  #70,433,690  (17 blocks behind head)
Peers        60 connected / 3 active
```

```bash
wallet-cli chain node --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"chain.node","data":{"endpoint":"nile.trongrid.io","version":"java-tron 4.8.2.1.PQ1_build1","p2pVersion":"201910292","headBlock":{"number":70433708,"timestamp":1787818563000},"solidBlock":{"number":70433690},"lagBlocks":18,"inSync":true,"peers":{"connected":58,"active":3}},"meta":{"durationMs":752,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

On an EVM network, with the chain id and the node's own syncing flag added:

```bash
wallet-cli chain node --network evm:11155111
```

```console
Endpoint     ethereum-sepolia-rpc.publicnode.com
Version      Geth/v1.17.1-stable-16783c16/linux-amd64/go1.25.7
Chain id     11155111
Head block   #11,576,632  2026-08-27 08:16:00 (~6s ago — in sync)
Solid block  #11,576,563  (69 blocks behind head)
Syncing      no
Peers        25 connected / 25 active
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"chain.node","data":{"endpoint":"ethereum-sepolia-rpc.publicnode.com","version":"Geth/v1.17.1-stable-16783c16/linux-amd64/go1.25.7","chainId":"11155111","p2pVersion":null,"headBlock":{"number":11576632,"timestamp":1787818560000},"solidBlock":{"number":11576563},"lagBlocks":69,"inSync":true,"peers":{"connected":25,"active":25}},"meta":{"durationMs":389,"warnings":[]},"chain":{"family":"evm","network":"evm:11155111","chainId":"11155111"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `endpoint` | string | Host of the node queried — host only, never the full URL |
| `version` | string | Node software version |
| `chainId` | string | EIP-155 chain id; **EVM only** |
| `p2pVersion` | string \| null | P2P protocol version; `null` on EVM |
| `headBlock` | object | Latest block `{number, timestamp}` |
| `solidBlock` | object \| null | Solidified block on TRON, the finalized block on EVM — `{number}` |
| `lagBlocks` | number \| null | Head − solid block gap |
| `inSync` | boolean \| null | Whether the node is caught up. On TRON: the head block is fresh (within 3 block intervals, i.e. ≤ 9 s). On EVM: the node's own `eth_syncing` answer, inverted — `null` when it could not be read, which is not the same as out of sync |
| `peers` | object \| null | `{connected, active}`; `null` when the endpoint hides it. EVM reports one peer count, so both fields carry it |

## Exit status

`0` success · `1` execution failure (`rpc_error`, `timeout`) · `2` usage error.

## See also

[`chain params`](params.md) · [`networks`](../networks.md) · [Troubleshooting](../../troubleshooting.md)
