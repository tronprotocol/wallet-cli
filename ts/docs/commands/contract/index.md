# wallet-cli contract

Call, send, deploy, inspect, and govern smart contracts.

Calling, sending and deploying work on TRON and EVM alike. The governing part is TRON-specific and the deployer's: who pays a call's energy, and whether the contract keeps an ABI on chain. Those settings belong to the account that deployed the contract and take effect as soon as the transaction confirms. `create2` is unrelated to any of that — it is local arithmetic over a TRON address that does not exist yet.

## Synopsis

```
wallet-cli contract COMMAND
```

## Subcommands

| Command | Page | Description | Networks |
|---|---|---|---|
| `contract call` | [call.md](call.md) | Read-only contract call | TRON, EVM |
| `contract send` | [send.md](send.md) | State-changing contract call | TRON, EVM |
| `contract deploy` | [deploy.md](deploy.md) | Deploy contract bytecode | TRON, EVM |
| `contract info` | [info.md](info.md) | Show contract ABI + metadata | TRON only |
| `contract clear-abi` | [clear-abi.md](clear-abi.md) | Clear the on-chain ABI (irreversible) | TRON only |
| `contract set-origin-energy-limit` | [set-origin-energy-limit.md](set-origin-energy-limit.md) | Energy the deployer covers per call | TRON only |
| `contract set-user-resource-percent` | [set-user-resource-percent.md](set-user-resource-percent.md) | Share of a call's energy paid by the caller | TRON only |
| `contract create2` | [create2.md](create2.md) | Precompute a CREATE2 address | TRON only |

The three portable commands share one flag vocabulary and differ only in fees: `--fee-limit` / `--permission-id` / `--expiration` on TRON, `--gas-limit` / `--max-fee` / `--priority-fee` / `--nonce` on EVM, each refused on the other family with `invalid_option`. The **TRON only** commands are the ones with no EVM counterpart — an on-chain ABI registry and the deployer-pays energy model are TRON protocol features, and TRON's CREATE2 derivation is not Ethereum's. Running one against an EVM network fails with `family_mismatch`.

## See also

[Energy & bandwidth](../../concepts/energy-bandwidth.md) · [`tx status`](../tx/status.md)
