# wallet-cli contact remove

Remove a contact.

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
  Address  TXe4Kd8nP2rF9gH5jL3mV6cW1bN7yS0aQz
```

```bash
wallet-cli contact remove bob -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"contact.remove","data":{"name":"bob","address":"TXe4Kd8nP2rF9gH5jL3mV6cW1bN7yS0aQz"},"meta":{"durationMs":3,"warnings":[]}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `name` | string | The removed contact's name |
| `address` | string | Its address |

## Exit status

`0` success · `1` execution failure (`not_found` — no such contact, `encoding_error`, `insecure_permissions`) · `2` usage error.

## See also

[`contact add`](add.md) · [`contact list`](list.md)
