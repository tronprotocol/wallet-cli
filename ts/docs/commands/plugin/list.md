# wallet-cli plugin list

List built-in and installed plugins.

## Synopsis

```
wallet-cli plugin list [options]
```

## Description

Shows every plugin with its version, the plugin API it was built for, its command groups and its state:

| State | Meaning |
|---|---|
| `ok` | The plugin loads and its commands are available |
| `incompatible` | The plugin was built for a plugin API this wallet-cli does not provide; `reason` names the side to update |
| `broken` | The plugin could not be read, loaded or registered; `reason` says why |

A plugin that is not `ok` affects only its own command groups. This command loads every installed plugin to report its state.

## Options

No command-specific options; the [global options](../index.md#global-options-every-command) only.

## Examples

```bash
wallet-cli plugin list
```

```console
NAME     VERSION  KIND       STATE  COMMANDS
gasfree  1.0.0    builtin    ok     gasfree
sunpump  1.0.0    installed  ok     sunpump
sunswap  1.0.0    installed  ok     sunswap
```

```bash
wallet-cli plugin list -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"plugin.list","data":[{"name":"gasfree","version":"1.0.0","apiVersion":1,"apiRevision":1,"groups":["gasfree"],"kind":"builtin","state":"ok"},{"name":"sunswap","version":"1.0.0","apiVersion":1,"apiRevision":1,"groups":["sunswap"],"kind":"installed","state":"ok","source":{"type":"directory","path":"/home/me/wallet-cli-sun-plugins/packages/sunswap"},"installedAt":"2026-11-16T20:18:41.713Z"}],"meta":{"durationMs":145,"warnings":[]}}
```

## Output

`data` is an array, one entry per plugin:

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Plugin name |
| `version` | string | Plugin version |
| `apiVersion` / `apiRevision` | number | The plugin API the plugin was built for |
| `groups` | string[] | Its command groups |
| `kind` | string | `builtin` or `installed` |
| `state` | string | `ok`, `incompatible` or `broken` |
| `reason` | string | Present when `state` is not `ok` |
| `source` | object | Installed plugins only: where it was installed from |
| `installedAt` | string | Installed plugins only: ISO 8601 time of the install or last update |

## Exit status

`0` success, also when a plugin is `incompatible` or `broken` · `1` execution failure (`io_error` — the plugin directory could not be read).

## See also

[`plugin install`](install.md) · [`plugin update`](update.md) · [`plugin remove`](remove.md)
