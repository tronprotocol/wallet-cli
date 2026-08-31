<h1 align="center">wallet-cli</h1>

<h4 align="center">
  A command-line wallet for <a href="https://tron.network">TRON</a> and selected EVM networks — dual-mode in Java, agent-first in TypeScript
</h4>

<p align="center">
  <a href="https://github.com/tronprotocol/wallet-cli/issues"><img src="https://img.shields.io/github/issues/tronprotocol/wallet-cli.svg"></a>
  <a href="https://github.com/tronprotocol/wallet-cli/pulls"><img src="https://img.shields.io/github/issues-pr/tronprotocol/wallet-cli.svg"></a>
  <a href="https://github.com/tronprotocol/wallet-cli/graphs/contributors"><img src="https://img.shields.io/github/contributors/tronprotocol/wallet-cli.svg"></a>
  <a href="https://www.npmjs.com/package/@tron-walletcli/wallet-cli"><img src="https://img.shields.io/npm/v/@tron-walletcli/wallet-cli.svg"></a>
  <a href="https://github.com/tronprotocol/wallet-cli/blob/master/LICENSE"><img src="https://img.shields.io/github/license/tronprotocol/wallet-cli.svg"></a>
</p>

This repository holds **two independent implementations** that share the same purpose but target different users:

- **[Java](java/README.md)** — the original, full-featured reference CLI. Run one-shot standard commands or start the interactive prompt (REPL).
- **[TypeScript](ts/README.md)** — an agent-first rewrite for automation. Standard subcommands with a stable JSON envelope, built for scripts, CI, and AI agents.

Both manage TRON wallets, but they are independent implementations rather than interchangeable account stores. Do not assume every derived account has the same address across implementations: check the recorded BIP44 path when migrating. The TypeScript implementation additionally supports selected EVM networks.

## At a glance

|                        | [**Java**](java/README.md) — the original                                                                                      | [**TypeScript**](ts/README.md) — agent-first rewrite                                                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What it is**         | The mature, full-feature reference CLI.                                                                                        | A newer rewrite focused on programmatic integration.                                                                                                                                                                                                        |
| **Runtime**            | JVM — built with Gradle, run as a `.jar`. Uses the [Trident](https://github.com/tronprotocol/trident) SDK.                     | [Node.js](https://nodejs.org) **20+**.                                                                                                                                                                                                                      |
| **Install**            | `git clone` + `./gradlew build` (see [Setup](java/README.md#setup))                                                            | `npm install -g @tron-walletcli/wallet-cli`                                                                                                                                                                                                                 |
| **How you drive it**   | One-shot standard commands, or an interactive prompt when run without a command / with `--interactive`.                       | **One-shot subcommands** — `wallet-cli <command>` from your shell. Interactive prompts only for secret input.                                                                                                                                               |
| **Command style**      | PascalCase verbs: `RegisterWallet`, `SendCoin`, `GetBalance`. Amounts in **SUN** (1 TRX = 1,000,000 SUN).                      | Noun-verb subcommands: `create`, `tx send`, `account balance`, with `--flags`.                                                                                                                                                                              |
| **Output for scripts** | Text by default; standard mode supports `--output json` and structured success/error envelopes.                               | Stable JSON via `-o json` ([`wallet-cli.result.v1`](ts/docs/machine-interface.md)) + fixed exit codes (`0`/`1`/`2`).                                                                                                                                        |
| **Config / networks**  | `config.conf` (net type + full node), or `SwitchNetwork` at runtime. Mainnet · Nile · Shasta · custom.                         | `--network` flag / `config` command. Three TRON networks plus Ethereum, Sepolia, BNB Smart Chain, and its testnet.                                                                                                                                           |
| **Signing**            | Software keystore · Ledger.                                                                                                    | Encrypted local keystore · Ledger. Secrets enter via stdin/TTY, never argv or dedicated secret env vars.                                                                                                                                                    |
| **Feature scope**      | **The full surface** — wallets and transfers, staking, voting and rewards, governance, contracts, TRC10, and the on-chain exchange. | **The full surface** — HD wallets, TRX/TRC20/TRC10 transfers, staking & delegation, voting & rewards, governance proposals & super-representative operation, contract call/deploy/governance, TRC10 issuance, the on-chain Bancor exchange, multi-sig, GasFree transfers, message signing, and on-chain queries. |
| **Best for**           | People at a terminal who want every TRON capability.                                                                           | Scripting, CI pipelines, and AI agents.                                                                                                                                                                                                                     |
| **Full docs**          | [java/README.md](java/README.md)                                                                                               | [ts/README.md](ts/README.md)                                                                                                                                                                                                                                |

## Java — get a taste

Build it, then either run a standard command or start the prompt:

```console
$ git clone https://github.com/tronprotocol/wallet-cli.git
$ cd wallet-cli && ./gradlew build && cd build/libs
$ java -jar wallet-cli.jar --output json --network nile get-balance --address T...
$ java -jar wallet-cli.jar        # opens the interactive prompt
> RegisterWallet 123456           # create a keystore (password 123456)
> Login                           # unlock it
> GetAddress                      # your TRON address
> GetBalance                      # TRX balance
```

Full setup (config.conf, connecting to a node), the complete A–Z command list, and features like GasFree and multi-sig live in **[java/README.md](java/README.md)** — jump to [Setup](java/README.md#setup), [Quickstart](java/README.md#quickstart), [Commands](java/README.md#commands), or [GasFree](java/README.md#contracts-gasfree--chain-data).

## TypeScript — get a taste

Install from npm, then run subcommands directly from your shell:

```console
$ npm install -g @tron-walletcli/wallet-cli
$ wallet-cli create --label main               # prompts for a master password
$ wallet-cli account balance --network tron:nile
$ wallet-cli account balance -o json           # one wallet-cli.result.v1 JSON frame
```

Every command has a reference page, and the JSON contract, exit codes, and agent integration are documented in depth. Start at **[ts/README.md](ts/README.md)**, then:

- [Getting started](ts/docs/guide/getting-started.md) — create a wallet and send your first transaction
- [Command reference](ts/docs/commands/index.md) — every command, A–Z
- [Machine interface](ts/docs/machine-interface.md) — JSON envelope, exit codes, script safety
- [Agent skill](ts/skills/wallet-cli/SKILL.md) — for AI agents

## Which should I use?

- **Scripting, CI, or building an AI agent?** → the [TypeScript version](ts/README.md) — the JSON envelope and deterministic exit codes exist for exactly this.
- **Working interactively** — one long-running session at a `>` prompt, with the wallet unlocked once for the whole session? → the [Java version](java/README.md).
- **Just sending TRX/tokens or staking from your own machine?** → either works; the TypeScript CLI is the lighter install (`npm install -g`, no build step).
