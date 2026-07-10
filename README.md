# wallet-cli

This repository holds **two independent implementations** of a TRON command-line wallet. Pick the one that fits how you work — each has its own documentation:

| | [**Java**](java/README.md) — the original | [**TypeScript**](ts/README.md) — agent-first rewrite |
|---|---|---|
| What it is | The mature, full-feature reference CLI. Ships two modes: an interactive **REPL** for people and a scriptable **standard-CLI** mode. | A newer rewrite built for automation: a stable JSON envelope, deterministic exit codes, and discoverable schemas. Interactive prompts are kept only for secret input (import / backup / delete). |
| Install | `git clone` + Gradle — see **[java/README.md](java/README.md#get-started)** | `npm install -g @tron-walletcli/wallet-cli` — see **[ts/README.md](ts/README.md)** |
| Docs | **[java/README.md](java/README.md)** | **[ts/README.md](ts/README.md)** · [Command reference](ts/docs/commands/index.md) · [Machine interface](ts/docs/machine-interface.md) · [Agent skill](ts/skills/wallet-cli/SKILL.md) |

**Which one?**

- **Scripting, CI, or building an AI agent?** → the [TypeScript version](ts/README.md) is built for exactly that.
- **Want the original, full-featured Java CLI?** → the [Java version](java/README.md).
