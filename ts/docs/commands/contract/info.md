# wallet-cli contract info

Show contract ABI + metadata.

## Synopsis

```
wallet-cli contract info --contract <address> [options]
```

## Description

> **TRON only.** The ABI this reads is the one held on chain, which is a TRON protocol feature; on an EVM network the command fails with `family_mismatch`.

Fetches a deployed contract's ABI and metadata (getContract + getContractInfo combined): name, method list, origin address, bytecode, energy settings. Useful before crafting a [`contract call`](call.md) / [`contract send`](send.md) — the ABI tells you the exact method signatures. Read-only — no account or password involved.

## Options

| Option | Description |
|---|---|
| `--contract <string>` | **Required.** Contract address |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli contract info --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf --network nile
```

```console
Contract  TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf
Name      TetherToken
Methods   33 (name / deprecate / approve …)
```

```bash
wallet-cli contract info --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf --network nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"contract.info","data":{"address":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","name":"TetherToken","functionCount":33,"methods":["name","deprecate","approve","deprecated","addBlackList","totalSupply","transferFrom","…"],"contract":{"origin_address":"41…","contract_address":"41…","abi":{},"bytecode":"…","name":"TetherToken"},"info":{"smart_contract":{},"runtimecode":"…","contract_state":{}}},"meta":{"durationMs":15,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `address` | string | Contract address |
| `name` | string | Contract name |
| `functionCount` | number | Number of ABI functions |
| `methods` | string[] | Function names |
| `contract` | object | Raw `getContract` (ABI, bytecode, origin) — json only |
| `info` | object | Raw `getContractInfo` (runtime code, contract state) — json only |

Text output shows the human summary; the raw `contract` / `info` detail is json-only.

## Exit status

`0` success · `1` execution failure (`rpc_error`; address is not a contract) · `2` usage error (`family_mismatch` on an EVM network).

## See also

[`contract call`](call.md) · [`contract deploy`](deploy.md) · [`token info`](../token/info.md)
