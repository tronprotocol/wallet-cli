# wallet-cli permission

View and update account permissions — the basis of TRON multi-sig.

`show` is the read-only query to run before you touch anything; `update` replaces the whole permission structure in one on-chain transaction (and burns 100 TRX).

**TRON only.** The multi-key permission model is a TRON protocol feature; both subcommands fail with `family_mismatch` on an EVM network.

## Synopsis

```
wallet-cli permission COMMAND
```

## Subcommands

| Command | Page | Description |
|---|---|---|
| `permission show` | [show.md](show.md) | Show the account's permission structure |
| `permission update` | [update.md](update.md) | Replace the account's permission structure (burns 100 TRX) |

## The permission model

Every TRON account has:

- **one owner permission** (id `0`) — full control, including the power to change the permissions themselves;
- **up to 8 active permissions** (ids `2`–`9`) — each scoped to a set of operation types it may perform;
- **one witness permission** (id `1`) — SRs only, for block-production signing.

Each permission group holds **up to 5 keys** (address + weight) and a **threshold**. A transaction is valid for a group when the combined weight of its signatures is **≥ the threshold** — that is what makes an account "multi-sig". A typical setup keeps the owner group behind a multi-key threshold and runs day-to-day activity through a scoped active group.

> ⚠️ **Misconfiguring the owner permission permanently locks the account.** If the new owner keys don't include an address you can sign with — or the threshold can't be met by keys you hold — the transaction still succeeds and there is no on-chain recovery. `permission update` surfaces the lockout risk as a warning but does **not** stop the submission. The warning codes are `owner_lockout` (local keys hold no owner weight), `owner_lockout_partial` (they hold less than the threshold, so co-signers become mandatory), `active_can_update_permission` (an active group can rewrite the permissions themselves) and `active_unknown_operations` (a group sets operation bits this build does not recognise).

## See also

[`permission show`](show.md) · [`permission update`](update.md) · [`tx sign`](../tx/sign.md) · [Security](../../concepts/security.md)
