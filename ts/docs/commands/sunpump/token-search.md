# wallet-cli sunpump token-search

Search SunPump tokens by symbol or name, or by a full contract address.

## Synopsis

```
wallet-cli sunpump token-search <keyword>
                                [--on-sunswap] [--twitter-launch] [--sun-agent-launch]
                                [--order-by <field>] [--sort <asc|desc>]
                                [--limit <n>] [--offset <n>]
```

## Description

Matching is a partial, case-insensitive match on the token's **symbol and name**. A full contract address matches that token exactly.

**Symbols and names are not unique.** A search routinely returns several tokens calling themselves the same thing, of which at most one is the one meant — the launchpad lists several tokens named `Tether USD` with symbol `USDT`, none of them Tether's. Check `Address` before acting on a row.

**The filters combine as an intersection:**

- `--on-sunswap` — only tokens already listed on SunSwap, i.e. launched.
- `--twitter-launch` — only tokens launched via Twitter.
- `--sun-agent-launch` — only tokens launched via a Sun agent, SunPump's own AI agent.

There is **no `--ai-helper`** and **no `--dlive`**. The Sun-agent filter is named after what the service actually filters on — tokens launched *by* a Sun agent. The service has no working live-stream filter and its records carry no data to filter on locally, so `--dlive` is not offered; passing it is `invalid_option`.

**There is no result total.** As with [`token-list`](token-list.md), the service reports `0` for every total, so `meta.pagination.total` is `null` and a page shorter than `--limit` is the only end-of-results signal.

An empty or whitespace keyword is refused rather than sent: the service reads it as "no filter" and would answer with the entire catalogue, which is a different question from the one asked.

## Options

| Option | Default | Description |
|---|---|---|
| `<keyword>` | — | **Required** positional. Text to match against symbols and names, or a full contract address |
| `--on-sunswap` | off | Only tokens already listed on SunSwap |
| `--twitter-launch` | off | Only tokens launched via Twitter |
| `--sun-agent-launch` | off | Only tokens launched via a Sun agent |
| `--order-by <field>` | `market-cap` | `created`, `market-cap`, `volume-24h` or `price-change-24h` |
| `--sort <asc\|desc>` | `desc` | Sort direction |
| `--limit <n>` | `20` | Maximum rows; at most `50` |
| `--offset <n>` | `0` | Rows to skip; must be a multiple of `--limit` |

