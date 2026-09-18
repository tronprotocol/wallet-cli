# wallet-cli contact add

Add a recipient to the contact book.

## Synopsis

```
wallet-cli contact add <name> <address> [--note <text>]
```

## Description

Saves a recipient (name → address) to the local address book. The name can then be used wherever a recipient is expected — [`tx send --to`](../tx/send.md) and [`gasfree transfer --to`](../gasfree/transfer.md). The address checksum is validated locally; no node access.

The name must be 1–64 characters and must not look like an address (so it can't be confused with a literal `--to` address).

A contact belongs to one chain family, inferred from the address itself — this command has no family or network selector. A malformed address, or one belonging to no supported family, is refused with `invalid_address`; family compatibility is checked later, when a chain command uses the contact.

## Options

| Option | Description |
|---|---|
| `--note <text>` | Free-form note (e.g. "exchange deposit address"), up to 128 characters |

Plus the [global options](../index.md#global-options-every-command). `name` and `address` are positional arguments.

## Examples

```bash
wallet-cli contact add alice TF9yB7bAL2oBbonYaMvGTqoXxExS14x73c --note "Alice mainnet"
```

```console
✅ Contact added
  Name     alice
  Address  TF9yB7bAL2oBbonYaMvGTqoXxExS14x73c
  Note     Alice mainnet
```

```bash
wallet-cli contact add alice TF9yB7bAL2oBbonYaMvGTqoXxExS14x73c --note "Alice mainnet" -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"contact.add","data":{"name":"alice","address":"TF9yB7bAL2oBbonYaMvGTqoXxExS14x73c","note":"Alice mainnet"},"meta":{"durationMs":4,"warnings":[]}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Contact name |
| `address` | string | Recipient address |
| `note` | string \| null | The note, or `null` |

## Exit status

`0` success · `1` execution failure (`encoding_error` — the local address book cannot be decoded; `insecure_permissions` — it is a symlink or group/world-readable, so `chmod 600` it) · `2` usage error (`already_exists` — the name or address is taken; `limit_exceeded` — the address book is full; `invalid_address` — the address is not valid for a supported family; `invalid_value` — an invalid name or note).

## See also

[`contact list`](list.md) · [`contact remove`](remove.md) · [`tx send`](../tx/send.md)
