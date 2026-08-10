# wallet-cli exchange list

List exchange pairs, one page at a time.

## Synopsis

```
wallet-cli exchange list [--limit <n>] [--offset <n>] [options]
```

## Description

Lists exchange pairs with their two token ids, reserves and creator.

**This is exactly one RPC per call, and never looks a token up.** An exchange record carries only ids and balances — no name, no precision — so rendering whole tokens would mean one lookup per distinct token per row. Instead, tokens are shown **by id** and reserves in **minimal units**, with the column labelled to match. The label matters: `198100000` is either 198.1 tokens or 198,100,000 depending on a precision the record does not carry, and putting it under a bare "Reserves" heading beside TRX would mislead.

Use [`exchange show`](show.md) for one pair with names and whole tokens.

**No total is reported.** The chain does not return one without transferring every record. [`meta.pagination`](../../machine-interface.md#reading-metapagination) therefore carries `total: null` — the count does not exist, rather than having been omitted — alongside `offset` and `limit`. Page until you get a short page.

## Options

| Option | Description |
|---|---|
| `--limit <number>` | Max pairs to return, 1-1000 (default `10`) |
| `--offset <number>` | Pagination offset (default `0`) |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli exchange list --network tron:nile
```

```bash
wallet-cli exchange list --limit 50 --offset 50 --network tron:nile
```

## Errors

| Code | Meaning |
|---|---|
| `invalid_value` | `--limit` outside 1-1000, or a negative `--offset` |

## See also

[`exchange show`](show.md) · [`exchange` group](index.md)
