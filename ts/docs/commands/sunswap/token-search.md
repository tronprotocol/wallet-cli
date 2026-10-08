# wallet-cli sunswap token-search

Search tokens traded on SunSwap by symbol, ordered by TVL, highest first.

## Synopsis

```
wallet-cli sunswap token-search <keyword> [options]
```

## Description

Mainnet only, like every SunSwap market query: on Nile or Shasta the command fails with `unsupported_network_capability`.

Matching is a case-insensitive **substring match on the token symbol**; names are not matched. A full contract address matches exactly.

**Impersonation tokens share real symbols and names.** Searching `USDT` returns several tokens calling themselves USDT, only one of which is Tether's. Check `Address` before acting on any result.

Results are always ordered by TVL descending — there is no ordering flag, so no `meta.query` is reported. The rows have the same shape as [`token-list`](token-list.md)'s.

An empty or whitespace keyword is refused rather than sent: the service reads it as "no filter" and would answer with the entire catalogue, which is a different question from the one asked.

## Options

| Option | Default | Description |
|---|---|---|
| `--protocol <name>` | `ALL` | Protocol scope, as in [`token-list`](token-list.md) |
| `--limit <n>` | `20` | Maximum rows |
| `--offset <n>` | `0` | Rows to skip; must be a multiple of `--limit`, and `--offset` + `--limit` may not exceed 1000 — the data service exposes only the first 1000 rows of this listing |

Plus the [global options](../index.md#global-options-every-command). No `--account`: it is rejected with `invalid_option`.

## Examples

```bash
wallet-cli sunswap token-search USDT --limit 2 --network tron
```

```console
Tokens (limit 2, offset 0)
| Symbol | Name        | Address                            | Protocol | Price (USD) | TVL (USD)       | Vol 24h (USD)  | 24h change |
| ------ | ----------- | ---------------------------------- | -------- | ----------- | --------------- | -------------- | ---------- |
| USDT   | Tether USD  | TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t | ALL      | $0.9994     | $217,498,493.13 | $40,301,769.42 | -0.03%     |
| stUSDT | Staked USDT | TThzxNRLrW2Brp9DcTQU8i4Wd9udCWEdZ3 | ALL      | $0.9993     | $10,236.98      | $0.99          | -0.06%     |
```

```bash
wallet-cli sunswap token-search USDT --limit 1 --network tron -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"sunswap.token-search","data":{"tokens":[{"address":"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t","symbol":"USDT","name":"Tether USD","decimals":6,"logo":"https://static.tronscan.org/production/logo/usdtlogo.png","protocol":"ALL","priceUsd":"0.99939870103","priceUsd1dRate":"-0.000292","reserveUsd":"216991185.227922882295330926","reserveUsd1dRate":"0.025041","volumeUsd1d":"40301769.416415264905278144","volumeUsd7d":"346845809.597768768770542075","volumeUsd14d":"736776369.965312839752351791","volumeUsd1dRate":"-0.375053","volumeUsd7dRate":"-0.110493","transaction1d":8767,"transaction1dRate":"0.150374","transactionRecentTotal":1652582,"relevantProtocols":["V3","V2","V4","CURVE","V1","V1_5"],"relevantPools":["TSUUVjysXV8YqHytSNjfkNXnnB49QDvZpx","TFGDbUyP8xez44C76fin3bn3Ss6jugoUwJ","dda1d5819853f19f3e952da5d93aa2d572d95c72a8e6e4c2acab65384fd2557e","TW68dBGdy9gtk16BfzmvaCZ9pEti3KFkk2","9a77a90c118768c6acceb24a531242ac57112f8dbeb2e0b4c1dce6aebbd2cac9","TDvGaAn29mHna9b4yrdvX2hivitYUkWTh5","TEZWKD7eujZVDJAm74ArJUCJ7s95xj2vn7","TTdeCobmYxhfFBYUZbiQqbZ56zrFkSE5DG","TXFpue4nqvVptJEv4o8JXko5W6yCWpZZaR","TLKyq7eJ4YKbs3TGEvoBJWkAXWYQKWo2Nn"]}]},"meta":{"durationMs":1160,"warnings":[],"pagination":{"offset":0,"limit":1,"total":null,"hasMore":true}},"chain":{"family":"tron","network":"tron:728126428","chainId":"728126428"}}
```

## Output

Identical to [`token-list`](token-list.md): `data.tokens[]` with `meta.pagination`. No `meta.query`, because there is no ordering to echo.

## Exit status

`0` success · `1` execution failure (`provider_error`, `provider_rate_limited`, `timeout`) · `2` usage error (`missing_option` — no keyword; `invalid_value` — an empty or whitespace keyword, or an invalid protocol or paging value; `unsupported_network_capability`).

## See also

[`sunswap token-list`](token-list.md) · [`sunswap pool-search`](pool-search.md) · [`sunswap` group](index.md)
