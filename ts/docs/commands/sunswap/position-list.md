# wallet-cli sunswap position-list

List the liquidity positions an address holds, most valuable first.

## Synopsis

```
wallet-cli sunswap position-list [options]
```

## Description

This is the entry point to the liquidity commands: the `Position` column is the id that `add-liquidity`, `remove-liquidity`, `collect-fees` and `position-info` take as `--position-id`.

The address comes from `--account`, as it does for `account balance` and the other address-scoped queries: the **active account by default**, or `--account <label|accountId|address>` for another one. A bare TRON address works too, so any holder can be queried without importing it.

**Only V3 and V4 positions are NFTs.** V1, V1_5, V2 and CURVE positions have no id: the `Position` column shows `—` and the JSON omits `nftTokenId` entirely. Identify those by their pool instead. Those protocols also provide full-range liquidity, so their `status` is always `IN_RANGE`, and their fees accrue into the LP token rather than accumulating separately — `Unclaimed (USD)` shows `—`, which is not the same as `$0.00`.

**`EMPTY` is a rendering, not a status value.** A V3 or V4 position whose liquidity has been removed while its NFT is still held has no meaningful range status, so the text column shows `EMPTY`. The JSON keeps the source `status` untouched, and that source value may well be `IN_RANGE`. **A script must read `extra.positionLiquidity === "0"`, not `status`.** Drained positions are still listed and sort to the end.

The source occasionally reports a pool share above 100%. The `Share` cell then shows `—` rather than an impossible number, and the JSON passes the source value through.

Results are always ordered by LP value descending; there is no ordering flag and therefore no `meta.query`.

## Options

| Option | Required | Default | Description |
|---|---|---|---|
| `--pool <pool>` | no | all | Only positions in this pool: a 64-hex pool id for V4 (`0x` stripped for you), the pool contract address otherwise |
| `--protocol <name>` | no | all | `V1`, `V1_5`, `V2`, `V3`, `V4`, `CURVE`. No `ALL`; omit the flag for every protocol |
| `--limit <n>` | no | `20` | Maximum rows |
| `--offset <n>` | no | `0` | Rows to skip; must be a multiple of `--limit`, and `--offset` + `--limit` may not exceed 1000 — the data service exposes only the first 1000 rows of this listing |

Plus the [global options](../index.md#global-options-every-command), including `--account` to select the address (see above).

## Examples

```bash
wallet-cli sunswap position-list --account TT2T17KZhoDu47i2E4FWxfG79zdkEWkU9N --offset 8 --limit 4 --network tron
```

```console
Positions (limit 4, offset 8)
| Position | Pair      | Protocol | Status   | Value (USD)   | Share    | Unclaimed (USD) |
| -------- | --------- | -------- | -------- | ------------- | -------- | --------------- |
| #88      | U/USDT    | V4       | IN_RANGE | $1,959,947.27 | 99.8477% | $501.35         |
| #5       | USDT/TUSD | V3       | IN_RANGE | $1,834,203.26 | 99.1391% | $15,916.42      |
| —        | USDD/USDT | CURVE    | IN_RANGE | $1,714,629.22 | 99.9934% | —               |
| —        | BTC/USDT  | V2       | IN_RANGE | $1,515,830.15 | 62.4082% | —               |
```

A drained V3 position, alongside one whose reported share exceeds 100%:

```console
| #938  | NFT/USD1 | V3 | EMPTY     | $0.00          | 0.0000% | $0.00       |
| #1118 | USDT/SUN | V3 | OUT_RANGE | $7,669,628.03  | —       | $16,882.70  |
```

## Output

`data.positions[]`, with `meta.pagination`. No `meta.query`.

| Field | Type | Meaning |
|---|---|---|
| `owner` | string | The holding address — echoed so results from several queries can be merged |
| `poolAddress` `protocol` `positionType` | string | Which pool, and on which protocol |
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

Plus the global options. `--account` selects the queried address; without it, the active account is used.
