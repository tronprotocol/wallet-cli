# wallet-cli vote status

Your current votes, voting power, and reward overview.

## Synopsis

```
wallet-cli vote status [options]
```

## Description

One read-only screen for the stake → vote → reward loop: your current vote distribution and each SR's reward ratio, your voting power (total / used / available TP), and the currently claimable reward.

- **Voting power (TP)** — total = staked TRX; used = votes placed; available = total − used.
- **APR / Reward ratio** — reward ratio is read on-chain. `aprPct` is reserved and always `null` because the current implementation has no APR provider. An SR can change its ratio at any time (on-chain UpdateBrokerage) — votes placed at 80% silently stop earning if it drops to 0%.
- **0% warning** — if any votes sit on an SR with a 0% reward ratio, text output appends a `!` line and json adds a plain-string entry to `meta.warnings`, one per affected SR.
- **Claimable** — same source as [`reward balance`](../reward/balance.md); claim with [`reward withdraw`](../reward/withdraw.md).

## Options

No command-specific options; the [global options](../index.md#global-options-every-command) only (`--network` / `--account`).

## Examples

```bash
wallet-cli vote status --account main --network tron:3448148188
```

```console
Label         main
Voting power  1,500 TP  (used 1,000 / available 500)
Claimable     12.345678 TRX

Current votes (2)
| Name         | Votes | APR | Reward ratio | Address                            |
| ------------ | ----- | --- | ------------ | ---------------------------------- |
| tronscan.org | 600   | —   | 80%          | TZ4UXDV5ZhNW7fb2AMSbgfAEZ7hWsnYS2g |
| binance.com  | 400   | —   | 0%           | TT5W8MPbYJih9R586kTszb4LoybzUvCYm2 |
! 400 votes on binance.com earn nothing — 0% reward ratio
```

```bash
wallet-cli vote status --account main --network tron:3448148188 -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"vote.status","data":{"address":"TQk...","votingPower":{"total":1500,"used":1000,"available":500},"claimableRewardSun":"12345678","votes":[{"witness":"TZ4...","name":"tronscan.org","count":600,"rewardRatioPct":80,"brokeragePct":20,"aprPct":null},{"witness":"TT5...","name":"binance.com","count":400,"rewardRatioPct":0,"brokeragePct":100,"aprPct":null}]},"meta":{"durationMs":16,"warnings":["400 votes on TT5... (binance.com) earn nothing: reward ratio is 0%"]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `address` | string | Queried account |
| `votingPower.total` / `.used` / `.available` | number | TP total / spent / spendable |
| `claimableRewardSun` | string | Currently claimable reward, in SUN |
| `votes[]` | array | Current distribution: `witness`, URL-hostname `name`, `count`, nullable `rewardRatioPct` / `brokeragePct`, and reserved `aprPct` (always `null`) |

Zero-reward-ratio warnings appear in `meta.warnings` as plain strings — see [reading `meta.warnings`](../../machine-interface.md#reading-metawarnings).

## Exit status

`0` success · `1` execution failure (`rpc_error`) · `2` usage error (`invalid_value`).

## See also

[`vote cast`](cast.md) · [`vote list`](list.md) · [`reward balance`](../reward/balance.md) · [`stake info`](../stake/info.md)
