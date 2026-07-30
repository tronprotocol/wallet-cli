# wallet-cli account

Query on-chain account state.

## Synopsis

```
wallet-cli account COMMAND
```

All subcommands read the chain for the **active account** by default; override with `--account <accountId|label>` or change the default with `wallet-cli use <account>`.

## Subcommands

| Command | Description | Data source |
|---|---|---|
| [`account balance`](balance.md) | Native balance (TRX/SUN) | node RPC |
| [`account info`](info.md) | Raw account data incl. bandwidth/energy | node RPC |
| [`account history`](history.md) | Transaction history | **TronGrid required** |
| [`account portfolio`](portfolio.md) | Native + token balances, best-effort USD | node RPC + price source |

## See also

[`list`](../list.md) — local accounts (no chain access) · [Networks & resources](../../concepts/networks.md)
