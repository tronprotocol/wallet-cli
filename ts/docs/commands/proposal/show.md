# wallet-cli proposal show

Show one proposal, the parameters it sets, and approval progress.

## Synopsis

```
wallet-cli proposal show <id> [options]
```

## Description

The state is normalized to `voting`, `approved`, `disapproved`, or `canceled`. A pending proposal remains `voting` until expiry even after reaching the threshold. JSON includes the full `approvedBy[]` address list; text output keeps only the count.

Each parameter's value is the one the proposal would set, not the value in effect now — the chain does not record what the parameter was when the proposal was created. For a settled proposal the current value is unrelated to that baseline, and for an approved one it *is* the value the proposal installed. See [`chain params`](../chain/params.md) for the values in effect now.

## Arguments

| Argument | Description |
|---|---|
| `id` | Positive proposal id |

## Example

```bash
wallet-cli proposal show 47 --network tron:nile
```

## Output

Returns the proposer, create/expiry timestamps, threshold status, approving addresses, and `parameters[]` sorted by id — each entry `{ id, name, value, unit }`.

## Exit status

`0` success · `1` `proposal_not_found` or RPC failure · `2` invalid id.

## See also

[`proposal list`](list.md) · [`proposal approve`](approve.md)
