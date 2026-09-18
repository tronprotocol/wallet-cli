# wallet-cli contact list

List all recipients in the contact book.

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
| Name  | Address                            | Note          |
| ----- | ---------------------------------- | ------------- |
| alice | TF9yB7bAL2oBbonYaMvGTqoXxExS14x73c | Alice mainnet |
| bob   | TNDHPk1LMLZTap8tMWfxUBy4MgArnWeSVP | —             |
```

```bash
wallet-cli contact list -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"contact.list","data":{"contacts":[{"name":"alice","address":"TF9yB7bAL2oBbonYaMvGTqoXxExS14x73c","note":"Alice mainnet"},{"name":"bob","address":"TNDHPk1LMLZTap8tMWfxUBy4MgArnWeSVP","note":null}]},"meta":{"durationMs":3,"warnings":[]}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `contacts[]` | array | Recipients, each `{name, address, note}` — `note` is `null` when unset |

## Exit status

`0` success (including an empty list) · `1` execution failure (`encoding_error`, `insecure_permissions` — the address book is a symlink or group/world-readable; `chmod 600` it) · `2` usage error.

## See also

[`contact add`](add.md) · [`contact remove`](remove.md) · [`tx send`](../tx/send.md)
