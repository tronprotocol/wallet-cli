# wallet-cli account balance

Show native balance (TRX/SUN).

## Synopsis

```
wallet-cli account balance [options]
```

## Description

Fetches the native TRX balance of the active account (or `--account`) from the node. Read-only; no unlock needed.

## Options

Only the [global options](../index.md#global-options-every-command) (`--account`, `--network`, …).

## Examples

```console
$ wallet-cli account balance --network tron:nile
Label    main
Balance  1976.489 TRX
```

```console
$ wallet-cli account balance --network tron:nile -o json
{"schema":"wallet-cli.result.v1","success":true,"command":"tron.account.balance","data":{"address":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","balance":"1976489000","decimals":6,"symbol":"TRX"},"meta":{"durationMs":1114,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `address` | string | Queried base58 address |
| `balance` | string | Raw balance in SUN (`"1976489000"` = 1976.489 TRX) |
| `decimals` | number | `6` for TRX |
| `symbol` | string | `TRX` |

## Exit status

`0` · `1` execution failure (node unreachable, timeout) · `2` usage error.

## See also

[`account portfolio`](portfolio.md) — includes tokens · [`account info`](info.md) · [Units: TRX vs SUN](../../concepts/networks.md#fees-the-tron-resource-model)
