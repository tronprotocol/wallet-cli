# Command Reference

Every command — including every subcommand — has its own page, following a fixed layout (Synopsis · Description · Options · Examples · Output · Exit status · See also). Command-group pages list and link their subcommands.

## Which commands run on which networks

wallet-cli supports two chain families, **TRON** and **EVM**, and `--network` selects one network of one family. Commands fall into three kinds:

- **Portable** — the same command on either family, with the family-specific parts named per family: `account balance` / `info` / `portfolio`, `block`, `tx send` / `broadcast` / `status` / `info` / `sign`, `token` (all five), `contract call` / `send` / `deploy`, `chain node` / `prices`, `message sign`, `typed-data sign`.
- **TRON only** — the command implements a TRON protocol feature with no EVM counterpart: `account history` / `activate` / `set`, `chain params`, `contract info` / `clear-abi` / `create2` / `set-origin-energy-limit` / `set-user-resource-percent`, `tx approvals` / `multisig`, and every command in the `stake`, `vote`, `reward`, `proposal`, `witness`, `permission`, `asset`, `exchange` and `gasfree` groups. Run against an EVM network they fail with **`family_mismatch`** before any node call.
- **Local** — no network at all: `create`, `import`, `use`, `current`, `list`, `derive`, `rename`, `backup`, `delete`, `change-password`, `config`, `networks`, `contact`, `encoding`, `address`. Some of these still accept `--network` as a **display selector** (which family's address to print, which key a keystore export takes); no node is contacted either way.

Individual flags are family-scoped the same way. `--help` tags them `(tron only)` / `(evm only)`, and using one on the other family is a usage error — `invalid_option`, exit `2`.

## Wallets and accounts

| Command | Page |
|---|---|
| `create` | [create.md](create.md) |
| `import` (group) | [import/index.md](import/index.md) |
| `import mnemonic` | [import/mnemonic.md](import/mnemonic.md) *(interactive-only)* |
| `import private-key` | [import/private-key.md](import/private-key.md) *(interactive-only)* |
| `import keystore` | [import/keystore.md](import/keystore.md) *(interactive-only)* |
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

## Transactions

| Command | Page |
|---|---|
| `tx` (group) | [tx/index.md](tx/index.md) |
| `tx send` | [tx/send.md](tx/send.md) |
| `tx broadcast` | [tx/broadcast.md](tx/broadcast.md) |
| `tx status` | [tx/status.md](tx/status.md) |
| `tx info` | [tx/info.md](tx/info.md) |
| `tx sign` | [tx/sign.md](tx/sign.md) |
| `tx approvals` | [tx/approvals.md](tx/approvals.md) |
| `tx multisig` | [tx/multisig.md](tx/multisig.md) |

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

## Account permissions

| Command | Page |
|---|---|
| `permission` (group) | [permission/index.md](permission/index.md) |
| `permission show` | [permission/show.md](permission/show.md) |
| `permission update` | [permission/update.md](permission/update.md) |

## Tokens and contracts

| Command | Page |
|---|---|
| `token` (group) | [token/index.md](token/index.md) |
| `token balance` | [token/balance.md](token/balance.md) |
| `token info` | [token/info.md](token/info.md) |
| `token add` | [token/add.md](token/add.md) |
| `token list` | [token/list.md](token/list.md) |
| `token remove` | [token/remove.md](token/remove.md) |
| `contact` (group) | [contact/index.md](contact/index.md) |
| `contact add` | [contact/add.md](contact/add.md) |
| `contact list` | [contact/list.md](contact/list.md) |
| `contact remove` | [contact/remove.md](contact/remove.md) |
| `contract` (group) | [contract/index.md](contract/index.md) |
| `contract call` | [contract/call.md](contract/call.md) |
| `contract send` | [contract/send.md](contract/send.md) |
| `contract deploy` | [contract/deploy.md](contract/deploy.md) |
| `contract info` | [contract/info.md](contract/info.md) |
| `contract clear-abi` | [contract/clear-abi.md](contract/clear-abi.md) |
| `contract set-origin-energy-limit` | [contract/set-origin-energy-limit.md](contract/set-origin-energy-limit.md) |
| `contract set-user-resource-percent` | [contract/set-user-resource-percent.md](contract/set-user-resource-percent.md) |
| `contract create2` | [contract/create2.md](contract/create2.md) |
| `gasfree` (group) | [gasfree/index.md](gasfree/index.md) |
| `gasfree info` | [gasfree/info.md](gasfree/info.md) |
| `gasfree transfer` | [gasfree/transfer.md](gasfree/transfer.md) |
| `gasfree trace` | [gasfree/trace.md](gasfree/trace.md) |

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

## Governance

| Command | Page |
|---|---|
| `proposal` (group) | [proposal/index.md](proposal/index.md) |
| `proposal list` | [proposal/list.md](proposal/list.md) |
| `proposal show` | [proposal/show.md](proposal/show.md) |
| `proposal create` | [proposal/create.md](proposal/create.md) |
| `proposal approve` | [proposal/approve.md](proposal/approve.md) |
| `proposal delete` | [proposal/delete.md](proposal/delete.md) |
| `witness` (group) | [witness/index.md](witness/index.md) |
| `witness create` | [witness/create.md](witness/create.md) |
| `witness update` | [witness/update.md](witness/update.md) |
| `witness set-brokerage` | [witness/set-brokerage.md](witness/set-brokerage.md) |

## TRC10 assets and the on-chain exchange

| Command | Page |
|---|---|
| `asset` (group) | [asset/index.md](asset/index.md) |
| `asset issue` | [asset/issue.md](asset/issue.md) |
| `asset update` | [asset/update.md](asset/update.md) |
| `asset participate` | [asset/participate.md](asset/participate.md) |
| `asset unfreeze` | [asset/unfreeze.md](asset/unfreeze.md) |
| `asset info` | [asset/info.md](asset/info.md) |
| `asset list` | [asset/list.md](asset/list.md) |
| `exchange` (group) | [exchange/index.md](exchange/index.md) |
| `exchange create` | [exchange/create.md](exchange/create.md) |
| `exchange inject` | [exchange/inject.md](exchange/inject.md) |
| `exchange withdraw` | [exchange/withdraw.md](exchange/withdraw.md) |
| `exchange trade` | [exchange/trade.md](exchange/trade.md) |
| `exchange show` | [exchange/show.md](exchange/show.md) |
| `exchange list` | [exchange/list.md](exchange/list.md) |

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
| `encoding` (group) | [encoding/index.md](encoding/index.md) |
| `encoding convert` | [encoding/convert.md](encoding/convert.md) |
| `address` (group) | [address/index.md](address/index.md) |
| `address generate` | [address/generate.md](address/generate.md) |
| `config` | [config.md](config.md) |
| `networks` | [networks.md](networks.md) |

## Global options (every command)

```
-o, --output <text|json>   result format (default: config.defaultOutput, built-in text)
--network <string>         network id or alias, e.g. nile, sepolia, bsc, evm:11155111
                           (falls back to config.defaultNetwork)
--account <string>         accountId, label, or address (wallet-bound commands; falls back to active)
--timeout <number>         per RPC/device call timeout, ms (default: config.timeoutMs, built-in 60000)
-v, --verbose              extra diagnostic output
-h, --help / -V, --version
```

Broadcast (✍️) commands additionally take `--wait` / `--wait-timeout <ms>` (cap default: config `waitTimeoutMs`, built-in 60000) and the early-exit modes `--dry-run` / `--sign-only` / `--build-only`.

Fee and multi-sig flags are **family-scoped**, so they are not global:

| Flags | Family | Where |
|---|---|---|
| Permission group and expiry — see below | TRON | every TRON broadcast command |
| `--fee-limit <sun>` | TRON | the commands that spend energy: `tx send`, `contract send` / `deploy` |
| `--gas-limit <n>` / `--max-fee <gwei>` / `--priority-fee <gwei>` / `--nonce <n>` | EVM | `tx send`, `contract send` / `deploy` |

Every TRON broadcast command takes the multi-signature pair: the permission group to sign under (0=owner, 1=witness, 2-9=active) and the transaction's expiry, which extends the window for collecting co-signatures. On a multi-family command they are tagged `(tron only)` and refused on EVM with `invalid_option`; an EVM transaction carries exactly one signature, so neither has a counterpart there.

The three early-exit modes are mutually exclusive, and `--expiration` is accepted only alongside `--sign-only` or `--build-only`. Breaking either rule is a usage error at exit `2`. The code depends on where the check runs: on the governance writes it is `invalid_value`, and the message names the field as `--input` rather than the flags you passed — for example `invalid --input: choose at most one of --dry-run, --sign-only, --build-only`. Elsewhere the same conflict reports `invalid_option`. Branch on the exit code, not on the code string; see [machine interface](../machine-interface.md#error-codes).
