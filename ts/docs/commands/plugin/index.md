# wallet-cli plugin

Install, list, update and remove plugins.

## Synopsis

```
wallet-cli plugin COMMAND
```

## Description

A plugin adds one or more command groups to wallet-cli. **Built-in** plugins ship inside wallet-cli and are always present. **Installed** plugins are added with `plugin install`, kept under the wallet-cli home directory (`plugins/`), and removed with `plugin remove`.

Plugins run inside wallet-cli with the wallet's privileges: nothing isolates them, and packages are neither signed nor reviewed. Install plugins only from sources you trust. See the [plugin guide](../../guide/plugins.md).

## Commands

| Command | Description |
|---|---|
| [`plugin install`](install.md) | Install a plugin |
| [`plugin list`](list.md) | List built-in and installed plugins |
| [`plugin update`](update.md) | Update installed plugins from their sources |
| [`plugin remove`](remove.md) | Remove an installed plugin |

## See also

[Plugin guide](../../guide/plugins.md) · [machine interface: plugins](../../machine-interface.md#plugins) · [`config`](../config.md) (`pluginRegistry`)
