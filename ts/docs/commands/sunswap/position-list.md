# wallet-cli sunswap position-list

List the liquidity positions an address holds, most valuable first.

## Synopsis

```
wallet-cli sunswap position-list [options]
```

## Description

Positions come from the SunSwap market data service, which holds mainnet data only — on Nile or Shasta the command fails with `unsupported_network_capability`, so a position opened on Nile is found from its `add-liquidity` receipt instead.

This is the entry point to the liquidity commands: the `Position` column is the id that `add-liquidity`, `remove-liquidity`, `collect-fees` and `position-info` take as `--position-id`.

The address comes from `--account`, as it does for `account balance` and the other address-scoped queries: the **active account by default**, or `--account <label|accountId|address>` for another one. A bare TRON address works too, so any holder can be queried without importing it.

**Only V3 and V4 positions are NFTs.** V1, V1_5, V2 and CURVE positions have no id: the `Position` column shows `—` and the JSON omits `nftTokenId` entirely. Identify those by their pool instead. Those protocols also provide full-range liquidity, so their `status` is always `IN_RANGE`, and their fees accrue into the LP token rather than accumulating separately — `Unclaimed (USD)` shows `—`, which is not the same as `$0.00`.

**`EMPTY` is a rendering, not a status value.** A V3 or V4 position whose liquidity has been removed while its NFT is still held has no meaningful range status, so the text column shows `EMPTY`. The JSON keeps the source `status` untouched, and that source value may well be `IN_RANGE`. **A script must read `extra.positionLiquidity === "0"`, not `status`.** Drained positions are still listed and sort to the end.

The source occasionally reports a pool share above 100%. The `Share` cell then shows `—` rather than an impossible number, and the JSON passes the source value through.

Results are always ordered by LP value descending; there is no ordering flag and therefore no `meta.query`.

## Options

