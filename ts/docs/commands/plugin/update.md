# wallet-cli plugin update

Update installed plugins from their sources.

## Synopsis

```
wallet-cli plugin update [<name>] [options]
```

## Description

Fetches each installed plugin again from the source it was installed from: the registry package, the local directory, or the local archive. The new package passes the same checks as an install.

- A registry package installed with an exact version is pinned and stays unchanged. To move it, remove it and install the version you want.
- A plugin whose source yields the same build is reported as `unchanged`.
- An update replaces the plugin in one step. A failure before that step leaves the installed version in place.
- If the installed plugin changed while its update was being fetched (removed, or reinstalled from another source), the update is refused with `plugin_conflict`. Run it again.

Without a name every installed plugin is updated. One failure does not stop the others; the command then fails with the first failure's code and reports every plugin in `error.details.results`.

Built-in plugins change only with wallet-cli itself.

## Arguments

| Argument | Meaning |
|---|---|
| `[<name>]` | The installed plugin to update; omit to update all |

## Options

No command-specific options; the [global options](../index.md#global-options-every-command) only.

## Examples

```bash
wallet-cli plugin update sunswap
```

```console
sunswap: unchanged at 1.0.0
```

```bash
wallet-cli plugin update -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"plugin.update","data":[{"name":"sunpump","status":"unchanged","version":"1.0.0"},{"name":"sunswap","status":"unchanged","version":"1.0.0"}],"meta":{"durationMs":22,"warnings":[]}}
```

## Output

`data` is an array, one entry per plugin (`error.details.results` has the same shape when the command fails):

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Plugin name |
| `status` | string | `updated`, `unchanged` or `failed` |
| `version` | string | `unchanged`: the installed version |
| `from` / `to` | string | `updated`: the version before and after |
| `incomplete` | string | `updated` only: the plugin was replaced, but the change could not be confirmed on disk; the text says what failed |
| `code` / `message` | string | `failed`: the error for this plugin |

## Exit status

`0` every plugin updated or unchanged · `1` execution failure (`plugin_invalid`, `plugin_incompatible`, `plugin_integrity`, `not_found`, `provider_error` / `provider_rate_limited` / `timeout`, `io_error`) · `2` usage error (`plugin_not_installed`, `plugin_conflict` — the plugin is built in, a command group of the new version is taken, or the installed plugin changed during the update).

## See also

[`plugin install`](install.md) · [`plugin list`](list.md) · [`plugin remove`](remove.md)
