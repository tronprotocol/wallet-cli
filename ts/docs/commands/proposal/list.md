# wallet-cli proposal list

List on-chain governance proposals.

## Synopsis

```
wallet-cli proposal list [--state <active|all>] [--limit <n>] [--offset <n>] [options]
```

## Description

Lists proposals with their approval progress, expiry, and the chain parameters each one would set. Parameters are shown by name, using the same vocabulary as [`chain params`](../chain/params.md). Read-only, no account needed.

**`Value` is what the proposal would set, not the value in effect now.** A proposal records only its target values — the chain keeps no record of what a parameter was when the proposal was created. For a settled proposal the current value is unrelated to that baseline, and for an approved one it *is* the value that proposal installed. Use [`chain params`](../chain/params.md) for the values in effect now.

A proposal can set several parameters at once. The list never truncates them: the first parameter sits on the proposal's row, the rest continue on their own rows with the left-hand columns blank. Parameters are ordered by parameter id, so the same proposal always prints in the same order; `data.proposals[].parameters[]` uses that order too.

Filtering is client-side and happens before pagination: `--state` narrows the set, then `--offset` / `--limit` cut a window out of it. The title carries the count — `Proposals (4)` for the whole set, `Proposals (showing 2 of 4)` once a window is in play. Exact numbers are in `meta.pagination`. When nothing matches, the title is followed by `(none)`.

## Options

| Option | Description |
|---|---|
| `--state <active\|all>` | `active` = still inside the voting window (default); `all` = also approved, disapproved, and canceled ones |
| `--limit <number>` | Max proposals to return (default: all) |
| `--offset <number>` | Pagination offset (default `0`) |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli proposal list --state all --network tron:nile
```

```console
Proposals (4)
  ID   State         Approvals   Expiry (UTC)       Parameter                       Value
  47   voting          12 / 18   2026-07-22 08:00   getTransactionFee                  15
  46   voting           5 / 18   2026-07-22 08:00   getCreateAccountFee            200000
  45   approved        18 / 18   2026-07-21 08:00   getEnergyFee                      140
  44   disapproved      8 / 18   2026-07-20 08:00   getMaintenanceTimeInterval   10800000
                                                    getMaxCpuTimeOfOneTx               80
```

Second page — skip the first two, two per page:

```bash
wallet-cli proposal list --state all --offset 2 --limit 2 --network tron:nile
```

```console
Proposals (showing 2 of 4)
  ID   State         Approvals   Expiry (UTC)       Parameter                       Value
  45   approved        18 / 18   2026-07-21 08:00   getEnergyFee                      140
  44   disapproved      8 / 18   2026-07-20 08:00   getMaintenanceTimeInterval   10800000
                                                    getMaxCpuTimeOfOneTx               80
```

```bash
wallet-cli proposal list --state all --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"proposal.list","data":{"approvalThreshold":18,"proposals":[{"id":47,"proposerAddress":"TSRmq8kP...","state":"voting","approvals":12,"expirationTime":1784707200000,"parameters":[{"id":3,"name":"getTransactionFee","value":15,"unit":"sun/byte"}]},{"id":44,"proposerAddress":"TSRee5...","state":"disapproved","approvals":8,"expirationTime":1784534400000,"parameters":[{"id":0,"name":"getMaintenanceTimeInterval","value":10800000,"unit":"ms"},{"id":13,"name":"getMaxCpuTimeOfOneTx","value":80,"unit":"ms"}]}]},"meta":{"durationMs":31,"warnings":[],"pagination":{"offset":0,"limit":null,"total":4}},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `approvalThreshold` | number | Approvals needed to pass = 70 % of the active SRs |
| `proposals[].id` | number | Proposal id |
| `proposals[].proposerAddress` | string | Creator, base58 |
| `proposals[].state` | string | `voting` / `approved` / `disapproved` / `canceled` |
| `proposals[].approvals` | number | Approvals cast so far |
| `proposals[].expirationTime` | number | End of the voting window, ms since epoch |
| `proposals[].parameters[]` | array | `id`, `name`, `value` (what the proposal sets), `unit`; ordered by `id` |
| `meta.pagination` | object | `offset`, `limit` (`null` = unlimited), `total` after `--state` filtering |

## Exit status

`0` success · `1` execution failure (`rpc_error`) · `2` usage error (`invalid_value` — bad state, limit, or offset).

## See also

[`proposal show`](show.md) · [`proposal create`](create.md) · [`chain params`](../chain/params.md)
