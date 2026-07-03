# wallet-cli

An agent-first TypeScript CLI wallet for TRON, with deterministic commands, structured JSON, discoverable schemas, and secure secret input. Privacy-sensitive operations such as import, backup, and delete retain guided, human-friendly interactions.

> Currently supports TRON mainnet, Nile, and Shasta. EVM chains are not yet supported by this version.

## Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Common Tasks](#common-tasks)
- [Automation and Agent Integration](#automation-and-agent-integration)
- [Security](#security)
- [Development](#development)

## Features

| Category | Capabilities |
| --- | --- |
| Wallets | Create BIP39 HD wallets, import mnemonics or private keys, derive accounts, rename, back up, and delete |
| External accounts | Watch-only addresses, Ledger TRON App, and on-device signing |
| Accounts | TRX balance, raw account data, transaction history, token portfolio, and best-effort USD valuation |
| Tokens | TRC10 and TRC20 metadata and balances, plus a custom token address book |
| Transactions | TRX, TRC10, and TRC20 transfers; dry-run; sign-only; broadcast; status and receipt queries |
| Contracts | Constant calls, state-changing calls, contract metadata, and deployment |
| Stake 2.0 | Stake, unstake, delegate and reclaim resources, cancel pending unstakes, and withdraw expired unstakes |
| Signing | TIP-191/V2 message signing |
| Automation | Stable JSON envelopes, deterministic exit codes, and a complete command JSON Schema |

## Quick Start

### 1. Install

Node.js 20 or later is required.

```bash
npm install -g walletcli
```

Verify the installation:

```bash
wallet-cli --version
wallet-cli --help
```

### 2. Create your first wallet

```bash
wallet-cli create --label main
```

The CLI prompts you to set a master password. It encrypts your local keys and cannot be recovered by this tool if lost.

Inspect your wallets and make `main` the active account:

```bash
wallet-cli list
wallet-cli use main
wallet-cli current
```

### 3. Start on testnet

For your first transaction, set Nile as the default network:

```bash
wallet-cli config defaultNetwork tron:nile
wallet-cli account balance
```

You can also select a network for one command without changing the default:

```bash
wallet-cli account balance --network tron:nile
```

### 4. Dry-run before sending

Build and estimate a transaction without signing or broadcasting it:

```bash
wallet-cli tx send \
  --network tron:nile \
  --to T... \
  --amount 1 \
  --dry-run
```

After checking the recipient, amount, and estimated cost, send it:

```bash
wallet-cli tx send \
  --network tron:nile \
  --to T... \
  --amount 1 \
  --wait
```

The CLI prompts for the master password when a signature is required. Without `--wait`, it returns the txid immediately after a successful broadcast. With `--wait`, it polls until the transaction is confirmed, fails, or reaches the wait timeout.

## Common Tasks

### Import an existing wallet

In an interactive terminal, mnemonic and private-key prompts hide their input:

```bash
wallet-cli import mnemonic --label imported
wallet-cli import private-key --label hot
```

Register an address that can be monitored but cannot sign:

```bash
wallet-cli import watch --address T... --label treasury
```

Derive the next account from an HD wallet. Find its seed ID with `wallet-cli list`:

```bash
wallet-cli derive --seed-id wlt_ab12cd34 --label operations
```

### Use a Ledger device

Connect and unlock the Ledger, open the TRON App, and register its first account:

```bash
wallet-cli import ledger --app tron --index 0 --label cold
wallet-cli use cold
wallet-cli account balance
```

Ledger private keys are never written locally. Signing requires confirmation on the device. You can also provide a derivation path with `--path`, or locate an account with `--address` and `--scan-limit`.

### Query accounts and assets

```bash
wallet-cli account balance
wallet-cli account portfolio
wallet-cli account history --limit 10
wallet-cli account info --output json
```

Wallet-bound commands use the active account by default. Override it with a label, account ID, or address:

```bash
wallet-cli account balance --account treasury
```

### Work with TRC10 and TRC20 tokens

The mainnet address book includes USDT and USDC. Add a custom TRC20 contract to use its symbol in later commands:

```bash
wallet-cli token add --contract TR7...
wallet-cli token list
wallet-cli token balance --contract TR7...
wallet-cli tx send --to T... --token USDT --amount 5 --dry-run
```

You can also use `--contract` directly. Use `--asset-id` for TRC10 tokens:

```bash
wallet-cli tx send --to T... --contract TR7... --amount 5
wallet-cli tx send --to T... --asset-id 1002000 --raw-amount 1000000
```

### Inspect transactions and sign offline

```bash
wallet-cli tx status --txid <TXID>
wallet-cli tx info --txid <TXID> --output json
```

Commands that change chain state support three execution modes:

- Default: build, sign, and broadcast.
- `--dry-run`: build and estimate without signing or broadcasting.
- `--sign-only`: sign and output the transaction without broadcasting. Submit it later with `tx broadcast --tx-stdin`.

Use command help for the complete set of options:

```bash
wallet-cli tx send --help
wallet-cli tx broadcast --help
```

### Interact with smart contracts

Inspect a contract and make a read-only call:

```bash
wallet-cli contract info --contract T...
wallet-cli contract call \
  --contract T... \
  --method 'balanceOf(address)' \
  --params '[{"type":"address","value":"T..."}]'
```

Dry-run a state-changing call before submitting it:

```bash
wallet-cli contract send \
  --contract T... \
  --method 'transfer(address,uint256)' \
  --params '[{"type":"address","value":"T..."},{"type":"uint256","value":"1000000"}]' \
  --dry-run
```

Deploy a contract:

```bash
wallet-cli contract deploy \
  --abi '[...]' \
  --bytecode 60... \
  --fee-limit 1000000000 \
  --params '[100,"T..."]' \
  --dry-run
```

### Use Stake 2.0

Stake amounts are specified in SUN (1 TRX = 1,000,000 SUN):

```bash
wallet-cli stake freeze --amount-sun 1000000 --resource energy --dry-run
wallet-cli stake delegate --amount-sun 1000000 --receiver T... --resource energy --dry-run
wallet-cli stake undelegate --amount-sun 1000000 --receiver T... --resource energy --dry-run
wallet-cli stake unfreeze --amount-sun 1000000 --resource energy --dry-run
wallet-cli stake withdraw --dry-run
```

### Sign a message

```bash
wallet-cli message sign --message 'hello'
```

## Automation and Agent Integration

### JSON output

```bash
wallet-cli account balance --output json
wallet-cli tx info --txid <TXID> --output json
```

JSON mode uses the `wallet-cli.result.v1` envelope and writes exactly one terminal frame to stdout. Exit codes are deterministic:

| Exit code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | Execution, authentication, device, or chain error |
| `2` | Invalid command usage or arguments |

### Discover commands

Agents do not need to parse human-readable help. Retrieve every command, input schema, example, and prerequisite in one call:

```bash
wallet-cli --json-schema
```

Retrieve the input schema for one command:

```bash
wallet-cli tx send --json-schema
```

### Provide secrets safely

Use stdin flags in non-interactive environments. Do not put passwords, mnemonics, or private keys directly in argv or exported environment variables:

```bash
printf '%s\n' "$WALLET_PASSWORD" | wallet-cli message sign --message 'hello' --password-stdin --output json
printf '%s\n' "$MNEMONIC" | wallet-cli import mnemonic --label main --mnemonic-stdin
printf '%s\n' "$PRIVATE_KEY" | wallet-cli import private-key --label hot --private-key-stdin
```

These examples assume the shell variables are populated securely and are not exported. Only one `*-stdin` flag may consume stdin in each invocation. Use an interactive terminal when one operation requires two secrets.

### Source secrets from a password manager

Because secrets are read from stdin, you can pipe them straight from a password manager. The secret is never written to argv, an environment variable, a temp file, or shell history — the manager keeps it encrypted at rest, and the CLI consumes it once and discards it. This pairs well with the no-`MASTER_PASSWORD`-env design: the password manager is where the secret lives, the pipe is how it travels.

**1Password (`op read`):**

```bash
# 1. Store the master password once (op stores it encrypted).
op item create --category=password --title='wallet-cli master' password='<master-password>'

# 2. Use it via pipe — nothing sensitive touches argv or history.
op read 'op://Private/wallet-cli master/password' | \
  wallet-cli create --label main --password-stdin
```

**macOS Keychain (`security`):**

```bash
# 1. Store the master password once (omit the value after -w to be prompted, so it stays out of history).
security add-generic-password -s wallet-cli-master -a "$USER" -w

# 2. Use it via pipe.
security find-generic-password -s wallet-cli-master -w | \
  wallet-cli create --label main --password-stdin
```

Only one `*-stdin` flag may consume stdin per invocation, so commands that need two secrets at once (for example `import mnemonic`, which needs both a mnemonic and a password) can pipe one secret and must supply the other interactively.

Use `WALLET_CLI_HOME` to isolate test or automation data. The default data directory is `~/.wallet-cli`:

```bash
WALLET_CLI_HOME=/tmp/wallet-cli-demo wallet-cli list --output json
```

## Security

- Mnemonics and private keys are encrypted locally using scrypt, AES-128-CTR, and a Keccak MAC.
- The keystore uses one master password. Secrets are not accepted through argv or CLI-specific environment variables.
- Configuration, keystore, and backup data are written with restricted permissions. `backup` creates `0600` files and never overwrites an existing file.
- Ledger accounts store only the address and derivation path locally; signing remains on the hardware device.
- Watch-only accounts can query data but cannot sign.
- Test on Nile and use `--dry-run` before sending production transactions. Backup files contain secret material capable of restoring an account and must be protected like private keys.

Back up an account:

```bash
wallet-cli backup main --out ~/main-backup.json
```

## Configuration and Command Reference

```bash
wallet-cli config
wallet-cli networks
wallet-cli COMMAND --help
```

Global options include `--network`, `--account`, `--output text|json`, `--timeout`, and `--verbose`. Broadcasting commands also support `--wait` and `--wait-timeout`.

## Development

```bash
npm ci
npm run typecheck
npm run depcruise
npm test
npm run build
```

The Nile live suite uses an isolated `WALLET_CLI_HOME` and does not copy or print private material:

```bash
npm run test:live:nile
```

For the design and CLI contracts, see the [architecture source of truth](./docs/typescript-wallet-cli-architecture-source-of-truth.md) and the [architecture overview](./docs/architecture.md).
