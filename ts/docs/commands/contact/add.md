# wallet-cli contact add

Add a recipient to the contact book.

## Synopsis

```
wallet-cli contact add <name> <address> [--note <text>]
```

## Description

Saves a recipient (name → address) to the local address book. The name can then be used wherever a recipient is expected — [`tx send --to`](../tx/send.md) and [`gasfree transfer --to`](../gasfree/transfer.md). The address checksum is validated locally; no node access.

The name must be 1–64 characters and must not look like an address (so it can't be confused with a literal `--to` address).

## Options

| Option | Description |
|---|---|
| `--note <text>` | Free-form note (e.g. "exchange deposit address"), up to 128 characters |

Plus the [global options](../index.md#global-options-every-command). `name` and `address` are positional arguments.

## Examples

```bash
wallet-cli contact add alice TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub --note "Alice mainnet"
```

```console
✅ Contact added
  Name     alice
  Address  TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub
  Note     Alice mainnet
```

```bash
wallet-cli contact add alice TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub --note "Alice mainnet" -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"contact.add","data":{"name":"alice","address":"TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub","note":"Alice mainnet","family":"tron"},"meta":{"durationMs":4,"warnings":[]}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Contact name |
| `address` | string | Recipient address |
| `note` | string \| null | The note, or `null` |
| `family` | string | Chain family (`tron`) |

## Exit status

`0` success · `1` execution failure (`already_exists` — the name is taken, `limit_exceeded` — the address book is full). The address book is a local file: `encoding_error` if it cannot be decoded, `insecure_permissions` if it is a symlink or group/world-readable (`chmod 600` it). · `2` usage error (`invalid_value` — bad address checksum, or an invalid name).

## See also

[`contact list`](list.md) · [`contact remove`](remove.md) · [`tx send`](../tx/send.md)
