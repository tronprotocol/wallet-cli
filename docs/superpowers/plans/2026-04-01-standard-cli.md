# Standard CLI Implementation Plan

**Status:** Completed (2026-04-01)  
**Spec:** `docs/superpowers/specs/2026-04-01-standard-cli-design.md`

**Goal:** Add non-interactive standard CLI mode to the TRON wallet-cli with named options, JSON/text output, authenticating via keystore + `MASTER_PASSWORD` env var.

**Architecture:** A thin CLI layer (`cli/` package) sits on top of the existing `WalletApiWrapper`/`WalletApi` stack. `Client.main()` is a router: `--interactive` launches the existing REPL, otherwise `CommandRegistry` dispatches to command handlers that call the same `WalletApiWrapper` methods. `OutputFormatter` handles JSON/text output.

**Tech Stack:** Java 8, JCommander 1.82, Gson 2.11.0 (already in deps), Gradle

---

## Files Created

### CLI Framework

| File | Responsibility |
|------|----------------|
| `cli/OptionDef.java` | Single option definition: name, description, required flag, type |
| `cli/ParsedOptions.java` | Parsed option values with typed getters |
| `cli/CommandHandler.java` | Functional interface for command execution |
| `cli/CommandDefinition.java` | Command metadata: name, aliases, description, options, handler, arg parsing |
| `cli/OutputFormatter.java` | JSON/text output formatting, error formatting, exit codes. JSON mode: strictly JSON-only stdout (info messages suppressed) |
| `cli/GlobalOptions.java` | Parse global flags (`--output`, `--network`, `--wallet`, `--grpc-endpoint`, etc.) |
| `cli/CommandRegistry.java` | Register all commands, resolve names/aliases, generate help, did-you-mean |
| `cli/StandardCliRunner.java` | Orchestrates: parse globals → network → authenticate → lookup → execute |

### Command Groups (120 commands total)

| File | Count | Commands |
|------|-------|----------|
| `cli/commands/QueryCommands.java` | 53 | get-address, get-balance, get-account, get-block, list-witnesses, get-chain-parameters, etc. |
| `cli/commands/TransactionCommands.java` | 14 | send-coin, transfer-asset, create-account, update-account, broadcast-transaction, etc. |
| `cli/commands/ContractCommands.java` | 7 | deploy-contract, trigger-contract, trigger-constant-contract, estimate-energy, etc. |
| `cli/commands/StakingCommands.java` | 10 | freeze-balance-v2, unfreeze-balance-v2, delegate-resource, withdraw-expire-unfreeze, etc. |
| `cli/commands/WitnessCommands.java` | 4 | create-witness, update-witness, vote-witness, update-brokerage |
| `cli/commands/ProposalCommands.java` | 3 | create-proposal, approve-proposal, delete-proposal |
| `cli/commands/ExchangeCommands.java` | 6 | exchange-create, exchange-inject, exchange-withdraw, market-sell-asset, etc. |
| `cli/commands/WalletCommands.java` | 16 | login, logout, register-wallet, import-wallet, change-password, lock, unlock, etc. |
| `cli/commands/MiscCommands.java` | 7 | generate-address, get-private-key-by-mnemonic, help, encoding-converter, etc. |

### Modified Files

| File | Change |
|------|--------|
| `Client.java` | `main()` rewritten as router (existing `run()` and all commands untouched) |
| `Utils.java` | `inputPassword()` checks `MASTER_PASSWORD` env var before prompting |
| `build.gradle` | Added `qaRun` task |

---

## Tasks (all completed)

- [x] **Task 1:** CLI Framework — Core Data Types (OptionDef, ParsedOptions, CommandHandler, CommandDefinition)
- [x] **Task 2:** CLI Framework — OutputFormatter (JSON/text output, protobuf formatting, exit codes)
- [x] **Task 3:** CLI Framework — GlobalOptions (global flag parsing)
- [x] **Task 4:** CLI Framework — CommandRegistry (alias resolution, help generation, did-you-mean)
- [x] **Task 5:** CLI Framework — StandardCliRunner (command dispatch, authentication, network selection)
- [x] **Task 6:** Modify Existing Files — main() router, MASTER_PASSWORD support
- [x] **Task 7:** Command Group — QueryCommands (53 read-only commands)
- [x] **Task 8:** Command Group — TransactionCommands (14 mutation commands)
- [x] **Task 9:** Command Group — ContractCommands (7 contract commands)
- [x] **Task 10:** Command Group — StakingCommands (10 staking commands)
- [x] **Task 11:** Command Groups — WitnessCommands, ProposalCommands, ExchangeCommands (13 commands)
- [x] **Task 12:** Command Groups — WalletCommands, MiscCommands (23 commands)
- [x] **Task 13:** Full Integration — Build, shadowJar, smoke tests (help, version, query, unknown command)

### Smoke Test Results

```
wallet-cli                           → global help with 120 commands listed ✓
wallet-cli --version                 → "wallet-cli v4.9.3" ✓
wallet-cli send-coin --help          → usage with --to, --amount, --owner, --multi ✓
wallet-cli sendkon                   → "Did you mean: sendcoin?" exit 2 ✓
wallet-cli --network nile get-chain-parameters → JSON chain params from Nile ✓
wallet-cli --network nile send-coin --to $ADDR --amount 1 → successful (auth via MASTER_PASSWORD) ✓
```
