# wallet-cli contact list

List every recipient in the local address book.

## Synopsis

```
wallet-cli contact list [options]
```

## Description

Prints all stored contacts, sorted by name. Local only — no network access, no wallet unlock.

## Options

Only the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli contact list
```

```console
| Name  | Address                            | Note          |
| ----- | ---------------------------------- | ------------- |
| alice | TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t | Alice mainnet |
```

```bash
wallet-cli contact list -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"contact.list","data":{"contacts":[{"name":"alice","address":"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t","note":"Alice mainnet","family":"tron"}]},"meta":{"durationMs":14,"warnings":[]}}
```

An empty address book is a success, not an error — `data.contacts` is `[]`.

## Output

`data` is a local result — no `chain` block.

| Field | Type | Meaning |
|---|---|---|
| `contacts` | array | Stored contacts, sorted by name |
| `contacts[].name` | string | Contact name |
| `contacts[].address` | string | TRON base58 address |
| `contacts[].note` | string \| null | The note, or `null` |
| `contacts[].family` | string | Chain family — `tron` |

## Storage

Contacts are kept in `contacts.json` under the wallet home. The file is not encrypted, but it must
be a regular file owned by you with mode `0600`, and each entry is re-validated on every read.
A file that fails those checks fails the command:

| Code | Cause |
|---|---|
| `insecure_permissions` | Symlink, wrong owner, or mode other than `0600` |
| `encoding_error` | Not valid JSON, wrong schema, duplicate names, or larger than 4 MiB |

## Exit status

`0` · `1` execution failure (`insecure_permissions`, `encoding_error`) · `2` usage error.

## See also

[`contact add`](add.md) · [`contact remove`](remove.md) · [`list`](../list.md) — wallet accounts,
not recipients
