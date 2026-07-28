# wallet-cli permission

Inspect and replace a TRON account's multi-signature permission structure.

## Synopsis

```
wallet-cli permission COMMAND
```

## Subcommands

| Command | Description | Broadcasts |
|---|---|---|
| [`permission show`](show.md) | Show owner, witness, and active permission groups | no |
| [`permission update`](update.md) | Replace the complete account permission structure | ✍️ yes |

## The TRON permission model

Every TRON account has a permission structure that decides **which keys may authorize what**. It
has three kinds of group:

| Group | id | Purpose |
|---|---|---|
| **owner** | `0` | Full control, including replacing the permission structure itself. Exactly one. |
| **witness** | `1` | Block production. Only meaningful for super representatives; at most one, with exactly one key. |
| **active** | `2`–`9` | Scoped day-to-day authority — each active group carries an explicit list of allowed operations. Up to 8. |

Each group has:

- **keys** — 1 to 5 addresses, each with a positive **weight**
- a **threshold** — the total weight a transaction must accumulate to be authorized; it may not
  exceed the sum of the group's key weights

A single-key account is just the degenerate case: one key of weight 1 and a threshold of 1. Once a
threshold exceeds any one key's weight, transactions need co-signing — that is what the
[`tx sign`](../tx/sign.md) / [`tx approvals`](../tx/approvals.md) /
[`tx multisig`](../tx/multisig.md) workflow exists for.

Active groups additionally carry an **operations bitmap** — 32 bytes, one bit per TRON contract
type — which is what limits an active permission to, say, transfers and staking but not permission
changes.

## Choosing the permission for a transaction

Signing commands take `--permission-id <0-9>` to say *which group authorizes this transaction*
(default `0`, the owner). The id must be a group that actually permits the operation, and the
signer must be one of its keys.

## The lockout risk

`permission update` is a **complete replacement**, not a patch, and the account's own owner
permission is what governs future changes. A structure whose owner group contains no key this
wallet holds — or whose threshold your local keys cannot reach — leaves the account
permanently unusable from here. There is no recovery path and no support channel that can undo it.

The CLI emits warnings for the recognizable cases (`owner_lockout`, `owner_lockout_partial`,
`active_can_update_permission`, `active_unknown_operations`), but they are warnings, not blocks.
Always run [`permission update --dry-run`](update.md) first and read the rendered structure back
before broadcasting.

## See also

[`tx sign`](../tx/sign.md) · [`tx approvals`](../tx/approvals.md) ·
[`tx multisig`](../tx/multisig.md) · [Security model](../../concepts/security.md)
