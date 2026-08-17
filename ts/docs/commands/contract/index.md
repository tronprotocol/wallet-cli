# wallet-cli contract

Call, send, deploy, inspect, and govern smart contracts.

The governing part is the deployer's: who pays a call's energy, and whether the contract keeps an ABI on chain. Those settings belong to the account that deployed the contract and take effect as soon as the transaction confirms. `create2` is unrelated to any of that — it is local arithmetic over an address that does not exist yet.

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
| `contract clear-abi` | [clear-abi.md](clear-abi.md) | Clear the on-chain ABI (irreversible) |
| `contract set-origin-energy-limit` | [set-origin-energy-limit.md](set-origin-energy-limit.md) | Energy the deployer covers per call |
| `contract set-user-resource-percent` | [set-user-resource-percent.md](set-user-resource-percent.md) | Share of a call's energy paid by the caller |
| `contract create2` | [create2.md](create2.md) | Compute a CREATE2 address locally |

## See also

[Energy & bandwidth](../../concepts/energy-bandwidth.md) · [`tx status`](../tx/status.md)
