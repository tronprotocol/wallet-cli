# wallet-cli proposal show

Show one proposal, the parameters it sets, and its approval progress.

## Synopsis

```
wallet-cli proposal show <id> [options]
```

## Description

Reports a single proposal: every parameter it sets as `name  value` with its unit, the approval count against the threshold, and the creation and expiry times. Read-only, no account needed.

**The value shown is the one the proposal would set, not the value in effect now.** The chain does not record what a parameter was when the proposal was created. For a settled proposal the current value is unrelated to that baseline, and for an approved one it *is* the value the proposal installed. Use [`chain params`](../chain/params.md) for the values in effect now.

Text shows the approval count only. The addresses behind it are in the json as `approvedBy[]`, at full length.

`State` is the chain's own value, so a proposal deleted by its creator reads `canceled` here.

## Options

| Option | Description |
|---|---|
| `<id>` | **Required.** Proposal id |

Plus the [global options](../index.md#global-options-every-command).

## Examples

A proposal inside its voting window:

```bash
wallet-cli proposal show 47 --network tron:nile
```

```console
Proposal #47
  State         voting
  Proposer      TSRmq8kP...9dEf
  Created time  2026-07-21 08:00 UTC
  Expiry time   2026-07-22 08:00 UTC
  Approvals     12 / 18
  Parameters    (1)
    getTransactionFee   15   sun/byte
```

One that reached the threshold at expiry — the value is live from that tally on:

```bash
wallet-cli proposal show 45 --network tron:nile
```

```console
Proposal #45
  State         approved
  Proposer      TSRwd3nL...8vC
  Created time  2026-07-20 08:00 UTC
  Expiry time   2026-07-21 08:00 UTC
  Approvals     18 / 18
  Parameters    (1)
    getEnergyFee   140   sun
```

One that expired below the threshold, carrying two parameters:

```bash
wallet-cli proposal show 44 --network tron:nile
```

```console
Proposal #44
  State         disapproved
  Proposer      TSRee5...2xB
  Created time  2026-07-19 08:00 UTC
  Expiry time   2026-07-20 08:00 UTC
  Approvals     8 / 18
  Parameters    (2)
    getMaintenanceTimeInterval   10800000   ms
    getMaxCpuTimeOfOneTx               80   ms
```

```bash
wallet-cli proposal show 47 --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"proposal.show","data":{"id":47,"proposerAddress":"TSRmq8kP...","state":"voting","createTime":1784620800000,"expirationTime":1784707200000,"approvals":12,"approvalThreshold":18,"reachedThreshold":false,"parameters":[{"id":3,"name":"getTransactionFee","value":15,"unit":"sun/byte"}],"approvedBy":["TSRaa1...","TSRbb2..."]},"meta":{"durationMs":22,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `id` | number | Proposal id |
| `proposerAddress` | string | Creator, base58 |
| `state` | string | `voting` / `approved` / `disapproved` / `canceled` |
| `createTime` / `expirationTime` | number | Creation and end of the voting window, ms since epoch |
| `approvals` / `approvalThreshold` | number | Approvals cast, and the count needed to pass |
| `reachedThreshold` | boolean | Whether `approvals` already meets `approvalThreshold` |
| `parameters[]` | array | `id`, `name`, `value` (what the proposal sets), `unit`; ordered by `id` |
| `approvedBy[]` | array | Addresses that have approved, base58 (json only) |

There is no cancellation timestamp: the chain's proposal record holds only the fields above, so `canceled` carries no time of its own.

## Exit status

`0` success · `1` execution failure (`proposal_not_found` — no such proposal, `rpc_error`) · `2` usage error (`invalid_value` — id not a number).

## See also

[`proposal list`](list.md) · [`proposal approve`](approve.md) · [`chain params`](../chain/params.md)
