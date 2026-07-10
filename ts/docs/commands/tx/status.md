# wallet-cli tx status

Show confirmation status of a transaction.

## Synopsis

```
wallet-cli tx status --txid <id> [options]
```

## Description

Reports where a transaction stands using a **four-state model**. This is the command scripts and agents poll after a send; the state machine is part of the v1 contract.

| `data.state` | Meaning | Terminal? |
|---|---|---|
| `confirmed` | Solidified on chain; `blockNumber` present | yes |
| `failed` | Included and reverted / rejected | yes |
| `pending` | Seen by the node, not yet solidified | no — keep polling |
| `not_found` | Unknown to the queried node (wrong network? not propagated yet?) | no — poll within your own deadline |

## Options

| Option | Description |
|---|---|
| `--txid <string>` | **Required.** TRON transaction id/hash |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```console
$ wallet-cli tx status --txid 7d9b6a08505537f7fd51ed4fb4223ce89098403d26e8d3fe07bdb3d625a46364 --network tron:nile
TxID    7d9b6a08505537f7fd51ed4fb4223ce89098403d26e8d3fe07bdb3d625a46364
Status  confirmed ✅
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"tron.tx.status","data":{"txid":"7d9b6a08505537f7fd51ed4fb4223ce89098403d26e8d3fe07bdb3d625a46364","state":"confirmed","confirmed":true,"failed":false,"blockNumber":68822193},"meta":{"durationMs":1006,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

An unknown txid is a **success** with `state: "not_found"` (exit 0) — the query worked; the answer is "not there":

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"tron.tx.status","data":{"txid":"0000…0000","state":"not_found","confirmed":false,"failed":false},"meta":{"durationMs":1022,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `txid` | string | Echo of the queried id |
| `state` | string | `confirmed` / `failed` / `pending` / `not_found` |
| `confirmed` / `failed` | boolean | Direct-branch conveniences mirroring `state` |
| `blockNumber` | number | Present when confirmed |

## Exit status

`0` query answered (including `not_found`) · `1` execution failure (node unreachable, timeout) · `2` usage error.

## See also

[`tx info`](info.md) — full detail + receipt · [`tx send`](send.md) · [Script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed)
