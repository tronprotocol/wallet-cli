# wallet-cli sunswap pool-list

List SunSwap liquidity pools.

## Synopsis

```
wallet-cli sunswap pool-list [options]
```

## Description

Pools ranked by TVL, 24-hour volume, 24-hour fees or APR.

**A V4 pool id is not a contract address.** V4 pools share a single pool manager, so a V4 pool is identified by a 64-hex id. The `Pool` column prints it in full and never truncates it — a shortened identifier is one nobody can paste into the next command. Read `protocol` before treating a `poolAddress` as a contract.

**With `--token`, each pool also carries `pairPrices`** — the price of its other tokens quoted in the token given. The price is computed from *that pool's own* exchange rate, so two pools holding the same pair can and do report different prices. It is not a market-wide quote. A pool with more than two tokens has no single pairwise rate; its price cell shows `—` and the JSON is the authority.

`TRX` matches **native** TRX pools and is not silently swapped for WTRX; pass `WTRX` for wrapped pools.

**On APR:** when ordering by `apr`, set `--min-tvl` — a pool with almost no liquidity can show an enormous APR that nobody can enter, and without a threshold such pools top the list. The figure comes from the data service and does not track today's volume. A dynamic-fee V4 pool reports a fee of `0`, which would read as free; it renders as `dynamic` instead.

`--pool` and `--token` cannot be given together — the service refuses the combination, and it is refused here as a usage error so the exit code says "this can never work" rather than "try again".

## Options

| Option | Default | Description |
|---|---|---|
| `--pool <pool>` | all | A 64-hex pool id for V4 (`0x` prefix stripped for you), the pool contract address otherwise. Mutually exclusive with `--token` |
| `--token <symbol\|address>` | all | A token in the pool, by symbol or address. Adds `pairPrices`. A symbol resolves against the **official** address book only — this command takes no account, so [`token add`](../token/add.md) entries do not apply; pass the address instead |
| `--protocol <name>` | all | `V1`, `V1_5`, `V2`, `V3`, `V4`, `CURVE`. There is no `ALL` here — a pool belongs to one protocol, and "all of them" is omitting the flag |
| `--min-tvl <usd>` | no filter | Only pools whose TVL (`reserveUsd`) is at least this many USD. A plain non-negative decimal (`100000`, `15963.5`); `-1`, `abc` and `1e5` are `invalid_value`. Applied **before** `--limit` / `--offset`; `0` is the same as omitting it |
| `--order-by <field>` | `tvl` | `tvl`, `volume-24h`, `fees-24h`, `apr` |
| `--sort <asc\|desc>` | `desc` | Sort direction |
| `--limit <n>` | `20` | Maximum rows |
| `--offset <n>` | `0` | Rows to skip; must be a multiple of `--limit`, and `--offset` + `--limit` may not exceed 1000 — the data service exposes only the first 1000 rows of each ordering |