| Option | Required | Default | Description |
|---|---|---|---|
| `--account <label\|accountId\|address>` | no | active account | Whose positions to list: a local account, or any TRON address |
| `--pool <pool>` | no | all | Only positions in this pool: a 64-hex pool id for V4 (`0x` stripped for you), the pool contract address otherwise |
| `--protocol <name>` | no | all | `V1`, `V1_5`, `V2`, `V3`, `V4`, `CURVE`. No `ALL`; omit the flag for every protocol |
| `--limit <n>` | no | `20` | Maximum rows |
| `--offset <n>` | no | `0` | Rows to skip; must be a multiple of `--limit`, and `--offset` + `--limit` may not exceed 1000 — the data service exposes only the first 1000 rows of this listing |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli sunswap position-list --account TT2T17KZhoDu47i2E4FWxfG79zdkEWkU9N --limit 3 --network tron
```

```console
Positions (limit 3, offset 0)
| Position | Pair      | Protocol | Status   | Value (USD)     | Share    | Unclaimed (USD) |
| -------- | --------- | -------- | -------- | --------------- | -------- | --------------- |
| #1672    | WTRX/USDT | V3       | IN_RANGE | $109,444,388.62 | 58.3764% | $768,416.66     |
| #224     | TRX/USDT  | V4       | IN_RANGE | $92,256,694.46  | 99.9500% | $1,105,621.80   |
| #1573    | WTRX/USDT | V3       | IN_RANGE | $74,967,672.12  | 39.9869% | $1,442,074.51   |
```

```bash
wallet-cli sunswap position-list --account TT2T17KZhoDu47i2E4FWxfG79zdkEWkU9N --limit 1 --network tron -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"sunswap.position-list","data":{"positions":[{"positionType":"Liquidity Asset","protocol":"V3","poolAddress":"TSUUVjysXV8YqHytSNjfkNXnnB49QDvZpx","owner":"TT2T17KZhoDu47i2E4FWxfG79zdkEWkU9N","poolFeeRate":"0.0005","tokens":[{"address":"TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR","symbol":"WTRX","name":"Wrapped TRX","decimals":6,"logo":"https://static.tronscan.org/production/upload/logo/TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR.png?t=1598430824415","amount":"125620279278493","priceUsd":"0.334857305797","rewardAmount":"1147465414678"},{"address":"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t","symbol":"USDT","name":"Tether USD","decimals":6,"logo":"https://static.tronscan.org/production/logo/usdtlogo.png","amount":"67429824239434","priceUsd":"0.99939870103","rewardAmount":"384469463798"}],"lpBalanceUsd":"109444388.622643465384815301","lpBalanceAmount":"856233695062022","nftTokenId":"1672","poolShare":"0.583764","status":"IN_RANGE","lpTokenSymbol":"SUN-V3-POS","lpTokenName":"SUNSWAP V3 POSITION NFT","lastActiveAt":"2026-06-12 13:55","extra":{"maxPrice":"0.40013463418133116","minPrice":"0.25009093065785776","tickLower":-13860,"tickUpper":-9160,"tokenRewardUsd":"768416.6608638362","positionLiquidity":"856233695062022"}}]},"meta":{"durationMs":1304,"warnings":[],"pagination":{"offset":0,"limit":1,"total":null,"hasMore":true}},"chain":{"family":"tron","network":"tron:728126428","chainId":"728126428"}}
```

Further down the same holder's list, positions on V2 and CURVE have no NFT id, so `Position` shows `—`, and their fees accrue into the LP token, so `Unclaimed (USD)` shows `—` too:

```bash
wallet-cli sunswap position-list --account TT2T17KZhoDu47i2E4FWxfG79zdkEWkU9N --offset 8 --limit 4 --network tron
```

```console
Positions (limit 4, offset 8)
| Position | Pair      | Protocol | Status   | Value (USD)   | Share    | Unclaimed (USD) |
| -------- | --------- | -------- | -------- | ------------- | -------- | --------------- |
| #88      | U/USDT    | V4       | IN_RANGE | $1,959,022.98 | 99.8362% | $516.91         |
| #5       | USDT/TUSD | V3       | IN_RANGE | $1,833,811.98 | 99.1359% | $15,971.50      |
| —        | USDD/USDT | CURVE    | IN_RANGE | $1,714,639.09 | 99.9934% | —               |
| —        | BTC/USDT  | V2       | IN_RANGE | $1,488,712.67 | 62.4319% | —               |
```

## Output

`data.positions[]`, with `meta.pagination`. No `meta.query`.

| Field | Type | Meaning |
|---|---|---|
| `owner` | string | The holding address — echoed so results from several queries can be merged |
| `poolAddress` `protocol` `positionType` | string | Which pool, on which protocol, and what kind of position (`Liquidity Asset`) |
| `nftTokenId` | string | The `--position-id` for the liquidity commands. **Absent** on V1/V1_5/V2/CURVE |
| `status` | string | `IN_RANGE` or `OUT_RANGE` (that spelling, not `OUT_OF_RANGE`). The source value, untouched |
| `poolShare` | string | Decimal fraction; occasionally above 1 in the source |
| `lpBalanceUsd` | string | Position value in USD |
| `lpBalanceAmount` | string | Equal to `extra.positionLiquidity` on V3/V4; on the others it is the LP token quantity |
| `poolFeeRate` | string | The pool's fee as a decimal fraction (`0.003` = 0.3%) |
| `tokens[]` | array | `{address, symbol, name, decimals, logo, amount, priceUsd, rewardAmount}`. `amount` is principal, `rewardAmount` is unclaimed fees — different things, both base units |
| `lastActiveAt` | string | UTC minute of the last change to the position (liquidity added or removed, LP transferred). Does **not** move with price or accruing fees. JSON only |
| `extra` | object | Protocol-shaped: V3/V4 give `tick`, `liquidity`, `sqrtPriceX96`, `positionLiquidity` and the tick bounds; V4 adds the derived amounts, `parameters`, `isDynamicFee` and `hooksAddress` where present; CURVE gives `lpTokenAddress`; V2 and the rest give `{}` |

## Exit status

`0` success · `1` execution failure (`missing_wallet_address` — no active account and no `--account`; `provider_error`, `provider_rate_limited`, `timeout`) · `2` usage error (`account_not_found` — `--account` is neither a known account nor a TRON address; `invalid_value` — protocol or paging; `unsupported_network_capability`).

## See also

[`sunswap pool-list`](pool-list.md) · [`sunswap` group](index.md)
