# wallet-cli contact remove

Remove a recipient from the contact book.

## Synopsis

```
wallet-cli contact remove <name>
```

## Description

Deletes a recipient from the local address book. Local record only — nothing on-chain is affected. Purely local; no node access.

## Options

No command-specific options; `name` is a positional argument, plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli contact remove bob
```

```console
✅ Contact removed
  Name     bob
  Address  TNDHPk1LMLZTap8tMWfxUBy4MgArnWeSVP
```

```bash
wallet-cli contact remove bob -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"contact.remove","data":{"name":"bob","address":"TNDHPk1LMLZTap8tMWfxUBy4MgArnWeSVP"},"meta":{"durationMs":3,"warnings":[]}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `name` | string | The removed contact's name |
| `address` | string | Its address |

## Exit status

`0` success · `1` execution failure (`encoding_error`, `insecure_permissions`) · `2` usage error (`contact_not_found` — no contact by that name; `invalid_value`).

## See also

[`contact add`](add.md) · [`contact list`](list.md)
