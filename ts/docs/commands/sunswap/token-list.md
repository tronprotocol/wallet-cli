# wallet-cli sunswap token-list

List tokens traded on SunSwap, with price and liquidity data.

## Synopsis

```
wallet-cli sunswap token-list [options]
```

## Description

The on-chain DEX token catalogue. This is **not** the local token address book — for that, see [`token list`](../token/list.md). From the SunSwap market data service, which holds mainnet data only — on Nile or Shasta the command fails with `unsupported_network_capability`.

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
| TRX    | TRX         | T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb | ALL      | $0.3350     | $298,870,200.39 | $35,000,679.93 | 0.75%      |
| USDT   | Tether USD  | TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t | ALL      | $0.9994     | $217,498,493.13 | $40,301,769.42 | -0.03%     |
| WTRX   | Wrapped TRX | TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR | ALL      | $0.3350     | $215,634,071.22 | $25,126,310.73 | 0.75%      |
```

```bash
wallet-cli sunswap token-list --limit 1 --network tron -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"sunswap.token-list","data":{"tokens":[{"address":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","symbol":"TRX","name":"TRX","decimals":6,"logo":"https://static.tronscan.org/production/upload/logo/TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR.png","protocol":"ALL","priceUsd":"0.334857305797","priceUsd1dRate":"0.006902","reserveUsd":"299238620.23406357010697014","reserveUsd1dRate":"-0.019545","volumeUsd1d":"35000679.9308136778864465","volumeUsd7d":"282946872.960986098367921161","volumeUsd14d":"617067596.589292868368646424","volumeUsd1dRate":"-0.096315","volumeUsd7dRate":"-0.15316","transaction1d":8052,"transaction1dRate":"0.108328","transactionRecentTotal":3524963,"relevantProtocols":["V3","V2","V4","V1","V1_5"],"relevantPools":["TSUUVjysXV8YqHytSNjfkNXnnB49QDvZpx","TFGDbUyP8xez44C76fin3bn3Ss6jugoUwJ","dda1d5819853f19f3e952da5d93aa2d572d95c72a8e6e4c2acab65384fd2557e","TRaQussyGeM6rhRGM3wfEj3B8vofTJj3EB","THu6ConqvZ3phYHeNTDyW9aE3pGypwBsP6","TCkBkQBnSmsNXJvdn5ihPKUjUSHrjfT5xv","TFi3v5PtYRnVdC43qSvPR3upZhgreiURga","TPBtSWUNAQWfMUJk92czYwktvF7aS44nLp","TUDo1PuMG6j4aDSg6rsCNiz5gR5cnQaNTT","TQ3SU3p5hKogGrHmfMq7F3LQ9zAnZYHfsL"]}]},"meta":{"durationMs":1152,"warnings":[],"pagination":{"offset":0,"limit":1,"total":null,"hasMore":true},"query":{"orderBy":"tvl","sort":"desc"}},"chain":{"family":"tron","network":"tron:728126428","chainId":"728126428"}}
```

The same tokens in the V3 scope — the figures are what happened inside V3 alone, and must not be added to the `ALL` rows above:

```bash
wallet-cli sunswap token-list --protocol V3 --limit 2 --network tron
```

```console
Tokens (limit 2, offset 0)
| Symbol | Name        | Address                            | Protocol | Price (USD) | TVL (USD)       | Vol 24h (USD)  | 24h change |
| ------ | ----------- | ---------------------------------- | -------- | ----------- | --------------- | -------------- | ---------- |
| USDT   | Tether USD  | TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t | V3       | $0.9994     | $103,248,058.55 | $26,918,567.89 | -0.03%     |
| WTRX   | Wrapped TRX | TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR | V3       | $0.3350     | $96,387,162.44  | $23,906,149.08 | 0.75%      |
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
