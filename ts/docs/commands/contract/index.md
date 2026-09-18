# wallet-cli contract

Call, send, deploy, inspect, and govern smart contracts.

The governing part is the deployer's: who pays a call's energy, and whether the contract keeps an ABI on chain. Those settings are TRON's, belong to the account that deployed the contract, and take effect as soon as the transaction confirms. `create2` is unrelated to any of that — it is local arithmetic over an address that does not exist yet.

## Synopsis

```
wallet-cli contract COMMAND
```

## Subcommands

| Command | Page | Description | Networks |
|---|---|---|---|
| `contract call` | [call.md](call.md) | Read-only call | TRON, EVM |
| `contract send` | [send.md](send.md) | State-changing call | TRON, EVM |
| `contract deploy` | [deploy.md](deploy.md) | Deploy a smart contract | TRON, EVM |
| `contract info` | [info.md](info.md) | Show contract ABI + metadata | TRON only |
| `contract clear-abi` | [clear-abi.md](clear-abi.md) | Clear the on-chain ABI (irreversible) | TRON only |
| `contract set-origin-energy-limit` | [set-origin-energy-limit.md](set-origin-energy-limit.md) | Energy the deployer covers per call | TRON only |
| `contract set-user-resource-percent` | [set-user-resource-percent.md](set-user-resource-percent.md) | Share of a call's energy paid by the caller | TRON only |
| `contract create2` | [create2.md](create2.md) | Compute a CREATE2 address locally | TRON only |

`call`, `send` and `deploy` run on both families; the rest implement TRON protocol features with no EVM counterpart and fail there with `family_mismatch`. The portable three share the families, not the flags: `contract call` is read-only and takes call inputs, while `contract send` and `contract deploy` are write transactions and carry the fee/signing vocabulary — `--fee-limit` / `--permission-id` / `--expiration` on TRON, `--gas-limit` / `--max-fee` / `--priority-fee` / `--nonce` on EVM, each refused on the other family with `invalid_option`.

## See also

[Energy & bandwidth](../../concepts/energy-bandwidth.md) · [`tx status`](../tx/status.md)
