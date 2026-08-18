# wallet-cli proposal delete

Delete a proposal you created.

## Synopsis

```
wallet-cli proposal delete <id>
                           [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]]
                           [--permission-id <n>] [options]
```

## Description

Withdraws the proposal itself. Only its creator can do this, and only while it is still in its voting window; afterwards the proposal has been tallied and is final.

This is a different action from [`proposal approve --cancel`](approve.md), which withdraws a single approval. The receipts say so: `Proposal deleted` here, `Approval canceled` there.

The chain records the result under its own name — after a successful delete, [`proposal show`](show.md) reports `State canceled`.

**By default the command returns at submission** (`stage: "submitted"`), not confirmation — add `--wait` to block until confirmed/failed. Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign — `--dry-run` and `--build-only` do not unlock the wallet and run without it. Watch-only accounts fail with `watch_only_no_signer` in a signing mode.

## Options

| Option | Description |
|---|---|
| `<id>` | **Required.** Proposal id |
| `--dry-run` | Build and estimate only, no signature/broadcast; excludes `--sign-only` / `--build-only` |
| `--sign-only` | Sign without broadcasting, output the signed hex; excludes `--dry-run` / `--build-only`; pairs with `--expiration` |
| `--build-only` | Build only, output the **unsigned** hex; excludes `--dry-run` / `--sign-only`; pairs with `--expiration` |
| `--expiration <ms>` | Transaction expiration in ms, up to `86400000` (24h); only with `--sign-only` or `--build-only`; omitted = node default (~60s) |
| `--permission-id <n>` | Permission group to sign with (0=owner, 1=witness, 2-9=active); default `0` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin (fd 0) |

Plus the [global options](../index.md#global-options-every-command).

## Examples

In the examples, `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

```bash
echo "$PW" | wallet-cli proposal delete 48 --network tron:nile --wait --password-stdin
```

```console
✅ Proposal deleted
  Proposal  #48
  Proposer  TSRmq8kP...9dEf (main)
  TxID      c7d...
  Block     57,880,355
  Fee       0 TRX  (265 bandwidth)
  Status    success
```

```bash
echo "$PW" | wallet-cli proposal delete 48 --network tron:nile --wait --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"proposal.delete","data":{"kind":"proposal-delete","stage":"confirmed","txId":"c7d...","confirmed":true,"blockNumber":57880355,"failed":false,"proposalId":48,"feeSun":0,"resource":{"netUsage":265,"netFeeSun":0,"energyUsage":0,"energyFeeSun":0}},"meta":{"durationMs":6390,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "proposal-delete"`, `stage: "submitted"`, `txId`, `proposalId` |
| `--wait` (confirmed) | above, plus `stage: "confirmed"`, `confirmed` (boolean), `blockNumber`, `feeSun`, `resource`, `failed` |

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`proposal_not_found` — no such proposal, `not_proposal_owner` — you are not its creator, `proposal_expired`, `already_canceled`, `watch_only_no_signer`, `auth_failed`) · `2` usage error (`invalid_value` — id not a number).

## See also

[`proposal create`](create.md) · [`proposal approve`](approve.md) · [`proposal show`](show.md) · [Script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed)
