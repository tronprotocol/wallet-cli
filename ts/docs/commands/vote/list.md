# wallet-cli vote list

List super representatives and candidates.

## Synopsis

```
wallet-cli vote list [--limit <n>] [--candidates] [options]
```

## Description

Lists SRs (the 27 elected, by default) with votes, estimated APR, and reward ratio — the numbers you need before a [`vote cast`](cast.md). Read-only, no account needed.

Column semantics:

- **APR** — the voter's estimated annual return, already adjusted for the SR's reward ratio. **Best-effort**: not from chain RPC but from explorer/TronGrid data; when unavailable the column shows `—` (json `null`).
- **Reward ratio** — the share of rewards the SR passes to voters (on-chain, reliable). 80% means voters split 80% of the rewards; **0% means your votes earn nothing**. json also carries the chain-native `brokeragePct` (= 100 − rewardRatioPct).
- **Ranks and eligibility** — ranks 1–27 are elected SRs (block + vote rewards); 28–127 are partners (vote rewards only); beyond 127 candidates earn nothing, so `--limit` caps at 127.

## Options

| Option | Description |
|---|---|
| `--limit <number>` | Max ranks to return (default 27, max 127). By default only the 27 elected SRs are listed, so a higher limit has no effect unless you also pass `--candidates` |
| `--candidates` | Also list non-elected candidates (ranks 28+), so `--limit` can reach beyond 27 up to 127 |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli vote list --limit 3 --network tron:nile
```

```console
Rank  Name             Votes          APR   Reward ratio  Address
   1  TRONSCAN         1,203,456,789  4.8%  80%           TZ4UXDV5ZhNW7fb2AMSbgfAEZ7hWsnYS2g
   2  Binance Staking    998,765,432  0%    0%            TT5W8MPbYJih9R586kTszb4LoybzUvCYm2
   3  JustLend           876,543,210  4.9%  80%           TWxkzUeAiKcFvzXvJEcaTQCQqCuMednAtN
```

```bash
wallet-cli vote list --limit 3 --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"vote.list","data":{"witnesses":[{"rank":1,"name":"TRONSCAN","address":"TZ4UXDV5ZhNW7fb2AMSbgfAEZ7hWsnYS2g","voteCount":"1203456789","rewardRatioPct":80,"brokeragePct":20,"aprPct":4.8}]},"meta":{"durationMs":40,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data.witnesses[]` — one entry per rank:

| Field | Type | Meaning |
|---|---|---|
| `rank` | number | Rank by vote count (1 = most votes) |
| `name` | string | SR name |
| `address` | string | SR base58 address |
| `voteCount` | string | Total votes, raw integer |
| `rewardRatioPct` | number | % of rewards passed to voters (on-chain) |
| `brokeragePct` | number | SR's cut (= 100 − `rewardRatioPct`) |
| `aprPct` | number \| null | Estimated voter APR; `null` when the estimate source is unavailable |

## Exit status

`0` success · `1` execution failure (`rpc_error`) · `2` usage error (`invalid_value` — limit out of range).

## See also

[`vote cast`](cast.md) · [`vote status`](status.md)
