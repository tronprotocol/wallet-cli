# wallet-cli proposal show

Show one proposal, its parameter changes, and approval progress.

## Synopsis

```
wallet-cli proposal show <id> [options]
```

## Description

The state is normalized to `voting`, `approved`, `disapproved`, or `canceled`. A pending proposal remains `voting` until expiry even after reaching the threshold. JSON includes the full `approvedBy[]` address list; text output keeps only the count.

## Arguments

| Argument | Description |
|---|---|
| `id` | Positive proposal id |

## Example

```bash
wallet-cli proposal show 47 --network tron:nile
```

## Output

Returns the proposer, create/expiry timestamps, threshold status, approving addresses, and parameter changes sorted by id.

## Exit status

`0` success · `1` `proposal_not_found` or RPC failure · `2` invalid id.

## See also

[`proposal list`](list.md) · [`proposal approve`](approve.md)
