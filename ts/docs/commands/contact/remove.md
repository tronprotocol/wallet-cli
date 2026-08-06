# wallet-cli contact remove

Remove one recipient from the local address book.

## Synopsis

```
wallet-cli contact remove <name> [options]
```

## Description

Deletes a single contact. This is a purely local edit — it changes **no on-chain state**, moves no
funds, and does not affect any transaction that already used the name.

The lookup is case-insensitive, so the name may be given in any casing. An unknown name fails with
`not_found` rather than silently succeeding.

Use this to repoint a name at a different address: remove it, then
[`contact add`](add.md) it again — [`contact add`](add.md) refuses to overwrite an existing entry.

## Arguments

- `name` — contact name to remove (positional)

## Options

Only the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli contact remove alice
```

```console
✅ Contact removed
  Name     alice
  Address  TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
```

Removing a name that is not there:

```console
error [not_found]: contact not found: alice
```

## Output

`data` is the removed contact — the address is echoed so you can confirm what was dropped.

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Removed contact name |
| `address` | string | Address it pointed to |
| `note` | string \| null | The note, or `null` |
| `family` | string | Chain family — `tron` |

## Exit status

`0` · `1` execution failure (`insecure_permissions`, `encoding_error`) · `2` usage error
(`not_found`, missing positional).

## See also

[`contact add`](add.md) · [`contact list`](list.md)
