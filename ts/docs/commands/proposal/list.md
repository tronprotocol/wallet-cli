# wallet-cli proposal list

List chain-parameter proposals, newest first.

## Synopsis

```
wallet-cli proposal list [--state active|all] [--offset <n>] [--limit <n>] [options]
```

## Description

`active` selects `PENDING` proposals whose voting window has not expired. `all` includes approved, disapproved, and canceled history. Filtering happens before local pagination. Each proposal's parameter map is sorted by protocol parameter id; JSON pagination is emitted as `meta.pagination`.

## Options

| Option | Description |
|---|---|
| `--state <active|all>` | State filter; default `active` |
| `--offset <number>` | Zero-based offset; default 0 |
| `--limit <number>` | Positive page size; omitted means all remaining rows |

Plus the [global options](../index.md#global-options-every-command).

## Example

```bash
wallet-cli proposal list --state all --offset 20 --limit 20 --network tron:nile -o json
```

## Output

`data.approvalThreshold` is 18 for the normal 27-member active SR set. `data.proposals[]` contains `id`, `proposerAddress`, normalized `state`, approval count, expiry, and sorted `changes[]`. `meta.pagination` contains `offset`, `limit`, and the filtered total.

## Exit status

`0` success · `1` RPC failure · `2` invalid state or pagination value.

## See also

[`proposal show`](show.md) · [`chain params`](../chain/params.md)
