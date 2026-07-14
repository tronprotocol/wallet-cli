# wallet-cli token balance

Show a single token balance (TRC20 or TRC10).

## Synopsis

```
wallet-cli token balance (--contract <address> | --asset-id <id>) [options]
```

## Description

Queries one token balance for the active account (or `--account`). Pass exactly one selector: `--contract` for a TRC20 token, `--asset-id` for a TRC10 asset. Read-only — no password, nothing is signed.

## Options

| Option | Description |
|---|---|
| `--contract <string>` | TRC20 contract address; exactly one of `--contract` / `--asset-id` |
| `--asset-id <string>` | TRC10 numeric asset id; exactly one of `--asset-id` / `--contract` |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli token balance --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf --network tron:nile
```

```console
Label    main
Symbol   USDT
Balance  1,204.56
```

```bash
wallet-cli token balance --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"tron.token.balance","data":{"address":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","token":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","balance":"1204560000","symbol":"USDT","decimals":6},"meta":{"durationMs":15,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `address` | string | Queried account (base58) |
| `token` | string | Contract address (TRC20) or asset id (TRC10) |
| `balance` | string | Raw balance in token base units (`"1204560000"` ÷ 10^`decimals`) |
| `symbol` | string | Token symbol |
| `decimals` | number | Token decimals |

## Exit status

`0` success · `1` execution failure (`rpc_error`, `timeout`) · `2` usage error (`invalid_value` — missing or conflicting selector).

## See also

[`token info`](info.md) · [`account portfolio`](../account/portfolio.md) · [`tx send`](../tx/send.md)
