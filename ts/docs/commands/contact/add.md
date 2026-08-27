# wallet-cli contact add

Add a payee to the address book.

## Synopsis

```
wallet-cli contact add <name> <address> [--note <text>]
```

## Description

Saves a recipient (name → address) to the local address book. The name can then be used wherever a recipient is expected — [`tx send --to`](../tx/send.md) and [`gasfree transfer --to`](../gasfree/transfer.md). The address is validated locally against the family it belongs to (`T…` = TRON, `0x…` = EVM), which is also the family recorded on the entry; no node access.

A contact belongs to **one family**. Filing a TRON address under EVM (or the reverse) is refused with `invalid_address`, because a name that resolved to an address that does not exist on the selected network would be worse than no name at all.

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

An EVM address is filed the same way, under `family: "evm"`:

```bash
wallet-cli contact add alice-eth 0x742d35Cc6634C0532925a3b844Bc454e4438f44e --note "Alice mainnet"
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
| `family` | string | Chain family the address belongs to — `tron` or `evm`, detected from the address |

## Exit status

`0` success · `1` execution failure (`already_exists` — the name is taken, `limit_exceeded` — the address book is full). The address book is a local file: `encoding_error` if it cannot be decoded, `insecure_permissions` if it is a symlink or group/world-readable (`chmod 600` it). · `2` usage error (`invalid_address` — the address is not valid for its family; `invalid_value` — an invalid name or note).

## See also

[`contact list`](list.md) · [`contact remove`](remove.md) · [`tx send`](../tx/send.md)
