# wallet-cli — TypeScript implementation

The agent-first implementation of wallet-cli, built for automation: every command has a stable JSON envelope, deterministic exit codes, and discoverable schemas; interactive prompts are kept only for secret input (import / backup / delete). For what wallet-cli is and how the two implementations compare, see the [repository overview](../README.md); for the original, see the [Java implementation](../java/README.md).

## Key features

- **Agent-first** — stable JSON output, deterministic exit codes, and discoverable schemas, built for scripts, CI, and AI agents (details in [The contract, in one paragraph](#the-contract-in-one-paragraph)).
- **Encrypted local storage** — software keystores are encrypted on disk; secrets are never passed via argv or environment variables.
- **Software and Ledger signing** — sign in software, or on a Ledger device (the private key never leaves the device).
- **Covers the main TRON capabilities** — HD wallets, TRX and TRC20/TRC10 transfers, staking / resource delegation, voting / rewards, smart-contract calls and deployment, message and EIP-712/TIP-712 signing, and on-chain queries.

## Supported chains

Three TRON networks are supported today. Networks are identified by a canonical `family:chain` id (all `tron` today):

| Network id | What it is | TRX value |
|---|---|---|
| `tron:mainnet` | Production mainnet | **Real funds** |
| `tron:nile` | Primary testnet (faucet at nileex.io) | None — use freely |
| `tron:shasta` | Alternate testnet | None |

Your address is the same on every network, but balances, tokens, and transactions are isolated per network. Fees use TRON's `tron-resource` model (bandwidth + energy) rather than EVM gas — see [networks](docs/concepts/networks.md) and [energy & bandwidth](docs/concepts/energy-bandwidth.md).

## Install

**Prerequisites**: [Node.js](https://nodejs.org) **20 or later** (`node --version` to check). Ledger signing additionally needs a supported Ledger device with the TRON app installed — see the [Ledger guide](docs/guide/ledger.md).

```bash
npm install -g @tron-walletcli/wallet-cli
```

Note the scope: the package is `@tron-walletcli/wallet-cli`, not the bare `wallet-cli` name (which is an unrelated third-party package).

Verify:

```bash
wallet-cli --version
```

```console
<version>          # shows the installed version
```

Upgrade with `npm update -g @tron-walletcli/wallet-cli`; uninstall with `npm uninstall -g @tron-walletcli/wallet-cli`.

**From source** (contributors, or to run unreleased changes) — additionally requires Git:

```bash
git clone https://github.com/tronprotocol/wallet-cli.git
cd wallet-cli/ts
npm ci && npm run build
npm link             # puts `wallet-cli` on your PATH (or run: node dist/index.js)
```

**Create your first wallet.** `create` prompts for a master password, then shows the new account:

```bash
wallet-cli create --label main
```

```console
✅ Created wallet "main"
  Account ID    wlt_2dbv24de.0
  TRON address  TTVdGTBXY5mmY3nJFGUp7Vo898kUJ6gtFQ
  Active        yes
```

```bash
wallet-cli list
```

```console
HD  wlt_2dbv24de
└─ [0] main  TTVdGTBXY5mmY3nJFGUp7Vo898kUJ6gtFQ  (active)
```

Next: fund it on a testnet, check the balance, and send TRX → [Getting started](docs/guide/getting-started.md).

## Start here

- 🚀 **First time?** → [Getting started: create a wallet and send your first transaction](docs/guide/getting-started.md)
- 📖 **Looking up a command?** → [Command index](#commands) below, or `wallet-cli <command> --help`
- 🤖 **Calling from a script, CI, or an AI agent?** → [Machine interface: JSON envelope, exit codes, script safety](docs/machine-interface.md) · [Agent skill](skills/wallet-cli/SKILL.md)
- 🔐 **Using a Ledger hardware wallet?** → [Ledger guide](docs/guide/ledger.md)
- 🧭 **Something failed?** → [Troubleshooting](docs/troubleshooting.md)

## The contract, in one paragraph

Every command supports `-o json` and then prints **exactly one** terminal JSON frame on stdout, schema [`wallet-cli.result.v1`](docs/machine-interface.md#the-result-envelope). Exit codes are fixed: `0` success, `1` execution failure, `2` usage error. Secrets (passwords, mnemonics, private keys) are never accepted via argv or environment variables — only via stdin flags or interactive TTY prompts; mnemonic/private-key import and `change-password` are interactive-only (no stdin path at all). Details: [machine-interface.md](docs/machine-interface.md).

## Commands

Every command — including every subcommand — has a reference page; run `wallet-cli <command> --help` for the built-in equivalent.

### Wallets and accounts

| Command | Description |
|---|---|
| [`create`](docs/commands/create.md) | Create a new HD wallet (BIP39 seed) |
| [`import mnemonic`](docs/commands/import/mnemonic.md) | Import a BIP39 mnemonic phrase (interactive-only) |
| [`import private-key`](docs/commands/import/private-key.md) | Import a raw private key (interactive-only) |
| [`import ledger`](docs/commands/import/ledger.md) | Register a Ledger account (watch-only; signs on device) |
| [`import watch`](docs/commands/import/watch.md) | Register a watch-only address (no secret) |
| [`list`](docs/commands/list.md) | List wallets / accounts |
| [`use`](docs/commands/use.md) / [`current`](docs/commands/current.md) | Set / show the active account |
| [`derive`](docs/commands/derive.md) | Derive the next HD account from a seed wallet |
| [`rename`](docs/commands/rename.md) / [`backup`](docs/commands/backup.md) / [`delete`](docs/commands/delete.md) | Manage accounts (backup writes secret + metadata, mode 0600) |
| [`change-password`](docs/commands/change-password.md) | Change the master password (re-encrypt all software keystores) |

### Transactions

| Command | Description |
|---|---|
| [`tx send`](docs/commands/tx/send.md) | Send native TRX or TRC20/TRC10 tokens |
| [`tx sign`](docs/commands/tx/sign.md) | Sign a transaction built elsewhere, without broadcasting |
| [`tx broadcast`](docs/commands/tx/broadcast.md) | Broadcast a presigned transaction |
| [`tx status`](docs/commands/tx/status.md) | Show confirmation status (confirmed / failed / pending / not_found) |
| [`tx info`](docs/commands/tx/info.md) | Show full transaction detail + receipt |

### On-chain queries

| Command | Description |
|---|---|
| [`account balance`](docs/commands/account/balance.md) | Show the native TRX balance |
| [`account info`](docs/commands/account/info.md) | Show raw account data incl. resources |
| [`account history`](docs/commands/account/history.md) | Show transaction history (requires TronGrid) |
| [`account portfolio`](docs/commands/account/portfolio.md) | Native + token balances with best-effort USD value |
| [`block`](docs/commands/block.md) | Get a block (latest if omitted) |
| [`chain params`](docs/commands/chain/params.md) | On-chain governance parameters |
| [`chain prices`](docs/commands/chain/prices.md) | Energy/bandwidth unit price and memo fee |
| [`chain node`](docs/commands/chain/node.md) | Connected node status (version / sync / peers) |

### Tokens, contracts, staking, signing

| Command | Description |
|---|---|
| [`token`](docs/commands/token/index.md) | Manage the token address book and query tokens ([balance](docs/commands/token/balance.md) · [info](docs/commands/token/info.md) · [add](docs/commands/token/add.md) · [list](docs/commands/token/list.md) · [remove](docs/commands/token/remove.md)) |
| [`contract`](docs/commands/contract/index.md) | Call, send, deploy, and inspect smart contracts ([call](docs/commands/contract/call.md) · [send](docs/commands/contract/send.md) · [deploy](docs/commands/contract/deploy.md) · [info](docs/commands/contract/info.md)) |
| [`stake`](docs/commands/stake/index.md) | Stake / delegate resources & query state ([freeze](docs/commands/stake/freeze.md) · [unfreeze](docs/commands/stake/unfreeze.md) · [withdraw](docs/commands/stake/withdraw.md) · [cancel-unfreeze](docs/commands/stake/cancel-unfreeze.md) · [delegate](docs/commands/stake/delegate.md) · [undelegate](docs/commands/stake/undelegate.md) · [info](docs/commands/stake/info.md) · [delegated](docs/commands/stake/delegated.md)) |
| [`vote`](docs/commands/vote/index.md) | Vote for super representatives ([cast](docs/commands/vote/cast.md) · [list](docs/commands/vote/list.md) · [status](docs/commands/vote/status.md)) |
| [`reward`](docs/commands/reward/index.md) | Query / withdraw voting rewards ([balance](docs/commands/reward/balance.md) · [withdraw](docs/commands/reward/withdraw.md)) |
| [`message`](docs/commands/message/index.md) | Sign arbitrary messages ([sign](docs/commands/message/sign.md)) |
| [`typed-data`](docs/commands/typed-data/index.md) | Sign EIP-712 / TIP-712 structured data ([sign](docs/commands/typed-data/sign.md)) |

### Local configuration

| Command | Description |
|---|---|
| [`config`](docs/commands/config.md) | Show / get / set configuration values |
| [`networks`](docs/commands/networks.md) | List known networks (`tron:mainnet`, `tron:nile`, `tron:shasta`) |

## Documentation map

| You want to… | Read |
|---|---|
| Learn by doing | [guide/](docs/guide/index.md) — [getting started](docs/guide/getting-started.md) · [sending tokens](docs/guide/send-tokens.md) · [staking](docs/guide/stake-and-resources.md) · [Ledger](docs/guide/ledger.md) · [scripting](docs/guide/scripting.md) |
| Look up a command | [commands/](docs/commands/index.md) |
| Integrate programmatically | [machine-interface.md](docs/machine-interface.md) |
| Understand TRON mechanics | [concepts/](docs/concepts/index.md) — [networks](docs/concepts/networks.md) · [accounts & HD](docs/concepts/accounts-and-hd.md) · [energy & bandwidth](docs/concepts/energy-bandwidth.md) · [security](docs/concepts/security.md) |
| Fix an error | [troubleshooting.md](docs/troubleshooting.md) |

> All copy-pasteable examples in this documentation run against the **Nile testnet** (`--network tron:nile`). Mainnet commands move real funds; they appear only as annotated, non-copyable descriptions.
