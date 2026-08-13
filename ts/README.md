# wallet-cli — TypeScript implementation

The agent-first implementation of wallet-cli, built for automation: every command has a stable JSON envelope, deterministic exit codes, and discoverable schemas; interactive prompts are kept only for secret input (import / backup / delete). For what wallet-cli is and how the two implementations compare, see the [repository overview](../README.md); for the original, see the [Java implementation](../java/README.md).

## Key features

- **Agent-first** — stable JSON output, deterministic exit codes, and discoverable schemas, built for scripts, CI, and AI agents (details in [The contract, in one paragraph](#the-contract-in-one-paragraph)).
- **Encrypted local storage** — software keystores are encrypted on disk; secrets are never passed via argv or environment variables.
- **Software and Ledger signing** — sign in software, or on a Ledger device (the private key never leaves the device).
- **Covers the main TRON capabilities** — HD wallets, TRX and TRC20/TRC10 transfers, staking / resource delegation, voting / rewards, smart-contract calls and deployment, message and EIP-712/TIP-712 signing, and on-chain queries.
- **Multi-signature end to end** — inspect and replace [account permissions](docs/commands/permission/index.md), then collect signatures either offline by passing a transaction artifact between signers or through the TronLink service, with approval weight and threshold visible at every step.
- **Gas-free transfers** — move USDT and other supported tokens with [no TRX at all](docs/commands/gasfree/index.md), paying the fee in the token itself via the GasFree Open Platform.

## Table of contents

- [Supported chains](#supported-chains)
- [Install](#install)
- [Quickstart](#quickstart)
- [Commands](#commands)
  - [Wallets and accounts](#wallets-and-accounts)
  - [Transactions](#transactions)
  - [On-chain queries](#on-chain-queries)
  - [Tokens, contracts, staking, signing](#tokens-contracts-staking-signing)
  - [Local tools and configuration](#local-tools-and-configuration)
- [The contract, in one paragraph](#the-contract-in-one-paragraph)
- [Understanding TRON mechanics](#understanding-tron-mechanics)
- [Troubleshooting](#troubleshooting)

## Supported chains

Three TRON networks are supported today. Networks are identified by a canonical `family:chain` id (all `tron` today):

| Network id | What it is | TRX value |
|---|---|---|
| `tron:mainnet` | Production mainnet | **Real funds** |
| `tron:nile` | Primary testnet (faucet at nileex.io) | None — use freely |
| `tron:shasta` | Alternate testnet | None |

Your address is the same on every network, but balances, tokens, and transactions are isolated per network. Fees use TRON's `tron-resource` model (bandwidth + energy) rather than EVM gas — see [networks](docs/concepts/networks.md) and [energy & bandwidth](docs/concepts/energy-bandwidth.md).

## Install

### Standalone executable

After a change lands on `develop`, download `wallet-cli-standalone-<commit>` from the successful [TypeScript Standalone Artifacts workflow](https://github.com/tronprotocol/wallet-cli/actions/workflows/ts-standalone-release.yml). GitHub wraps the artifact in a zip containing all five platform archives, `SHA256SUMS.txt`, and `BUILD_METADATA.txt`. The executables contain the runtime and JavaScript dependencies, including Ledger HID support; Node.js, Bun, and npm are not required. Linux remains dynamically linked to the system ABI: it requires glibc 2.35 or later, and Ledger access requires `libudev.so.1` plus permission to open the device.

| System | Artifact archive | Runtime requirements |
|---|---|---|
| macOS Apple Silicon | `wallet-cli-<version>-macos-arm64.tar.gz` | — |
| macOS Intel | `wallet-cli-<version>-macos-x64.tar.gz` | — |
| Linux ARM64 | `wallet-cli-<version>-linux-arm64.tar.gz` | glibc 2.35+; `libudev.so.1` for Ledger |
| Linux x64 | `wallet-cli-<version>-linux-x64.tar.gz` | glibc 2.35+; `libudev.so.1` for Ledger |
| Windows x64 | `wallet-cli-<version>-windows-x64.zip` | — |

Example for Linux x64:

```bash
unzip "wallet-cli-standalone-<commit>.zip" -d wallet-cli-artifacts
cd wallet-cli-artifacts
sha256sum --check --ignore-missing SHA256SUMS.txt
archive="$(find . -maxdepth 1 -name 'wallet-cli-*-linux-x64.tar.gz' -print -quit)"
gh attestation verify "$archive" --repo tronprotocol/wallet-cli
tar -xzf "$archive"
package="${archive#./}"
sudo install -m 0755 "${package%.tar.gz}/wallet-cli" /usr/local/bin/wallet-cli
wallet-cli --version
```

On Linux, `ldconfig -p | grep -F libudev.so.1` checks whether the Ledger runtime library is available; Debian and Ubuntu provide it in the `libudev1` package. Device access also needs the Ledger udev rules described in the [Ledger guide](docs/guide/ledger.md). Minimal containers must expose the host's HID device as well as providing the library.

On Windows, extract the zip and put its directory on `PATH`. On macOS, use the matching archive and install the same way; release binaries carry an ad-hoc code signature, not Apple notarization. If Gatekeeper quarantines a checksum-verified download, remove the quarantine attribute from that executable with `xattr -d com.apple.quarantine /path/to/wallet-cli`.

Every successful standalone run includes `SHA256SUMS.txt` and GitHub/Sigstore build provenance for each archive. `gh attestation verify` is optional, but the checksum must be verified before installation. Actions retains the combined artifact for 30 days.

### npm

The npm package remains available when Node.js **20 or later** is already installed:

```bash
npm install -g @tron-walletcli/wallet-cli
```

The package is `@tron-walletcli/wallet-cli`, not the unrelated bare `wallet-cli` package. Upgrade with `npm update -g @tron-walletcli/wallet-cli`; uninstall with `npm uninstall -g @tron-walletcli/wallet-cli`.

Ledger signing additionally needs a supported Ledger device with the TRON app installed — see the [Ledger guide](docs/guide/ledger.md).

**From source** (contributors, or to run unreleased changes) requires Node.js 20+, npm, and Git:

```bash
git clone https://github.com/tronprotocol/wallet-cli.git
cd wallet-cli/ts
npm ci && npm run build
npm link             # puts `wallet-cli` on your PATH (or run: node dist/index.js)
```

`npm ci` also installs the exact Bun version pinned in `devDependencies`, so contributors can run
`npm run build:standalone` without a global Bun installation.

Every update to `develop`, including a merged pull request, runs the standalone workflow. It builds each executable on a runner with the same OS and CPU architecture, exercises the embedded Ledger addon, and stores the five archives plus checksums and build metadata as an Actions artifact. Tag and Release events do not trigger this workflow; maintainers can also start it manually from the Actions page.

## Quickstart

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

The full flow — fund it on a testnet, check the balance, send your first TRX — is in the [getting-started guide](docs/guide/getting-started.md). From there, go deeper by topic: [sending tokens](docs/guide/send-tokens.md) · [staking & resources](docs/guide/stake-and-resources.md) · [using a Ledger hardware wallet](docs/guide/ledger.md) · [scripting](docs/guide/scripting.md).

## Commands

Every command — including every subcommand — has its own reference page; the full per-command list is in the **[command index](docs/commands/index.md)**, and `wallet-cli <command> --help` is the built-in equivalent.

### Wallets and accounts

Create, import, and manage local wallets and accounts.

| Command | Description |
|---|---|
| [`create`](docs/commands/create.md) | Create a new HD wallet (BIP39 seed) |
| `import` | Import a wallet — [mnemonic](docs/commands/import/mnemonic.md) · [private-key](docs/commands/import/private-key.md) · [ledger](docs/commands/import/ledger.md) · [watch](docs/commands/import/watch.md)-only |
| [`list`](docs/commands/list.md) | List wallets and accounts |
| [`use`](docs/commands/use.md) · [`current`](docs/commands/current.md) | Set / show the active account (`current --qr` for a receive QR) |
| [`derive`](docs/commands/derive.md) | Derive the next HD account from a seed wallet |
| [`rename`](docs/commands/rename.md) · [`backup`](docs/commands/backup.md) · [`delete`](docs/commands/delete.md) | Rename, back up, or delete an account (backup writes secret + metadata, mode 0600) |
| [`change-password`](docs/commands/change-password.md) | Change the master password (re-encrypt all software keystores) |
| [`address generate`](docs/commands/address/generate.md) | Generate a keypair locally, without adding it to the wallet |

### Transactions

Send, broadcast, inspect, and co-sign transactions.

| Command | Description |
|---|---|
| [`tx send`](docs/commands/tx/send.md) | Send native TRX or TRC20/TRC10 tokens |
| [`tx broadcast`](docs/commands/tx/broadcast.md) | Broadcast a presigned transaction |
| [`tx status`](docs/commands/tx/status.md) · [`tx info`](docs/commands/tx/info.md) | Confirmation status, or full detail + receipt |
| [`tx sign`](docs/commands/tx/sign.md) · [`tx approvals`](docs/commands/tx/approvals.md) · [`tx multisig`](docs/commands/tx/multisig.md) | Co-sign multi-sig transactions and inspect approvals |

### Multi-signature permissions

| Command | Description |
|---|---|
| [`permission show`](docs/commands/permission/show.md) | Show owner, witness, and active permission groups with decoded operations |
| [`permission update`](docs/commands/permission/update.md) | Replace the complete permission structure — **can permanently lock the account** |

### Gas-free transfers

Send tokens with no TRX: sign a TIP-712 authorization and let the GasFree provider broadcast, taking its fee in the transferred token. Needs credentials via [`config`](docs/commands/config.md); unavailable on `tron:shasta`.

| Command | Description |
|---|---|
| [`gasfree info`](docs/commands/gasfree/info.md) | GasFree address, activation status, nonce, balances, and fees |
| [`gasfree transfer`](docs/commands/gasfree/transfer.md) | Sign and submit a TIP-712 GasFree token transfer |
| [`gasfree trace`](docs/commands/gasfree/trace.md) | Track a submitted transfer to its terminal state |

### On-chain queries

Read account, block, and chain state.

| Command | Description |
|---|---|
| [`account balance`](docs/commands/account/balance.md) · [`info`](docs/commands/account/info.md) · [`portfolio`](docs/commands/account/portfolio.md) | Balance, raw account data, or balances with USD estimate |
| [`account history`](docs/commands/account/history.md) | Transaction history (requires TronGrid) |
| [`account activate`](docs/commands/account/activate.md) · [`set`](docs/commands/account/set.md) | Activate an account, or set its on-chain name / ID |
| [`block`](docs/commands/block.md) | Get a block (latest if omitted) |
| [`chain params`](docs/commands/chain/params.md) · [`prices`](docs/commands/chain/prices.md) · [`node`](docs/commands/chain/node.md) | Governance params, resource prices, or node status |

### Tokens, contracts, staking, signing

Token and contract operations, resource staking, voting rewards, message signing, and permissions.

| Command | Description |
|---|---|
| [`token`](docs/commands/token/index.md) | Token address book and queries ([balance](docs/commands/token/balance.md) · [info](docs/commands/token/info.md) · [add](docs/commands/token/add.md) · [list](docs/commands/token/list.md) · [remove](docs/commands/token/remove.md)) |
| [`contact`](docs/commands/contact/index.md) | Recipient contact book ([add](docs/commands/contact/add.md) · [list](docs/commands/contact/list.md) · [remove](docs/commands/contact/remove.md)) |
| [`contract`](docs/commands/contract/index.md) | Call, send, deploy, inspect contracts ([call](docs/commands/contract/call.md) · [send](docs/commands/contract/send.md) · [deploy](docs/commands/contract/deploy.md) · [info](docs/commands/contract/info.md)) |
| [`stake`](docs/commands/stake/index.md) | Stake / delegate resources ([freeze](docs/commands/stake/freeze.md) · [unfreeze](docs/commands/stake/unfreeze.md) · [delegate](docs/commands/stake/delegate.md) · [info](docs/commands/stake/info.md), …) |
| [`vote`](docs/commands/vote/index.md) · [`reward`](docs/commands/reward/index.md) | Vote for super representatives and claim voting rewards |
| [`message`](docs/commands/message/index.md) · [`typed-data`](docs/commands/typed-data/index.md) | Sign arbitrary messages, or EIP-712/TIP-712 structured data |
| [`permission`](docs/commands/permission/index.md) | View / update account permissions for multi-sig |
| [`gasfree`](docs/commands/gasfree/index.md) | Gas-free token transfers via the GasFree service |
| [`typed-data`](docs/commands/typed-data/index.md) | Sign EIP-712 / TIP-712 structured data ([sign](docs/commands/typed-data/sign.md)) |

### Local tools and configuration

Offline local commands and configuration.

| Command | Description |
|---|---|
| [`encoding convert`](docs/commands/encoding/convert.md) | Convert / validate addresses and encodings |
| [`address generate`](docs/commands/address/generate.md) | Generate a random keypair (local, not stored) |
| [`config`](docs/commands/config.md) | Show / get / set configuration values |
| [`networks`](docs/commands/networks.md) | List known networks |

## The contract, in one paragraph

Every command supports `-o json` and then prints **exactly one** terminal JSON frame on stdout, schema [`wallet-cli.result.v1`](docs/machine-interface.md#the-result-envelope). Exit codes are fixed: `0` success, `1` execution failure, `2` usage error. Secrets (passwords, mnemonics, private keys) are never accepted via argv or environment variables — only via stdin flags or interactive TTY prompts; mnemonic/private-key import and `change-password` are interactive-only (no stdin path at all). Full spec: [machine-interface.md](docs/machine-interface.md); for calling from an AI agent, see the [Agent skill](skills/wallet-cli/SKILL.md).

## Understanding TRON mechanics

TRON differs a lot from EVM chains in fees, accounts, and key permissions — these are worth understanding up front to avoid surprises:

- [Networks](docs/concepts/networks.md) — the three networks and the `family:chain` id
- [Accounts & HD](docs/concepts/accounts-and-hd.md) — mnemonics, derivation paths, account activation
- [Energy & bandwidth](docs/concepts/energy-bandwidth.md) — TRON's resource-based fee model (in place of EVM gas)
- [Security](docs/concepts/security.md) — keystore encryption, secret handling, multi-sig permissions

## Troubleshooting

A command errored or behaved unexpectedly? Common issues and how to diagnose them are in [troubleshooting.md](docs/troubleshooting.md).

> All copy-pasteable examples in this documentation run against the **Nile testnet** (`--network tron:nile`). Mainnet commands move real funds; they appear only as annotated, non-copyable descriptions.
