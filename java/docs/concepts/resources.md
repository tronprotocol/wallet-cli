# Resources: bandwidth, energy & TRON Power

TRON accounts obtain resources by **staking** TRX with `freezeBalanceV2` (Stake 2.0). This page collects the mechanics that the operation pages refer to. For the commands themselves, see [commands/stake-v2](../commands/stake-v2.md).

## What staking gives you

| Resource | Consumed by | Obtained by |
|---|---|---|
| **Bandwidth** | every transaction you broadcast, in proportion to its size | staking for `BANDWIDTH` (ResourceCode 0), plus a free daily allowance |
| **Energy** | smart-contract execution only, including TRC20 transfers | staking for `ENERGY` (ResourceCode 1) |
| **TRON Power** | [voting](../commands/vote-reward.md#how-to-vote) for super representatives | staking for `TRON_POWER` (ResourceCode 2) — 1 TRX staked = 1 vote |

Staked TRX remains yours; it is locked, not spent. Unstaking (`unfreezeBalanceV2`) drops the resources immediately and puts the TRX into a waiting period before it can be withdrawn, and votes cast with unstaked TRON Power expire.

Queries (`getaccount`, `getblock`, and the rest) are node reads, not transactions, and consume nothing.

## How bandwidth is consumed

A transaction consumes bandwidth equal to the **size of the signed transaction in bytes** — a plain TRX transfer runs a few hundred. There is no fixed per-transaction figure; a transaction with more signatures or a memo is bigger and costs more.

The node draws on three sources in order:

1. The **free daily allowance** — the chain parameter `getFreeNetLimit`, 600 bytes/day on mainnet today. TRC10 transfers may draw on the issuer's `free_asset_net_limit` first.
2. **Staked bandwidth**, which regenerates over 24 hours.
3. Whatever is still uncovered is paid by **burning TRX**, at `getTransactionFee` — 1,000 SUN per byte on mainnet today.

Energy works the same way at the third step, burning at `getEnergyFee` (100 SUN per energy on mainnet today), but has no free allowance: an account with no staked energy pays for every contract call in TRX.

## How much bandwidth or energy a stake yields

Staking does not buy a fixed amount. Each resource is a **fixed network-wide pool split in proportion to what everyone has staked**:

```
your bandwidth = getTotalNetLimit           * yourBandwidthStake / totalBandwidthStaked
your energy    = getTotalEnergyCurrentLimit * yourEnergyStake    / totalEnergyStaked
```

On mainnet today those pools are 43,200,000,000 bandwidth and 180,000,000,000 energy. Because the denominator is everyone else's stake, the same stake yields less as the network stakes more — check what you actually hold with `getaccountresource` rather than computing an expected figure.

Every value named above is a chain parameter that super representatives can change by proposal. Read the current ones with [`GetChainParameters`](../commands/chain-data.md#getchainparameters); do not hardcode them.

## Stake 1.0: how this used to work

Before Stake 2.0, `freezeBalance` took a `frozen_duration` (3 days) and each freeze was a separate position tied to that duration, unfrozen individually once it expired. Descriptions of bandwidth as `constant * frozen amount * days` come from that model.

`freezeBalanceV2` no longer accepts a duration — it takes only an amount and a resource type — and the proportional-share rules above are what applies now. The Stake 1.0 commands remain available for unwinding old positions; see [commands/stake-v1-legacy](../commands/stake-v1-legacy.md).

## Resource prices

Historical unit prices for bandwidth and energy, and the memo fee, are queryable — see [commands/resources](../commands/resources.md).

## See also

- [commands/stake-v2](../commands/stake-v2.md) — the current staking model
- [commands/stake-v1-legacy](../commands/stake-v1-legacy.md) — legacy freeze
- [concepts/staking-models](staking-models.md)
