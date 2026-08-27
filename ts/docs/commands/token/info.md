# wallet-cli token info

Show token metadata.

## Synopsis

```
wallet-cli token info (--contract <address> | --asset-id <id>) [options]
```

## Description

Fetches a token's metadata straight from the chain — a pure RPC read that never touches your accounts. Pass exactly one selector: `--contract` for a contract-based token (TRC20 on TRON, ERC20 on EVM), `--asset-id` for a TRC10 asset.

TRON additionally reports `totalSupply`; the EVM read returns `name`, `symbol` and `decimals` only.

## Options

| Option | Description |
|---|---|
| `--contract <string>` | Token contract address — TRC20 on TRON, ERC20 on EVM |
| `--asset-id <string>` | **TRON only.** TRC10 numeric asset id; exactly one of `--asset-id` / `--contract` |

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
{"schema":"wallet-cli.result.v1","success":true,"command":"token.info","data":{"contract":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","name":"Tether USD","symbol":"USDT","decimals":6,"totalSupply":"17600000000030000000"},"meta":{"durationMs":690,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

An ERC20 token on an EVM network — no `totalSupply`:

```bash
wallet-cli token info --contract 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 --network evm:11155111 -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"token.info","data":{"contract":"0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238","symbol":"USDC","decimals":6,"name":"USDC"},"meta":{"durationMs":409,"warnings":[]},"chain":{"family":"evm","network":"evm:11155111","chainId":"11155111"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `contract` | string | Token contract address (or `assetId` for TRC10) |
| `name` | string | Token name |
| `symbol` | string | Token symbol |
| `decimals` | number | Token decimals |
| `totalSupply` | string | Total supply, raw integer in base units; **TRON only** |

## Exit status

`0` success · `1` execution failure (`token_metadata_unavailable` — the contract does not expose ERC20-style metadata; `rpc_error`) · `2` usage error (`invalid_value`; `invalid_option` — `--asset-id` on an EVM network).

## See also

[`token add`](add.md) · [`token balance`](balance.md) · [`contract info`](../contract/info.md)