Plus the [global options](../index.md#global-options-every-command). No `--account`: it is rejected with `invalid_option`.

### `--min-tvl`: filter first, then page

`--offset` and `--limit` count the pools that **meet** the threshold, in the chosen order: `--min-tvl 100000 --limit 20` is the first 20 such pools, and fewer than 20 come back only when fewer exist. The service has no TVL filter, so the CLI reads its pages (100 rows each) and drops the pools below the threshold; the order is still the service's.

The service exposes only the first 1000 rows of any ordering, so a scan never reads past row 1000:

- **Default order (`--order-by tvl --sort desc`)** — the scan stops at the first pool below the threshold, since nothing after it can qualify. Exact.
- **Any other order or direction** — the scan reads that order until the window is filled or the pools run out. Exact. If it reaches row 1000 first, the CLI reads the complete qualifying set by TVL instead and sorts it locally (exact decimal comparison, ties by `poolAddress`). Exact as long as that set fits in 1000 rows: on mainnet the 1000th pool by TVL holds about $16,000, so for any threshold above that the complete set fits.
- **More than 1000 pools qualify** and the requested order did not fill the window within its first 1000 rows: the complete set is unreachable. The pools that were found are returned, `hasMore` is `true`, and `meta.warnings` carries `{code: "sunswap_scan_truncated"}` (text mode prints it on stderr). Raise `--min-tvl` or use the default order for an exact answer.

`meta.pagination.total` stays `null`. `hasMore` is always present with `--min-tvl`: `true` when a qualifying pool beyond the window was seen, or when the scan was truncated. A larger threshold or a sparser order means more pages, each bound by `--timeout`.

## Examples

```bash
wallet-cli sunswap pool-list --token USDT --limit 3 --network tron
```

```console
Pools (limit 3, offset 0)
| Pool                                                             | Pair      | Protocol | Fee   | Price (USDT)  | TVL (USD)       | Vol 24h (USD)  | APR   |
| ---------------------------------------------------------------- | --------- | -------- | ----- | ------------- | --------------- | -------------- | ----- |
| TSUUVjysXV8YqHytSNjfkNXnnB49QDvZpx                               | WTRX/USDT | V3       | 0.05% | 0.342251 USDT | $189,096,342.93 | $31,256,555.90 | 3.13% |
| TFGDbUyP8xez44C76fin3bn3Ss6jugoUwJ                               | WTRX/USDT | V2       | 0.3%  | 0.343051 USDT | $94,813,994.05  | $946,612.60    | 0.58% |
| dda1d5819853f19f3e952da5d93aa2d572d95c72a8e6e4c2acab65384fd2557e | TRX/USDT  | V4       | 0.05% | 0.342287 USDT | $93,440,132.54  | $16,916,755.90 | 2.74% |
```

The third row is a V4 pool: its identifier is 64 hex characters, not an address.

```bash
wallet-cli sunswap pool-list --order-by apr --min-tvl 100000 --limit 3 --network tron
```

The highest-APR pools holding at least $100,000. Without `--min-tvl`, the top of this list is pools nobody can enter.

## Output

`data.pools[]`, with `meta.pagination` and `meta.query`.

| Field | Type | Meaning |
|---|---|---|
| `poolAddress` | string | Pool contract address, or a 64-hex pool id on V4 |
| `protocol` `poolType` | string | Which protocol, and its pool shape |
| `feeRate` `protocolFeeRate` | string | Decimal fractions (`0.0005` = 0.05%) |
| `tokens[]` | array | `{address, symbol, name, decimals, logo, amount, priceUsd, volume1d}`; `amount` and `volume1d` are base units |
| `reserveUsd` `volumeUsd1d` `volumeUsd7d` `volumeUsd14d` `feeUsd1d` | string | Money, exact digits |
| `farmApr` `feeApr` `totalApr` | string | Decimal fractions |
| `transaction1d` `transactionRecentTotal` | number | Counts |
| `createdAt` | string | UTC minute the pool was created |
| `extra` | object | Protocol-specific and deliberately not normalised: V1/V1_5/V2 give `lpTokenDecimals` and `lpTokenTotalSupply`; V3 gives `tick`, `liquidity`, `sqrtPriceX96` and both protocol fee rates; V4 adds `parameters`, `isDynamicFee`, the derived amounts, `hooksAddress` when the pool has a hook, and two pool-key parts derived for [`add-liquidity`](add-liquidity.md): `tickSpacing` (decoded from `parameters`) and `hooks` (`"none"` when the pool has no hook); CURVE gives `lpTokenAddress` |
| `pairPrices[]` | array | Only with `--token`: `{base, quote, price}`, `price` truncated at 18 decimal places |

The service's raw `swapRateList` is not published: its orientation is an implementation detail, and `pairPrices` is the answer it was there to produce.

## Exit status

`0` success · `1` execution failure (`provider_error`, `provider_rate_limited`, `timeout`) · `2` usage error (`invalid_option` — `--pool` with `--token`; `invalid_value` — protocol, ordering, direction, `--min-tvl` or paging, including a window past row 1000; `invalid_address`; `unsupported_token`; `unsupported_network_capability`).

## See also

[`sunswap pool-search`](pool-search.md) · [`sunswap position-list`](position-list.md) · [`sunswap token-list`](token-list.md) · [`sunswap` group](index.md)
