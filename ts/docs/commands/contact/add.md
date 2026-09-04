# wallet-cli contact add

Add a payee to the address book.

## Synopsis

```
wallet-cli contact add <name> <address> [--note <text>]
```

## Description

Saves a recipient (name → address) to the local address book. The name can then be used wherever a recipient is expected — [`tx send --to`](../tx/send.md) and [`gasfree transfer --to`](../gasfree/transfer.md). The address is validated locally against the family it belongs to (`T…` = TRON, `0x…` = EVM), which is also the family recorded on the entry; no node access.

A contact belongs to **one family**, inferred directly from its address; this command has no family or network selector. A malformed address, or one that belongs to no supported family, is refused with `invalid_address`. Family compatibility is checked later when a contact is used by a chain command.

The name must be 1–64 safe characters (no control or formatting characters) and must not **resemble** an address. The resemblance check is deliberately loose — it matches a near miss too, a checksum typo or a truncated paste — so that a mistyped address can never silently fall through to a name lookup and pay whoever registered that name. Names are compared case-insensitively after Unicode NFKC normalization.

## Options

| Option | Description |
|---|---|
| `--note <text>` | Free-form note (e.g. "exchange deposit address"), up to 128 safe characters |

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

An EVM address is filed the same way. The family is used internally for routing but is not exposed in the public contact object:

```bash
wallet-cli contact add alice-eth 0x742d35Cc6634C0532925a3b844Bc454e4438f44e --note "Alice mainnet"
```

```bash
wallet-cli contact add alice TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub --note "Alice mainnet" -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"contact.add","data":{"name":"alice","address":"TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub","note":"Alice mainnet"},"meta":{"durationMs":4,"warnings":[]}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Contact name |
| `address` | string | Recipient address |
| `note` | string \| null | The note, or `null` |

## Exit status

`0` success · `1` execution failure (`encoding_error` — the local address book cannot be decoded; `insecure_permissions` — it is a symlink or group/world-readable, so run `chmod 600`) · `2` usage error (`already_exists` — the name or address is taken; `limit_exceeded` — the address book is full; `invalid_address` — the address is not valid for a supported family; `invalid_value` — invalid name or note).

## See also

[`contact list`](list.md) · [`contact remove`](remove.md) · [`tx send`](../tx/send.md)
