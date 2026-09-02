# Staking (Stake 1.0, legacy)

> ⚠️ **Legacy.** These are the pre–Stake 2.0 freeze commands, kept for reference. New usage should prefer [Stake 2.0](stake-v2.md). For the difference between the two models, see [concepts/staking-models](../concepts/staking-models.md).

Legacy freeze/unfreeze and resource delegation (v1). Bandwidth mechanics are explained in [concepts/resources](../concepts/resources.md).

## How to freeze/unfreeze balance

After the funds are frozen, the corresponding number of shares and bandwidth will be obtained. Shares can be used for voting and bandwidth can be used for trading. The rules for the use and calculation of share and bandwidth are described in [concepts/resources](../concepts/resources.md).

**Freeze operation is as follows:**

```console
> freezeBalance [OwnerAddress] frozen_balance frozen_duration [ResourceCode:0 BANDWIDTH, 1 ENERGY, 2 TRON_POWER] [receiverAddress]
```

- `OwnerAddress` — the address of the account that initiated the transaction, optional, default is the address of the login account.
- `frozen_balance` — the amount of frozen funds, the unit is Sun. The minimum value is **1000000 Sun (1 TRX)**.
- `frozen_duration` — freeze time, this value is currently only allowed for **3 days**.
- `ResourceCode` — `0` BANDWIDTH; `1` ENERGY; `2` TRON_POWER only when `getAllowNewResourceModel` is enabled. TRON_POWER cannot be delegated, so omit `receiverAddress` when using `2`.

For example:

```console
> freezeBalance 100000000 3 1 TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW
```

After the freeze operation, frozen funds will be transferred from Account Balance to Frozen. You can view frozen funds from your account information. After being unfrozen, it is transferred back to Balance from Frozen, and the frozen funds cannot be used for trading.

When more share or bandwidth is needed temporarily, additional funds may be frozen to obtain additional share and bandwidth. The unfrozen time is postponed until 3 days after the last freeze operation.

After the freezing time expires, funds can be unfrozen.

**Unfreeze operation is as follows:**

```console
> unfreezeBalance [OwnerAddress] ResourceCode(0 BANDWIDTH, 1 ENERGY, 2 TRON_POWER) [receiverAddress]
```

## How to delegate resource

### FreezeBalance (delegate)

```console
> freezeBalance [OwnerAddress] frozen_balance frozen_duration [ResourceCode:0 BANDWIDTH, 1 ENERGY] [receiverAddress]
```

The latter two parameters are optional. If not set, the TRX is frozen to obtain resources for its own use; if not empty, the acquired resources are used by `receiverAddress`.

- `OwnerAddress` — the address of the account that initiated the transaction, optional, default is the address of the login account.
- `frozen_balance` — the amount of frozen TRX, the unit is the smallest unit (Sun), the minimum is 1000000 sun.
- `frozen_duration` — frozen duration, 3 days.
- `ResourceCode` — 0 BANDWIDTH; 1 ENERGY.
- `receiverAddress` — target account address.

### UnfreezeBalance (undelegate)

```console
> unfreezeBalance [OwnerAddress] ResourceCode(0 BANDWIDTH, 1 ENERGY) [receiverAddress]
```

The latter two parameters are optional. If they are not set, the BANDWIDTH resource is unfrozen by default; when the `receiverAddress` is set, the delegated resources are unfrozen.

### Get resource delegation information

- `getDelegatedResource fromAddress toAddress` — get the information from the `fromAddress` to the `toAddress` resource delegate.
- `getDelegatedResourceAccountIndex address` — get the information that `address` is delegated to other accounts' resources.

## See also

- [stake-v2](stake-v2.md) — the current staking model (Stake 2.0)
- [concepts/staking-models](../concepts/staking-models.md) · [concepts/resources](../concepts/resources.md)
