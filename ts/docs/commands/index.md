# Command Reference

Every command — including every subcommand — has its own page, following a fixed layout (Synopsis · Description · Options · Examples · Output · Exit status · See also). Command-group pages list and link their subcommands.

## Wallets and accounts

| Command | Page |
|---|---|
| `create` | [create.md](create.md) |
| `import mnemonic` | [import/mnemonic.md](import/mnemonic.md) *(interactive-only)* |
| `import private-key` | [import/private-key.md](import/private-key.md) *(interactive-only)* |
| `import ledger` | [import/ledger.md](import/ledger.md) |
| `import watch` | [import/watch.md](import/watch.md) |
| `list` | [list.md](list.md) |
| `use` | [use.md](use.md) |
| `current` | [current.md](current.md) |
| `derive` | [derive.md](derive.md) |
| `rename` | [rename.md](rename.md) |
| `backup` | [backup.md](backup.md) |
| `delete` | [delete.md](delete.md) |
| `change-password` | [change-password.md](change-password.md) |
| `address` (group) | [address/index.md](address/index.md) |
| `address generate` | [address/generate.md](address/generate.md) |

## Transactions

| Command | Page |
|---|---|
| `tx` (group) | [tx/index.md](tx/index.md) |
| `tx send` | [tx/send.md](tx/send.md) |
| `tx sign` | [tx/sign.md](tx/sign.md) |
| `tx broadcast` | [tx/broadcast.md](tx/broadcast.md) |
| `tx approvals` | [tx/approvals.md](tx/approvals.md) |
| `tx multisig` | [tx/multisig.md](tx/multisig.md) |
| `tx status` | [tx/status.md](tx/status.md) |
| `tx info` | [tx/info.md](tx/info.md) |

## Multi-signature permissions

| Command | Page |
|---|---|
| `permission` (group) | [permission/index.md](permission/index.md) |
| `permission show` | [permission/show.md](permission/show.md) |
| `permission update` | [permission/update.md](permission/update.md) *(can lock you out — read first)* |

## Gas-free transfers

| Command | Page |
|---|---|
| `gasfree` (group) | [gasfree/index.md](gasfree/index.md) |
| `gasfree info` | [gasfree/info.md](gasfree/info.md) |
| `gasfree transfer` | [gasfree/transfer.md](gasfree/transfer.md) |
| `gasfree trace` | [gasfree/trace.md](gasfree/trace.md) |

## On-chain queries

| Command | Page |
|---|---|
| `account` (group) | [account/index.md](account/index.md) |
| `account balance` | [account/balance.md](account/balance.md) |
| `account info` | [account/info.md](account/info.md) |
| `account history` | [account/history.md](account/history.md) |
| `account portfolio` | [account/portfolio.md](account/portfolio.md) |
| `account activate` | [account/activate.md](account/activate.md) |
| `account set` | [account/set.md](account/set.md) |
| `block` | [block.md](block.md) |
| `chain` (group) | [chain/index.md](chain/index.md) |
| `chain params` | [chain/params.md](chain/params.md) |
| `chain prices` | [chain/prices.md](chain/prices.md) |
| `chain node` | [chain/node.md](chain/node.md) |

## Tokens and contracts

| Command | Page |
|---|---|
| `token` (group) | [token/index.md](token/index.md) |
| `token balance` | [token/balance.md](token/balance.md) |
| `token info` | [token/info.md](token/info.md) |
| `token add` | [token/add.md](token/add.md) |
| `token list` | [token/list.md](token/list.md) |
| `token remove` | [token/remove.md](token/remove.md) |
| `contract` (group) | [contract/index.md](contract/index.md) |
| `contract call` | [contract/call.md](contract/call.md) |
| `contract send` | [contract/send.md](contract/send.md) |
| `contract deploy` | [contract/deploy.md](contract/deploy.md) |
| `contract info` | [contract/info.md](contract/info.md) |

## Staking, voting, rewards

| Command | Page |
|---|---|
| `stake` (group) | [stake/index.md](stake/index.md) |
| `stake freeze` | [stake/freeze.md](stake/freeze.md) |
| `stake unfreeze` | [stake/unfreeze.md](stake/unfreeze.md) |
| `stake withdraw` | [stake/withdraw.md](stake/withdraw.md) |
| `stake cancel-unfreeze` | [stake/cancel-unfreeze.md](stake/cancel-unfreeze.md) |
| `stake delegate` | [stake/delegate.md](stake/delegate.md) |
| `stake undelegate` | [stake/undelegate.md](stake/undelegate.md) |
| `stake info` | [stake/info.md](stake/info.md) |
| `stake delegated` | [stake/delegated.md](stake/delegated.md) |
| `vote` (group) | [vote/index.md](vote/index.md) |
| `vote cast` | [vote/cast.md](vote/cast.md) |
| `vote list` | [vote/list.md](vote/list.md) |
| `vote status` | [vote/status.md](vote/status.md) |
| `reward` (group) | [reward/index.md](reward/index.md) |
| `reward balance` | [reward/balance.md](reward/balance.md) |
| `reward withdraw` | [reward/withdraw.md](reward/withdraw.md) |

## Signing

| Command | Page |
|---|---|
| `message` (group) | [message/index.md](message/index.md) |
| `message sign` | [message/sign.md](message/sign.md) |
| `typed-data` (group) | [typed-data/index.md](typed-data/index.md) |
| `typed-data sign` | [typed-data/sign.md](typed-data/sign.md) |

## Local

| Command | Page |
|---|---|
| `config` | [config.md](config.md) |
| `networks` | [networks.md](networks.md) |
| `contact` (group) | [contact/index.md](contact/index.md) |
| `contact add` | [contact/add.md](contact/add.md) |
| `contact list` | [contact/list.md](contact/list.md) |
| `contact remove` | [contact/remove.md](contact/remove.md) |
| `encoding` (group) | [encoding/index.md](encoding/index.md) |
| `encoding convert` | [encoding/convert.md](encoding/convert.md) |

## Global options (every command)

```
-o, --output <text|json>   result format (default: config.defaultOutput, built-in text)
--network <string>         canonical network id (chain commands; falls back to config.defaultNetwork)
--account <string>         accountId, label, or address (wallet-bound commands; falls back to active)
--timeout <number>         per RPC/device call timeout, ms (default: config.timeoutMs, built-in 60000)
-v, --verbose              extra diagnostic output
-h, --help / -V, --version
```

Broadcast (✍️) commands additionally take `--wait` / `--wait-timeout <ms>` (cap default: config `waitTimeoutMs`, built-in 60000) and the mutually exclusive execution-mode flags:

```
--dry-run                  build and estimate only — no signature, no broadcast
--sign-only                sign and output the complete transaction hex
--build-only               build unsigned transaction hex without unlocking
--permission-id <0-9>      TRON permission group authorizing this transaction (default 0)
--expiration <ms>          expiration duration, 1–86400000; only with --sign-only / --build-only
```

Not every broadcast command exposes all of these — `gasfree transfer` signs a TIP-712 authorization
rather than building a TRON transaction, so it takes only `--dry-run`. Check the command's page.
