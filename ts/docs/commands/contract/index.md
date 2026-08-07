# wallet-cli contract

Call, deploy, inspect, and govern smart contracts.

## Synopsis

```
wallet-cli contract COMMAND
```

## Subcommands

| Command | Page | Description |
|---|---|---|
| `contract call` | [call.md](call.md) | Read-only call (triggerConstantContract) |
| `contract send` | [send.md](send.md) | State-changing call (triggerSmartContract) |
| `contract deploy` | [deploy.md](deploy.md) | Deploy a smart contract |
| `contract info` | [info.md](info.md) | Show contract ABI + metadata |
| `contract clear-abi` | [clear-abi.md](clear-abi.md) | Irreversibly remove on-chain ABI metadata |
| `contract set-origin-energy-limit` | [set-origin-energy-limit.md](set-origin-energy-limit.md) | Set the deployer's per-call energy contribution cap |
| `contract set-user-resource-percent` | [set-user-resource-percent.md](set-user-resource-percent.md) | Set the caller-paid energy percentage |
| `contract create2` | [create2.md](create2.md) | Compute a TVM CREATE2 address locally |

## See also

[Energy & bandwidth](../../concepts/energy-bandwidth.md) · [`tx status`](../tx/status.md)
