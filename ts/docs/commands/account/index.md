# wallet-cli account

Query on-chain account state.

## Synopsis

```
wallet-cli account COMMAND
```

All subcommands read the chain for the **active account** by default; override with `--account <accountId|label>` or change the default with `wallet-cli use <account>`.

## Subcommands

Read-only:

| Command | Description | Data source |
|---|---|---|
| [`account balance`](balance.md) | Native balance (TRX/SUN) | node RPC |
| [`account info`](info.md) | Raw account data incl. bandwidth/energy | node RPC |
| [`account history`](history.md) | Transaction history | **TronGrid required** |
| [`account portfolio`](portfolio.md) | Native + token balances, best-effort USD | node RPC + price source |

Broadcasting (✍️) — these change on-chain state and cost fees:

| Command | Description |
|---|---|
| [`account activate`](activate.md) | Activate a new TRON account, paid for by the active account |
| [`account set`](set.md) | Set the one-time on-chain account name or ID |

Both write-side commands are effectively one-shot: an account can only be activated once, and the
on-chain name and ID can each be set once. Run them with `--dry-run` first.

## See also

[`list`](../list.md) — local accounts (no chain access) · [Networks & resources](../../concepts/networks.md)
