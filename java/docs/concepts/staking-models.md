# Staking models: Stake 1.0 vs 2.0

wallet-cli supports two generations of the TRON staking mechanism. New usage should prefer Stake 2.0.

## Stake 1.0 (legacy)

The original model, driven by `freezeBalance` / `unfreezeBalance`:

- Freezing specifies a `frozen_duration`, currently only allowed to be **3 days**.
- After the freezing time expires, funds can be unfrozen; when the unfreezing operation occurs, bandwidth is not cleared.
- Resource delegation is expressed through the optional `receiverAddress` parameter of the same freeze/unfreeze commands.

See [commands/stake-v1-legacy](../commands/stake-v1-legacy.md).

## Stake 2.0 (current)

The current model, driven by `freezeBalanceV2` / `unfreezeBalanceV2`, with resource delegation and an explicit unbonding/withdrawal flow:

- `freezeBalanceV2` stakes TRX for BANDWIDTH, ENERGY, or TRON_POWER.
- `delegateResource` / `unDelegateResource` delegate resources to another account (optionally locked for 3 days).
- `unfreezeBalanceV2` begins unbonding; `withdrawExpireUnfreeze` withdraws the amount once it has expired; `cancelAllUnfreezeV2` cancels pending unfreezes.
- Dedicated v2 query commands report delegation state and available/withdrawable amounts.

See [commands/stake-v2](../commands/stake-v2.md).

## See also

- [concepts/resources](resources.md) — what shares, bandwidth, and energy are
