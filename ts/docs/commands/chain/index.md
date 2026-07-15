# wallet-cli chain

Query chain params, prices & node info.

Three read-only queries for fee estimation, staking/voting decisions, and troubleshooting. Not to be confused with [`networks`](../networks.md), which lists locally known networks without touching a node — `chain` queries the node selected by `--network`.

## Synopsis

```
wallet-cli chain COMMAND
```

## Subcommands

| Command | Page | Description |
|---|---|---|
| `chain params` | [params.md](params.md) | On-chain governance parameters |
| `chain prices` | [prices.md](prices.md) | Energy/bandwidth unit price and memo fee |
| `chain node` | [node.md](node.md) | Connected node status (version / sync / peers) |

## See also

[`networks`](../networks.md) · [Energy & bandwidth](../../concepts/energy-bandwidth.md) · [Troubleshooting](../../troubleshooting.md)
