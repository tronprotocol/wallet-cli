# wallet-cli stake

Stake / delegate resources, and inspect staking state.

Staking lifecycle: `freeze ──► unfreeze ──(waiting period)──► withdraw`; `cancel-unfreeze` rolls all pending unstakes back to frozen; `delegate` / `undelegate` lend resource to others / take it back. `info` and `delegated` are the read-only queries to run before operating.

**TRON only.** Staking for bandwidth/energy is a TRON protocol feature; every subcommand here fails with `family_mismatch` on an EVM network.

## Synopsis

```
wallet-cli stake COMMAND
```

## Subcommands

| Command | Page | Description |
|---|---|---|
| `stake freeze` | [freeze.md](freeze.md) | Stake TRX for energy/bandwidth |
| `stake unfreeze` | [unfreeze.md](unfreeze.md) | Unstake TRX |
| `stake withdraw` | [withdraw.md](withdraw.md) | Withdraw expired unfrozen TRX |
| `stake cancel-unfreeze` | [cancel-unfreeze.md](cancel-unfreeze.md) | Cancel all pending unstakes |
| `stake delegate` | [delegate.md](delegate.md) | Delegate resource to another address |
| `stake undelegate` | [undelegate.md](undelegate.md) | Reclaim delegated resource |
| `stake info` | [info.md](info.md) | Staking & resource overview |
| `stake delegated` | [delegated.md](delegated.md) | Delegation details and max delegatable size |

## See also

[Staking guide](../../guide/stake-and-resources.md) · [Energy & bandwidth](../../concepts/energy-bandwidth.md) · [`vote`](../vote/index.md)
