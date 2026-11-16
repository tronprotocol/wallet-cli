# wallet-cli plugin install

Install a plugin and its command groups.

## Synopsis

```
wallet-cli plugin install <source> [options]
```

## Description

Fetches a plugin package, checks it, and adds its command groups to wallet-cli. The plugin is usable from the next command on.

`<source>` is one of:

| Form | Example | Meaning |
|---|---|---|
| Short name | `sunswap` | The npm package `@tron-walletcli/plugin-sunswap` |
| Scoped npm package | `@scope/name` | That package, from the registry |
| Exact npm package | `npm:my-plugin` | That package name as written, with no short-name expansion |
| Local directory | `./my-plugin`, `/abs/path`, `~/my-plugin` | A package directory: an absolute path, or a path starting with `.` or `~` |
| Local archive | `my-plugin-1.0.0.tgz` | Any path ending in `.tgz` or `.tar.gz` |

A registry package takes an optional exact version or dist-tag: `sunswap@1.2.0`, `@scope/name@1.2.0`, `npm:my-plugin@latest`. An exact version pins the plugin: [`plugin update`](update.md) leaves it unchanged.

Registry packages come from the registry named by the `pluginRegistry` config key (default `https://registry.npmjs.org`). The download must match the SHA-512 integrity value the registry publishes, or nothing is installed. npm is never run, and a package's install scripts are never executed.

Before anything is published, the package is refused when:

- it has no plugin manifest, or a file is missing or too large (`plugin_invalid`);
- it was built for a plugin API this wallet-cli does not provide (`plugin_incompatible`);
- a plugin of that name is already installed, or its name or one of its command groups belongs to wallet-cli, a built-in plugin, or another installed plugin (`plugin_conflict`).

A refused or interrupted install leaves the installed plugins as they were.

**Trust.** Plugins run inside wallet-cli with the wallet's privileges: nothing isolates them, and packages are neither signed nor reviewed. Install plugins only from sources you trust.

## Arguments

| Argument | Meaning |
|---|---|
| `<source>` | The plugin to install: a directory, a `.tgz` archive, a short name, `@scope/name`, or `npm:name` |

## Options

No command-specific options; the [global options](../index.md#global-options-every-command) only.

## Examples

```bash
wallet-cli plugin install sunswap
```

```console
installed sunswap 1.0.0 (plugin API 1.1)
  commands: sunswap
  source:   @tron-walletcli/plugin-sunswap

Plugins run inside wallet-cli with the wallet's privileges: nothing isolates them, and packages are neither signed nor reviewed. Install plugins only from sources you trust.
```

```bash
wallet-cli plugin install ./packages/sunpump -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"plugin.install","data":{"name":"sunpump","version":"1.0.0","apiVersion":1,"apiRevision":1,"groups":["sunpump"],"source":{"type":"directory","path":"/home/me/wallet-cli-sun-plugins/packages/sunpump"},"installedAt":"2026-11-16T20:18:42.170Z","notice":"Plugins run inside wallet-cli with the wallet's privileges: nothing isolates them, and packages are neither signed nor reviewed. Install plugins only from sources you trust."},"meta":{"durationMs":39,"warnings":[]}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Plugin name |
| `version` | string | Installed version |
| `apiVersion` / `apiRevision` | number | The plugin API the package was built for |
| `groups` | string[] | Command groups the plugin adds |
| `source` | object | Where it came from: `{type: "registry", spec, registry}`, or `{type: "directory" \| "archive", path}` |
| `installedAt` | string | ISO 8601 time of the install |
| `notice` | string | The trust statement |

## Exit status

`0` success · `1` execution failure (`plugin_invalid`, `plugin_incompatible`, `plugin_integrity` — the download does not match the registry's integrity value, `not_found` — the registry has no such package or version, `provider_error` / `provider_rate_limited` / `timeout` — the registry could not be reached, answered 429, or did not answer in time, `io_error` — the plugin could not be written) · `2` usage error (`plugin_conflict`, `invalid_value` — the source is not a valid plugin source, `file_not_found` — no package at that path).

## See also

[`plugin list`](list.md) · [`plugin update`](update.md) · [`plugin remove`](remove.md) · [Plugin guide](../../guide/plugins.md) · [`config`](../config.md)
