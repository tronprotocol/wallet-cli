# wallet-cli vote

Vote for super representatives (SR).

Voting spends **Tron Power (TP)**: 1 TP = 1 staked TRX ([`stake freeze`](../stake/freeze.md)). Votes are tallied at the next maintenance cycle (~6 h) and then earn rewards continuously — query and claim them with [`reward`](../reward/index.md).

## Synopsis

```
wallet-cli vote COMMAND
```

## Subcommands

| Command | Page | Description |
|---|---|---|
| `vote cast` | [cast.md](cast.md) | Cast/replace your full vote allocation |
| `vote list` | [list.md](list.md) | List super representatives and candidates |
| `vote status` | [status.md](status.md) | Your current votes, voting power, and reward overview |

## See also

[`reward`](../reward/index.md) · [`stake info`](../stake/info.md) · [Staking guide](../../guide/stake-and-resources.md)
