# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
# Build the project (generates protobuf sources into src/main/gen/)
./gradlew build

# Build fat JAR (output: build/libs/wallet-cli.jar)
./gradlew shadowJar

# Run in REPL 交互模式 (human-friendly, interactive prompts)
./gradlew run
# Or after building: java -jar build/libs/wallet-cli.jar

# Run in standard CLI mode (non-interactive, scriptable)
java -jar build/libs/wallet-cli.jar --network nile get-account --address TXyz...
java -jar build/libs/wallet-cli.jar --output json --network nile get-account --address TXyz...

# Run tests
./gradlew test

# Run a single test class
./gradlew test --tests "org.tron.keystore.StringUtilsTest"

# Clean (also removes src/main/gen/)
./gradlew clean
```

Java 8 source/target compatibility. Protobuf sources are in `src/main/protos/` and generate into `src/main/gen/` — this directory is git-tracked but rebuilt on `clean`.

## QA Verification

The `qa/` directory contains shell-based parity tests that compare interactive REPL output vs standard CLI (text and JSON modes). Requires a funded Nile testnet account.

```bash
# Run QA verification (needs TRON_TEST_APIKEY env var for private key)
TRON_TEST_APIKEY=<nile-private-key> bash qa/run.sh verify

# QA config is in qa/config.sh; test commands are in qa/commands/*.sh
# MASTER_PASSWORD env var is used for keystore auto-login (default: testpassword123A)
```

## Architecture

This is a **TRON blockchain CLI wallet** built on the [Trident SDK](https://github.com/tronprotocol/trident). It communicates with TRON nodes via gRPC.

### Two CLI Modes

1. **REPL 交互模式** (human-friendly) — `Client` class with JCommander `@Parameters` inner classes. Entry point: `org.tron.walletcli.Client`. Features tab completion, interactive prompts, and conversational output. This is the largest file (~4700 lines). Best for manual exploration and day-to-day wallet management by humans.
2. **Standard CLI 模式** (AI-agent-friendly) — `StandardCliRunner` with `CommandRegistry`/`CommandDefinition` pattern in `org.tron.walletcli.cli.*`. Supports `--output json`, `--network`, `--quiet` flags. Commands are registered in `cli/commands/` classes (e.g., `WalletCommands`, `TransactionCommands`, `QueryCommands`). Designed for automation: deterministic exit codes, structured JSON output, no interactive prompts, and env-var-based authentication — ideal for AI agents, scripts, and CI/CD pipelines.

The standard CLI suppresses all stray stdout/stderr in JSON mode to ensure machine-parseable output. Authentication is automatic via `MASTER_PASSWORD` env var + keystore files in `Wallet/`.

### Standard CLI Contract

Before changing parser behavior, auth flow, JSON output, command success/failure semantics, or `qa/` expectations for
the standard CLI, read:

- `docs/standard-cli-contract-spec.md`

Treat that file as the source of truth for the standard CLI contract unless the repository owner explicitly decides to
revise it.

### Request Flow

```
# Standard CLI mode:
User Input → GlobalOptions → StandardCliRunner → CommandRegistry → CommandHandler → WalletApiWrapper → WalletApi → Trident SDK → gRPC → TRON Node

# Interactive REPL mode:
User Input → Client (JCommander) → WalletApiWrapper → WalletApi → Trident SDK → gRPC → TRON Node
```

### Key Classes

- **`org.tron.walletcli.Client`** — Legacy REPL entry point and CLI command dispatcher. Each command is a JCommander `@Parameters` inner class.
- **`org.tron.walletcli.cli.StandardCliRunner`** — New standard CLI executor. Handles network init, auto-authentication, JSON stream suppression, and command dispatch.
- **`org.tron.walletcli.cli.CommandRegistry`** — Maps command names/aliases to `CommandDefinition` instances. Supports fuzzy suggestion on typos.
- **`org.tron.walletcli.cli.CommandDefinition`** — Immutable command metadata (name, aliases, options, handler). Built via fluent `Builder` API.
- **`org.tron.walletcli.cli.OutputFormatter`** — Formats output as text or JSON. In JSON mode, wraps results in `{"success":true,"data":...}` envelope.
- **`org.tron.walletcli.WalletApiWrapper`** — Orchestration layer between CLI and core wallet logic. Handles transaction construction, signing, and broadcasting.
- **`org.tron.walletserver.WalletApi`** — Core wallet operations: account management, transaction creation, proposals, asset operations. Delegates gRPC calls to Trident.
- **`org.tron.walletcli.ApiClientFactory`** — Creates gRPC client instances for different networks (mainnet, Nile testnet, Shasta testnet, custom).

### Adding a New Standard CLI Command

1. Create or extend a class in `cli/commands/` (e.g., `TransactionCommands.java`)
2. Build a `CommandDefinition` via `CommandDefinition.builder()` with name, aliases, options, and handler
3. Register it in the appropriate `register(CommandRegistry)` method
4. The handler receives `(ParsedOptions, WalletApiWrapper, OutputFormatter)` — use `formatter.success()/error()` for output

### Package Organization

| Package | Purpose |
|---------|---------|
| `walletcli` | CLI entry points, API wrapper |
| `walletcli.cli` | Standard CLI framework: registry, definitions, options, formatter |
| `walletcli.cli.commands` | Standard CLI command implementations by domain |
| `walletserver` | Core wallet API and gRPC communication |
| `common` | Crypto utilities, encoding, enums, shared helpers |
| `core` | Configuration, data converters, DAOs, exceptions, managers |
| `keystore` | Wallet file encryption/decryption, key management |
| `ledger` | Ledger hardware wallet integration via HID |
| `mnemonic` | BIP39 mnemonic seed phrase support |
| `multi` | Multi-signature transaction handling |
| `gasfree` | GasFree transaction API (transfer tokens without gas) |

### Configuration

- **Network config:** `src/main/resources/config.conf` (HOCON format via Typesafe Config)
- **Logging:** `src/main/resources/logback.xml` (Logback, INFO level console + rolling file)
- **Lombok:** `lombok.config` — uses `logger` as the log field name (not the default `log`)

### Key Frameworks & Libraries

- **Trident SDK 0.10.0** — All gRPC API calls to TRON nodes
- **JCommander 1.82** — CLI argument parsing (REPL 交互模式)
- **JLine 3.25.0** — Interactive terminal/readline
- **BouncyCastle** — Cryptographic operations
- **Protobuf 3.25.5 / gRPC 1.60.0** — Protocol definitions and transport
- **Lombok** — `@Getter`, `@Setter`, `@Slf4j` etc. (annotation processing)
