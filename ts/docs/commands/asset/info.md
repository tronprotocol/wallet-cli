# wallet-cli asset info

Show one TRC10 in full.

## Synopsis

```
wallet-cli asset info [<asset>] [--issuer <address>] [options]
```

## Description

Shows a single TRC10's complete record: issuer, total supply, precision, ICO rate and window, project URL, description, both free-bandwidth limits, and every frozen tranche with its unlock time.

Give **exactly one** of the `<asset>` argument or `--issuer`. A purely numeric `<asset>` is read as an id; anything else is read as a name. `--issuer` looks up the token issued by an address — unique by construction, since an account can only issue one.

**Token names are not unique.** Duplicate names have been permitted since `AllowSameTokenName` was enabled, and there really are duplicates on both mainnet and Nile. A name matching more than one token is an **error** (`ambiguous_asset_name`) carrying the matching ids, not a differently-shaped success — the JSON `data` shape for this command never varies, so an agent can rely on it.

Quantities are whole tokens in text and minimal units in JSON; the record carries its own `precision`, so no extra lookup is involved either way.

**Related but different:** [`token info`](../token/info.md) is the cross-type metadata lookup (name / symbol / decimals / total supply, TRC20 and TRC10 alike). This command gives the TRC10-only issuance record.

## Arguments

| Argument | Description |
|---|---|
| `<asset>` | Token id or name; a numeric value is read as the id. Exactly one of this or `--issuer` |

## Options

| Option | Description |
|---|---|
| `--issuer <string>` | Look up the token issued by this address. Exactly one of this or `<asset>` |

Plus the [global options](../index.md#global-options-every-command).

## Examples

By id:

```bash
wallet-cli asset info 1000123 --network tron:nile
```

By name — fails with the candidate ids if the name is not unique:

```bash
wallet-cli asset info MyToken --network tron:nile
```

By issuer:

```bash
wallet-cli asset info --issuer TQkXm4vN...5Zt7Uw --network tron:nile
```

Machine-readable:

```bash
wallet-cli asset info 1000123 --network tron:nile -o json
```

## Errors

| Code | Meaning |
|---|---|
| `asset_not_found` | No TRC10 matches that id, name or issuer |
| `ambiguous_asset_name` | The name matches several tokens; `details.assetIds` lists them |
| `invalid_value` | Neither or both of `<asset>` and `--issuer` were given |

## See also

[`asset list`](list.md) · [`token info`](../token/info.md) · [`asset` group](index.md)
