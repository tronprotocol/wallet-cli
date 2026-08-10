# wallet-cli asset list

List TRC10 tokens, one page at a time.

## Synopsis

```
wallet-cli asset list [--limit <n>] [--offset <n>] [options]
```

## Description

Lists TRC10 tokens with id, name, total supply, precision and issuer. Use [`asset info`](info.md) for one token in full.

**Paged server-side, and small by default.** There are thousands of TRC10s on chain — around 5,200 on mainnet and 7,300 on Nile, roughly 2.7 MB if fetched in one go — so `--limit` defaults to **10**. Raise it deliberately; a tool call that returns five thousand records will exhaust an agent's context long before anyone notices.

**No total is reported.** The paginated node endpoint does not return a count, and the only way to compute one is to transfer every record. [`meta.pagination`](../../machine-interface.md#reading-metapagination) therefore carries `total: null` — the count does not exist, rather than having been omitted — alongside `offset` and `limit`; the text header reads `Assets (limit 10, offset 0)`. Page until you get a short page.

Total supply is shown in whole tokens; each record carries its own precision, so this costs no extra lookups.

## Options

| Option | Description |
|---|---|
| `--limit <number>` | Max tokens to return, 1–1000 (default `10`) |
| `--offset <number>` | Pagination offset (default `0`) |

Plus the [global options](../index.md#global-options-every-command).

## Examples

First page:

```bash
wallet-cli asset list --network tron:nile
```

Walk further in:

```bash
wallet-cli asset list --limit 50 --offset 50 --network tron:nile
```

Machine-readable:

```bash
wallet-cli asset list --limit 50 --network tron:nile -o json
```

## Errors

| Code | Meaning |
|---|---|
| `invalid_value` | `--limit` outside 1–1000, or a negative `--offset` |

## See also

[`asset info`](info.md) · [`asset` group](index.md)
