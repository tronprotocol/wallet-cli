# wallet-cli sunswap pool-search

Search SunSwap liquidity pools, ordered by TVL, highest first.

## Synopsis

```
wallet-cli sunswap pool-search <keyword> [options]
```

## Description

Mainnet only, like every SunSwap market query: on Nile or Shasta the command fails with `unsupported_network_capability`.

Matching is a case-insensitive **substring match on the symbols of the tokens in the pool**; token names are not matched. Space-separated words must all match, in any order — `"TRX USDT"` and `"USDT TRX"` give the same result. A full pool contract address, or a V4 64-hex pool id, matches exactly; a `0x` prefix is stripped for you, since the service will not match one that carries it.

**Substring matching finds impersonation pools.** A search for `"TRX USDT"` also returns pools of tokens whose symbols merely contain `USDT`. Check `tokens[].address` in the JSON before acting on any pool this returns.

This is the one listing with a **trustworthy total**: the count is taken under the same filters as the page, so `showing 3 of 83` describes the same set of pools as the rows above it.

Compared with [`pool-list --token`](pool-list.md): that matches one token *exactly*, by address, and can quote prices in it. This matches symbols loosely and can look up a pool by its identifier. Both order by TVL descending.

## Options

| Option | Default | Description |
|---|---|---|
| `--protocol <name>` | all | `V1`, `V1_5`, `V2`, `V3`, `V4`, `CURVE`. No `ALL`; omit the flag for every protocol |
| `--limit <n>` | `20` | Maximum rows |
| `--offset <n>` | `0` | Rows to skip; must be a multiple of `--limit`, and `--offset` + `--limit` may not exceed 1000 — the data service exposes only the first 1000 rows of this listing |

Plus the [global options](../index.md#global-options-every-command). No `--account`: it is rejected with `invalid_option`.

## Examples

```bash
wallet-cli sunswap pool-search "TRX USDT" --limit 3 --network tron
```

```console
Pools (showing 3 of 83)
| Pool                                                             | Pair      | Protocol | Fee   | TVL (USD)       | Vol 24h (USD)  | APR   |
| ---------------------------------------------------------------- | --------- | -------- | ----- | --------------- | -------------- | ----- |
| TSUUVjysXV8YqHytSNjfkNXnnB49QDvZpx                               | WTRX/USDT | V3       | 0.05% | $187,520,420.19 | $23,870,832.79 | 2.65% |
| TFGDbUyP8xez44C76fin3bn3Ss6jugoUwJ                               | WTRX/USDT | V2       | 0.3%  | $93,923,431.61  | $629,652.68    | 0.68% |
| dda1d5819853f19f3e952da5d93aa2d572d95c72a8e6e4c2acab65384fd2557e | TRX/USDT  | V4       | 0.05% | $92,322,471.91  | $8,021,822.96  | 1.90% |
```

```bash
wallet-cli sunswap pool-search "TRX USDT" --limit 1 --network tron -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"sunswap.pool-search","data":{"pools":[{"poolAddress":"TSUUVjysXV8YqHytSNjfkNXnnB49QDvZpx","protocol":"V3","poolType":"2pool","feeRate":"0.0005","protocolFeeRate":"0.166666666666666667","tokens":[{"address":"TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR","symbol":"WTRX","name":"Wrapped TRX","decimals":6,"logo":"https://static.tronscan.org/production/upload/logo/TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR.png?t=1598430824415","amount":"267177393240838","priceUsd":"0.334857305797","volume1d":"71313548105398"},{"address":"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t","symbol":"USDT","name":"Tether USD","decimals":6,"logo":"https://static.tronscan.org/production/logo/usdtlogo.png","amount":"98065592952792","priceUsd":"0.99939870103","volume1d":"23876364488162"}],"reserveUsd":"187472928.283249657946313646","reserveUsd1dRate":"0.003297","volumeUsd1d":"23870832.794668487073937915","volumeUsd1dRate":"-0.146525","volumeUsd7d":"190539358.865637616339507464","volumeUsd7dRate":"-0.195128","volumeUsd14d":"427271798.896549584886917024","feeUsd1d":"11935.416397334243536969","farmApr":"0","feeApr":"0.0264917","totalApr":"0.0264917","transaction1d":3680,"transaction1dRate":"0.082671","transactionRecentTotal":691015,"createdAt":"2023-06-27 15:23","createTxHash":"287a2bd4c78a944937cc31570de6bea6a63ad8bb0cebca254e07fd17c9e68fc6","extra":{"tick":-10936,"liquidity":"1794647496512473","protocolFeeRateToken0":"0.16666666666666666","protocolFeeRateToken1":"0.16666666666666666","sqrtPriceX96":"45860650900268961124746003501"}}]},"meta":{"durationMs":1181,"warnings":[],"pagination":{"offset":0,"limit":1,"total":83,"hasMore":true}},"chain":{"family":"tron","network":"tron:728126428","chainId":"728126428"}}
```

`meta.pagination.total` is the size of the whole match (here 83), counted under the same filters as the page.

## Output

Same record shape as [`pool-list`](pool-list.md), without `pairPrices` — there is no chosen token to quote in. `meta.pagination.total` carries the real count; there is no `meta.query`, because the ordering is fixed.

If the service answers the count with something that is not a non-negative integer, `total` is `null` rather than a number that would be printed as fact; a count request that fails outright fails the whole command.

## Exit status

`0` success · `1` execution failure (`provider_error`, `provider_rate_limited`, `timeout`) · `2` usage error (`missing_option` — no keyword; `invalid_value` — an empty or whitespace keyword, or an invalid protocol or paging value; `unsupported_network_capability`).

## See also

[`sunswap pool-list`](pool-list.md) · [`sunswap token-search`](token-search.md) · [`sunswap` group](index.md)
