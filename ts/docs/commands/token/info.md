# wallet-cli token info

Show token metadata.

## Synopsis

```
wallet-cli token info (--contract <address> | --asset-id <id>) [options]
```

## Description

Fetches a token's metadata straight from the chain — a pure RPC read that never touches your accounts. Pass exactly one selector: `--contract` for a contract-based token (TRC20 on TRON, ERC20 on EVM), `--asset-id` for a TRC10 asset.

Contract-token reads (TRC20/ERC20) return normalized metadata. The TRC10 `--asset-id` branch keeps the node record's snake_case keys, but decodes its text fields (`name`, `abbr`, `url`, `description`) to UTF-8 and serializes int64 quantities such as `total_supply` as decimal strings. Do not apply the contract-token field set to a TRC10 response.

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

A TRC10 lookup keeps the node's key names while decoding text and preserving quantities exactly:

```bash
wallet-cli token info --asset-id 1002000 --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"token.info","data":{"id":"1002000","owner_address":"418225f3aa48a2d30643a64410abb1e914dfa0bd2f","name":"MyToken","abbr":"MTK","description":"Demo TRC10","url":"https://mytoken.example","total_supply":"1000000000","trx_num":1,"num":100,"precision":6,"start_time":1785542400000,"end_time":1788134400000,"free_asset_net_limit":0,"public_free_asset_net_limit":0,"frozen_supply":[]},"meta":{"durationMs":210,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

For `--contract` (TRC20/ERC20):

| Field | Type | Meaning |
|---|---|---|
| `contract` | string | Token contract address |
| `name` | string | Token name |
| `symbol` | string | Token symbol |
| `decimals` | number | Token decimals |
| `totalSupply` | string | Total supply when the TRON contract adapter returns it; not returned by the EVM service |

For `--asset-id` (TRC10):

| Field | Type | Meaning |
|---|---|---|
| `id` / `owner_address` | string | Asset id and the node's hex owner address |
| `name` / `abbr` / `description` / `url` | string | UTF-8 text decoded from the node response |
| `total_supply` | string | Exact int64 supply in minimal units |
| `trx_num` / `num` | number | On-chain ICO rate pair |
| `precision` | number? | Asset precision; absent means `0` |
| `start_time` / `end_time` | number | ICO window, epoch milliseconds |
| `free_asset_net_limit` / `public_free_asset_net_limit` | number? | Free-bandwidth limits when present |
| `frozen_supply` | array? | Frozen tranches; each `frozen_amount` is a decimal string and `frozen_days` is a number |

The TRC10 shape does not contain normalized `contract`, `symbol`, or `decimals` keys.

## Exit status

`0` success · `1` execution failure (`token_metadata_unavailable` — the contract does not expose ERC20-style metadata; `rpc_error`) · `2` usage error (`invalid_value`; `invalid_option` — `--asset-id` on an EVM network).

## See also

[`token add`](add.md) · [`token balance`](balance.md) · [`contract info`](../contract/info.md)
