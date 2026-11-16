# Plugins

A plugin adds command groups to wallet-cli. This guide shows how to install one, keep it up to date, remove it, and what to check before you trust it.

## Built-in and installed plugins

| Kind | Examples | How you get it |
|---|---|---|
| Built-in | `gasfree`, `x402`, `bai`, `8004` | Ships inside wallet-cli; always present; changes only with wallet-cli itself |
| Installed | `sunswap`, `sunpump` | Added with `wallet-cli plugin install`; updated and removed by you |

Both kinds behave like any other command group: the same global options, the same JSON envelope, the same exit codes. wallet-cli keeps your wallets, accounts, configuration and signing; a plugin supplies the commands of one protocol.

## Before you install: trust

**A plugin runs inside wallet-cli with the wallet's privileges.** Nothing isolates it, and packages are neither signed nor reviewed.

- A plugin does not receive your private keys, mnemonic or master password. It asks wallet-cli to sign, and wallet-cli signs with the account you selected.
- That is a design boundary, not a sandbox. A plugin is code running in the same process and with your user's file access; a malicious one can do what any program you run can do.
- Install a plugin only when you trust its publisher and its source, as you would any software that can move funds.

`plugin install` repeats this statement every time.

## Install

```bash
wallet-cli plugin install sunswap
```

```console
installed sunswap 1.0.0 (plugin API 1.1)
  commands: sunswap
  source:   @tron-walletcli/plugin-sunswap

Plugins run inside wallet-cli with the wallet's privileges: nothing isolates them, and packages are neither signed nor reviewed. Install plugins only from sources you trust.
```

The new group works at once:

```bash
wallet-cli sunswap --help
wallet-cli sunswap price TRX --network tron
```

A short name such as `sunswap` means the npm package `@tron-walletcli/plugin-sunswap`. You can also name a scoped package, an exact npm package, a local directory or a packed archive:

```bash
wallet-cli plugin install @scope/name@1.2.0
wallet-cli plugin install npm:my-plugin
wallet-cli plugin install ./my-plugin
wallet-cli plugin install ./my-plugin-1.0.0.tgz
```

Registry packages are downloaded directly from the registry and must match the SHA-512 integrity value it publishes. npm is not needed and is never run, and install scripts in a package are never executed. To use another registry:

```bash
wallet-cli config pluginRegistry https://registry.example.com
```

See [`plugin install`](../commands/plugin/install.md) for every source form and refusal.

## See what is installed

```bash
wallet-cli plugin list
```

```console
NAME     VERSION  KIND       STATE  COMMANDS
gasfree  1.0.0    builtin    ok     gasfree
sunpump  1.0.0    installed  ok     sunpump
sunswap  1.0.0    installed  ok     sunswap
```

`STATE` is `ok`, `incompatible` (the plugin and wallet-cli need different plugin API versions; the reason names the side to update) or `broken` (the reason says why). A plugin that is not `ok` affects only its own commands.

## Update

```bash
wallet-cli plugin update sunswap   # one plugin
wallet-cli plugin update           # every installed plugin
```

An update fetches the plugin again from where it was installed. A plugin installed with an exact version (`sunswap@1.0.0`) is pinned and stays as it is. An update that fails leaves the installed version in place.

After you upgrade wallet-cli itself, run `wallet-cli plugin list`: a plugin built for an older plugin API shows as `incompatible` until you update it.

## Remove

```bash
wallet-cli plugin remove sunswap
```

The group is gone from the next command on. Settings the plugin read from `config.yaml` stay as written.

## When a command is not found

```console
error [unknown_command]: unknown command: sunswap price; run 'wallet-cli plugin list' to see the installed plugins, or 'wallet-cli plugin install <name>' to add one
```

The first word is not a wallet-cli command and not the group of an installed plugin. Install the plugin that provides it.

## For scripts and agents

- `wallet-cli --json-schema` lists the commands and error codes of installed plugins together with the built-in ones.
- The envelope of an installed plugin's command carries `meta.plugin` with the plugin's `name` and `version`.
- A script that depends on a plugin should check `wallet-cli plugin list -o json` first and install the plugin when it is missing.

See [machine interface: plugins](../machine-interface.md#plugins).

## Where plugins are stored

Installed plugins live under the wallet-cli home directory (`~/.wallet-cli` unless `WALLET_CLI_HOME` is set), in `plugins/<name>/`. `active.json` names the version in use, and `versions/` holds the files. Removing or updating a plugin leaves its earlier version files in place; delete `plugins/<name>/versions/` entries you no longer need, or the whole `plugins/<name>/` directory after a removal.

## Writing a plugin

A plugin is one bundled ES module built against the `@tron-walletcli/plugin-sdk` package. The SDK's README (`plugin-sdk/README.md` in this repository) describes the package format, the plugin API and how to test a plugin.

## See also

[`plugin`](../commands/plugin/index.md) · [machine interface](../machine-interface.md#plugins) · [`config`](../commands/config.md)
