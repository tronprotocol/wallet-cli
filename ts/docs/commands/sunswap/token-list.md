# wallet-cli sunswap token-list

List tokens traded on SunSwap, with price and liquidity data.

## Synopsis

```
wallet-cli sunswap token-list [options]
```

## Description

The on-chain DEX token catalogue. This is **not** the local token address book — for that, see [`token list`](../token/list.md).

Each row is a token **within one protocol scope**. The default scope `ALL` reports statistics combined across every protocol; `--protocol V3` reports what happened inside V3 alone. An `ALL` row and a `V3` row for the same token overlap, so they can be listed together and never added together.

`relevantPools` and `relevantProtocols` carry at most ten entries and are **not** the full set. To see every pool holding a token, use [`pool-list --token`](pool-list.md).

There is no `--sort`: the token endpoints expose a sort field but no direction, so results are always descending and `meta.query.sort` reports the constant `"desc"`. There is no `--include-blacklisted` either — records carry no blacklist marker, so listing them without marking them would put impersonations in the table unlabelled.

## Options

| Option | Default | Description |
|---|---|---|
| `--address <token>` | all | Only this token contract address |
| `--protocol <name>` | `ALL` | Protocol scope: `ALL`, `V1`, `V1_5`, `V2`, `V3`, `V4`, `CURVE` |
| `--order-by <field>` | `tvl` | Order by `tvl` or `volume-24h` |
| `--limit <n>` | `20` | Maximum rows |
| `--offset <n>` | `0` | Rows to skip; must be a multiple of `--limit`, and `--offset` + `--limit` may not exceed 1000 — the data service exposes only the first 1000 rows of each ordering |

Plus the [global options](../index.md#global-options-every-command). No `--account`: it is rejected with `invalid_option`.

## Examples

```bash
wallet-cli sunswap token-list --limit 3 --network tron
```

```console
Tokens (limit 3, offset 0)
| Symbol | Name        | Address                            | Protocol | Price (USD) | TVL (USD)       | Vol 24h (USD)  | 24h change |
| ------ | ----------- | ---------------------------------- | -------- | ----------- | --------------- | -------------- | ---------- |
| TRX    | TRX         | T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb | ALL      | $0.3426     | $286,874,147.95 | $50,281,493.64 | -0.98%     |
| USDT   | Tether USD  | TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t | ALL      | $0.9998     | $234,098,371.02 | $76,157,982.93 | 0.01%      |
| WTRX   | Wrapped TRX | TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR | ALL      | $0.3426     | $207,847,060.48 | $33,070,208.31 | -0.98%     |
```

`TRX`'s `ALL` statistics include its WTRX pools, so the TRX and WTRX rows overlap and their TVL cannot be summed.

```bash
wallet-cli sunswap token-list --protocol V3 --limit 2 --network tron
```

```console
Tokens (limit 2, offset 0)
| Symbol | Name        | Address                            | Protocol | Price (USD) | TVL (USD)       | Vol 24h (USD)  | 24h change |
| ------ | ----------- | ---------------------------------- | -------- | ----------- | --------------- | -------------- | ---------- |
| USDT   | Tether USD  | TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t | V3       | $0.9998     | $115,123,484.07 | $54,033,298.57 | 0.01%      |
| WTRX   | Wrapped TRX | TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR | V3       | $0.3426     | $86,774,743.45  | $31,366,364.47 | -0.98%     |
```

## Output

`data.tokens[]`, with `meta.pagination` and `meta.query`.

| Field | Type | Meaning |
|---|---|---|
| `address` `symbol` `name` `logo` | string | Token identity; `address` is the only one that identifies it |
| `decimals` | number | Token precision |
| `protocol` | string | The scope these statistics were measured in |
| `priceUsd` `reserveUsd` `volumeUsd1d` `volumeUsd7d` `volumeUsd14d` | string | Money, exact digits |
| `priceUsd1dRate` `reserveUsd1dRate` `volumeUsd1dRate` `volumeUsd7dRate` `transaction1dRate` | string | Change against the previous period, as a decimal fraction (`-0.0043` = −0.43%) |
| `transaction1d` `transactionRecentTotal` | number | Counts |
| `relevantProtocols[]` `relevantPools[]` | string[] | At most ten each; not the full set |

## Exit status

`0` success · `1` execution failure (`provider_error`, `provider_rate_limited`, `timeout`) · `2` usage error (`invalid_value` — protocol, ordering or paging; `invalid_address`; `unsupported_network_capability`).

## See also

[`sunswap token-search`](token-search.md) · [`sunswap pool-list`](pool-list.md) · [`token list`](../token/list.md) · [`sunswap` group](index.md)
