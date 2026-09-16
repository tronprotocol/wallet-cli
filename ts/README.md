# wallet-cli — TypeScript implementation

The agent-first implementation of wallet-cli, built for automation: every command has a stable JSON envelope, deterministic exit codes, and discoverable schemas; interactive prompts are kept to a short allowlist — `create`, the `import` variants, `backup`, `change-password` and `delete` — and everywhere else a missing credential is an error, never a prompt. For what wallet-cli is and how the two implementations compare, see the [repository overview](../README.md); for the original, see the [Java implementation](../java/README.md).

## Key features

- **Agent-first** — stable JSON output, deterministic exit codes, and discoverable schemas, built for scripts, CI, and AI agents (details in [The contract, in one paragraph](#the-contract-in-one-paragraph)).
- **Encrypted local storage** — software keystores are encrypted on disk; secrets enter via stdin/TTY, never argv or dedicated secret environment variables.
- **Software and Ledger signing** — sign in software, or on a Ledger device (the private key never leaves the device).
- **Covers the full TRON feature surface** — HD wallets, TRX and TRC20/TRC10 transfers, staking / resource delegation, voting / rewards, governance proposals and super-representative operation, smart-contract calls, deployment and governance, TRC10 issuance, the on-chain Bancor exchange, multi-sig, GasFree transfers, message signing, and on-chain queries.

## Table of contents

- [Supported chains](#supported-chains)
- [Install](#install)
- [Quickstart](#quickstart)
- [Commands](#commands)
  - [Wallets and accounts](#wallets-and-accounts)
  - [Transactions](#transactions)
  - [On-chain queries](#on-chain-queries)
  - [Tokens, contracts, staking, signing](#tokens-contracts-staking-signing)
  - [Governance, TRC10, and the on-chain exchange](#governance-trc10-and-the-on-chain-exchange)
  - [Local tools and configuration](#local-tools-and-configuration)
- [The contract, in one paragraph](#the-contract-in-one-paragraph)
- [Understanding TRON mechanics](#understanding-tron-mechanics)
- [Troubleshooting](#troubleshooting)

## Supported chains

Nine built-in networks are supported. Networks use a canonical [CAIP-2](https://chainagnostic.org/CAIPs/caip-2) `namespace:reference` id. The namespace is not the family: `eip155` is CAIP-2's namespace for EVM chains, while the family this CLI branches on is `evm`.

| Network id        | Family | Native coin | Environment                              |
| ----------------- | ------ | ----------- | ---------------------------------------- |
| `tron:728126428`  | TRON   | TRX         | Mainnet — **real funds**                 |
| `tron:3448148188` | TRON   | TRX         | Testnet                                  |
| `tron:2494104990` | TRON   | TRX         | Testnet                                  |
| `eip155:1`        | EVM    | ETH         | Ethereum mainnet — **real funds**        |
| `eip155:11155111` | EVM    | ETH         | Sepolia testnet                          |
| `eip155:56`       | EVM    | BNB         | BNB Smart Chain mainnet — **real funds** |
| `eip155:97`       | EVM    | BNB         | BNB Smart Chain testnet                  |
| `eip155:8453`     | EVM    | ETH         | Base mainnet — **real funds**            |
| `eip155:84532`    | EVM    | ETH         | Base Sepolia testnet                     |

One seed produces a TRON address and a different EVM address. Each address is reused within its family, while balances, tokens, and transactions remain isolated per network. TRON uses the `tron-resource` fee model (bandwidth + energy); EVM networks use gas. See [networks](docs/concepts/networks.md) and [energy & bandwidth](docs/concepts/energy-bandwidth.md).

## Install

**Prerequisites**: [Node.js](https://nodejs.org) **20 or later** (`node --version` to check). Ledger signing additionally needs a supported Ledger device with the app for the selected family installed — TRON for TRON accounts, Ethereum for EVM accounts. See the [Ledger guide](docs/guide/ledger.md).

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

## Quickstart

**Create your first wallet.** `create` prompts for a master password, then shows the new account:

```bash
wallet-cli create --label main
```

```console
✅ Created wallet "main"
  Account ID    wlt_2dbv24de.0
  Type          HD
  TRON address  TTVdGTBXY5mmY3nJFGUp7Vo898kUJ6gtFQ
  EVM address   0x5c8e1b04A7f39d62C0B3e85A1d47F9028b6ce713
  Active        yes

⚠️ Recovery phrase is encrypted locally and was not printed.
⚠️ Run `backup` soon and store the file offline.
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

| Command                                                                                                         | Description                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`create`](docs/commands/create.md)                                                                             | Create a new HD wallet (BIP39 seed)                                                                                                                                                                                                                         |
| `import`                                                                                                        | Import a wallet — [mnemonic](docs/commands/import/mnemonic.md) · [private-key](docs/commands/import/private-key.md) · [keystore](docs/commands/import/keystore.md) · [ledger](docs/commands/import/ledger.md) · [watch](docs/commands/import/watch.md)-only |
| [`list`](docs/commands/list.md)                                                                                 | List wallets and accounts                                                                                                                                                                                                                                   |
| [`use`](docs/commands/use.md) · [`current`](docs/commands/current.md)                                           | Set / show the active account (`current --qr` for a receive QR)                                                                                                                                                                                             |
| [`derive`](docs/commands/derive.md)                                                                             | Derive the next HD account from a seed wallet                                                                                                                                                                                                               |
| [`rename`](docs/commands/rename.md) · [`backup`](docs/commands/backup.md) · [`delete`](docs/commands/delete.md) | Rename, back up, or delete an account (backup writes secret + metadata, mode 0600; `--keystore` for Web3 keystore format, `--records` for the export audit log)                                                                                             |
| [`change-password`](docs/commands/change-password.md)                                                           | Change the master password (re-encrypt all software keystores)                                                                                                                                                                                              |

### Transactions

Send, broadcast, inspect, and co-sign transactions.

| Command                                                                                                                                 | Description                                          |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [`tx send`](docs/commands/tx/send.md)                                                                                                   | Send native TRX or TRC20/TRC10 tokens                |
| [`tx broadcast`](docs/commands/tx/broadcast.md)                                                                                         | Broadcast a presigned transaction                    |
| [`tx status`](docs/commands/tx/status.md) · [`tx info`](docs/commands/tx/info.md)                                                       | Confirmation status, or full detail + receipt        |
| [`tx sign`](docs/commands/tx/sign.md) · [`tx approvals`](docs/commands/tx/approvals.md) · [`tx multisig`](docs/commands/tx/multisig.md) | Co-sign multi-sig transactions and inspect approvals |

### On-chain queries

Read account, block, and chain state.

| Command                                                                                                                                             | Description                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [`account balance`](docs/commands/account/balance.md) · [`info`](docs/commands/account/info.md) · [`portfolio`](docs/commands/account/portfolio.md) | Balance, raw account data, or balances with USD estimate |
| [`account history`](docs/commands/account/history.md)                                                                                               | Transaction history (requires TronGrid)                  |
| [`account activate`](docs/commands/account/activate.md) · [`set`](docs/commands/account/set.md)                                                     | Activate an account, or set its on-chain name / ID       |
| [`block`](docs/commands/block.md)                                                                                                                   | Get a block (latest if omitted)                          |
| [`chain params`](docs/commands/chain/params.md) · [`prices`](docs/commands/chain/prices.md) · [`node`](docs/commands/chain/node.md)                 | Governance params, resource prices, or node status       |

### Tokens, contracts, staking, signing

Token and contract operations, resource staking, voting rewards, message signing, and permissions.

| Command                                                                                         | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`token`](docs/commands/token/index.md)                                                         | Token address book and queries ([balance](docs/commands/token/balance.md) · [info](docs/commands/token/info.md) · [add](docs/commands/token/add.md) · [list](docs/commands/token/list.md) · [remove](docs/commands/token/remove.md))                                                                                                                                                                                                                                                          |
| [`contact`](docs/commands/contact/index.md)                                                     | Recipient contact book ([add](docs/commands/contact/add.md) · [list](docs/commands/contact/list.md) · [remove](docs/commands/contact/remove.md))                                                                                                                                                                                                                                                                                                                                              |
| [`contract`](docs/commands/contract/index.md)                                                   | Call, send, deploy, inspect, and govern contracts ([call](docs/commands/contract/call.md) · [send](docs/commands/contract/send.md) · [deploy](docs/commands/contract/deploy.md) · [info](docs/commands/contract/info.md) · [clear-abi](docs/commands/contract/clear-abi.md) · [set-origin-energy-limit](docs/commands/contract/set-origin-energy-limit.md) · [set-user-resource-percent](docs/commands/contract/set-user-resource-percent.md) · [create2](docs/commands/contract/create2.md)) |
| [`stake`](docs/commands/stake/index.md)                                                         | Stake / delegate resources ([freeze](docs/commands/stake/freeze.md) · [unfreeze](docs/commands/stake/unfreeze.md) · [delegate](docs/commands/stake/delegate.md) · [info](docs/commands/stake/info.md), …)                                                                                                                                                                                                                                                                                     |
| [`vote`](docs/commands/vote/index.md) · [`reward`](docs/commands/reward/index.md)               | Vote for super representatives and claim voting rewards                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| [`message`](docs/commands/message/index.md) · [`typed-data`](docs/commands/typed-data/index.md) | Sign arbitrary messages, or EIP-712/TIP-712 structured data                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| [`permission`](docs/commands/permission/index.md)                                               | View / update account permissions for multi-sig                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [`gasfree`](docs/commands/gasfree/index.md)                                                     | Gas-free token transfers via the GasFree service                                                                                                                                                                                                                                                                                                                                                                                                                                              |

### Governance, TRC10, and the on-chain exchange

Chain governance, super-representative operation, and TRON's protocol-level TRC10 and Bancor exchange mechanics.

| Command                                       | Description                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`proposal`](docs/commands/proposal/index.md) | Chain-parameter proposals ([list](docs/commands/proposal/list.md) · [show](docs/commands/proposal/show.md) · [create](docs/commands/proposal/create.md) · [approve](docs/commands/proposal/approve.md) · [delete](docs/commands/proposal/delete.md)) — `list` / `show` are open to anyone, the write commands require a registered witness                      |
| [`witness`](docs/commands/witness/index.md)   | Register and operate a super representative ([create](docs/commands/witness/create.md) · [update](docs/commands/witness/update.md) · [set-brokerage](docs/commands/witness/set-brokerage.md))                                                                                                                                                                   |
| [`asset`](docs/commands/asset/index.md)       | Issue and manage TRC10 tokens ([issue](docs/commands/asset/issue.md) · [update](docs/commands/asset/update.md) · [participate](docs/commands/asset/participate.md) · [unfreeze](docs/commands/asset/unfreeze.md) · [info](docs/commands/asset/info.md) · [list](docs/commands/asset/list.md)); TRC10 transfers go through [`tx send`](docs/commands/tx/send.md) |
| [`exchange`](docs/commands/exchange/index.md) | The protocol-level Bancor exchange between TRX and TRC10 ([create](docs/commands/exchange/create.md) · [inject](docs/commands/exchange/inject.md) · [withdraw](docs/commands/exchange/withdraw.md) · [trade](docs/commands/exchange/trade.md) · [show](docs/commands/exchange/show.md) · [list](docs/commands/exchange/list.md))                                |

### Local tools and configuration

Offline local commands and configuration.

| Command                                                 | Description                                   |
| ------------------------------------------------------- | --------------------------------------------- |
| [`encoding convert`](docs/commands/encoding/convert.md) | Convert / validate addresses and encodings    |
| [`address generate`](docs/commands/address/generate.md) | Generate a random keypair (local, not stored) |
| [`config`](docs/commands/config.md)                     | Show / get / set configuration values         |
| [`networks`](docs/commands/networks.md)                 | List known networks                           |

## The contract, in one paragraph

Every command supports `-o json` and then prints **exactly one** terminal JSON frame on stdout, schema [`wallet-cli.result.v1`](docs/machine-interface.md#the-result-envelope). Exit codes are fixed: `0` success, `1` execution failure, `2` usage error. Secrets (passwords, mnemonics, private keys) are never accepted via argv and are not read from dedicated secret environment variables. Passwords can enter through stdin flags or interactive TTY prompts; mnemonic/private-key import and `change-password` are interactive-only (no stdin path at all). Full spec: [machine-interface.md](docs/machine-interface.md).

## Understanding TRON mechanics

TRON differs a lot from EVM chains in fees, accounts, and key permissions — these are worth understanding up front to avoid surprises:

- [Networks](docs/concepts/networks.md) — built-in TRON/EVM networks and the CAIP-2 `namespace:reference` id
- [Accounts & HD](docs/concepts/accounts-and-hd.md) — mnemonics, derivation paths, account activation
- [Energy & bandwidth](docs/concepts/energy-bandwidth.md) — TRON's resource-based fee model (in place of EVM gas)
- [Security](docs/concepts/security.md) — keystore encryption, secret handling, multi-sig permissions

## Troubleshooting

A command errored or behaved unexpectedly? Common issues and how to diagnose them are in [troubleshooting.md](docs/troubleshooting.md).

> Copy-pasteable examples that spend anything target a testnet — **Nile** (`--network tron:3448148188`) on TRON, **Sepolia** (`--network eip155:11155111`) on EVM. Mainnet ids (`tron:728126428`, `eip155:1`) also appear: in read-only examples such as token-book listings and config paths, and in a few illustrations of mainnet token contracts. Those last ones carry placeholder recipients (`T...` / `0x...`) and are not runnable as written.

## ERC-8004 beta integration

The `8004` command group uses `@bankofai/8004-sdk@1.2.0-beta.1`.

```sh
wallet-cli 8004 show eip155:97:42 --network bsc-testnet --output json
wallet-cli 8004 register 'data:application/json;base64,eyJuYW1lIjoiRXhhbXBsZSJ9' --network nile --dry-run
wallet-cli 8004 approve 42 --revoke --network nile
wallet-cli 8004 operator-check <owner> <operator> --network nile
```

Agent IDs are decimal uint256 strings; scoped IDs must match the selected network.
HTTPS, IPFS and base64 JSON data registration URIs are supported (maximum 2048
characters on register/update). Metadata loading is bounded and failures preserve
chain fields with a warning. `show` and `operator-check` do not require a wallet.
Write commands retain the normal wallet transaction modes. `--wait` reports the
registered ID or re-reads URI/owner after successful confirmation; an unconfirmed
transaction is returned as submitted and must not be blindly retried.

Registry configuration stays in the SDK; signing and broadcasting stay in the wallet
transaction pipeline. See [the SDK integration](docs/development/erc8004-sdk-integration.md).

## B.AI usage and x402 providers

The v4.14 command names are:

| Group  | Commands                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------- |
| `x402` | `pay`, `serve`, `roundtrip`, `provider-list`, `provider-show`, `endpoint-list`, `update-catalog`         |
| `bai`  | `usage-summary`, `usage-records`, `recharge`, `report-recharge`, `recharge-orders`                       |
| `8004` | `show`, `register`, `update`, `transfer`, `approve`, `add-operator`, `remove-operator`, `operator-check` |

JSON command identifiers use these names, for example `bai.usage-summary`.
Scripts using earlier beta command names must switch to the names above.

```sh
wallet-cli bai usage-summary --output json
wallet-cli bai usage-records --limit 20 --output json
wallet-cli x402 provider-list --output json
```

`bai usage-summary` is the single account summary command (the former `bai status` entry was removed). It reads the service's `usage.summary`: current credit balance,
current-month spend, and monthly trend. It accepts no date filters and does not
aggregate usage records locally. `bai usage-records` exposes `hasMore` and
`nextCursor`; pass `--cursor` to continue listing records. B.AI account reads
require the configured API key but no wallet signature.

x402 payments use the selected wallet account through the payer signer bridge,
including the existing device precheck and signing ceremony. Payment guards
validate the declared payer and configured GasFree fee ceiling. Base USDC,
BSC, and TRON routes are supported according to the provider's challenge.

For `x402 pay`, `x402 roundtrip` and `bai recharge`, `--gasfree-relay official` (the default)
uses the SDK's credential-free proxy. `--gasfree-relay gasfree` reads the
configured GasFree Open API using `gasfreeApiKey` and `gasfreeApiSecret`;
missing credentials fail before payment. An HTTPS URL selects a custom relay
without forwarding those credentials. Selection controls the provider/account
information used to construct the authorization; the protected endpoint's
facilitator remains responsible for submitting it. Failed relay requests never
fall back to another relay or payment scheme.

Use `--max-gasfree-fee` or `--max-gasfree-fee-raw` to cap the fee authorized before
signing. Without a cap, the CLI warns about the maximum fee/payment ratio. A
maximum authorized fee is not evidence of the actual fee charged.

Provider queries prefer the local snapshot. Run `x402 update-catalog` to refresh
it; see [catalog caching](docs/concepts/provider-catalog.md).

### Facilitator compatibility

For TRON, local `x402 serve`, `x402 roundtrip` and `bai recharge` query the
configured facilitator's `/supported` endpoint before advertising the payment
requirement. The CLI matches the network, scheme and x402 version 2, then uses the
network spelling that the facilitator supports:

- Decimal only: use the decimal ID, such as `tron:3448148188`.
- Hexadecimal only: use the advertised hexadecimal ID, such as `tron:0xcd8690dc`.
- Both: prefer the canonical decimal ID.

Capability lookup failures, malformed responses and missing matching capabilities
stop the flow before signing. The selected representation stays consistent through
the challenge, payment payload, verify and settle requests. The CLI does not rewrite
signed payloads or retry settlement with another format after an error. CLI network
selection and server result fields retain canonical decimal IDs; settlement receipts
accept either representation of the same chain. EVM network IDs remain unchanged.
External providers remain responsible for their own facilitator compatibility.

### Local x402 server

`serve` and `roundtrip` accept either `--amount` or `--raw-amount`, and either
`--token` or `--asset`. An unregistered asset requires `--decimals`; registered
precision cannot be overridden. `--valid-for-seconds` sets authorization validity
(default 300 seconds).

```sh
wallet-cli x402 serve --network nile --token USDT --raw-amount 100 \
  --pay-to <recipient-address> --valid-for-seconds 300 --daemon --output json
```

The daemon returns its PID, payment URL and access-log path after the listener is
ready. Stop it with `kill -TERM <pid>`. Foreground access logs go to stderr; daemon
logs are written to a private file. Logs exclude query strings, headers and payment
bodies. `serve --resource-url` changes the advertised resource URL and `--host`
selects a loopback bind address. `roundtrip` always binds to loopback and closes its
server on completion; it does not accept `--host`, `--resource-url` or `--daemon`.

### B.AI setup, recharge and recovery

Before the first recharge, the selected wallet must already be bound to the B.AI
account. Configure the personal API key through stdin; setup verifies the binding
for the selected account and network before saving the key:

```sh
wallet-cli config baiApiKey --network tron --account payer --api-key-stdin
wallet-cli bai recharge 1 --network base --token USDC --dry-run --output json
wallet-cli bai recharge 1 --network tron --token USDT --to recipient@example.com --dry-run
```

Base, BSC and TRON recharge routes remain supported. Omit `--to` to recharge your
own account; recipient recharge resolves the target before using the same preorder,
payment and transaction-report flow. The on-chain destination remains the platform
address, not the recipient's wallet.

Dry-run checks binding, amount, recipient and the payment challenge without creating
an order, unlocking, signing, paying or reporting a transaction. It reads payer wallet
balances when RPC is available; these are not GasFree account balances. Final network
or relay fees may be unavailable and are explicitly reported as unestimated. For TRON,
`--scheme exact_gasfree` supports the relay and fee-limit options described above.

If payment succeeded but reporting failed, retain the original transaction hash and
use `bai report-recharge` with the original chain and recipient information. Reconcile
an unknown payment outcome before proceeding; do not pay again to retry reporting.
`bai recharge-orders` caps requests above 100 at the backend's 100-row limit and returns
an effective limit plus a warning. `usage-records` retains its independent limit.

### ERC-8004 registration metadata

Register/update URI validation is separate from metadata loading: HTTPS, IPFS and
JSON data URIs remain supported for writing. Metadata reads accept only HTTP/HTTPS,
never follow redirects, and enforce a 1 MiB limit on compressed and expanded content,
a maximum JSON depth of 20, and the shorter of the global timeout and 10 seconds.
Unsupported or unavailable metadata produces a warning while preserving chain data.
