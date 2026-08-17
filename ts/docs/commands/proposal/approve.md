# wallet-cli proposal approve

Approve a proposal, or cancel your approval.

## Synopsis

```
wallet-cli proposal approve <id> [--cancel]
                            [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]]
                            [--permission-id <n>] [options]
```

## Description

Adds your approval to a proposal; `--cancel` withdraws an approval you already cast. TRON governance has these two states only — there is no "against" vote, and abstaining means doing nothing.

Only a registered witness can approve; other accounts fail with `not_a_witness`. The chain checks nothing beyond that, so a non-elected candidate's approval is accepted and lands on chain — but at tally only the approvals of the **top-27 active SRs** count toward the threshold, so it does not move the proposal any closer to passing.

**By default the command returns at submission** (`stage: "submitted"`), not confirmation — add `--wait` to block until confirmed/failed. Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign — `--dry-run` and `--build-only` do not unlock the wallet and run without it. Watch-only accounts fail with `watch_only_no_signer` in a signing mode.

## Options

| Option | Description |
|---|---|
| `<id>` | **Required.** Proposal id |
| `--cancel` | Withdraw an approval you cast earlier instead of adding one |
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
echo "$PW" | wallet-cli proposal approve 47 --network tron:nile --wait --password-stdin
```

```console
✅ Proposal approved
  Proposal   #47
  Voter      TSRmq8kP...9dEf (main)
  Approvals  13 / 18
  TxID       b1e...
  Block      57,880,240
  Fee        0 TRX  (267 bandwidth)
  Status     success
```

`--cancel` takes your own approval back off the proposal:

```bash
echo "$PW" | wallet-cli proposal approve 47 --cancel --network tron:nile --wait --password-stdin
```

```console
✅ Approval canceled
  Proposal   #47
  Voter      TSRmq8kP...9dEf (main)
  Approvals  12 / 18
  TxID       b2f...
  Block      57,880,255
  Fee        0 TRX  (267 bandwidth)
  Status     success
```

```bash
echo "$PW" | wallet-cli proposal approve 47 --network tron:nile --wait --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"proposal.approve","data":{"kind":"proposal-approve","stage":"confirmed","txId":"b1e...","confirmed":true,"blockNumber":57880240,"failed":false,"proposalId":47,"addApproval":true,"feeSun":0,"resource":{"netUsage":267,"netFeeSun":0,"energyUsage":0,"energyFeeSun":0}},"meta":{"durationMs":6410,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "proposal-approve"`, `stage: "submitted"`, `txId`, `proposalId`, `addApproval` (`false` with `--cancel`) |
| `--wait` (confirmed) | above, plus `stage: "confirmed"`, `confirmed` (boolean), `blockNumber`, `feeSun`, `resource`, `failed` |

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`not_a_witness`, `proposal_not_found` — no such proposal, `already_approved` — you already approved it, `not_approved` — `--cancel` with no approval to withdraw, `proposal_expired`, `watch_only_no_signer`, `auth_failed`) · `2` usage error (`invalid_value` — id not a number).

## See also

[`proposal show`](show.md) · [`proposal list`](list.md) · [`proposal delete`](delete.md) · [Script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed)
