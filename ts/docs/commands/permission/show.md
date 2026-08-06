# wallet-cli permission show

Show owner, witness, and active permission groups.

## Synopsis

```
wallet-cli permission show [--account <accountId|label|address>] [options]
```

## Description

Reads the account's permission structure from the node and renders it with the operation bitmaps
**decoded** — so an active group shows `Transfer TRX · Vote · TRX Stake (2.0)` rather than 32 bytes
of hex. Read-only; no unlock, no broadcast.

`--account` accepts a local account (id or label) **or any activated TRON address**, so you can
inspect an account this wallet does not hold keys for.

Keys that belong to this wallet are annotated with the owning account label:

```
                  TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ       1  (this wallet: main)
```

That annotation is what tells you whether you can still authorize owner-level operations — read it
before running [`permission update`](update.md).

Both forms are shown for active groups: the decoded operation labels and the raw `operationsHex`.
Bits the build has no name for are listed explicitly as `Unknown contract type <id>` rather than
being dropped, so no granted scope is invisible.

## Options

Only the [global options](../index.md#global-options-every-command) (`--account`, `--network`, …).

## Examples

```bash
wallet-cli permission show --network tron:nile
```

```console
Account  main (TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ)

Permission Name   owner  (id 0)
Threshold         2
Authorized To     Address                             Weight
                  TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ       1  (this wallet: main)
                  TB6dL8QunEyPUqX95PESxyZ2SHGeAQELW2       1

Permission Name   operations  (id 2, active)
Operation(s)      Transfer TRX · Transfer TRC10 · Vote · TRX Stake (2.0)  (4 total)
Operations Hex    1600000000004000000000000000000000000000000000000000000000000000
Threshold         1
Authorized To     Address                             Weight
                  TB6dL8QunEyPUqX95PESxyZ2SHGeAQELW2       1
```

Inspect any account by address:

```bash
wallet-cli permission show --account TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t \
  --network tron:nile -o json
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `address` | string | Account whose permissions these are |
| `owner` | object | The owner group (id `0`) |
| `witness` | object \| null | The witness group (id `1`), or `null` |
| `actives` | array | Active groups (ids `2`–`9`) |

Every group carries:

| Field | Type | Meaning |
|---|---|---|
| `id` | number | Permission group id |
| `name` | string | Group name |
| `threshold` | number | Weight required to authorize |
| `keys[].address` | string | Authorized key |
| `keys[].weight` | number | That key's weight |
| `keys[].local` | string \| null | Local account label if this wallet holds the key, else `null` |

Active groups additionally carry:

| Field | Type | Meaning |
|---|---|---|
| `operations` | string[] | Allowed contract types, e.g. `["TransferContract","VoteWitnessContract"]` |
| `operationLabels` | string[] | Human labels for the same, e.g. `["Transfer TRX","Vote"]` |
| `operationsHex` | string | The raw 32-byte bitmap |
| `unknownOperationIds` | number[] | Set bits this build has no name for |

## Exit status

`0` · `1` execution failure (node unreachable, account not activated) · `2` usage error.

## See also

[`permission update`](update.md) · [`account info`](../account/info.md) ·
[`tx approvals`](../tx/approvals.md)
