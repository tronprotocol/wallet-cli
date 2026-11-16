# wallet-cli plugin remove

Remove an installed plugin.

## Synopsis

```
wallet-cli plugin remove <name> [options]
```

## Description

Removes an installed plugin and its command groups. From the next command on, its group words fail with `unknown_command`.

Settings the plugin read from `config.yaml` are left as written, so installing the plugin again restores its behaviour. The files of removed versions stay under the wallet-cli home directory (`plugins/<name>/versions/`); delete that directory to reclaim the space.

Built-in plugins cannot be removed.

## Arguments

| Argument | Meaning |
|---|---|
| `<name>` | The installed plugin to remove |

## Options

No command-specific options; the [global options](../index.md#global-options-every-command) only.

## Examples

```bash
wallet-cli plugin remove sunpump
```

```console
removed sunpump 1.0.0
```

```bash
wallet-cli plugin remove sunpump -o json
```

```json
{"schema":"wallet-cli.result.v1","success":false,"command":"plugin.remove","error":{"code":"plugin_not_installed","message":"no installed plugin named sunpump; run plugin list to see the installed plugins"},"meta":{"durationMs":15,"warnings":[]}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `name` | string | The removed plugin |
| `version` | string | The version that was installed |
| `removed` | boolean | Always `true` |

## Exit status

`0` success · `1` execution failure (`io_error` — the plugin could not be removed, or it was removed and the change could not be confirmed on disk; the message says which) · `2` usage error (`plugin_not_installed`, `plugin_conflict` — the plugin is built in).

## See also

[`plugin install`](install.md) · [`plugin list`](list.md) · [`plugin update`](update.md)
