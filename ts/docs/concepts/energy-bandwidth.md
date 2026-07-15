# Energy and Bandwidth

TRON's fee model, and why `stake` exists. Units first: **1 TRX = 1,000,000 SUN**; all CLI amounts named `*-sun` and all JSON amounts are raw SUN strings.

## Two resources instead of gas

| Resource | Consumed by | Free allowance |
|---|---|---|
| **Bandwidth** | every transaction's bytes | small daily per-account quota |
| **Energy** | smart-contract execution (TRC20 transfers included) | none |

When a transaction needs more than you have, the node **burns TRX** from your balance to cover the difference. For contract calls, `--fee-limit` (on `tx send` / `contract` commands, default 100000000 SUN) caps that burn — a safety valve against a buggy or hostile contract consuming unbounded energy.

Check your standing anytime:

```bash
wallet-cli account info --network tron:nile -o json | jq '.data.resources'
```

```json
{ "bandwidth": { "used": 0, "limit": 600 }, "energy": { "used": 0, "limit": 888 } }
```

## How you obtain resources: staking

Staking locks TRX (it remains yours) in exchange for a continuous resource quota plus TRON Power (governance votes). The `stake` command group maps 1:1 onto the chain operations:

| Command | Chain operation | Effect |
|---|---|---|
| `stake freeze` | FreezeBalanceV2 | Lock TRX for `--resource energy\|bandwidth` |
| `stake unfreeze` | UnfreezeBalanceV2 | Request unlock; resources drop immediately, TRX enters a **waiting period** (14 days on mainnet) |
| `stake withdraw` | WithdrawExpireUnfreeze | Claim unstakes whose waiting period has expired |
| `stake cancel-unfreeze` | CancelAllUnfreezeV2 | Roll **all** pending unstakes back to staked |
| `stake delegate` | DelegateResourceV2 | Lend resource quota to `--receiver` (optionally `--lock` for `--lock-period` blocks, ~3 s/block) |
| `stake undelegate` | UnDelegateResourceV2 | Reclaim a delegation |

Delegation moves the **resource quota**, never the TRX — the stake stays on the owner's account. A common setup: a cold account holds the stake and delegates energy to a hot account that does the transacting.

## Practical consequences

- A "free" TRX transfer isn't always free: past the bandwidth quota, it burns TRX.
- A TRC20 transfer with zero energy burns noticeably more — check `--dry-run`'s `fee` block before complaining about balances.
- `rpc_error` mentioning bandwidth/energy/balance during send → fund, stake, or wait for the daily quota; see [Troubleshooting](../troubleshooting.md#rpc_error-exit-1).

## See also

[Staking walkthrough](../guide/stake-and-resources.md) · [Networks](networks.md) · [`account info`](../commands/account/info.md)
