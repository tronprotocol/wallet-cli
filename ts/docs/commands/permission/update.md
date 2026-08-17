# wallet-cli permission update

Replace the account's permission structure.

## Synopsis

```
wallet-cli permission update (--file <path> | --json <str>)
                             [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]]
                             [--permission-id <n>] [options]
```

## Description

Replaces the account's **entire** permission structure with the new one given by `--file` (a JSON file) or `--json` (an inline JSON string) — TRON's `UpdateAccountPermission` has replace semantics, so the JSON you supply becomes the whole structure. The chain burns **100 TRX** for the change.

The command runs without a confirmation prompt. It requires an account and the master password via `--password-stdin`; watch-only accounts fail with `watch_only_no_signer`.

**Input format.** The permission JSON is the same shape as [`permission show -o json`](show.md)'s `data` (`owner` / `witness` / `actives`; a key's `local` field may be omitted). You write the **contract-type names** for each active group's `operations`, not the raw bitmap — the CLI encodes it. A convenient way to produce a valid input is to export the current structure, edit it, and submit the file.

The structure is validated strictly before anything is built, and a violation is a usage error (exit `2`) rather than a silent normalisation. In particular a group's `threshold` may **not exceed the sum of its key weights** — an unreachable threshold is itself a lockout, so it is refused with `invalid_permission` (`owner.threshold exceeds the total key weight`). Thresholds and weights are parsed losslessly, so a value beyond the safe-integer range is rejected rather than rounded.

**Editing an exported structure.** `permission show -o json` emits both `operations` (contract-type names) and `operationsHex` (the raw bitmap) for each active group. Supplying both is allowed, but they must **agree** — two disagreeing descriptions of the same group would mean the structure you reviewed is not the structure that goes on chain, so the mismatch is refused. After editing `operations`, delete that group's `operationsHex` and the CLI regenerates it:

```bash
wallet-cli permission show -o json --network tron:nile | jq '.data' > perms.json
# edit operations, then drop the stale operationsHex from the same active group
```

Changing only `keys`, `threshold` or `name` needs no such deletion.

⚠️ **The chain applies no safety checks.** Even if the new structure contains no key you can sign with, the transaction still succeeds and the account is permanently locked, with no on-chain recovery. This CLI surfaces two **local** warnings but does **not** block the submission (in JSON they go to `meta.warnings`, and `success` stays `true`):

- **Lockout risk** — when the combined weight of your locally-signable owner keys (software / Ledger) is below the new owner threshold, a `!` line spells out that you can no longer meet the owner threshold on your own (`owner_lockout` if you hold no weight, `owner_lockout_partial` if you now need co-signers). Multi-party custody legitimately means "I alone can't reach the threshold", so this is a notice, not a block.
- **Dangerous operations** — when an active group includes `Update Account Permissions` (that group could then change the permissions themselves, effectively owner-level), a `!` line flags it (`active_can_update_permission`).

## Options

| Option | Description |
|---|---|
| `--file <path>` | **Required** (one of). JSON file with the new structure (same shape as `permission show -o json` data); replaces the whole thing |
| `--json <string>` | **Required** (one of). Inline JSON string with the new structure (same shape) |
| `--dry-run` | Mock receipt — fee, resulting-structure card, and warnings — matching a real submission; no signature, no broadcast, no password. Excludes `--sign-only` / `--build-only` |
| `--sign-only` | Build and sign, output the signed hex without broadcasting (feed [`tx broadcast`](../tx/broadcast.md) for on-chain co-signing). Excludes `--dry-run` / `--build-only`; pairs with `--expiration` |
| `--build-only` | Build only, output the **unsigned** hex (feed [`tx multisig --create`](../tx/multisig.md) for service-relayed multi-sig). Excludes `--dry-run` / `--sign-only`; pairs with `--expiration` |
| `--expiration <ms>` | Transaction expiration in ms, up to `86400000` (24h); only with `--sign-only` or `--build-only`; omitted = node default (~60s) |
| `--permission-id <n>` | Permission group to sign with (0=owner, 1=witness, 2-9=active) — changing permissions is owner-level, so normally `0` (default `0`) |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin |

