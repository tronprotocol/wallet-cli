# wallet-cli exchange show

Show one exchange pair.

## Synopsis

```
wallet-cli exchange show <id> [options]
```

## Description

Shows a single pair: creator, creation time, and both tokens with their reserves in whole tokens. Names and precisions are resolved for the two sides, which costs at most two extra lookups — acceptable for one pair, and the reason [`exchange list`](list.md) does not do it per row.

**No price is shown, on purpose.** The reserve ratio is a quoted rate, not what a trade returns: any trade with size moves along the curve and gets less. Showing the ratio as a price invites people to read it as executable. To price a specific amount at the current reserves, use [`exchange trade --dry-run`](trade.md).

The reserves themselves are the useful signal — they tell you how deep the pair is, and therefore how much price impact a given trade will suffer.

## Arguments

| Argument | Description |
|---|---|
| `<id>` | **Required.** Exchange pair id |

## Options

Only the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli exchange show 12 --network tron:nile
```

```bash
wallet-cli exchange show 12 --network tron:nile -o json
```

## Errors

| Code | Meaning |
|---|---|
| `exchange_not_found` | No pair has that id |
| `asset_not_found` | A TRC10 side references an id that no longer resolves |

## See also

[`exchange list`](list.md) · [`exchange trade`](trade.md) · [`exchange` group](index.md)
