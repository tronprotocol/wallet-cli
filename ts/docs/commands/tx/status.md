# wallet-cli tx status

Show confirmation status of a transaction.

## Synopsis

```
wallet-cli tx status --txid <id> [options]
```

## Description

Reports which step a transaction is at, using **four states**, on TRON and EVM networks alike. After sending, scripts and agents poll it to learn whether the tx made it on-chain and succeeded. These four state values are **stable — they won't be renamed or dropped across versions** — so you can program against them (see the `wallet-cli.result.v1` output contract in [machine-interface](../../machine-interface.md)).

| `data.state` | Meaning | Terminal? |
|---|---|---|
| `confirmed` | On chain — solidified on TRON, receipted on EVM; `blockNumber` present | yes |
| `failed` | Included and reverted / rejected | yes |
| `pending` | Seen by the node, not yet solidified | no — keep polling |
| `not_found` | Unknown to the queried node (wrong network? not propagated yet?) | no — poll within your own deadline |

## Options

| Option | Description |
|---|---|
| `--txid <string>` | **Required.** Transaction id/hash — bare hex on TRON, `0x…` on EVM |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli tx status --txid 7d9b6a08505537f7fd51ed4fb4223ce89098403d26e8d3fe07bdb3d625a46364 --network tron:nile
```

```console
TxID           34d9da372cd7fa9d4e7384744c0925af9d682eef4c9410fb831e0b87b355171b
Status         confirmed ✅
Block          #70,433,563
Confirmations  1
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"tx.status","data":{"txid":"34d9da372cd7fa9d4e7384744c0925af9d682eef4c9410fb831e0b87b355171b","state":"confirmed","confirmed":true,"failed":false,"blockNumber":70433563,"confirmations":1},"meta":{"durationMs":732,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

The same query on an EVM network, by `0x` hash:

```bash
wallet-cli tx status --txid 0x55b0068ef31bce39bbf5b06d456eaef307fd77f96d85ea291f48c1ae4b900d80 --network evm:11155111 -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"tx.status","data":{"txid":"0x55b0068ef31bce39bbf5b06d456eaef307fd77f96d85ea291f48c1ae4b900d80","state":"confirmed","confirmed":true,"failed":false,"blockNumber":11576586,"confirmations":0},"meta":{"durationMs":408,"warnings":[]},"chain":{"family":"evm","network":"evm:11155111","chainId":"11155111"}}
```

An unknown txid is a **success** with `state: "not_found"` (exit 0) — the query worked; the answer is "not there":

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"tx.status","data":{"txid":"0000…0000","state":"not_found","confirmed":false,"failed":false},"meta":{"durationMs":1022,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

On EVM, `not_found` also carries a `meta.warnings` entry, because a public endpoint that has pruned its history is indistinguishable from a hash that never existed:

```json
{"…":"…","data":{"txid":"0x0000…0000","state":"not_found","confirmed":false,"failed":false},"meta":{"durationMs":407,"warnings":["0x0000…0000 is unknown to this endpoint. Public nodes often prune history, so this may mean the node has no record of it rather than that it never existed; try an archival endpoint."]}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `txid` | string | Echo of the queried id |
| `state` | string | `confirmed` / `failed` / `pending` / `not_found` |
| `confirmed` / `failed` | boolean | Direct-branch conveniences mirroring `state` |
| `blockNumber` | number | Present when confirmed |
| `confirmations` | number | Blocks on top of the including block; present when confirmed |

## Exit status

`0` query answered (including `not_found`) · `1` execution failure (node unreachable, timeout) · `2` usage error.

## See also

[`tx info`](info.md) — full detail + receipt · [`tx send`](send.md) · [Script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed)
