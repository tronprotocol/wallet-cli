# Standard CLI command reference

The Java jar has a one-shot CLI in addition to the legacy interactive prompt. Any invocation with a command token uses this mode:

```console
$ java -jar wallet-cli.jar [global options] <command> [command options]
$ java -jar wallet-cli.jar --network nile --output json get-balance --address T...
$ java -jar wallet-cli.jar get-balance --help
```

Running the jar with no arguments opens the prompt. Use `--interactive` as a standalone mode selector to open it explicitly. If a command token follows `--interactive`, the prompt still opens and that command is not executed; placing `--interactive` after a command instead passes it to that command and normally produces a usage error. A global option without a command, except `--help`, `--version`, or `--interactive`, returns a usage error with exit `2`.

## Global options

| Option | Meaning |
|---|---|
| `--output <text\|json>` | Output format; default `text` |
| `--network <main\|nile\|shasta\|custom>` | Select a built-in network or custom endpoint set |
| `--wallet <name\|path>` | Select the wallet used by wallet-bound commands |
| `--grpc-endpoint <host:port>` | Override the gRPC endpoint |
| `--quiet` / `--verbose` | Suppress non-essential output or enable diagnostics; mutually exclusive |
| `--password-stdin` | Read the master password from stdin for commands that need one |
| `--help`, `-h`, `--version` | Global help or version when placed before the command |
| `--interactive` | Launch the legacy prompt; use without a command |

Global execution options may appear before or after the command. Put command-specific options after the command and use `<command> --help` as the authority for required fields and authentication.

JSON mode emits `{success, data}` on success or `{success, error, message}` on failure; alias resolution may add `meta.resolved`. Exit codes are `0` for success, `1` for execution failure, and `2` for usage errors.

For password-bearing commands, keep the secret out of argv:

```console
$ printf '%s\n' "$PW" | java -jar wallet-cli.jar --network nile --password-stdin send-coin --to T... --amount 1000000
$ printf '%s\n' "$PW" | java -jar wallet-cli.jar --password-stdin register-wallet --name main --words 12
```

## Wallet and alias commands

These commands exist only in the standard CLI and do not have equivalent legacy REPL verbs:

```console
$ java -jar wallet-cli.jar list-wallet
$ java -jar wallet-cli.jar set-active-wallet --name treasury
$ java -jar wallet-cli.jar get-active-wallet
$ java -jar wallet-cli.jar --network nile alias-add --name payroll --type ACCOUNT --address T... --note "operations"
$ java -jar wallet-cli.jar --network nile alias-list --type ACCOUNT
$ java -jar wallet-cli.jar --network nile alias-resolve --name payroll --type ACCOUNT
$ java -jar wallet-cli.jar --network nile alias-remove --name payroll
```

`set-active-wallet` requires exactly one of `--name` or `--address`. Alias data is network-scoped. `alias-add --type TOKEN` accepts `--decimals`; `--note` is valid only for `ACCOUNT` aliases.

## Registered commands

The registry currently contains 107 primary command names. Aliases are accepted by the parser but omitted here; global help prints the current primary catalog.

### Wallets and aliases (12)

`register-wallet`, `list-wallet`, `set-active-wallet`, `get-active-wallet`, `clear-wallet-keystore`, `reset-wallet`, `modify-wallet-name`, `generate-sub-account`, `alias-add`, `alias-remove`, `alias-list`, `alias-resolve`

### Transactions (12)

`send-coin`, `transfer-asset`, `transfer-usdt`, `participate-asset-issue`, `asset-issue`, `create-account`, `update-account`, `set-account-id`, `update-asset`, `broadcast-transaction`, `update-account-permission`, `gas-free-transfer`

### Contracts (7)

`deploy-contract`, `trigger-contract`, `trigger-constant-contract`, `estimate-energy`, `clear-contract-abi`, `update-setting`, `update-energy-limit`

### Staking and rewards (10)

`freeze-balance`, `freeze-balance-v2`, `unfreeze-balance`, `unfreeze-balance-v2`, `withdraw-expire-unfreeze`, `delegate-resource`, `undelegate-resource`, `cancel-all-unfreeze-v2`, `withdraw-balance`, `unfreeze-asset`

### Witnesses and voting (4)

`create-witness`, `update-witness`, `vote-witness`, `update-brokerage`

### Governance proposals (3)

`create-proposal`, `approve-proposal`, `delete-proposal`

### Exchange and market (5)

`exchange-create`, `exchange-inject`, `exchange-withdraw`, `market-sell-asset`, `market-cancel-order`

### Queries (53)

`get-address`, `get-balance`, `get-account`, `get-account-by-id`, `get-account-net`, `get-account-resource`, `get-usdt-balance`, `current-network`, `get-block`, `get-block-by-id`, `get-block-by-id-or-num`, `get-block-by-latest-num`, `get-block-by-limit-next`, `get-transaction-by-id`, `get-transaction-info-by-id`, `get-transaction-count-by-block-num`, `get-asset-issue-by-account`, `get-asset-issue-by-id`, `get-asset-issue-by-name`, `get-asset-issue-list-by-name`, `get-chain-parameters`, `get-bandwidth-prices`, `get-energy-prices`, `get-memo-fee`, `get-next-maintenance-time`, `get-contract`, `get-contract-info`, `get-delegated-resource`, `get-delegated-resource-v2`, `get-delegated-resource-account-index`, `get-delegated-resource-account-index-v2`, `get-can-delegated-max-size`, `get-available-unfreeze-count`, `get-can-withdraw-unfreeze-amount`, `get-brokerage`, `get-reward`, `list-nodes`, `list-witnesses`, `list-asset-issue`, `list-asset-issue-paginated`, `list-proposals`, `list-proposals-paginated`, `get-proposal`, `list-exchanges`, `list-exchanges-paginated`, `get-exchange`, `get-market-order-by-account`, `get-market-order-by-id`, `get-market-order-list-by-pair`, `get-market-pair-list`, `get-market-price-by-pair`, `gas-free-info`, `gas-free-trace`

### Utility (1)

`help`

## See also

- [Interactive command index](index.md)
- [Standard CLI contract](../standard-cli-contract-spec.md)
- [Configuration](../reference/config.md)
