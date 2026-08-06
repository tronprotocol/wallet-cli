# wallet-cli permission update

Replace the complete account permission structure. ✍️

> **This can permanently lock you out of the account.** It is a full replacement, and the owner
> permission is what authorizes all future changes. Run `--dry-run` first and read the rendered
> structure back before broadcasting. See [the lockout risk](index.md#the-lockout-risk).

## Synopsis

```
wallet-cli permission update (--file <path> | --json <json>)
                             [--dry-run | --sign-only | --build-only] [options]
```

## Description

Submits one `AccountPermissionUpdateContract` that replaces the account's **owner, witness, and
active** permissions in a single atomic change. There is no partial update: whatever you pass is
the account's entire permission structure afterwards, and anything you omit is gone.

The structure is validated strictly before anything is built, and rejected with `invalid_permission`
(exit 2) on any violation — never silently normalized.

Exactly one of `--file` / `--json`. Files are read with a 1 MiB cap. Numbers are parsed
losslessly, so a threshold or weight beyond the safe-integer range is rejected rather than rounded.

### The permission JSON

```json
{
  "owner": {
    "id": 0,
    "name": "owner",
    "threshold": 2,
    "keys": [
      { "address": "TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ", "weight": 1 },
      { "address": "TB6dL8QunEyPUqX95PESxyZ2SHGeAQELW2", "weight": 1 }
    ]
  },
  "actives": [
    {
      "id": 2,
      "name": "operations",
      "threshold": 1,
      "operations": [
        "TransferContract",
        "TransferAssetContract",
        "VoteWitnessContract",
        "FreezeBalanceV2Contract"
      ],
      "keys": [
        { "address": "TB6dL8QunEyPUqX95PESxyZ2SHGeAQELW2", "weight": 1 }
      ]
    }
  ]
}
```

| Field | Required | Rules |
|---|---|---|
| `address` | no | If present, must equal the selected account's address |
| `owner` | **yes** | `id` must be `0`; must **not** define `operations` |
| `witness` | no | `id` must be `1`; exactly one key; must **not** define `operations`; omit or `null` for non-SR accounts |
| `actives` | no | At most 8 groups; ids `2`–`9` and unique; defaults to `[]` |

Rules that apply to every group:

- `keys` — 1 to 5 entries, valid TRON addresses, **no duplicates**
- `weight` — a positive safe integer
- `threshold` — a positive safe integer that **may not exceed the sum of the group's key weights**
  (an unreachable threshold is a lockout, so it is refused)
- `name` — at most 32 UTF-8 bytes, no control characters; defaults to the group kind

Active groups must grant at least one operation. Contract-type names are the TRON protocol names
(`TransferContract`, `TriggerSmartContract`, `AccountPermissionUpdateContract`, …); an unrecognized
one is refused rather than ignored. Use [`permission show`](show.md) on an existing account to see
the exact spelling.

### `operations` and `operationsHex`

Normally you list `operations` and the bitmap is computed for you. You may also supply
`operationsHex` — but then it must **agree** with `operations`, and any set bit that has no known
contract type must be declared verbatim in `unknownOperationIds`:

```json
{ "id": 2, "name": "ops", "threshold": 1,
  "operations": ["TransferContract"],
  "operationsHex": "02000000000000000000000000000000000000000000000000000000000000c0",
  "unknownOperationIds": [254, 255],
  "keys": [{ "address": "T…", "weight": 1 }] }
```

This exists so a bitmap cannot quietly widen a permission while the human-readable `operations`
list stays unchanged. A mismatch is `invalid_permission`.

### Safety warnings

Warnings are emitted into `meta.warnings` before the transaction is built. They do **not** block
the update:

| Code | Meaning |
|---|---|
| `owner_lockout` | Local keys hold **no** owner weight — applying this may permanently lock out this wallet |
| `owner_lockout_partial` | Local keys hold less than the owner threshold — co-signers will be required |
| `active_can_update_permission` | An active group can itself replace the permission structure |
| `active_unknown_operations` | An active group grants contract types this build cannot name |
| `permission_postcheck_mismatch` | After confirmation, the on-chain structure differs from what was requested |

The command also refuses to broadcast when the account balance is below the network's permission
update fee (`insufficient_balance`) — this fee is substantial on mainnet, so check it with
`--dry-run`.

## Options

| Option | Description |
|---|---|
| `--file <path>` | Complete replacement permission JSON file (≤ 1 MiB) |
| `--json <string>` | The same JSON inline |
| `--dry-run` | Validate, build, and estimate without signing or broadcasting |
| `--sign-only` | Build and sign, then output the complete transaction hex |
| `--build-only` | Build and output unsigned transaction hex without unlocking |
| `--permission-id <0-9>` | Permission group authorizing *this* transaction (default `0`) |
| `--expiration <ms>` | Expiration duration in ms (1–86400000); only with `--sign-only` / `--build-only` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed |
| `--password-stdin` | Master password from stdin (software accounts) |

`--dry-run`, `--sign-only`, and `--build-only` are mutually exclusive.

Plus the [global options](../index.md#global-options-every-command).

## Examples

Always start here — validate and price the change without signing:

```bash
wallet-cli permission update --file permissions.json --network tron:nile --dry-run
```

```console
⏳ Permission update dry run
  Fee     100 TRX
  Status  not submitted

Account  TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ

Permission Name   owner  (id 0)
Threshold         2
Authorized To     Address                             Weight
                  TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ       1  (this wallet: main)
                  TB6dL8QunEyPUqX95PESxyZ2SHGeAQELW2       1
```

Apply it once the rendered structure is what you intended:

```bash
echo "$PW" | wallet-cli permission update --file permissions.json \
  --network tron:nile --wait --password-stdin
```

Build on an online machine, sign on an offline one:

```bash
wallet-cli permission update --file permissions.json --network tron:nile --build-only
# → unsigned transaction hex; sign it with `tx sign --hex`, then `tx broadcast --hex`
```

A structure whose threshold cannot be met is refused, not submitted:

```console
error [invalid_permission]: owner.threshold exceeds the total key weight
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `kind` | string | `"permission-update"` |
| `stage` | string | `"submitted"` / `"confirmed"` / `"failed"` |
| `mode` | string | `"dry-run"` / `"sign-only"` / `"build-only"` when a mode flag was used |
| `txId` | string | Transaction id |
| `hex` | string | Complete transaction hex (`--sign-only` / `--build-only`) |
| `permissions` | object | The canonical structure — as requested for non-broadcast modes, as read back from the chain after confirmation. Same shape as [`permission show`](show.md) |
| `blockNumber`, `feeSun` | — | Present after `--wait` |

## Exit status

`0` · `1` execution failure (`insufficient_balance`, `not_authorized`, `auth_failed`, node
rejection) · `2` usage error — `invalid_permission` (any structural violation), neither/both of
`--file` / `--json`, conflicting mode flags.

## See also

[`permission show`](show.md) · [`tx sign`](../tx/sign.md) · [`tx approvals`](../tx/approvals.md) ·
[Security model](../../concepts/security.md)
