# wallet-cli account

Query on-chain account state, and activate & name accounts.

## Synopsis

```
wallet-cli account COMMAND
```

Subcommands act on the **active account** by default; override with `--account <accountId|label>` or change the default with `wallet-cli use <account>`. Which address is queried follows the selected network's family — the same account has a TRON base58 address and an EVM `0x` address. The first four are read-only queries; `activate` and `set` change on-chain state and need the master password.

## Subcommands

| Command | Description | Networks | Data source |
|---|---|---|---|
| [`account balance`](balance.md) | Native coin balance | TRON, EVM | node RPC |
| [`account info`](info.md) | On-chain account state (TRON adds bandwidth/energy) | TRON, EVM | node RPC |
| [`account history`](history.md) | Transaction history | TRON only | **TronGrid required** |
| [`account portfolio`](portfolio.md) | Native + token balances, best-effort USD | TRON, EVM | node RPC + price source |
| [`account activate`](activate.md) | Activate a not-yet-existing account (no transfer) | TRON only | broadcast |
| [`account set`](set.md) | Set the on-chain name / account id (one-time) | TRON only | broadcast |

A **TRON only** command run against an EVM network fails with `family_mismatch` before any node call.

## See also

[`list`](../list.md) — local accounts (no chain access) · [Networks & resources](../../concepts/networks.md)
