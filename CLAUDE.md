# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

The repository holds two independent implementations:

- `ts/` — the agent-first TypeScript rewrite (npm package `@tron-walletcli/wallet-cli`). See
  [TypeScript](#typescript-ts) and `ts/README.md`.
- `java/` — the original REPL-first implementation. See [Java](#java-java).

## TypeScript (`ts/`)

A self-contained, agent-first CLI (Node.js 22.23.4+ / 24.22.1+ / 26.12.1+, ESM, TypeScript). Every command has a
stable JSON envelope, deterministic exit codes, and discoverable schemas; interactive prompts are used only for
secret input (create / import / backup / delete). **All `ts/` commands run from the `ts/` directory.**

```bash
cd ts
npm ci                 # install
npm run build          # bundle to dist/ via tsup (bin: wallet-cli -> dist/index.js)
npm run dev -- <args>  # run from source via tsx (e.g. npm run dev -- create --label main)
npm test               # vitest (tests are co-located as *.test.ts)
npm run typecheck      # tsc --noEmit
npm run depcruise      # dependency-cruiser — enforces the layer rules
```

`npm run depcruise` uses `ts/.dependency-cruiser-known-violations.json` and fails on new violations or
stale/duplicate baseline entries. After fixing a known violation or enabling a rule with existing violations,
run `npm run depcruise:baseline` from `ts/`, review the exact entries added or removed, and rerun
`npm run depcruise`. Commit the baseline diff with the corresponding code or rule change. Regeneration records
all current violations; fix unintended new violations before regenerating. To see unsuppressed diagnostics,
run `npx --no-install depcruise src`.

### Development rules

The rules for `ts/` are in `ts/docs/dev/rules/`. They are the single source of truth; do not restate them here.

@ts/docs/dev/rules/architecture.md
@ts/docs/dev/rules/comments.md

Which commands each chain family supports: the `families` tags in `wallet-cli --json-schema`.

### Adding a command

1. Add the command module under `adapters/inbound/cli/commands/` with its Zod schema.
2. Route it to an application use case under `application/use-cases/`.
3. If it needs new I/O, define a port in `application/ports/`, implement it in `adapters/outbound/`, and wire
   it in `bootstrap/composition.ts`.
4. Add co-located `*.test.ts` and run `npm run depcruise && npm run typecheck && npm test`.

## Java (`java/`)

**All Java paths are relative to `java/`, and all Java commands are run from that directory** (`cd java` first).

### Build & Run

```bash
# Build the project (generates protobuf sources into src/main/gen/)
./gradlew build

# Build fat JAR (output: build/libs/wallet-cli.jar)
./gradlew shadowJar

# Run the interactive shell (the only way to run it)
./gradlew run
# Or after building: java -jar build/libs/wallet-cli.jar

# Run tests
./gradlew test

# Run a single test class
./gradlew test --tests "org.tron.keystore.StringUtilsTest"

# Clean (also removes src/main/gen/)
./gradlew clean
```

Java 8 source/target compatibility. Protobuf sources are in `src/main/protos/` and generate into `src/main/gen/` — this directory is git-tracked but rebuilt on `clean`.

### End-to-end coverage

`java/qa-repl/` drives the real interactive shell over a pty (`expect`) against a
funded Nile account — wallet lifecycle, account queries, a signed 1 TRX transfer, and
the not-logged-in guards. `./gradlew build` passing does **not** mean the shell still
works, so run it whenever you touch shared helpers:

```bash
cd java
./gradlew shadowJar
./qa-repl/run.sh build/libs/wallet-cli.jar head        # REPL regression
./qa-repl/cli-boundary.sh build/libs/wallet-cli.jar    # entry point takes only --version/--help
```

### Architecture

This is a **TRON blockchain CLI wallet** built on the [Trident SDK](https://github.com/tronprotocol/trident). It communicates with TRON nodes via gRPC.

#### One CLI Mode

**Interactive REPL** — `Client` class with JCommander `@Parameters` inner classes. Entry point:
`org.tron.walletcli.Client`. Features tab completion, interactive prompts, and conversational
output. This is the largest file (~4800 lines).

The shell is started one way only: a bare `java -jar wallet-cli.jar`. The entry point recognises
`--version` and `--help` and nothing else; any other argument prints a one-line pointer to the
TypeScript CLI on stderr and exits 2. Non-interactive, scriptable and CI use belongs to `ts/`
(npm `@tron-walletcli/wallet-cli`).

#### Request Flow

```
User Input → Client (JCommander) → WalletApiWrapper → WalletApi → Trident SDK → gRPC → TRON Node
```

#### Key Classes

- **`org.tron.walletcli.Client`** — REPL entry point and command dispatcher. Each command is a JCommander `@Parameters` inner class.
- **`org.tron.walletcli.WalletApiWrapper`** — Orchestration layer between CLI and core wallet logic. Handles transaction construction, signing, and broadcasting.
- **`org.tron.walletserver.WalletApi`** — Core wallet operations: account management, transaction creation, proposals, asset operations. Delegates gRPC calls to Trident.
- **`org.tron.walletcli.ApiClientFactory`** — Creates gRPC client instances for different networks (mainnet, Nile testnet, Shasta testnet, custom).

#### Package Organization

| Package | Purpose |
|---------|---------|
| `walletcli` | REPL entry point, API wrapper |
| `walletserver` | Core wallet API and gRPC communication |
| `common` | Crypto utilities, encoding, enums, shared helpers |
| `core` | Configuration, data converters, DAOs, exceptions, managers |
| `keystore` | Wallet file encryption/decryption, key management |
| `ledger` | Ledger hardware wallet integration via HID |
| `mnemonic` | BIP39 mnemonic seed phrase support |
| `multi` | Multi-signature transaction handling |
| `gasfree` | GasFree transaction API (transfer tokens without gas) |

#### Configuration

- **Network config:** `src/main/resources/config.conf` (HOCON format via Typesafe Config)
- **Logging:** `src/main/resources/logback.xml` (Logback, INFO level console + rolling file)
- **Lombok:** `lombok.config` — uses `logger` as the log field name (not the default `log`)

#### Key Frameworks & Libraries

- **Trident SDK 0.11.0** — All gRPC API calls to TRON nodes
- **JCommander 1.82** — CLI argument parsing (interactive REPL)
- **JLine 3.25.0** — Interactive terminal/readline
- **BouncyCastle** — Cryptographic operations
- **Protobuf 3.25.8 / gRPC 1.75.0** — Protocol definitions and transport
- **Lombok** — `@Getter`, `@Setter`, `@Slf4j` etc. (annotation processing)
