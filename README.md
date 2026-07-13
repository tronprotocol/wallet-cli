# wallet-cli

A command-line wallet for the [TRON](https://tron.network) network. This repository holds **two independent implementations** that share the same purpose but target different users:

- **[Java](java/README.md)** — the original, full-featured reference CLI. An interactive prompt (REPL) for people who want the complete TRON feature surface.
- **[TypeScript](ts/README.md)** — an agent-first rewrite for automation. Standard subcommands with a stable JSON envelope, built for scripts, CI, and AI agents.

Both manage the same kind of wallet on the same networks — your address is identical regardless of which you use. They differ in how you install and drive them, and in how much of TRON they cover. Pick one and read its own README for depth; this page gives you the basics of each so you can choose.

## At a glance

|                        | [**Java**](java/README.md) — the original                                                                                                  | [**TypeScript**](ts/README.md) — agent-first rewrite                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What it is**         | The mature, full-feature reference CLI.                                                                                                    | A newer rewrite focused on programmatic integration.                                                                                                              |
| **Runtime**            | JVM — built with Gradle, run as a `.jar`. Uses the [Trident](https://github.com/tronprotocol/trident) SDK.                                 | [Node.js](https://nodejs.org) **20+**.                                                                                                                            |
| **Install**            | `git clone` + `./gradlew build` (see [Setup](java/README.md#setup))                                                                        | `npm install -g @tron-walletcli/wallet-cli`                                                                                                                       |
| **How you drive it**   | An **interactive prompt only** — start it, then type commands at `>`.                                                                      | **One-shot subcommands** — `wallet-cli <command>` from your shell. Interactive prompts only for secret input.                                                     |
| **Command style**      | PascalCase verbs: `RegisterWallet`, `SendCoin`, `GetBalance`. Amounts in **SUN** (1 TRX = 1,000,000 SUN).                                  | Noun-verb subcommands: `create`, `tx send`, `account balance`, with `--flags`.                                                                                    |
| **Output for scripts** | Human-readable text.                                                                                                                       | Stable JSON via `-o json` ([`wallet-cli.result.v1`](ts/docs/machine-interface.md)) + fixed exit codes (`0`/`1`/`2`).                                              |
| **Config / networks**  | `config.conf` (net type + full node), or `SwitchNetwork` at runtime. Mainnet · Nile · Shasta · custom.                                     | `--network` flag / `config` command. `tron:mainnet` · `tron:nile` · `tron:shasta`.                                                                                |
| **Signing**            | Software keystore · Ledger.                                                                                                                | Encrypted local keystore · Ledger. Secrets never via argv/env.                                                                                                    |
| **Feature scope**      | **The full surface** — plus GasFree gas-less transfers, TRC10 token issuance, on-chain DEX & governance/proposals, and TronLink multi-sig. | **Core wallet ops** — HD wallets, TRX/TRC20/TRC10 transfers, staking & delegation, voting & rewards, contract call/deploy, message signing, and on-chain queries. |
| **Best for**           | People at a terminal who want every TRON capability.                                                                                       | Scripting, CI pipelines, and AI agents.                                                                                                                           |
| **Full docs**          | [java/README.md](java/README.md)                                                                                                           | [ts/README.md](ts/README.md)                                                                                                                                      |

## Java — get a taste

Interactive only. Build it, start the prompt, then type commands:

```console
$ git clone https://github.com/tronprotocol/wallet-cli.git
$ cd wallet-cli && ./gradlew build && cd build/libs
$ java -jar wallet-cli.jar        # opens the interactive prompt
> RegisterWallet 123456           # create a keystore (password 123456)
> Login                           # unlock it
> GetAddress                      # your TRON address
> GetBalance                      # TRX balance
```

Full setup (config.conf, connecting to a node), the complete A–Z command list, and features like GasFree and multi-sig live in **[java/README.md](java/README.md)** — jump to [Setup](java/README.md#setup), [Quickstart](java/README.md#quickstart), [Commands](java/README.md#commands), or [GasFree](java/README.md#gasfree).

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
- **Working interactively and want the complete TRON toolkit** — GasFree, TRC10 issuance, on-chain DEX/governance, or multi-sig? → the [Java version](java/README.md).
- **Just sending TRX/tokens or staking from your own machine?** → either works; the TypeScript CLI is the lighter install (`npm install -g`, no build step).