Plus the [global options](../index.md#global-options-every-command). No `--account`: it is rejected with `invalid_option`.

## Examples

```bash
wallet-cli sunpump token-search SUN --limit 3 --network tron
```

```console
Tokens (limit 3, offset 0)
| Symbol  | Name        | Address                            | Status   | Price (TRX) | Market cap (USD) | 24h change |
| ------- | ----------- | ---------------------------------- | -------- | ----------- | ---------------- | ---------- |
| SUNDOG  | Sundog      | TXL6rJbvmjD46zeN1JssfgxvSo99qC8MRT | LAUNCHED | 0.004491    | $1,504,207.79    | 4.09%      |
| SUNTRON | TRON MASCOT | TPP9Pq2LQwtrwfyUDLSyFsKJwJjFouf45B | LAUNCHED | 0.001993    | $667,640.79      | 0.65%      |
| SUNCAT  | SUNCAT      | TAwAg9wtQzTMFsijnSFotJrpxhMm3AqW1d | LAUNCHED | 0.000640    | $214,492.99      | 1.65%      |
```

```bash
wallet-cli sunpump token-search SUN --limit 1 --network tron -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"sunpump.token-search","data":{"tokens":[{"address":"TXL6rJbvmjD46zeN1JssfgxvSo99qC8MRT","symbol":"SUNDOG","name":"Sundog","decimals":18,"totalSupply":"1000000000000000000000000000","status":"LAUNCHED","owner":"TXr7ifGXHzAerNz2go11eJQ5R2QwcRJkAf","market":{"marketCapUsd":"1506766.33324264116478451","priceInTrx":"0.004499726621333105","priceChange24HrPercent":"4.8534","volume24HrSun":"557205009831","virtualLiquidity":"0"},"curve":{"pumpPercentage":"100","currentSold":"0","tokenReserve":"0","trxReserve":"0"},"swapPoolAddress":"TDR7rpU33hToG8qo9i676V56bzcjkpjqox","farm":{"address":"TRnQvRaKaRhjLEW6zwD1WX64kWCj2Yyu43","apy":"0"},"createdAt":"2024-08-15 22:33","launchedAt":"2024-08-15 22:53","createTxHash":"0177939db732884b59fff573bb96d5b8d1232993c32f4e1effa0d85a2c46e241","launchTxHash":"f9c1baf04a7c2ab704aafc280dc03fc108a7c75a8aaf640a1ae3df44e0c372ff","description":"SUNDOG: The Dog on TRON taking us to the Sun","links":{"logo":"https://cdn.sunpump.meme/public/logo/TA8dfp_a8cihY95bXeU.png","twitter":"https://x.com/SUNDOG_TRX","telegram":"https://t.me/SUNDOG_TRX","website":"https://www.sundog.meme/"},"listOn":{"HTX":"https://www.htx.com/trade/sundog_usdt/","Gate":"https://www.gate.io/trade/SUNDOG_USDT","MEXC":"https://www.mexc.com/exchange/SUNDOG_USDT?_from=market","Bybit":"https://www.bybit.com/en/trade/spot/SUNDOG/USDT","Bitget":"https://www.bitget.com/spot/SUNDOGUSDT","Kucoin":"https://www.kucoin.com/price/SUNDOG","Poloniex":"https://poloniex.com/trade/SUNDOG_USDT"}}]},"meta":{"durationMs":1221,"warnings":[],"pagination":{"offset":0,"limit":1,"total":null},"query":{"orderBy":"market-cap","sort":"desc"}},"chain":{"family":"tron","network":"tron:728126428","chainId":"728126428"}}
```

The same search, limited to tokens launched by a Sun agent:

```bash
wallet-cli sunpump token-search SUN --sun-agent-launch --limit 3 --network tron
```

```console
Tokens (limit 3, offset 0)
| Symbol  | Name           | Address                            | Status  | Price (TRX) | Market cap (USD) | 24h change |
| ------- | -------------- | ---------------------------------- | ------- | ----------- | ---------------- | ---------- |
| SUN     | Justin Sun     | TJHvocwdhYo4JWDQofLmoCoCPJXFT9rcqr | CREATED | 0.000038    | $12,883.17       | 0.00%      |
| SAG     | SunAgent Token | TJL6mwWyk6hyeThdtnwUhT7Ci78Dn3wYZ9 | CREATED | 0.000033    | $11,380.62       | 0.00%      |
| SUNDOGE | Sun Doge       | TP8edRCfuL6eLKbMtbV6qNxUhyFRfFSmJ7 | CREATED | 0.000032    | $11,042.06       | 0.00%      |
```

## Output

Identical to [`token-list`](token-list.md): `data.tokens[]`, with `meta.pagination` (`total` is `null`) and `meta.query` echoing `orderBy` and `sort`.

## Exit status

`0` success · `1` execution failure (`provider_error`, `provider_rate_limited`, `timeout`) · `2` usage error (`missing_option` — no keyword; `invalid_value` — an empty keyword, an unknown ordering, or an `--offset` that is not a multiple of `--limit`; `limit_exceeded`; `invalid_option` — an unknown flag such as `--dlive`; `unsupported_network_capability` off mainnet; `family_mismatch` on an EVM network).

## See also

[`sunpump token-list`](token-list.md) · [`sunpump token-info`](token-info.md) · [`sunswap token-search`](../sunswap/token-search.md) · [`sunpump` group](index.md)
