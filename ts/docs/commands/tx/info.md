# wallet-cli tx info

Show full transaction detail + receipt.

## Synopsis

```
wallet-cli tx info --txid <id> [options]
```

## Description

Fetches the complete transaction object and its execution receipt (resource consumption, contract result). Use this for forensics and fee analysis; for a simple "did it land?" check, [`tx status`](status.md) is cheaper and has the contract-guaranteed state machine.

Note the failure-mode difference: where `tx status` answers `not_found` with exit 0, `tx info` on an unknown txid is an **error** (`rpc_error`, exit 1) — there is no detail to show:

```json
{"schema":"wallet-cli.result.v1","success":false,"command":"tron.tx.info","error":{"code":"rpc_error","message":"TRON getTransaction failed: Transaction not found"},"meta":{"durationMs":1033,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Options

| Option | Description |
|---|---|
| `--txid <string>` | **Required.** TRON transaction id/hash |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli tx info --txid 7d9b6a08505537f7fd51ed4fb4223ce89098403d26e8d3fe07bdb3d625a46364 \
  --network tron:nile -o json
```

## Output

`data` carries the TRON transaction object (contract type, parameters, `raw_data`, signatures) plus the receipt (energy/bandwidth consumed, result, block). Contract deployments include the created `contractAddress`. Shapes follow the node's transaction model; only fields listed in [machine-interface](../../machine-interface.md) carry the v1 stability promise.

## Exit status

`0` found · `1` execution failure — including *not found* (`rpc_error`) · `2` usage error.

## See also

[`tx status`](status.md) · [`account history`](../account/history.md) · [Fees & resources](../../concepts/networks.md#fees-the-tron-resource-model)
