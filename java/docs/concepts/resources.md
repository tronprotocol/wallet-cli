# Resources: bandwidth, energy & shares

TRON accounts obtain resources by freezing (staking) TRX. This page collects the mechanics that the operation pages refer to.

## Shares and bandwidth from freezing

After funds are frozen, the corresponding number of shares and bandwidth is obtained. Shares can be used for voting and bandwidth can be used for trading.

- **Share** — 1 unit of share can be obtained for every 1 TRX frozen. Shares are used for [voting](../commands/vote-reward.md#how-to-vote). After unfreezing, a previous vote will expire.
- **Bandwidth** — consumed by contracts (transfers, asset transfers, voting, freezing, etc.). Querying does not consume bandwidth.

## How to calculate bandwidth

The bandwidth calculation rule is:

```
constant * FrozenFunds * days
```

Assuming freeze of 1 TRX (1_000_000 Sun) for 3 days, bandwidth obtained = 1 * 1_000_000 * 3 = 3_000_000.

All contracts consume bandwidth, including transferring, transferring of assets, voting, freezing, etc. Querying does not consume bandwidth. Each contract needs to consume **100_000 bandwidth**.

If a contract exceeds a certain time (**10s**), this operation does not consume bandwidth.

When the unfreezing operation occurs, the bandwidth is not cleared. The next time the freeze is performed, the newly added bandwidth is accumulated.

## Resource prices

Historical unit prices for bandwidth and energy, and the memo fee, are queryable — see [commands/resources](../commands/resources.md).

## See also

- [commands/stake-v2](../commands/stake-v2.md) — the current staking model
- [commands/stake-v1-legacy](../commands/stake-v1-legacy.md) — legacy freeze
- [concepts/staking-models](staking-models.md)
