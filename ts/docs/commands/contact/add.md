# wallet-cli contact add

Add a recipient to the local address book.

## Synopsis

```
wallet-cli contact add <name> <address> [--note <text>] [options]
```

## Description

Stores a name → address mapping locally. The address is validated as TRON Base58Check **at this
point**, so a typo fails here rather than on a later transfer:

```console
error [invalid_value]: address is not a valid TRON address
```

After adding, the name is accepted by [`tx send --to`](../tx/send.md) and
[`gasfree transfer --to`](../gasfree/transfer.md).

Names must not themselves look like a TRON address — a name that would be ambiguous with an
address is refused, so `--to <value>` can never be silently reinterpreted.

Adding a name that already exists is an error (`already_exists`), not an update. Lookups are
case-insensitive and Unicode-normalized (NFKC), so `Alice` and `alice` are the same contact — to
repoint a name, [`contact remove`](remove.md) it first.

No network access and no wallet unlock.

## Arguments

- `name` — contact name, 1–64 safe characters; must not resemble a TRON address (positional)
- `address` — TRON base58 address (positional)

## Options

| Option | Description |
|---|---|
| `--note <text>` | Free-form note, at most 128 safe characters |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli contact add alice TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --note "Alice mainnet"
```

```console
✅ Contact added
  Name     alice
  Address  TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
  Note     Alice mainnet
```

Then send by name:

```bash
echo "$PW" | wallet-cli tx send --to alice --amount 1 --network tron:nile --password-stdin
```

## Output

`data` is the stored contact. Local command — no `chain` block.

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Contact name as stored |
| `address` | string | Validated TRON base58 address |
| `note` | string \| null | The note, or `null` |
| `family` | string | Chain family — `tron` |

## Exit status

`0` · `1` execution failure (`insecure_permissions`, `encoding_error` — see
[`contact list`](list.md#storage)) · `2` usage error — `invalid_value` (malformed address, bad
name/note), `already_exists`, `limit_exceeded`.

## See also

[`contact list`](list.md) · [`contact remove`](remove.md) · [`tx send`](../tx/send.md)
