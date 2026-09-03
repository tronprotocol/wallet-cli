# wallet-cli chain

Query chain and node state.

Three read-only queries for fee estimation, staking/voting decisions, and troubleshooting. Not to be confused with [`networks`](../networks.md), which lists locally known networks without touching a node — `chain` queries the node selected by `--network`.

## Synopsis

```
wallet-cli chain COMMAND
```

## Subcommands

| Command | Page | Description | Networks |
|---|---|---|---|
| `chain params` | [params.md](params.md) | On-chain governance parameters | TRON only |
| `chain prices` | [prices.md](prices.md) | Current transaction unit prices | TRON, EVM |
| `chain node` | [node.md](node.md) | Connected node status | TRON, EVM |

`chain params` is TRON only — SR-governed system parameters have no EVM counterpart, so an EVM network fails with `family_mismatch`. `chain prices` answers in the selected network's fee model and returns a **different field set per family**: energy/bandwidth prices on TRON, gas prices on EVM.

## See also

[`networks`](../networks.md) · [Energy & bandwidth](../../concepts/energy-bandwidth.md) · [Troubleshooting](../../troubleshooting.md)
