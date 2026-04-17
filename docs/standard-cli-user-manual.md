# wallet-cli Standard CLI User Manual

> Complete reference for the TRON wallet-cli command-line interface (Standard CLI mode).
> This manual covers every supported command, organized by category.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Getting Started](#2-getting-started)
3. [Key Concepts](#3-key-concepts)
4. [General Usage](#4-general-usage)
5. [Global Options](#5-global-options)
6. [Authentication](#6-authentication)
7. [Wallet Management](#7-wallet-management) (9 commands)
8. [Transfers & Transactions](#8-transfers--transactions) (12 commands)
9. [Staking & Resources](#9-staking--resources) (10 commands)
10. [Query - Account & Balance](#10-query---account--balance) (7 commands)
11. [Query - Blockchain](#11-query---blockchain) (8 commands)
12. [Query - Assets & Tokens](#12-query---assets--tokens) (6 commands)
13. [Query - Network & Chain Info](#13-query---network--chain-info) (6 commands)
14. [Query - Delegation & Staking Info](#14-query---delegation--staking-info) (7 commands)
15. [Query - Witnesses, Proposals & Exchanges](#15-query---witnesses-proposals--exchanges) (10 commands)
16. [Query - Market Orders](#16-query---market-orders) (5 commands)
17. [Query - GasFree](#17-query---gasfree) (2 commands)
18. [Smart Contracts](#18-smart-contracts) (9 commands)
19. [Witnesses & Voting](#19-witnesses--voting) (4 commands)
20. [Proposals](#20-proposals) (3 commands)
21. [DEX & Exchanges](#21-dex--exchanges) (5 commands)
22. [Help](#22-help) (1 command)
23. [Common Scenarios](#23-common-scenarios)
24. [Exit Codes & Error Handling](#24-exit-codes--error-handling)
25. [Appendix](#25-appendix)

---

## 1. Introduction

**wallet-cli** is a command-line wallet for the [TRON](https://tron.network/) blockchain. It lets you create wallets, send TRX and tokens, stake resources, vote for Super Representatives, deploy smart contracts, and query on-chain data -- all from your terminal.

The **Standard CLI mode** is designed for scripting, automation, and AI-agent integration. It features:

- **No interactive prompts** -- every input is provided via flags and environment variables
- **Structured JSON output** -- machine-parseable results via `--output json`
- **Deterministic exit codes** -- `0` for success, `1` for execution errors, `2` for usage errors
- **Environment-based authentication** -- `MASTER_PASSWORD` env var for wallet unlock

---

## 2. Getting Started

### Prerequisites

- **Java 8** or later installed on your system

### Build

```bash
./gradlew shadowJar
```

This produces `build/libs/wallet-cli.jar`.

### Run Your First Command

```bash
# Check the current network
java -jar build/libs/wallet-cli.jar --network nile current-network
```

Throughout this manual we use `wallet-cli` as a shorthand for `java -jar build/libs/wallet-cli.jar`. You can create an alias for convenience:

```bash
alias wallet-cli='java -jar /path/to/wallet-cli.jar'
```

### Quick Start: Create a Wallet and Check Balance

```bash
# 1. Create a new wallet (password is set via environment variable)
export MASTER_PASSWORD="YourStrongPassword123"
wallet-cli register-wallet --name my-wallet

# 2. List your wallets
wallet-cli list-wallet

# 3. Check your balance (on Nile testnet)
wallet-cli --network nile get-balance

# 4. Send 1 TRX to another address (1 TRX = 1,000,000 SUN)
wallet-cli --network nile send-coin --to TRecipientAddress... --amount 1000000
```

---

## 3. Key Concepts

### SUN and TRX

TRX is the native currency of the TRON blockchain. Amounts in wallet-cli are specified in **SUN**, the smallest unit:

| TRX | SUN |
|-----|-----|
| 1 TRX | 1,000,000 SUN |
| 0.1 TRX | 100,000 SUN |
| 0.000001 TRX | 1 SUN |

**Example:** To send 10 TRX, use `--amount 10000000`.

### Addresses

TRON addresses are in **Base58Check** format, starting with `T`. Example: `TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL`

### Networks

| Network | Description | Use Case |
|---------|-------------|----------|
| `main` | TRON Mainnet | Real transactions with real TRX |
| `nile` | Nile Testnet | Testing and development (free test TRX) |
| `shasta` | Shasta Testnet | Legacy testnet |
| `custom` | Custom node | Private/local nodes |

### Resources: Bandwidth and Energy

TRON uses two resources to process transactions:
- **Bandwidth** -- consumed by all transactions (data transfer)
- **Energy** -- consumed by smart contract calls

You obtain these resources by **staking (freezing) TRX**. Resource type codes:
- `0` = Bandwidth
- `1` = Energy

---

## 4. General Usage

```
wallet-cli [global-options] <command> [command-options]
```

- **Global options** must come **before** the command name
- **Command options** come **after** the command name
- Option values can use space or `=` syntax: `--network nile` or `--network=nile`
- Boolean options default to `false` and can be specified as: `--multi`, `--multi=true`, `--multi=yes`, `--multi=1`

### Getting Help

```bash
# Global help (lists all commands)
wallet-cli --help

# Help for a specific command
wallet-cli send-coin --help
```

### Command Aliases

Every command has a no-dash alias for convenience. For example, `send-coin` can also be written as `sendcoin`. Both are equivalent.

---

## 5. Global Options

These flags apply to **all commands** and must appear **before** the command name.

| Flag | Value | Default | Description |
|------|-------|---------|-------------|
| `--output` | `text` or `json` | `text` | Output format. Use `json` for machine-parseable output. |
| `--network` | `main`, `nile`, `shasta`, `custom` | (from config) | Select which TRON network to connect to. |
| `--wallet` | name or file path | (active wallet) | Choose which wallet file to authenticate with. |
| `--grpc-endpoint` | `host:port` | (from network) | Override the gRPC endpoint for both fullnode and soliditynode communication. |
| `--quiet` | (none) | off | Suppress informational messages on stderr. |
| `--verbose` | (none) | off | Enable debug-level logging. |
| `-h`, `--help` | (none) | off | Show help information. |
| `--version` | (none) | off | Show version information. |
| `--interactive` | (none) | off | Launch the interactive REPL mode instead. |

**Notes:**
- `--quiet` and `--verbose` cannot be used together.
- `--output json` wraps all output in a JSON envelope (see [Exit Codes & Error Handling](#24-exit-codes--error-handling)).

### Examples

```bash
# Query in JSON format on Nile testnet
wallet-cli --output json --network nile get-balance --address TNPee...

# Use a specific wallet file
wallet-cli --wallet my-trading-wallet get-address

# Connect to a custom node
wallet-cli --network custom --grpc-endpoint 192.168.1.100:50051 get-block
```

---

## 6. Authentication

Some commands require wallet authentication (signing transactions, reading private keys). Authentication is handled entirely through the `MASTER_PASSWORD` environment variable.

### How It Works

1. **Set your password** as an environment variable:
   ```bash
   export MASTER_PASSWORD="YourWalletPassword"
   ```

2. **wallet-cli** automatically uses this password to unlock the active wallet keystore file.

3. If `MASTER_PASSWORD` is not set and the command requires authentication, it fails with an error.

### Authentication Requirement Levels

| Level | Description | Example Commands |
|-------|-------------|------------------|
| **Required** | Must be authenticated. Fails without `MASTER_PASSWORD`. | `send-coin`, `freeze-balance-v2`, `deploy-contract` |
| **Conditional** | Required only when certain options are omitted. | `get-balance` (required if `--address` not provided) |
| **Not required** | No authentication needed. | `get-account`, `get-block`, `list-witnesses` |

### Wallet Selection

Wallets are stored as encrypted keystore files in the `Wallet/` directory. The CLI determines which wallet to use in this order:

1. `--wallet` flag (explicit override)
2. The active wallet (set via `set-active-wallet`)
3. Error if neither is available

### Security Tips

- Never hardcode `MASTER_PASSWORD` in scripts checked into version control.
- Use environment variable injection from a secrets manager in CI/CD pipelines.
- Consider using `env -i MASTER_PASSWORD=... wallet-cli ...` to limit exposure.

---

## 7. Wallet Management

Commands for creating, listing, and managing local wallet files.

---

### `register-wallet`

Create a new wallet with a mnemonic seed phrase.

| | |
|---|---|
| **Alias** | `registerwallet` |
| **Auth** | Not required (but `MASTER_PASSWORD` must be set to encrypt the keystore) |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--name` | Yes | string | Display name for the wallet |
| `--words` | No | number | Mnemonic word count: `12` or `24` (default: `12`) |

```bash
export MASTER_PASSWORD="MySecurePass123"
wallet-cli register-wallet --name "my-main-wallet"
wallet-cli register-wallet --name "high-security" --words 24
```

**Output (JSON):**
```json
{
  "success": true,
  "data": {
    "keystore": "UTC--2024-01-01T00-00-00.000000000Z--TAddress.json",
    "address": "TXyz...",
    "wallet_name": "my-main-wallet",
    "mnemonic_keystore": "mnemonic--TXyz....json"
  }
}
```

---

### `list-wallet`

List all wallets in the `Wallet/` directory with their active status.

| | |
|---|---|
| **Alias** | `listwallet` |
| **Auth** | Not required |

No options.

```bash
wallet-cli list-wallet
```

**Output (text):**
```
Name                           Address                                    Active
my-main-wallet                 TXyz...abc                                 *
trading-wallet                 TAbc...xyz
```

> **Note:** If a keystore file in `Wallet/` is corrupt or unreadable, it still appears in the list with an `error` field in JSON mode (and `[ERROR]` placeholder in text mode) rather than failing the entire command.

---

### `set-active-wallet`

Set the active wallet for subsequent commands. Provide either `--address` or `--name`, not both.

| | |
|---|---|
| **Alias** | `setactivewallet` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--address` | One of address/name | string | Wallet address (Base58Check) |
| `--name` | One of address/name | string | Wallet display name |

```bash
wallet-cli set-active-wallet --address TXyz...abc
wallet-cli set-active-wallet --name "trading-wallet"
```

---

### `get-active-wallet`

Display the currently active wallet.

| | |
|---|---|
| **Alias** | `getactivewallet` |
| **Auth** | Not required |

No options.

```bash
wallet-cli get-active-wallet
```

---

### `modify-wallet-name`

Change the display name of the currently authenticated wallet.

| | |
|---|---|
| **Alias** | `modifywalletname` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--name` | Yes | string | New wallet display name |

```bash
wallet-cli modify-wallet-name --name "my-new-name"
```

---

### `generate-sub-account`

Generate a sub-account (child wallet) from the parent wallet's mnemonic using HD derivation.

| | |
|---|---|
| **Alias** | `generatesubaccount` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--index` | Yes | number | Derivation path index (0-99) |
| `--name` | Yes | string | Display name for the sub-account |

```bash
wallet-cli generate-sub-account --index 0 --name "sub-wallet-0"
```

---

### `clear-wallet-keystore`

Delete the keystore file of the currently authenticated wallet.

| | |
|---|---|
| **Alias** | `clearwalletkeystore` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--force` | No | boolean | Skip confirmation (required in non-interactive CLI mode) |

```bash
wallet-cli clear-wallet-keystore --force
```

> **Warning:** This permanently deletes the wallet keystore file. Make sure you have your mnemonic backed up.

---

### `reset-wallet`

Delete **all** wallet and mnemonic files. This is a destructive operation that requires an explicit confirmation token.

| | |
|---|---|
| **Alias** | `resetwallet` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--confirm` | No | string | Must be exactly `delete-all-wallets` to proceed |

```bash
# Dry run -- shows what would be deleted
wallet-cli reset-wallet

# Actually delete all wallets
wallet-cli reset-wallet --confirm delete-all-wallets
```

> **Note:** Without `--confirm`, this command performs a dry run. The dry-run output includes `files` (wallet/mnemonic keystores), `ledger_files` (Ledger device metadata), and `config_files` (e.g., `.active-wallet`) — showing everything that would be deleted.

> **Warning:** This permanently deletes ALL wallet and mnemonic files, Ledger metadata, and active wallet configuration. There is no undo.

---

## 8. Transfers & Transactions

Commands for sending TRX, transferring tokens, and managing accounts.

---

### `send-coin`

Send TRX to another address.

| | |
|---|---|
| **Alias** | `sendcoin` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--to` | Yes | address | Recipient address |
| `--amount` | Yes | number | Amount in SUN (1 TRX = 1,000,000 SUN) |
| `--owner` | No | address | Sender address (default: current wallet) |
| `--permission-id` | No | number | Permission ID for multi-sig signing (default: 0) |
| `--multi` | No | boolean | Enable multi-signature mode |

```bash
# Send 10 TRX
wallet-cli --network nile send-coin --to TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL --amount 10000000

# Send with JSON output
wallet-cli --output json --network nile send-coin --to TNPee... --amount 1000000
```

---

### `transfer-usdt`

Transfer USDT (TRC20 token). Automatically estimates energy and calculates the fee limit.

| | |
|---|---|
| **Alias** | `transferusdt` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--to` | Yes | address | Recipient address |
| `--amount` | Yes | number | Amount in smallest unit (1 USDT = 1,000,000 units) |
| `--owner` | No | address | Sender address (default: current wallet) |
| `--permission-id` | No | number | Permission ID for multi-sig signing (default: 0) |
| `--multi` | No | boolean | Enable multi-signature mode |

```bash
# Transfer 1 USDT
wallet-cli --network nile transfer-usdt --to TNPee... --amount 1000000
```

> **Note:** This command is only available on networks that have a known USDT contract address (mainnet and Nile).

---

### `transfer-asset`

Transfer a TRC10 token.

| | |
|---|---|
| **Alias** | `transferasset` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--to` | Yes | address | Recipient address |
| `--asset` | Yes | string | Asset name or ID |
| `--amount` | Yes | number | Amount to transfer |
| `--owner` | No | address | Sender address |
| `--multi` | No | boolean | Multi-signature mode |

```bash
wallet-cli --network nile transfer-asset --to TNPee... --asset "MyToken" --amount 100
```

---

### `create-account`

Create a new account on the TRON blockchain (activates an address on-chain).

| | |
|---|---|
| **Alias** | `createaccount` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--address` | Yes | address | The new account address to activate |
| `--owner` | No | address | Creator address (pays the fee) |
| `--multi` | No | boolean | Multi-signature mode |

```bash
wallet-cli --network nile create-account --address TNewAddress...
```

---

### `update-account`

Set or update the name of an account on-chain. An account name can only be set once.

| | |
|---|---|
| **Alias** | `updateaccount` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--name` | Yes | string | Account name |
| `--owner` | No | address | Owner address |
| `--multi` | No | boolean | Multi-signature mode |

```bash
wallet-cli --network nile update-account --name "MyAccountName"
```

---

### `set-account-id`

Set a unique account ID for your account.

| | |
|---|---|
| **Alias** | `setaccountid` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--id` | Yes | string | Account ID |
| `--owner` | No | address | Owner address |

```bash
wallet-cli --network nile set-account-id --id "my-unique-id"
```

---

### `asset-issue`

Create (issue) a new TRC10 token.

| | |
|---|---|
| **Alias** | `assetissue` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--name` | Yes | string | Token name |
| `--abbr` | Yes | string | Token abbreviation |
| `--total-supply` | Yes | number | Total supply |
| `--trx-num` | Yes | number | TRX amount per token unit in ICO |
| `--ico-num` | Yes | number | Token amount per TRX unit in ICO |
| `--start-time` | Yes | number | ICO start time (Unix timestamp in milliseconds) |
| `--end-time` | Yes | number | ICO end time (Unix timestamp in milliseconds) |
| `--url` | Yes | string | Project URL |
| `--free-net-limit` | Yes | number | Free bandwidth limit per account |
| `--public-free-net-limit` | Yes | number | Total public free bandwidth limit |
| `--precision` | No | number | Token precision / decimal places (default: 0) |
| `--description` | No | string | Token description |
| `--owner` | No | address | Issuer address |
| `--multi` | No | boolean | Multi-signature mode |

```bash
wallet-cli --network nile asset-issue \
  --name "MyToken" \
  --abbr "MTK" \
  --total-supply 1000000000 \
  --trx-num 1 \
  --ico-num 1 \
  --start-time 1735689600000 \
  --end-time 1738368000000 \
  --url "https://mytoken.example.com" \
  --free-net-limit 5000 \
  --public-free-net-limit 50000 \
  --precision 6 \
  --description "My awesome token"
```

---

### `update-asset`

Update parameters of an existing TRC10 token you own.

| | |
|---|---|
| **Alias** | `updateasset` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--description` | Yes | string | New token description |
| `--url` | Yes | string | New project URL |
| `--new-limit` | Yes | number | New free bandwidth limit per account |
| `--new-public-limit` | Yes | number | New total public free bandwidth limit |
| `--owner` | No | address | Owner address |
| `--multi` | No | boolean | Multi-signature mode |

```bash
wallet-cli --network nile update-asset \
  --description "Updated description" \
  --url "https://newurl.example.com" \
  --new-limit 10000 \
  --new-public-limit 100000
```

---

### `participate-asset-issue`

Participate in a TRC10 token ICO by purchasing tokens from the issuer.

| | |
|---|---|
| **Alias** | `participateassetissue` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--to` | Yes | address | Asset issuer's address |
| `--asset` | Yes | string | Asset name |
| `--amount` | Yes | number | Amount of TRX to spend |
| `--owner` | No | address | Participant address |
| `--multi` | No | boolean | Multi-signature mode |

```bash
wallet-cli --network nile participate-asset-issue \
  --to TIssuerAddress... \
  --asset "MyToken" \
  --amount 1000000
```

---

### `update-account-permission`

Update account permissions to configure multi-signature control.

| | |
|---|---|
| **Alias** | `updateaccountpermission` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--owner` | Yes | address | Account address to update |
| `--permissions` | Yes | string | Permissions configuration as a JSON string |
| `--multi` | No | boolean | Multi-signature mode |

```bash
wallet-cli --network nile update-account-permission \
  --owner TMyAddress... \
  --permissions '{"owner":{"type":0,"permission_name":"owner","threshold":2,"keys":[{"address":"TAddr1...","weight":1},{"address":"TAddr2...","weight":1}]}}'
```

---

### `broadcast-transaction`

Broadcast a pre-signed transaction to the network.

| | |
|---|---|
| **Alias** | `broadcasttransaction` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--transaction` | Yes | string | Signed transaction as a hex string |

```bash
wallet-cli --network nile broadcast-transaction --transaction 0a8e010a...
```

---

### `gas-free-transfer`

Transfer tokens using the GasFree service (the sender does not pay gas fees).

| | |
|---|---|
| **Alias** | `gasfreetransfer` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--to` | Yes | address | Recipient address |
| `--amount` | Yes | number | Amount to transfer |

```bash
wallet-cli --network nile gas-free-transfer --to TNPee... --amount 1000000
```

---

## 9. Staking & Resources

Commands for freezing/unfreezing TRX, delegating resources, and managing the Stake 2.0 system.

---

### `freeze-balance-v2`

Freeze TRX to obtain bandwidth or energy using **Stake 2.0** (the current staking mechanism).

| | |
|---|---|
| **Alias** | `freezebalancev2` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--amount` | Yes | number | Amount to freeze in SUN |
| `--resource` | No | number | Resource type: `0` = Bandwidth, `1` = Energy (default: `0`) |
| `--owner` | No | address | Owner address |
| `--permission-id` | No | number | Permission ID for multi-sig signing (default: 0) |
| `--multi` | No | boolean | Multi-signature mode |

```bash
# Freeze 100 TRX for energy
wallet-cli --network nile freeze-balance-v2 --amount 100000000 --resource 1

# Freeze 50 TRX for bandwidth
wallet-cli --network nile freeze-balance-v2 --amount 50000000 --resource 0
```

---

### `unfreeze-balance-v2`

Unfreeze previously frozen TRX under **Stake 2.0**. Unfrozen TRX enters a waiting period before it can be withdrawn.

| | |
|---|---|
| **Alias** | `unfreezebalancev2` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--amount` | Yes | number | Amount to unfreeze in SUN |
| `--resource` | No | number | Resource type: `0` = Bandwidth, `1` = Energy (default: `0`) |
| `--owner` | No | address | Owner address |
| `--permission-id` | No | number | Permission ID for multi-sig signing (default: 0) |
| `--multi` | No | boolean | Multi-signature mode |

```bash
wallet-cli --network nile unfreeze-balance-v2 --amount 50000000 --resource 1
```

---

### `withdraw-expire-unfreeze`

Withdraw TRX that has completed the unfreeze waiting period.

| | |
|---|---|
| **Alias** | `withdrawexpireunfreeze` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--owner` | No | address | Owner address |
| `--multi` | No | boolean | Multi-signature mode |

```bash
wallet-cli --network nile withdraw-expire-unfreeze
```

---

### `cancel-all-unfreeze-v2`

Cancel all pending unfreeze operations, returning the TRX to frozen state.

| | |
|---|---|
| **Alias** | `cancelallunfreezev2` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--owner` | No | address | Owner address |
| `--multi` | No | boolean | Multi-signature mode |

```bash
wallet-cli --network nile cancel-all-unfreeze-v2
```

---

### `delegate-resource`

Delegate bandwidth or energy to another address. The recipient can use the resources, but the TRX remains yours.

| | |
|---|---|
| **Alias** | `delegateresource` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--amount` | Yes | number | Amount of frozen TRX to delegate (in SUN) |
| `--resource` | Yes | number | Resource type: `0` = Bandwidth, `1` = Energy |
| `--receiver` | Yes | address | Receiver address |
| `--lock` | No | boolean | Lock the delegation (cannot be undelegated during lock period) |
| `--lock-period` | No | number | Lock period in blocks (only with `--lock`) |
| `--owner` | No | address | Owner address |
| `--multi` | No | boolean | Multi-signature mode |

```bash
# Delegate 100 TRX worth of energy to another address
wallet-cli --network nile delegate-resource \
  --amount 100000000 \
  --resource 1 \
  --receiver TReceiverAddr...

# Delegate with lock
wallet-cli --network nile delegate-resource \
  --amount 50000000 \
  --resource 0 \
  --receiver TReceiverAddr... \
  --lock \
  --lock-period 28800
```

---

### `undelegate-resource`

Reclaim previously delegated bandwidth or energy from another address.

| | |
|---|---|
| **Alias** | `undelegateresource` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--amount` | Yes | number | Amount to undelegate in SUN |
| `--resource` | Yes | number | Resource type: `0` = Bandwidth, `1` = Energy |
| `--receiver` | Yes | address | Address to reclaim from |
| `--owner` | No | address | Owner address |
| `--multi` | No | boolean | Multi-signature mode |

```bash
wallet-cli --network nile undelegate-resource \
  --amount 100000000 \
  --resource 1 \
  --receiver TReceiverAddr...
```

---

### `withdraw-balance`

Withdraw witness (Super Representative) block rewards.

| | |
|---|---|
| **Alias** | `withdrawbalance` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--owner` | No | address | Witness address |
| `--multi` | No | boolean | Multi-signature mode |

```bash
wallet-cli --network nile withdraw-balance
```

---

### `freeze-balance` (deprecated)

Freeze TRX using the legacy Stake 1.0 system. **Use `freeze-balance-v2` instead.**

| | |
|---|---|
| **Alias** | `freezebalance` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--amount` | Yes | number | Amount to freeze in SUN |
| `--duration` | Yes | number | Freeze duration in days |
| `--resource` | No | number | Resource type: `0` = Bandwidth, `1` = Energy (default: `0`) |
| `--receiver` | No | address | Delegate the frozen resources to this address |
| `--owner` | No | address | Owner address |
| `--multi` | No | boolean | Multi-signature mode |

```bash
wallet-cli --network nile freeze-balance --amount 100000000 --duration 3 --resource 1
```

---

### `unfreeze-balance` (deprecated)

Unfreeze TRX under the legacy Stake 1.0 system. **Use `unfreeze-balance-v2` instead.**

| | |
|---|---|
| **Alias** | `unfreezebalance` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--resource` | No | number | Resource type: `0` = Bandwidth, `1` = Energy (default: `0`) |
| `--receiver` | No | address | Receiver address (if resources were delegated) |
| `--owner` | No | address | Owner address |
| `--multi` | No | boolean | Multi-signature mode |

```bash
wallet-cli --network nile unfreeze-balance --resource 1
```

---

### `unfreeze-asset`

Unfreeze a previously frozen TRC10 asset.

| | |
|---|---|
| **Alias** | `unfreezeasset` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--owner` | No | address | Owner address |
| `--multi` | No | boolean | Multi-signature mode |

```bash
wallet-cli --network nile unfreeze-asset
```

---

## 10. Query - Account & Balance

Commands for querying account information and balances. These do **not** require authentication when an explicit address is provided.

---

### `get-address`

Display the address of the currently logged-in wallet.

| | |
|---|---|
| **Alias** | `getaddress` |
| **Auth** | Required |

No options.

```bash
wallet-cli get-address
```

---

### `get-balance`

Get the TRX balance of an address. Returns both SUN and TRX values.

| | |
|---|---|
| **Alias** | `getbalance` |
| **Auth** | Required if `--address` is omitted; not required if `--address` is provided |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--address` | No | address | Address to query (default: current wallet) |

```bash
# Query own wallet balance (requires auth)
wallet-cli --network nile get-balance

# Query any address (no auth needed)
wallet-cli --network nile get-balance --address TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL

# JSON output
wallet-cli --output json --network nile get-balance --address TNPee...
```

**JSON output:**
```json
{
  "success": true,
  "data": {
    "balance_sun": 1000000,
    "balance_trx": "1.000000"
  }
}
```

---

### `get-usdt-balance`

Get the USDT (TRC20) balance of an address.

| | |
|---|---|
| **Alias** | `getusdtbalance` |
| **Auth** | Required if `--address` is omitted; not required if `--address` is provided |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--address` | No | address | Address to query (default: current wallet) |

```bash
wallet-cli --network nile get-usdt-balance --address TNPee...
```

---

### `get-account`

Get detailed account information including balance, assets, permissions, and more.

| | |
|---|---|
| **Alias** | `getaccount` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--address` | Yes | address | Address to query |

```bash
wallet-cli --network nile get-account --address TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL
```

---

### `get-account-by-id`

Get account information using an account ID (set via `set-account-id`).

| | |
|---|---|
| **Alias** | `getaccountbyid` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--id` | Yes | string | Account ID |

```bash
wallet-cli --network nile get-account-by-id --id "my-unique-id"
```

---

### `get-account-net`

Get bandwidth (net) information for an account.

| | |
|---|---|
| **Alias** | `getaccountnet` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--address` | Yes | address | Address to query |

```bash
wallet-cli --network nile get-account-net --address TNPee...
```

---

### `get-account-resource`

Get resource information (bandwidth and energy) for an account.

| | |
|---|---|
| **Alias** | `getaccountresource` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--address` | Yes | address | Address to query |

```bash
wallet-cli --network nile get-account-resource --address TNPee...
```

---

## 11. Query - Blockchain

Commands for querying blocks and transactions.

---

### `get-block`

Get a block by number, or the latest block if no number is specified.

| | |
|---|---|
| **Alias** | `getblock` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--number` | No | number | Block number (default: latest block) |

```bash
# Get the latest block
wallet-cli --network nile get-block

# Get a specific block
wallet-cli --network nile get-block --number 1000000
```

---

### `get-block-by-id`

Get a block by its hash (block ID).

| | |
|---|---|
| **Alias** | `getblockbyid` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--id` | Yes | string | Block hash / ID |

```bash
wallet-cli --network nile get-block-by-id --id 00000000001e8480...
```

---

### `get-block-by-id-or-num`

Get a block by either its hash or number (auto-detected).

| | |
|---|---|
| **Alias** | `getblockbyidornum` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--value` | Yes | string | Block number or block hash |

```bash
wallet-cli --network nile get-block-by-id-or-num --value 1000000
wallet-cli --network nile get-block-by-id-or-num --value 00000000001e8480...
```

---

### `get-block-by-latest-num`

Get the most recent N blocks.

| | |
|---|---|
| **Alias** | `getblockbylatestnum` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--count` | Yes | number | Number of blocks to retrieve |

```bash
wallet-cli --network nile get-block-by-latest-num --count 5
```

---

### `get-block-by-limit-next`

Get blocks in a range `[start, end)`.

| | |
|---|---|
| **Alias** | `getblockbylimitnext` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--start` | Yes | number | Start block number (inclusive) |
| `--end` | Yes | number | End block number (exclusive) |

```bash
wallet-cli --network nile get-block-by-limit-next --start 1000000 --end 1000005
```

---

### `get-transaction-by-id`

Get a transaction by its transaction ID (hash).

| | |
|---|---|
| **Alias** | `gettransactionbyid` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--id` | Yes | string | Transaction ID |

```bash
wallet-cli --network nile get-transaction-by-id --id abc123def456...
```

---

### `get-transaction-info-by-id`

Get detailed transaction execution info (fee, energy usage, logs, etc.).

| | |
|---|---|
| **Alias** | `gettransactioninfobyid` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--id` | Yes | string | Transaction ID |

```bash
wallet-cli --network nile get-transaction-info-by-id --id abc123def456...
```

---

### `get-transaction-count-by-block-num`

Get the number of transactions in a specific block.

| | |
|---|---|
| **Alias** | `gettransactioncountbyblocknum` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--number` | Yes | number | Block number |

```bash
wallet-cli --network nile get-transaction-count-by-block-num --number 1000000
```

---

## 12. Query - Assets & Tokens

Commands for querying TRC10 asset information.

---

### `get-asset-issue-by-account`

Get all TRC10 assets issued by a specific account.

| | |
|---|---|
| **Alias** | `getassetissuebyaccount` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--address` | Yes | address | Issuer account address |

```bash
wallet-cli --network nile get-asset-issue-by-account --address TIssuer...
```

---

### `get-asset-issue-by-id`

Get a TRC10 asset by its numeric ID.

| | |
|---|---|
| **Alias** | `getassetissuebyid` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--id` | Yes | string | Asset ID |

```bash
wallet-cli --network nile get-asset-issue-by-id --id "1000001"
```

---

### `get-asset-issue-by-name`

Get a TRC10 asset by name (returns the first match).

| | |
|---|---|
| **Alias** | `getassetissuebyname` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--name` | Yes | string | Asset name |

```bash
wallet-cli --network nile get-asset-issue-by-name --name "MyToken"
```

---

### `get-asset-issue-list-by-name`

Get all TRC10 assets matching a name (may return multiple).

| | |
|---|---|
| **Alias** | `getassetissuelistbyname` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--name` | Yes | string | Asset name |

```bash
wallet-cli --network nile get-asset-issue-list-by-name --name "MyToken"
```

---

### `list-asset-issue`

List all TRC10 assets on the network.

| | |
|---|---|
| **Alias** | `listassetissue` |
| **Auth** | Not required |

No options.

```bash
wallet-cli --network nile list-asset-issue
```

---

### `list-asset-issue-paginated`

List TRC10 assets with pagination.

| | |
|---|---|
| **Alias** | `listassetissuepaginated` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--offset` | Yes | number | Starting offset |
| `--limit` | Yes | number | Number of results per page |

```bash
wallet-cli --network nile list-asset-issue-paginated --offset 0 --limit 20
```

---

## 13. Query - Network & Chain Info

Commands for querying network parameters and chain state.

---

### `current-network`

Display the currently connected network name.

| | |
|---|---|
| **Alias** | `currentnetwork` |
| **Auth** | Not required |

No options.

```bash
wallet-cli --network nile current-network
```

---

### `get-chain-parameters`

Get all TRON chain parameters (proposal-adjustable settings).

| | |
|---|---|
| **Alias** | `getchainparameters` |
| **Auth** | Not required |

No options.

```bash
wallet-cli --network nile get-chain-parameters
```

---

### `get-bandwidth-prices`

Get the history of bandwidth prices on the network.

| | |
|---|---|
| **Alias** | `getbandwidthprices` |
| **Auth** | Not required |

No options.

```bash
wallet-cli --network nile get-bandwidth-prices
```

---

### `get-energy-prices`

Get the history of energy prices on the network.

| | |
|---|---|
| **Alias** | `getenergyprices` |
| **Auth** | Not required |

No options.

```bash
wallet-cli --network nile get-energy-prices
```

---

### `get-memo-fee`

Get the current fee for adding a memo to transactions.

| | |
|---|---|
| **Alias** | `getmemofee` |
| **Auth** | Not required |

No options.

```bash
wallet-cli --network nile get-memo-fee
```

---

### `get-next-maintenance-time`

Get the timestamp of the next maintenance period (when votes are tallied).

| | |
|---|---|
| **Alias** | `getnextmaintenancetime` |
| **Auth** | Not required |

No options.

```bash
wallet-cli --network nile get-next-maintenance-time
```

---

## 14. Query - Delegation & Staking Info

Commands for querying resource delegation and staking status.

---

### `get-delegated-resource`

Get resources delegated between two addresses (Stake 1.0).

| | |
|---|---|
| **Alias** | `getdelegatedresource` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--from` | Yes | address | Delegator address |
| `--to` | Yes | address | Recipient address |

```bash
wallet-cli --network nile get-delegated-resource --from TFrom... --to TTo...
```

---

### `get-delegated-resource-v2`

Get resources delegated between two addresses (Stake 2.0).

| | |
|---|---|
| **Alias** | `getdelegatedresourcev2` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--from` | Yes | address | Delegator address |
| `--to` | Yes | address | Recipient address |

```bash
wallet-cli --network nile get-delegated-resource-v2 --from TFrom... --to TTo...
```

---

### `get-delegated-resource-account-index`

Get the list of addresses that have delegated resources to/from a given address (Stake 1.0).

| | |
|---|---|
| **Alias** | `getdelegatedresourceaccountindex` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--address` | Yes | address | Address to query |

```bash
wallet-cli --network nile get-delegated-resource-account-index --address TAddr...
```

---

### `get-delegated-resource-account-index-v2`

Get the list of addresses that have delegated resources to/from a given address (Stake 2.0).

| | |
|---|---|
| **Alias** | `getdelegatedresourceaccountindexv2` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--address` | Yes | address | Address to query |

```bash
wallet-cli --network nile get-delegated-resource-account-index-v2 --address TAddr...
```

---

### `get-can-delegated-max-size`

Get the maximum amount of a resource type that can be delegated.

| | |
|---|---|
| **Alias** | `getcandelegatedmaxsize` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--owner` | Yes | address | Owner address |
| `--type` | Yes | number | Resource type: `0` = Bandwidth, `1` = Energy |

```bash
wallet-cli --network nile get-can-delegated-max-size --owner TAddr... --type 1
```

---

### `get-available-unfreeze-count`

Get how many unfreeze operations are currently available for an address.

| | |
|---|---|
| **Alias** | `getavailableunfreezecount` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--address` | Yes | address | Address to query |

```bash
wallet-cli --network nile get-available-unfreeze-count --address TAddr...
```

---

### `get-can-withdraw-unfreeze-amount`

Get the amount of TRX that can be withdrawn from expired unfreeze operations.

| | |
|---|---|
| **Alias** | `getcanwithdrawunfreezeamount` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--address` | Yes | address | Address to query |
| `--timestamp` | No | number | Timestamp in milliseconds (default: current time) |

```bash
wallet-cli --network nile get-can-withdraw-unfreeze-amount --address TAddr...
```

---

## 15. Query - Witnesses, Proposals & Exchanges

Commands for querying Super Representatives, governance proposals, and on-chain exchanges.

---

### `list-nodes`

List all nodes connected to the current node.

| | |
|---|---|
| **Alias** | `listnodes` |
| **Auth** | Not required |

No options.

```bash
wallet-cli --network nile list-nodes
```

---

### `list-witnesses`

List all Super Representatives (witnesses) on the network.

| | |
|---|---|
| **Alias** | `listwitnesses` |
| **Auth** | Not required |

No options.

```bash
wallet-cli --network nile list-witnesses
```

---

### `get-brokerage`

Get the brokerage ratio (commission rate) of a witness.

| | |
|---|---|
| **Alias** | `getbrokerage` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--address` | Yes | address | Witness address |

```bash
wallet-cli --network nile get-brokerage --address TWitness...
```

---

### `get-reward`

Get the unclaimed voting reward for an address.

| | |
|---|---|
| **Alias** | `getreward` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--address` | Yes | address | Address to query |

```bash
wallet-cli --network nile get-reward --address TAddr...
```

---

### `list-proposals`

List all governance proposals.

| | |
|---|---|
| **Alias** | `listproposals` |
| **Auth** | Not required |

No options.

```bash
wallet-cli --network nile list-proposals
```

---

### `list-proposals-paginated`

List governance proposals with pagination.

| | |
|---|---|
| **Alias** | `listproposalspaginated` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--offset` | Yes | number | Starting offset |
| `--limit` | Yes | number | Number of results per page |

```bash
wallet-cli --network nile list-proposals-paginated --offset 0 --limit 10
```

---

### `get-proposal`

Get details of a specific governance proposal.

| | |
|---|---|
| **Alias** | `getproposal` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--id` | Yes | number | Proposal ID |

```bash
wallet-cli --network nile get-proposal --id 1
```

---

### `list-exchanges`

List all on-chain Bancor exchanges.

| | |
|---|---|
| **Alias** | `listexchanges` |
| **Auth** | Not required |

No options.

```bash
wallet-cli --network nile list-exchanges
```

---

### `list-exchanges-paginated`

List on-chain exchanges with pagination.

| | |
|---|---|
| **Alias** | `listexchangespaginated` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--offset` | Yes | number | Starting offset |
| `--limit` | Yes | number | Number of results per page |

```bash
wallet-cli --network nile list-exchanges-paginated --offset 0 --limit 10
```

---

### `get-exchange`

Get details of a specific on-chain exchange.

| | |
|---|---|
| **Alias** | `getexchange` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--id` | Yes | string | Exchange ID |

```bash
wallet-cli --network nile get-exchange --id "1"
```

---

## 16. Query - Market Orders

Commands for querying the on-chain decentralized market.

---

### `get-market-order-by-account`

Get all market orders placed by a specific account.

| | |
|---|---|
| **Alias** | `getmarketorderbyaccount` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--address` | Yes | address | Account address |

```bash
wallet-cli --network nile get-market-order-by-account --address TAddr...
```

---

### `get-market-order-by-id`

Get a specific market order by its ID.

| | |
|---|---|
| **Alias** | `getmarketorderbyid` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--id` | Yes | string | Order ID (hex) |

```bash
wallet-cli --network nile get-market-order-by-id --id abc123...
```

---

### `get-market-order-list-by-pair`

Get all market orders for a specific trading pair.

| | |
|---|---|
| **Alias** | `getmarketorderlistbypair` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--sell-token` | Yes | string | Sell token name (use `_` for TRX) |
| `--buy-token` | Yes | string | Buy token name (use `_` for TRX) |

```bash
wallet-cli --network nile get-market-order-list-by-pair --sell-token _ --buy-token MyToken
```

---

### `get-market-pair-list`

List all available market trading pairs.

| | |
|---|---|
| **Alias** | `getmarketpairlist` |
| **Auth** | Not required |

No options.

```bash
wallet-cli --network nile get-market-pair-list
```

---

### `get-market-price-by-pair`

Get the current market price for a trading pair.

| | |
|---|---|
| **Alias** | `getmarketpricebypair` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--sell-token` | Yes | string | Sell token name (use `_` for TRX) |
| `--buy-token` | Yes | string | Buy token name (use `_` for TRX) |

```bash
wallet-cli --network nile get-market-price-by-pair --sell-token _ --buy-token MyToken
```

---

## 17. Query - GasFree

Commands for the GasFree service (gasless transfers).

---

### `gas-free-info`

Get GasFree service eligibility and configuration info for an address.

| | |
|---|---|
| **Alias** | `gasfreeinfo` |
| **Auth** | Required if `--address` is omitted; not required if `--address` is provided |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--address` | No | string | Address to query (default: current wallet) |

```bash
wallet-cli --network nile gas-free-info --address TAddr...
```

---

### `gas-free-trace`

Trace the status of a GasFree transaction.

| | |
|---|---|
| **Alias** | `gasfreetrace` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--id` | Yes | string | GasFree transaction ID |

```bash
wallet-cli --network nile gas-free-trace --id "gasfree-tx-id..."
```

---

## 18. Smart Contracts

Commands for deploying, calling, and managing smart contracts.

---

### `deploy-contract`

Deploy a new smart contract to the blockchain.

| | |
|---|---|
| **Alias** | `deploycontract` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--name` | Yes | string | Contract name |
| `--abi` | Yes | string | Contract ABI as a JSON string |
| `--bytecode` | Yes | string | Contract bytecode (hex) |
| `--fee-limit` | Yes | number | Maximum fee in SUN |
| `--constructor` | No | string | Constructor signature (e.g., `constructor(uint256,address)`) |
| `--params` | No | string | Constructor parameters (provide with `--constructor`) |
| `--consume-user-resource-percent` | No | number | Caller's resource share percent, 0-100 (default: 0) |
| `--origin-energy-limit` | No | number | Max energy the deployer will provide (default: 10,000,000) |
| `--value` | No | number | TRX sent with deployment in SUN (default: 0) |
| `--token-value` | No | number | TRC10 token value (default: 0) |
| `--token-id` | No | string | TRC10 token ID |
| `--library` | No | string | Library link in format `LibName:TAddress` |
| `--compiler-version` | No | string | Solidity compiler version |
| `--owner` | No | address | Deployer address |
| `--multi` | No | boolean | Multi-signature mode |

> **Note:** `--constructor` and `--params` must be provided together.

```bash
wallet-cli --network nile deploy-contract \
  --name "MyContract" \
  --abi '[{"inputs":[],"stateMutability":"nonpayable","type":"constructor"}]' \
  --bytecode "608060405234801561001057600080fd5b50..." \
  --fee-limit 1000000000 \
  --consume-user-resource-percent 50 \
  --origin-energy-limit 10000000
```

---

### `trigger-contract`

Call a smart contract function that modifies state (sends a transaction).

| | |
|---|---|
| **Alias** | `triggercontract` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--contract` | Yes | address | Contract address |
| `--method` | Yes | string | Method signature (e.g., `transfer(address,uint256)`) |
| `--fee-limit` | Yes | number | Maximum fee in SUN |
| `--params` | No | string | Method parameters |
| `--value` | No | number | TRX to send with the call in SUN (default: 0) |
| `--token-value` | No | number | TRC10 token value (default: 0) |
| `--token-id` | No | string | TRC10 token ID |
| `--owner` | No | address | Caller address |
| `--permission-id` | No | number | Permission ID for multi-sig signing (default: 0) |
| `--multi` | No | boolean | Multi-signature mode |

```bash
# Call a contract method
wallet-cli --network nile trigger-contract \
  --contract TContractAddr... \
  --method "transfer(address,uint256)" \
  --params '"TRecipient...",1000000' \
  --fee-limit 100000000
```

---

### `trigger-constant-contract`

Call a read-only (view/pure) smart contract function. Does not create a transaction or cost resources.

| | |
|---|---|
| **Alias** | `triggerconstantcontract` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--contract` | Yes | address | Contract address |
| `--method` | Yes | string | Method signature (e.g., `balanceOf(address)`) |
| `--params` | No | string | Method parameters |
| `--owner` | No | address | Caller address |

```bash
# Check USDT balance of an address (read-only call)
wallet-cli --network nile trigger-constant-contract \
  --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf \
  --method "balanceOf(address)" \
  --params '"TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL"' \
  --owner TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL
```

---

### `estimate-energy`

Estimate how much energy a contract call would consume, without actually executing it.

| | |
|---|---|
| **Alias** | `estimateenergy` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--contract` | Yes | address | Contract address |
| `--method` | Yes | string | Method signature |
| `--params` | No | string | Method parameters |
| `--value` | No | number | Call value in SUN (default: 0) |
| `--token-value` | No | number | Token value (default: 0) |
| `--token-id` | No | string | Token ID |
| `--owner` | No | address | Caller address |

```bash
wallet-cli --network nile estimate-energy \
  --contract TContractAddr... \
  --method "transfer(address,uint256)" \
  --params '"TRecipient...",1000000' \
  --owner TMyAddr...
```

---

### `get-contract`

Get the smart contract definition (ABI, bytecode, etc.) by its address.

| | |
|---|---|
| **Alias** | `getcontract` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--address` | Yes | address | Contract address |

```bash
wallet-cli --network nile get-contract --address TContractAddr...
```

---

### `get-contract-info`

Get smart contract metadata including energy settings.

| | |
|---|---|
| **Alias** | `getcontractinfo` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--address` | Yes | address | Contract address |

```bash
wallet-cli --network nile get-contract-info --address TContractAddr...
```

---

### `clear-contract-abi`

Remove the ABI from a smart contract you own.

| | |
|---|---|
| **Alias** | `clearcontractabi` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--contract` | Yes | address | Contract address |
| `--owner` | No | address | Owner address |
| `--multi` | No | boolean | Multi-signature mode |

```bash
wallet-cli --network nile clear-contract-abi --contract TContractAddr...
```

---

### `update-setting`

Update the `consume_user_resource_percent` setting of a smart contract you own.

| | |
|---|---|
| **Alias** | `updatesetting` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--contract` | Yes | address | Contract address |
| `--consume-user-resource-percent` | Yes | number | New percentage (0-100) |
| `--owner` | No | address | Owner address |
| `--multi` | No | boolean | Multi-signature mode |

```bash
wallet-cli --network nile update-setting --contract TContractAddr... --consume-user-resource-percent 50
```

---

### `update-energy-limit`

Update the `origin_energy_limit` setting of a smart contract you own.

| | |
|---|---|
| **Alias** | `updateenergylimit` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--contract` | Yes | address | Contract address |
| `--origin-energy-limit` | Yes | number | New energy limit |
| `--owner` | No | address | Owner address |
| `--multi` | No | boolean | Multi-signature mode |

```bash
wallet-cli --network nile update-energy-limit --contract TContractAddr... --origin-energy-limit 10000000
```

---

## 19. Witnesses & Voting

Commands for Super Representative (witness) operations and voting.

---

### `create-witness`

Apply to become a Super Representative (witness). Requires 9,999 TRX to be burned.

| | |
|---|---|
| **Alias** | `createwitness` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--url` | Yes | string | Your witness website URL |
| `--owner` | No | address | Owner address |
| `--multi` | No | boolean | Multi-signature mode |

```bash
wallet-cli --network nile create-witness --url "https://mywitness.example.com"
```

---

### `update-witness`

Update the URL of an existing witness.

| | |
|---|---|
| **Alias** | `updatewitness` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--url` | Yes | string | New witness URL |
| `--owner` | No | address | Owner address |
| `--multi` | No | boolean | Multi-signature mode |

```bash
wallet-cli --network nile update-witness --url "https://new-url.example.com"
```

---

### `vote-witness`

Vote for one or more Super Representatives using your frozen TRX as voting power.

| | |
|---|---|
| **Alias** | `votewitness` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--votes` | Yes | string | Space-separated pairs: `address1 count1 address2 count2 ...` |
| `--owner` | No | address | Voter address |
| `--permission-id` | No | number | Permission ID for multi-sig signing (default: 0) |
| `--multi` | No | boolean | Multi-signature mode |

```bash
# Vote for two witnesses
wallet-cli --network nile vote-witness \
  --votes "TWitness1... 1000 TWitness2... 500"
```

> **Note:** Each vote replaces your previous votes entirely. Your total vote count cannot exceed your frozen TRX amount.

---

### `update-brokerage`

Update the brokerage (commission) ratio as a witness. This determines what percentage of voter rewards you keep.

| | |
|---|---|
| **Alias** | `updatebrokerage` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--brokerage` | Yes | number | Brokerage ratio (0-100). E.g., 20 means keep 20%, distribute 80%. |
| `--owner` | No | address | Witness address |
| `--multi` | No | boolean | Multi-signature mode |

```bash
wallet-cli --network nile update-brokerage --brokerage 20
```

---

## 20. Proposals

Commands for TRON governance proposals. Only Super Representatives can create proposals.

---

### `create-proposal`

Create a new governance proposal to change chain parameters.

| | |
|---|---|
| **Alias** | `createproposal` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--parameters` | Yes | string | Space-separated pairs: `paramId1 value1 paramId2 value2 ...` |
| `--owner` | No | address | Proposer address |
| `--multi` | No | boolean | Multi-signature mode |

```bash
# Create a proposal to change parameter #0 to value 100000
wallet-cli --network nile create-proposal --parameters "0 100000"
```

---

### `approve-proposal`

Vote to approve or disapprove an existing proposal.

| | |
|---|---|
| **Alias** | `approveproposal` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--id` | Yes | number | Proposal ID |
| `--approve` | Yes | boolean | `true` to approve, `false` to disapprove |
| `--owner` | No | address | Voter address |
| `--multi` | No | boolean | Multi-signature mode |

```bash
wallet-cli --network nile approve-proposal --id 1 --approve true
```

---

### `delete-proposal`

Delete a proposal you created (only before it is approved).

| | |
|---|---|
| **Alias** | `deleteproposal` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--id` | Yes | number | Proposal ID |
| `--owner` | No | address | Proposer address |
| `--multi` | No | boolean | Multi-signature mode |

```bash
wallet-cli --network nile delete-proposal --id 1
```

---

## 21. DEX & Exchanges

Commands for the on-chain Bancor exchange and decentralized market.

---

### `exchange-create`

Create a new Bancor exchange pair between two tokens.

| | |
|---|---|
| **Alias** | `exchangecreate` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--first-token` | Yes | string | First token ID (use `_` for TRX) |
| `--first-balance` | Yes | number | Initial balance of the first token |
| `--second-token` | Yes | string | Second token ID |
| `--second-balance` | Yes | number | Initial balance of the second token |
| `--owner` | No | address | Creator address |
| `--multi` | No | boolean | Multi-signature mode |

```bash
wallet-cli --network nile exchange-create \
  --first-token _ \
  --first-balance 10000000000 \
  --second-token "1000001" \
  --second-balance 10000000
```

---

### `exchange-inject`

Add liquidity to an existing exchange.

| | |
|---|---|
| **Alias** | `exchangeinject` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--exchange-id` | Yes | number | Exchange ID |
| `--token-id` | Yes | string | Token to inject |
| `--quant` | Yes | number | Amount to inject |
| `--owner` | No | address | Owner address |
| `--multi` | No | boolean | Multi-signature mode |

```bash
wallet-cli --network nile exchange-inject --exchange-id 1 --token-id _ --quant 1000000000
```

---

### `exchange-withdraw`

Withdraw liquidity from an exchange.

| | |
|---|---|
| **Alias** | `exchangewithdraw` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--exchange-id` | Yes | number | Exchange ID |
| `--token-id` | Yes | string | Token to withdraw |
| `--quant` | Yes | number | Amount to withdraw |
| `--owner` | No | address | Owner address |
| `--multi` | No | boolean | Multi-signature mode |

```bash
wallet-cli --network nile exchange-withdraw --exchange-id 1 --token-id _ --quant 500000000
```

---

### `market-sell-asset`

Place a limit sell order on the decentralized market.

| | |
|---|---|
| **Alias** | `marketsellasset` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--sell-token` | Yes | string | Token to sell (use `_` for TRX) |
| `--sell-quantity` | Yes | number | Amount to sell |
| `--buy-token` | Yes | string | Token to buy (use `_` for TRX) |
| `--buy-quantity` | Yes | number | Expected amount to buy (sets the price) |
| `--owner` | No | address | Seller address |
| `--multi` | No | boolean | Multi-signature mode |

```bash
wallet-cli --network nile market-sell-asset \
  --sell-token _ \
  --sell-quantity 1000000 \
  --buy-token "1000001" \
  --buy-quantity 500
```

---

### `market-cancel-order`

Cancel a previously placed market order.

| | |
|---|---|
| **Alias** | `marketcancelorder` |
| **Auth** | Required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--order-id` | Yes | string | Order ID (hex) |
| `--owner` | No | address | Owner address |
| `--multi` | No | boolean | Multi-signature mode |

```bash
wallet-cli --network nile market-cancel-order --order-id abc123def...
```

---

## 22. Help

### `help`

Display help information.

| | |
|---|---|
| **Alias** | `help` |
| **Auth** | Not required |

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--command` | No | string | Specific command to show help for |

```bash
wallet-cli help
wallet-cli --help
wallet-cli send-coin --help
```

---

## 23. Common Scenarios

### Scenario 1: Create a Wallet and Fund It

```bash
# Set your wallet password
export MASTER_PASSWORD="SecurePass123!"

# Create a new wallet on Nile testnet
wallet-cli register-wallet --name "test-wallet"
# Save the mnemonic phrase displayed! It's your backup.

# Check your address
wallet-cli get-address

# Fund it from the Nile testnet faucet (external step)
# Then verify your balance
wallet-cli --network nile get-balance
```

### Scenario 2: Send TRX to Someone

```bash
export MASTER_PASSWORD="SecurePass123!"

# Send 5 TRX (= 5,000,000 SUN)
wallet-cli --network nile send-coin \
  --to TRecipientAddress... \
  --amount 5000000

# Verify the transaction
wallet-cli --network nile get-transaction-info-by-id --id <txid-from-output>
```

### Scenario 3: Transfer USDT

```bash
export MASTER_PASSWORD="SecurePass123!"

# Transfer 10 USDT (= 10,000,000 in smallest unit)
wallet-cli --network nile transfer-usdt \
  --to TRecipientAddress... \
  --amount 10000000
```

### Scenario 4: Stake TRX for Energy

```bash
export MASTER_PASSWORD="SecurePass123!"

# Freeze 100 TRX for energy (Stake 2.0)
wallet-cli --network nile freeze-balance-v2 --amount 100000000 --resource 1

# Check your resources
wallet-cli --network nile get-account-resource --address TYourAddress...
```

### Scenario 5: Delegate Energy to Another Address

```bash
export MASTER_PASSWORD="SecurePass123!"

# Delegate 50 TRX worth of energy to a friend
wallet-cli --network nile delegate-resource \
  --amount 50000000 \
  --resource 1 \
  --receiver TFriendAddress...

# Later, reclaim it
wallet-cli --network nile undelegate-resource \
  --amount 50000000 \
  --resource 1 \
  --receiver TFriendAddress...
```

### Scenario 6: Vote for a Super Representative

```bash
export MASTER_PASSWORD="SecurePass123!"

# First, check available witnesses
wallet-cli --network nile list-witnesses

# Vote (you need frozen TRX for voting power)
wallet-cli --network nile vote-witness \
  --votes "TWitnessAddr1... 500 TWitnessAddr2... 300"

# Check unclaimed rewards later
wallet-cli --network nile get-reward --address TYourAddress...
```

### Scenario 7: Call a Read-Only Smart Contract (No Fee)

```bash
# Check USDT balance -- no wallet auth needed (read-only, no fee)
wallet-cli --network nile trigger-constant-contract \
  --contract TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf \
  --method "balanceOf(address)" \
  --params '"TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL"' \
  --owner TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL
```

### Scenario 8: JSON Output for Scripting

```bash
# Get balance as JSON and extract with jq
wallet-cli --output json --network nile get-balance --address TNPee... \
  | jq '.data.balance_trx'

# Check if command succeeded
wallet-cli --output json --network nile get-account --address TNPee... \
  | jq '.success'
```

---

## 24. Exit Codes & Error Handling

### Exit Codes

| Code | Meaning | Description |
|------|---------|-------------|
| `0` | Success | Command completed successfully |
| `1` | Execution Error | Runtime failure (network error, authentication failure, transaction rejected) |
| `2` | Usage Error | Invalid arguments, unknown command, missing required options |

### JSON Output Envelope

In `--output json` mode, all responses follow this structure:

**Success:**
```json
{
  "success": true,
  "data": {
    "key": "value"
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": "error_code",
  "message": "Human-readable error description"
}
```

Common error codes:
- `usage_error` -- invalid arguments or syntax
- `execution_error` -- runtime failure
- `query_failed` -- a query returned no data
- `missing_env` -- required environment variable is not set
- `not_found` -- requested resource not found
- `not_logged_in` -- authentication required but not provided

### Troubleshooting Tips

| Problem | Solution |
|---------|----------|
| "MASTER_PASSWORD is required..." | Set the `MASTER_PASSWORD` environment variable |
| "No active wallet selected..." | Run `set-active-wallet` or use `--wallet` flag |
| "Unknown global option..." | Global options must come before the command name |
| "Missing value for --network" | Provide one of: `main`, `nile`, `shasta`, `custom` |
| "Invalid value for --output" | Must be `text` or `json` |
| Command not found | Check spelling. Try the no-dash alias (e.g., `sendcoin` instead of `send-coin`) |

---

## 25. Appendix

### A. SUN / TRX Conversion Table

| TRX | SUN |
|-----|-----|
| 0.000001 | 1 |
| 0.001 | 1,000 |
| 0.01 | 10,000 |
| 0.1 | 100,000 |
| 1 | 1,000,000 |
| 10 | 10,000,000 |
| 100 | 100,000,000 |
| 1,000 | 1,000,000,000 |

**Formula:** SUN = TRX x 1,000,000

### B. Resource Type Codes

| Code | Resource | Used By |
|------|----------|---------|
| `0` | Bandwidth | All transactions (data transfer) |
| `1` | Energy | Smart contract calls |

### C. Network Endpoints

| Network | Description |
|---------|-------------|
| `main` | TRON Mainnet (production) |
| `nile` | Nile Testnet (recommended for development) |
| `shasta` | Shasta Testnet (legacy) |
| `custom` | Custom node (use with `--grpc-endpoint`) |

### D. Multi-Signature Usage

Many transaction commands support multi-signature mode via the `--multi` (or `-m`) flag. When enabled:

1. The command creates the transaction but does **not** broadcast it immediately.
2. Instead, it outputs the transaction for additional signatures.
3. After all required parties have signed, use `broadcast-transaction` to submit it.

To set up multi-sig, use `update-account-permission` to configure the account's permission structure first.

### E. Complete Command Index

| # | Command | Category | Auth |
|---|---------|----------|------|
| 1 | `register-wallet` | Wallet | No* |
| 2 | `list-wallet` | Wallet | No |
| 3 | `set-active-wallet` | Wallet | No |
| 4 | `get-active-wallet` | Wallet | No |
| 5 | `modify-wallet-name` | Wallet | Yes |
| 6 | `generate-sub-account` | Wallet | Yes |
| 7 | `clear-wallet-keystore` | Wallet | Yes |
| 8 | `reset-wallet` | Wallet | No |
| 9 | `send-coin` | Transaction | Yes |
| 10 | `transfer-usdt` | Transaction | Yes |
| 11 | `transfer-asset` | Transaction | Yes |
| 12 | `create-account` | Transaction | Yes |
| 13 | `update-account` | Transaction | Yes |
| 14 | `set-account-id` | Transaction | Yes |
| 15 | `asset-issue` | Transaction | Yes |
| 16 | `update-asset` | Transaction | Yes |
| 17 | `participate-asset-issue` | Transaction | Yes |
| 18 | `update-account-permission` | Transaction | Yes |
| 19 | `broadcast-transaction` | Transaction | No |
| 20 | `gas-free-transfer` | Transaction | Yes |
| 21 | `freeze-balance-v2` | Staking | Yes |
| 22 | `unfreeze-balance-v2` | Staking | Yes |
| 23 | `withdraw-expire-unfreeze` | Staking | Yes |
| 24 | `cancel-all-unfreeze-v2` | Staking | Yes |
| 25 | `delegate-resource` | Staking | Yes |
| 26 | `undelegate-resource` | Staking | Yes |
| 27 | `withdraw-balance` | Staking | Yes |
| 28 | `freeze-balance` | Staking | Yes |
| 29 | `unfreeze-balance` | Staking | Yes |
| 30 | `unfreeze-asset` | Staking | Yes |
| 31 | `get-address` | Query | Yes |
| 32 | `get-balance` | Query | Conditional |
| 33 | `get-usdt-balance` | Query | Conditional |
| 34 | `get-account` | Query | No |
| 35 | `get-account-by-id` | Query | No |
| 36 | `get-account-net` | Query | No |
| 37 | `get-account-resource` | Query | No |
| 38 | `current-network` | Query | No |
| 39 | `get-block` | Query | No |
| 40 | `get-block-by-id` | Query | No |
| 41 | `get-block-by-id-or-num` | Query | No |
| 42 | `get-block-by-latest-num` | Query | No |
| 43 | `get-block-by-limit-next` | Query | No |
| 44 | `get-transaction-by-id` | Query | No |
| 45 | `get-transaction-info-by-id` | Query | No |
| 46 | `get-transaction-count-by-block-num` | Query | No |
| 47 | `get-asset-issue-by-account` | Query | No |
| 48 | `get-asset-issue-by-id` | Query | No |
| 49 | `get-asset-issue-by-name` | Query | No |
| 50 | `get-asset-issue-list-by-name` | Query | No |
| 51 | `list-asset-issue` | Query | No |
| 52 | `list-asset-issue-paginated` | Query | No |
| 53 | `get-chain-parameters` | Query | No |
| 54 | `get-bandwidth-prices` | Query | No |
| 55 | `get-energy-prices` | Query | No |
| 56 | `get-memo-fee` | Query | No |
| 57 | `get-next-maintenance-time` | Query | No |
| 58 | `get-contract` | Contract | No |
| 59 | `get-contract-info` | Contract | No |
| 60 | `get-delegated-resource` | Query | No |
| 61 | `get-delegated-resource-v2` | Query | No |
| 62 | `get-delegated-resource-account-index` | Query | No |
| 63 | `get-delegated-resource-account-index-v2` | Query | No |
| 64 | `get-can-delegated-max-size` | Query | No |
| 65 | `get-available-unfreeze-count` | Query | No |
| 66 | `get-can-withdraw-unfreeze-amount` | Query | No |
| 67 | `get-brokerage` | Query | No |
| 68 | `get-reward` | Query | No |
| 69 | `list-nodes` | Query | No |
| 70 | `list-witnesses` | Query | No |
| 71 | `list-proposals` | Query | No |
| 72 | `list-proposals-paginated` | Query | No |
| 73 | `get-proposal` | Query | No |
| 74 | `list-exchanges` | Query | No |
| 75 | `list-exchanges-paginated` | Query | No |
| 76 | `get-exchange` | Query | No |
| 77 | `get-market-order-by-account` | Query | No |
| 78 | `get-market-order-by-id` | Query | No |
| 79 | `get-market-order-list-by-pair` | Query | No |
| 80 | `get-market-pair-list` | Query | No |
| 81 | `get-market-price-by-pair` | Query | No |
| 82 | `gas-free-info` | Query | Conditional |
| 83 | `gas-free-trace` | Query | No |
| 84 | `deploy-contract` | Contract | Yes |
| 85 | `trigger-contract` | Contract | Yes |
| 86 | `trigger-constant-contract` | Contract | No |
| 87 | `estimate-energy` | Contract | No |
| 88 | `clear-contract-abi` | Contract | Yes |
| 89 | `update-setting` | Contract | Yes |
| 90 | `update-energy-limit` | Contract | Yes |
| 91 | `create-witness` | Witness | Yes |
| 92 | `update-witness` | Witness | Yes |
| 93 | `vote-witness` | Witness | Yes |
| 94 | `update-brokerage` | Witness | Yes |
| 95 | `create-proposal` | Proposal | Yes |
| 96 | `approve-proposal` | Proposal | Yes |
| 97 | `delete-proposal` | Proposal | Yes |
| 98 | `exchange-create` | Exchange | Yes |
| 99 | `exchange-inject` | Exchange | Yes |
| 100 | `exchange-withdraw` | Exchange | Yes |
| 101 | `market-sell-asset` | Exchange | Yes |
| 102 | `market-cancel-order` | Exchange | Yes |
| 103 | `help` | Misc | No |

\* `register-wallet` requires `MASTER_PASSWORD` to be set (for keystore encryption) but does not authenticate against an existing wallet.

**Auth legend:** Yes = always required | No = never required | Conditional = depends on options provided
