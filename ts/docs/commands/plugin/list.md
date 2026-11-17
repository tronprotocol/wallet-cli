# wallet-cli plugin list

List installed plugins.

## Synopsis

```
wallet-cli plugin list [options]
```

## Description

Shows every installed plugin with its version, where it was installed from, the plugin API it was built for, its command groups and its state:

| State | Meaning |
|---|---|
| `ok` | The plugin loads and its commands are available |
| `incompatible` | The plugin was built for a plugin API this wallet-cli does not provide; `reason` names the side to update |
| `broken` | The plugin could not be read, loaded or registered; `reason` says why |

A plugin that is not `ok` affects only its own command groups. This command loads every installed plugin to report its state.

In text output, `SOURCE` is `registry <spec>`, `directory <path>` or `archive <path>`. The SHA-512 integrity value of a registry install is in the JSON output only (`integrity`).

## Options

No command-specific options; the [global options](../index.md#global-options-every-command) only.

## Examples

```bash
wallet-cli plugin list
```

```console
NAME     VERSION  SOURCE                                                      STATE  COMMANDS
sunpump  1.0.0    directory /home/me/wallet-cli-sun-plugins/packages/sunpump  ok     sunpump
sunswap  1.0.0    directory /home/me/wallet-cli-sun-plugins/packages/sunswap  ok     sunswap
```

```bash
wallet-cli plugin list -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"plugin.list","data":[{"name":"sunpump","version":"1.0.0","apiVersion":1,"apiRevision":1,"groups":["sunpump"],"state":"ok","source":{"type":"directory","path":"/home/me/wallet-cli-sun-plugins/packages/sunpump"},"installedAt":"2026-11-16T21:32:45.930Z"},{"name":"sunswap","version":"1.0.0","apiVersion":1,"apiRevision":1,"groups":["sunswap"],"state":"ok","source":{"type":"directory","path":"/home/me/wallet-cli-sun-plugins/packages/sunswap"},"installedAt":"2026-11-16T21:32:46.345Z"}],"meta":{"durationMs":146,"warnings":[]}}
```

## Output

`data` is an array, one entry per plugin:

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Plugin name |
| `version` | string | Plugin version |
| `apiVersion` / `apiRevision` | number | The plugin API the plugin was built for |
| `groups` | string[] | Its command groups |
| `state` | string | `ok`, `incompatible` or `broken` |
| `reason` | string | Present when `state` is not `ok` |
| `source` | object | Where it was installed from |
| `integrity` | string | Registry installs only: the SHA-512 integrity value of the installed package |
| `installedAt` | string | ISO 8601 time of the install or last update |

## Exit status

`0` success, also when a plugin is `incompatible` or `broken` · `1` execution failure (`io_error` — the plugin directory could not be read).

## See also

[`plugin install`](install.md) · [`plugin update`](update.md) · [`plugin remove`](remove.md)
