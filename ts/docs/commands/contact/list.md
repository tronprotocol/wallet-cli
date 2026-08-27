# wallet-cli contact list

List every contact.

## Synopsis

```
wallet-cli contact list
```

## Description

Lists every recipient in the local address book — name, full address, and note. An empty address book returns an empty list (not an error). Purely local; no node access.

## Options

No command-specific options; the [global options](../index.md#global-options-every-command) only.

## Examples

```bash
wallet-cli contact list
```

```console
Name   Address                             Note
alice  TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub  Alice mainnet
bob    TXe4Kd8nP2rF9gH5jL3mV6cW1bN7yS0aQz  —
```

```bash
wallet-cli contact list -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"contact.list","data":{"contacts":[{"name":"alice","address":"TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub","note":"Alice mainnet","family":"tron"},{"name":"bob","address":"TXe4Kd8nP2rF9gH5jL3mV6cW1bN7yS0aQz","note":null,"family":"tron"}]},"meta":{"durationMs":3,"warnings":[]}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `contacts[]` | array | Recipients, each `{name, address, note, family}` — `note` is `null` when unset |

## Exit status

`0` success (including an empty list) · `1` execution failure (`encoding_error`, `insecure_permissions` — the address book is a symlink or group/world-readable; `chmod 600` it) · `2` usage error.

## See also

[`contact add`](add.md) · [`contact remove`](remove.md) · [`tx send`](../tx/send.md)
