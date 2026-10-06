# wallet-cli sunswap pool-search

Search SunSwap liquidity pools, ordered by TVL, highest first.

## Synopsis

```
wallet-cli sunswap pool-search <keyword> [options]
```

## Description

Matching is a case-insensitive **substring match on the symbols of the tokens in the pool**; token names are not matched. Space-separated words must all match, in any order — `"TRX USDT"` and `"USDT TRX"` give the same result. A full pool contract address, or a V4 64-hex pool id, matches exactly; a `0x` prefix is stripped for you, since the service will not match one that carries it.

**Substring matching finds impersonation pools.** A search for `"TRX USDT"` also returns pools of tokens whose symbols merely contain `USDT`. Check `tokens[].address` in the JSON before acting on any pool this returns.

This is the one listing with a **trustworthy total**: the count is taken under the same filters as the page, so `showing 3 of 81` describes the same set of pools as the rows above it.

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
Pools (showing 3 of 81)
| Pool                                                             | Pair      | Protocol | Fee   | TVL (USD)       | Vol 24h (USD)  | APR   |
| ---------------------------------------------------------------- | --------- | -------- | ----- | --------------- | -------------- | ----- |
| TSUUVjysXV8YqHytSNjfkNXnnB49QDvZpx                               | WTRX/USDT | V3       | 0.05% | $189,106,059.13 | $31,256,555.90 | 3.13% |
| TFGDbUyP8xez44C76fin3bn3Ss6jugoUwJ                               | WTRX/USDT | V2       | 0.3%  | $94,813,994.05  | $946,612.60    | 0.58% |
| dda1d5819853f19f3e952da5d93aa2d572d95c72a8e6e4c2acab65384fd2557e | TRX/USDT  | V4       | 0.05% | $93,440,132.54  | $16,916,755.90 | 2.74% |
```

## Output

Same record shape as [`pool-list`](pool-list.md), without `pairPrices` — there is no chosen token to quote in. `meta.pagination.total` carries the real count; there is no `meta.query`, because the ordering is fixed.

If the count cannot be read, `total` is `null` rather than a number that would be printed as fact.

## Exit status

`0` success · `1` execution failure (`provider_error`, `provider_rate_limited`, `timeout`) · `2` usage error (`invalid_value` — an empty or whitespace keyword, or an invalid protocol or paging value; `unsupported_network_capability`).

## See also

[`sunswap pool-list`](pool-list.md) · [`sunswap token-search`](token-search.md) · [`sunswap` group](index.md)
