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
| `--contract <string>` | Token contract address — TRC20 on TRON, ERC20 on EVM; exactly one of `--contract` / `--asset-id` |
| `--asset-id <string>` | **TRON only.** TRC10 numeric asset id; exactly one of `--asset-id` / `--contract` |

`--asset-id` is a TRON-only flag: help tags it `(TRON only)`, and passing it on an EVM network fails with `invalid_option` before any node call.

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli token balance --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf --network nile
```

```console
Label    main
Symbol   USDT
Balance  1,204.56
```

```bash
wallet-cli token balance --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf --network nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"token.balance","data":{"address":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","token":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","balance":"1204560000","symbol":"USDT","decimals":6},"meta":{"durationMs":15,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

An ERC20 balance on an EVM network — same fields, plus the token's `name`:

```bash
wallet-cli token balance --contract 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 --network sepolia -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"token.balance","data":{"address":"0x541B10b92b45C08513e67bb8209f035D810212B6","token":"0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238","balance":"0","symbol":"USDC","decimals":6,"name":"USDC"},"meta":{"durationMs":233,"warnings":[]},"chain":{"family":"evm","network":"eip155:11155111","chainId":"11155111"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `address` | string | Queried account, in the selected network's address format |
| `token` | string | Contract address, or TRC10 asset id |
| `balance` | string | Raw balance in token base units (`"1204560000"` ÷ 10^`decimals`) |
| `symbol` | string | Token symbol |
| `decimals` | number | Token decimals |
| `name` | string | Token name; EVM only |

## Exit status

`0` success · `1` execution failure (`rpc_error`, `timeout`) · `2` usage error (`invalid_value` — missing or conflicting selector; `invalid_option` — `--asset-id` on an EVM network).

## See also

[`token info`](info.md) · [`account portfolio`](../account/portfolio.md) · [`tx send`](../tx/send.md)
