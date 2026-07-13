# wallet-cli account portfolio

Show native + token balances with best-effort USD value.

## Synopsis

```
wallet-cli account portfolio [options]
```

## Description

Aggregates the account's native TRX and address-book token balances into one view, attaching USD prices from an external price source **best-effort**: when a price is unavailable (typical on testnets), `priceUsd` / `valueUsd` are `null` and the command still succeeds. Expect this to be the slowest `account` query — it fans out to the price source.

## Options

Only the [global options](../index.md#global-options-every-command).

## Examples

```console
$ wallet-cli account portfolio --network tron:nile
"main" Portfolio
| Token | Balance  | Price (USD) | Value (USD) |
| ----- | -------- | ----------- | ----------- |
| TRX   | 1969.421 | -           | -           |
Total ≈ -
```

```console
$ wallet-cli account portfolio --network tron:nile -o json
{"schema":"wallet-cli.result.v1","success":true,"command":"tron.account.portfolio","data":{"network":"tron:nile","account":"wlt_4473p34m.0","address":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","priceSource":"coingecko","holdings":[{"kind":"native","symbol":"TRX","decimals":6,"rawBalance":"1976489000","balance":"1976.489","priceUsd":null,"valueUsd":null}],"totalValueUsd":null},"meta":{"durationMs":11031,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `network` / `account` / `address` | string | Query context |
| `priceSource` | string | e.g. `coingecko` |
| `holdings[].kind` | string | `native` or token kinds |
| `holdings[].symbol` / `decimals` | — | Token identity |
| `holdings[].rawBalance` | string | Base units |
| `holdings[].balance` | string | Human units |
| `holdings[].priceUsd` / `valueUsd` | number\|null | **Best-effort estimate**; `null` when unpriced |
| `totalValueUsd` | number\|null | Sum of priced holdings, `null` if none priced |

## Exit status

`0` (even with all prices `null`) · `1` execution failure · `2` usage error.

## See also

[`account balance`](balance.md) · `token` — manage the address book that defines which tokens appear here
