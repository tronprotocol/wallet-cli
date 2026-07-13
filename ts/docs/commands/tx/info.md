# wallet-cli tx info

Show full transaction detail + receipt.

## Synopsis

```
wallet-cli tx info --txid <id> [options]
```

## Description

Fetches the complete transaction object and its execution receipt (resource consumption, contract result). Use this for forensics and fee analysis; for a simple "did it land?" check, [`tx status`](status.md) is cheaper — its four state values are stable, so you can program against them.

Note the failure-mode difference: where `tx status` answers `not_found` with exit 0, `tx info` on an unknown txid is a plain **error** (`rpc_error`, exit 1) — there is no detail to show (see the examples below).

## Options

| Option | Description |
|---|---|
| `--txid <string>` | **Required.** TRON transaction id/hash |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```console
$ wallet-cli tx info --txid 52332505ab6b605aff626aaef2b07f3718d4bac8f45cdab1c0ea9465eb98e065 --network tron:nile
TxID    52332505ab6b605aff626aaef2b07f3718d4bac8f45cdab1c0ea9465eb98e065
From    TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ
To      TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH
Amount  1 TRX
Status  SUCCESS
Block   #69,084,269
```

`-o json` returns the full detail (`transaction` is the raw tx, `info` is the receipt; elided as `{…}` here):

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"tron.tx.info","data":{"txid":"52332505ab6b605aff626aaef2b07f3718d4bac8f45cdab1c0ea9465eb98e065","from":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","to":"TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH","amount":"1","symbol":"TRX","status":"SUCCESS","blockNumber":69084269,"transaction":{…},"info":{…}},"meta":{"durationMs":1396,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

An unknown txid errors out (`rpc_error`, exit 1) — unlike `tx status`'s `not_found` (exit 0):

```json
{"schema":"wallet-cli.result.v1","success":false,"command":"tron.tx.info","error":{"code":"rpc_error","message":"TRON getTransaction failed: Transaction not found"},"meta":{"durationMs":1033,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` is structured transaction detail: a human-readable summary at the top level, `transaction` holds the raw tx object, `info` holds the execution receipt. Shapes follow the node's transaction model; only the fields listed in [machine-interface](../../machine-interface.md) are guaranteed stable, the rest may vary with the node model.

| Field | Type | Meaning |
|---|---|---|
| `txid` | string | Transaction id |
| `from` | string | Sender address |
| `to` | string | Recipient address |
| `amount` | string | Transfer amount (human units) |
| `symbol` | string | Asset symbol (e.g. `TRX`) |
| `status` | string | Execution result (e.g. `SUCCESS`) |
| `blockNumber` | number | Block height |
| `transaction` | object | Raw TRON transaction object (`raw_data`, `signature`, `txID`, …) |
| `info` | object | Execution receipt (`receipt` resource usage, `contractResult`, `blockTimeStamp`, …) |

## Exit status

`0` found · `1` execution failure — including *not found* (`rpc_error`) · `2` usage error.

## See also

[`tx status`](status.md) · [`account history`](../account/history.md) · [Fees & resources](../../concepts/networks.md#fees-the-tron-resource-model)
