# wallet-cli token balance

Show a single token balance.

## Synopsis

```
wallet-cli token balance (--contract <address> | --asset-id <id>) [options]
```

## Description

Queries one token balance for the active account (or `--account`) on the selected network — TRC20/TRC10 on TRON, ERC20 on EVM. Pass exactly one selector: `--contract` for a contract-based token, `--asset-id` for a TRC10 asset. Read-only — no password, nothing is signed.

## Options

| Option | Description |
|---|---|
| `--contract <string>` | Token contract address — TRC20 on TRON, ERC20 on EVM |
| `--asset-id <string>` | **TRON only.** TRC10 numeric asset id; exactly one of `--asset-id` / `--contract` |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli token balance --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf --network tron:nile
```

```console
Label    demo
Symbol   USDT
Balance  17061.463423
```

```bash
wallet-cli token balance --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"token.balance","data":{"address":"TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB","token":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","balance":"17061463423","symbol":"USDT","decimals":6},"meta":{"durationMs":1215,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

An ERC20 balance on an EVM network — same fields, plus the token's `name`:

```bash
wallet-cli token balance --contract 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 --network evm:11155111 -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"token.balance","data":{"address":"0x541B10b92b45C08513e67bb8209f035D810212B6","token":"0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238","balance":"0","symbol":"USDC","decimals":6,"name":"USDC"},"meta":{"durationMs":233,"warnings":[]},"chain":{"family":"evm","network":"evm:11155111","chainId":"11155111"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `address` | string | Queried account, in the selected network's address format |
| `token` | string | Contract address, or TRC10 asset id |
| `balance` | string | Raw balance in token base units (`"17061463423"` ÷ 10^`decimals`) |
| `symbol` | string | Token symbol |
| `decimals` | number | Token decimals |
| `name` | string | Token name; EVM only |

## Exit status

`0` success · `1` execution failure (`rpc_error`, `timeout`) · `2` usage error (`invalid_value` — missing or conflicting selector; `invalid_option` — `--asset-id` on an EVM network).

## See also

[`token info`](info.md) · [`account portfolio`](../account/portfolio.md) · [`tx send`](../tx/send.md)
