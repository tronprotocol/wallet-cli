# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

The repository holds two independent implementations:

- `java/` — the original REPL-first implementation, described by the rest of this file.
- `ts/` — the agent-first TypeScript rewrite (npm package `@tron-walletcli/wallet-cli`). See the
  **TypeScript Implementation** section below and `ts/README.md`.

Everything below (except the TypeScript Implementation section) refers to the Java implementation.
**All Java paths are relative to `java/`, and all Java commands are run from that directory**
(`cd java` first).

## TypeScript Implementation

The `ts/` package is a self-contained, agent-first CLI (Node.js 20+, ESM, TypeScript). Every command
has a stable JSON envelope, deterministic exit codes, and discoverable schemas; interactive prompts
are used only for secret input (create / import / backup / delete). **All `ts/` commands run from the
`ts/` directory.**

```bash
cd ts
npm ci                 # install
npm run build          # bundle to dist/ via tsup (bin: wallet-cli -> dist/index.js)
npm run dev -- <args>  # run from source via tsx (e.g. npm run dev -- create --label main)
npm test               # vitest (tests are co-located as *.test.ts)
npm run typecheck      # tsc --noEmit
npm run depcruise      # dependency-cruiser — enforces the architecture rules below
```

### Architecture (hexagonal / ports & adapters)

Dependencies point inward, and the table below is the rule — read it before changing boundaries,
ports, or command routing. `depcruise` enforces it in CI (`ts/.dependency-cruiser.cjs`).
`ts/docs/machine-interface.md` is the source of truth for the JSON contract (envelope, exit codes,
stdout/stderr discipline).

| Area (`ts/src/…`) | Role | May depend on | Must NOT depend on |
|---|---|---|---|
| `domain` | Pure rules & values, zero I/O (address, amounts, derivation, wallet, family, errors) | Node / pure libs only | application, adapters, bootstrap |
| `application` | Use cases, services, contracts, and **ports** (interfaces it owns) | `domain` | adapters, bootstrap |
| `adapters/inbound` | CLI driving side — parse argv, route to use cases, render output | application, domain | adapters/outbound, bootstrap |
| `adapters/outbound` | Implements application ports — keystore, TronWeb/Tron gateway, Ledger, price, config, persistence | application ports, domain | adapters/inbound, bootstrap |
| `bootstrap` | Composition root + process lifecycle (`runner.ts`, `composition.ts`, `argv.ts`, `families/`) | all areas | — (assembly only) |

Key points:
- **Ports live in `application/ports/`** (e.g. `wallet-repository`, `tron-gateway`, `ledger-device`,
  `price-provider`); outbound adapters implement them (dependency inversion).
- **Chain-family differences** are isolated in the `tron` family — `application/use-cases/tron/`,
  `adapters/outbound/chain/tron/`, and the family plugin under `bootstrap/families/`. EVM is planned,
  not yet public.
- **A single Zod schema per command** drives validation, yargs arity, help text, and JSON Schema.
- **Secrets** (private keys, mnemonics, BIP39 passphrases) are encrypted at rest and never accepted
  from argv or env — only a dedicated stdin channel or hidden TTY prompt.

### Adding a TypeScript command

1. Add the command module under `adapters/inbound/cli/commands/` with its Zod schema.
2. Route it to an application use case (`application/use-cases/…`, e.g. `tron/transaction-service.ts`);
   do not put I/O or chain logic in the inbound layer.
3. If it needs new I/O, define a **port** in `application/ports/` and implement it in
   `adapters/outbound/`. Wire it in `bootstrap/composition.ts`.
4. Add co-located `*.test.ts` and run `npm run depcruise && npm run typecheck && npm test`.

## Build & Run

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

## End-to-end coverage

There is none, and there never was: the `qa/` harness that used to live here
only ever drove the standard CLI, which was removed in v4.13.0. `./gradlew build`
passing does **not** mean the interactive shell still works — changes that touch
shared helpers must be walked through by hand against a funded Nile account.

## Architecture

This is a **TRON blockchain CLI wallet** built on the [Trident SDK](https://github.com/tronprotocol/trident). It communicates with TRON nodes via gRPC.

### One CLI Mode

**Interactive REPL** — `Client` class with JCommander `@Parameters` inner classes. Entry point:
`org.tron.walletcli.Client`. Features tab completion, interactive prompts, and conversational
output. This is the largest file (~4800 lines).

The shell is started one way only: a bare `java -jar wallet-cli.jar`. The entry point recognises
`--version` and `--help` and nothing else; any other argument prints a one-line pointer to the
TypeScript CLI on stderr and exits 2. Non-interactive, scriptable and CI use belongs to `ts/`
(npm `@tron-walletcli/wallet-cli`).

### Request Flow

```
User Input → Client (JCommander) → WalletApiWrapper → WalletApi → Trident SDK → gRPC → TRON Node
```

### Key Classes

- **`org.tron.walletcli.Client`** — REPL entry point and command dispatcher. Each command is a JCommander `@Parameters` inner class.
- **`org.tron.walletcli.WalletApiWrapper`** — Orchestration layer between CLI and core wallet logic. Handles transaction construction, signing, and broadcasting.
- **`org.tron.walletserver.WalletApi`** — Core wallet operations: account management, transaction creation, proposals, asset operations. Delegates gRPC calls to Trident.
- **`org.tron.walletcli.ApiClientFactory`** — Creates gRPC client instances for different networks (mainnet, Nile testnet, Shasta testnet, custom).

### Package Organization

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

### Configuration

- **Network config:** `src/main/resources/config.conf` (HOCON format via Typesafe Config)
- **Logging:** `src/main/resources/logback.xml` (Logback, INFO level console + rolling file)
- **Lombok:** `lombok.config` — uses `logger` as the log field name (not the default `log`)

### Key Frameworks & Libraries

- **Trident SDK 0.11.0** — All gRPC API calls to TRON nodes
- **JCommander 1.82** — CLI argument parsing (interactive REPL)
- **JLine 3.25.0** — Interactive terminal/readline
- **BouncyCastle** — Cryptographic operations
- **Protobuf 3.25.8 / gRPC 1.75.0** — Protocol definitions and transport
- **Lombok** — `@Getter`, `@Setter`, `@Slf4j` etc. (annotation processing)
