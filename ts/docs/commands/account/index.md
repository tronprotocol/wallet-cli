# wallet-cli account

Query on-chain account state, and activate & name accounts.

## Synopsis

```
wallet-cli account COMMAND
```

Subcommands act on the **active account** by default; override with `--account <accountId|label>` or change the default with `wallet-cli use <account>`. The first four are read-only queries; `activate` and `set` change on-chain state. Software signing needs the master password, Ledger signing confirms on device, and `--dry-run` / `--build-only` never unlock the wallet.

## Networks

`balance`, `info` and `portfolio` run on TRON and EVM networks alike, reporting the family-specific fields per family. `history`, `activate` and `set` are **TRON only** and fail with `family_mismatch` on an EVM network. See [which commands run on which networks](../index.md#which-commands-run-on-which-networks).

## Subcommands

| Command | Description | Data source |
|---|---|---|
| [`account balance`](balance.md) | Native coin balance | node RPC |
| [`account info`](info.md) | On-chain account state — resources on TRON, nonce and code on EVM | node RPC |
| [`account history`](history.md) | Transaction history | **TronGrid required** |
| [`account portfolio`](portfolio.md) | Native + token balances, best-effort USD | node RPC + price source |
| [`account activate`](activate.md) | Activate a not-yet-existing account (no transfer) | broadcast |
| [`account set`](set.md) | Set the on-chain name / account id (one-time) | broadcast |

## See also

[`list`](../list.md) — local accounts (no chain access) · [Networks & resources](../../concepts/networks.md)
