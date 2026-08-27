# wallet-cli contract call

Read-only contract call.

## Synopsis

```
wallet-cli contract call --contract <address> --method <sig> [--params <json>] [options]
```

## Description

Calls a contract method as a constant (read-only) call on TRON or EVM: nothing is signed, nothing is broadcast, no fee is spent, and no account is needed.

The function signature and parameter types are supplied explicitly — no ABI is fetched or consulted. Parameters are a JSON array of `{type, value}` objects matching the method signature.

## Options

| Option | Description |
|---|---|
| `--contract <string>` | **Required.** Contract address — base58 on TRON, `0x` on EVM |
| `--method <string>` | **Required.** Function signature, e.g. `balanceOf(address)` |
| `--params <string>` | JSON array of ABI parameters as `{type,value}`; omit to pass none |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli contract call --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf --method "balanceOf(address)" --params '[{"type":"address","value":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ"}]' --network tron:nile
```

```console
Method  balanceOf
Result  0000000000000000000000000000000000000000000000000000000000000000 (raw)
```

```bash
wallet-cli contract call --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf --method "balanceOf(address)" --params '[{"type":"address","value":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ"}]' --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"contract.call","data":{"contract":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","method":"balanceOf(address)","result":["0000000000000000000000000000000000000000000000000000000000000000"]},"meta":{"durationMs":15,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

The same call on an EVM network. Note the shape of `result`: the TRON node returns the return data split into words, the EVM node returns it as one `0x` blob:

```bash
wallet-cli contract call --contract 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 --method "balanceOf(address)" --params '[{"type":"address","value":"0x541B10b92b45C08513e67bb8209f035D810212B6"}]' --network evm:11155111
```

```console
Method  balanceOf
Result  0x0000000000000000000000000000000000000000000000000000000000000000 (raw)
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"contract.call","data":{"contract":"0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238","method":"balanceOf(address)","result":"0x0000000000000000000000000000000000000000000000000000000000000000"},"meta":{"durationMs":236,"warnings":[]},"chain":{"family":"evm","network":"evm:11155111","chainId":"11155111"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `contract` | string | Contract address called |
| `method` | string | Method signature invoked |
| `result` | string[] \| string | Raw ABI-encoded return data; an array of 32-byte words on TRON, a single `0x` string on EVM. Decode per the method's return type |

## Exit status

`0` success · `1` execution failure (`rpc_error`, revert) · `2` usage error (`invalid_value` — bad signature or params JSON).

## See also

[`contract send`](send.md) · [`contract info`](info.md) · [`token balance`](../token/balance.md)
