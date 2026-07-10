# wallet-cli reward

Query / withdraw voting rewards.

Rewards accrue continuously from your votes ([`vote cast`](../vote/cast.md)) — plus block rewards if you are an SR — and can be withdrawn **at most once every 24 hours** (an on-chain rule; earlier attempts are rejected).

## Synopsis

```
wallet-cli reward COMMAND
```

## Subcommands

| Command | Page | Description |
|---|---|---|
| `reward balance` | [balance.md](balance.md) | Show claimable reward and withdraw status |
| `reward withdraw` | [withdraw.md](withdraw.md) | Withdraw accrued rewards to balance |

## See also

[`vote`](../vote/index.md) · [`stake info`](../stake/info.md)
