# wallet-cli contract call

Read-only contract call (triggerConstantContract).

## Synopsis

```
wallet-cli contract call --contract <address> --method <sig> [--params <json>] [options]
```

## Description

Calls a contract method as a constant (read-only) call: nothing is signed, nothing is broadcast, no fee is spent. The active account (or `--account`) is used as the caller address — some methods (e.g. `balanceOf`-style views with `msg.sender`) care about who asks.

Parameters are a JSON array of `{type, value}` objects matching the method signature.

## Options

| Option | Description |
|---|---|
| `--contract <string>` | **Required.** Contract address |
| `--method <string>` | **Required.** Function signature, e.g. `balanceOf(address)` |
| `--params <string>` | JSON array of ABI parameters as `{type,value}`; omit to pass none |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```console
$ wallet-cli contract call --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf --method "balanceOf(address)" --params '[{"type":"address","value":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ"}]' --network tron:nile
Method  balanceOf
Result  0000000000000000000000000000000000000000000000000000000000000000 (raw)
```

```console
$ wallet-cli contract call --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf --method "balanceOf(address)" --params '[{"type":"address","value":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ"}]' --network tron:nile -o json
{"schema":"wallet-cli.result.v1","success":true,"command":"tron.contract.call","data":{"contract":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","method":"balanceOf(address)","result":["0000000000000000000000000000000000000000000000000000000000000000"]},"meta":{"durationMs":15,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `contract` | string | Contract address called |
| `method` | string | Method signature invoked |
| `result` | string[] | Raw ABI-encoded return words (hex); decode per the method's return type |

## Exit status

`0` success · `1` execution failure (`rpc_error`, revert) · `2` usage error (`invalid_value` — bad signature or params JSON).

## See also

[`contract send`](send.md) · [`contract info`](info.md) · [`token balance`](../token/balance.md)
