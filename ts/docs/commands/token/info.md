# wallet-cli token info

Show token metadata (name / symbol / decimals / totalSupply).

## Synopsis

```
wallet-cli token info (--contract <address> | --asset-id <id>) [options]
```

## Description

Fetches a token's metadata straight from the chain — a pure RPC read that never touches your accounts. Pass exactly one selector: `--contract` for TRC20, `--asset-id` for TRC10.

## Options

| Option | Description |
|---|---|
| `--contract <string>` | TRC20 contract address; exactly one of `--contract` / `--asset-id` |
| `--asset-id <string>` | TRC10 numeric asset id; exactly one of `--asset-id` / `--contract` |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli token info --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf --network tron:nile
```

```console
Name      Tether USD
Symbol    USDT
Decimals  6
```

```bash
wallet-cli token info --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"token.info","data":{"contract":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","name":"Tether USD","symbol":"USDT","decimals":6,"totalSupply":"17600000000030000000"},"meta":{"durationMs":15,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `contract` | string | TRC20 contract address (or `assetId` for TRC10) |
| `name` | string | Token name |
| `symbol` | string | Token symbol |
| `decimals` | number | Token decimals |
| `totalSupply` | string | Total supply, raw integer in base units |

## Exit status

`0` success · `1` execution failure (`token_metadata_unavailable` — the contract does not expose ERC20-style metadata; `rpc_error`) · `2` usage error (`invalid_value`).

## See also

[`token add`](add.md) · [`token balance`](balance.md) · [`contract info`](../contract/info.md)
