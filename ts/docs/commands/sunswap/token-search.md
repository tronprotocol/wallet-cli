# wallet-cli sunswap token-search

Search tokens traded on SunSwap by symbol, ordered by TVL, highest first.

## Synopsis

```
wallet-cli sunswap token-search <keyword> [options]
```

## Description

Matching is a case-insensitive **substring match on the token symbol**; names are not matched. A full contract address matches exactly.

**Impersonation tokens share real symbols and names.** Searching `USDT` returns several tokens calling themselves USDT, only one of which is Tether's. Check `Address` before acting on any result.

Results are always ordered by TVL descending — there is no ordering flag, so no `meta.query` is reported. Returning structure is identical to [`token-list`](token-list.md).

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
| USDT   | Tether USD  | TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t | ALL      | $0.9998     | $234,098,371.02 | $76,157,982.93 | 0.01%      |
| stUSDT | Staked USDT | TThzxNRLrW2Brp9DcTQU8i4Wd9udCWEdZ3 | ALL      | $0.9977     | $10,231.18      | $40.85         | 0.77%      |
```

## Output

Identical to [`token-list`](token-list.md): `data.tokens[]` with `meta.pagination`. No `meta.query`, because there is no ordering to echo.

## Exit status

`0` success · `1` execution failure (`provider_error`, `provider_rate_limited`, `timeout`) · `2` usage error (`invalid_value` — an empty or whitespace keyword, or an invalid protocol or paging value; `unsupported_network_capability`).

An empty keyword is refused rather than sent: the service reads it as "no filter" and would answer with the entire catalogue, which is a different question from the one asked.

## See also

[`sunswap token-list`](token-list.md) · [`sunswap pool-search`](pool-search.md) · [`sunswap` group](index.md)
