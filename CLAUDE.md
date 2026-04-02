# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## QA — MANDATORY

**Every code change must pass the QA. No exceptions.**

```bash
# Run before AND after any code change:
./qa/run.sh verify

# Current baseline: 321 tests, 315 passed, 0 failed (JSON format), 6 skipped
# Any increase in failures = regression = must fix before done
```

The QA verifies all 120 commands across help, text output, JSON output, on-chain transactions, REPL parity, and wallet management. It runs against Nile testnet and requires:
- `TRON_TEST_APIKEY` — Nile private key
- `MASTER_PASSWORD` — wallet password
- `TRON_TEST_MNEMONIC` — (optional) BIP39 mnemonic, may be a different account

Full QA spec: `docs/superpowers/specs/2026-04-01-qa-spec.md`

## Build & Run

```bash
# Build the project (generates protobuf sources into src/main/gen/)
./gradlew build

# Build fat JAR (output: build/libs/wallet-cli.jar)
./gradlew shadowJar

# Run the CLI interactively
./gradlew run
# Or after building: java -jar build/libs/wallet-cli.jar

# Run tests
./gradlew test

# Clean (also removes src/main/gen/)
./gradlew clean
```

Java 8 source/target compatibility. Protobuf sources are in `src/main/protos/` and generate into `src/main/gen/` — this directory is git-tracked but rebuilt on `clean`.

## Architecture

This is a **TRON blockchain CLI wallet** built on the [Trident SDK](https://github.com/tronprotocol/trident). It communicates with TRON nodes via gRPC.

### Request Flow

```
User Input → Client (JCommander CLI) → WalletApiWrapper → WalletApi → Trident SDK → gRPC → TRON Node
```

### Key Classes

- **`org.tron.walletcli.Client`** — Main entry point and CLI command dispatcher. Each command is a JCommander `@Parameters` inner class. This is the largest file (~4700 lines).
- **`org.tron.walletcli.WalletApiWrapper`** — Orchestration layer between CLI and core wallet logic. Handles transaction construction, signing, and broadcasting.
- **`org.tron.walletserver.WalletApi`** — Core wallet operations: account management, transaction creation, proposals, asset operations. Delegates gRPC calls to Trident.
- **`org.tron.walletcli.ApiClientFactory`** — Creates gRPC client instances for different networks (mainnet, Nile testnet, Shasta testnet, custom).

### Package Organization

| Package | Purpose |
|---------|---------|
| `walletcli` | CLI entry point, command definitions, API wrapper |
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
- **JCommander 1.82** — CLI argument parsing (each command is a `@Parameters`-annotated class)
- **JLine 3.25.0** — Interactive terminal/readline
- **BouncyCastle** — Cryptographic operations
- **Protobuf 3.25.5 / gRPC 1.60.0** — Protocol definitions and transport
- **Lombok** — `@Getter`, `@Setter`, `@Slf4j` etc. (annotation processing)