Plus the [global options](../index.md#global-options-every-command).

## Examples

In the examples, `$PW` is your master password, fed on stdin via `--password-stdin`.

Prepare the new structure by exporting, then editing (no need to hand-write the operations bitmap):

```bash
wallet-cli permission show --network tron:nile -o json | jq '.data' > perms.json
```

```bash
# edit perms.json — e.g. turn the owner group into a 2-of-3
$EDITOR perms.json
```

Submit with `--wait`. The receipt is the transaction record plus the resulting on-chain structure (read back after confirmation, same cards as `permission show`), with any `!` warnings appended:

```bash
echo "$PW" | wallet-cli permission update --file perms.json --network tron:nile --wait --password-stdin
```

```console
✅ Permissions updated
  Account  main (TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw)
  TxID     b3c...
  Block    #84,335,102
  Fee      100.268 TRX
  Status   success

Permission Name   owner  (id 0)
Threshold         2
Authorized To     Address                             Weight
                  TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw  1      (this wallet: main)
                  TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub  1
                  TXe4Kd8nP2rF9gH5jL3mV6cW1bN7yS0aQz  1

Permission Name   finance  (id 2, active)
Operation(s)      Transfer TRX · Transfer TRC10 · Trigger Smart Contract
Threshold         2
Authorized To     Address                             Weight
                  TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw  1      (this wallet: main)
                  TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub  1
                  TXe4Kd8nP2rF9gH5jL3mV6cW1bN7yS0aQz  1

! Your local keys now hold 1 of 2 owner weight — co-signers are required
  for owner-level operations from now on.
```

The JSON receipt's `data.permissions` is **structurally identical** to `permission show`'s `data`, so you can diff it against the pre-change export; the lockout warning is in `meta.warnings` with `success` still `true`:

```bash
echo "$PW" | wallet-cli permission update --file perms.json --network tron:nile --wait --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"permission.update","data":{"kind":"permission-update","stage":"confirmed","txId":"b3c...","confirmed":true,"blockNumber":84335102,"feeSun":100268000,"failed":false,"permissions":{"address":"TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw","owner":{"id":0,"threshold":2,"keys":[{"address":"TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw","weight":1,"local":"main"},{"address":"TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub","weight":1,"local":null},{"address":"TXe4Kd8nP2rF9gH5jL3mV6cW1bN7yS0aQz","weight":1,"local":null}]},"witness":null,"actives":[{"id":2,"name":"finance","threshold":2,"operations":["TransferContract","TransferAssetContract","TriggerSmartContract"],"operationsHex":"0600008000000000000000000000000000000000000000000000000000000000","keys":[{"address":"TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw","weight":1,"local":"main"},{"address":"TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub","weight":1,"local":null},{"address":"TXe4Kd8nP2rF9gH5jL3mV6cW1bN7yS0aQz","weight":1,"local":null}]}]}},"meta":{"durationMs":6810,"warnings":[{"code":"owner_lockout_partial","message":"local keys hold 1 of 2 owner weight; co-signers are required for owner-level operations"}]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` varies by mode:

| Mode | Fields |
|---|---|
| default (submit) | `kind: "permission-update"`, `stage: "submitted"`, `txId` |
| `--wait` (confirmed) | the above, but `stage: "confirmed"`, plus `confirmed`, `blockNumber`, `feeSun`, `failed`, and `permissions` (same shape as `permission show` data, read back from chain) |
| `--dry-run` | `kind`, `mode: "dry-run"`, `fee` (the 100 TRX change fee), and `permissions` (the resulting structure); no `txId` |
| `--sign-only` | `kind`, `mode: "sign-only"`, `hex` (signed tx hex — feed `tx broadcast --hex`), `fee` |
| `--build-only` | `kind`, `mode: "build-only"`, `hex` (unsigned tx hex — feed `tx multisig --create`), `fee` |

Local warnings (`owner_lockout`, `owner_lockout_partial`, `active_can_update_permission`) are emitted before the transaction is built, appear in `meta.warnings` as `{code, message}` objects, and do not affect `success` — see [reading `meta.warnings`](../../machine-interface.md#reading-metawarnings).

## Exit status

`0` submitted (or built/signed/dry-run in early-exit modes) · `1` execution failure (`invalid_permission`, `not_authorized`, `watch_only_no_signer`, `auth_failed`, `insufficient_balance`, `rpc_error`, `timeout`) · `2` usage error (`invalid_value`).

On a multi-sig account, a submission whose accumulated signature weight is below the permission threshold is refused **after signing and before broadcasting** with `not_authorized` (`signature threshold is not reached; missing N weight`) — nothing is sent and no fee is burned. Collect the remaining signatures through `--sign-only` + [`tx sign`](../tx/sign.md) and submit with [`tx broadcast`](../tx/broadcast.md) instead. `--sign-only` and `--build-only` still return a partial signature, which is how a co-signing flow starts.

## See also

[`permission show`](show.md) · [`tx sign`](../tx/sign.md) · [`tx broadcast`](../tx/broadcast.md) · [`tx multisig`](../tx/multisig.md) · [Security](../../concepts/security.md)
