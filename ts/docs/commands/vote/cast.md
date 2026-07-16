# wallet-cli vote cast

Cast or replace your full vote allocation.

## Synopsis

```
wallet-cli vote cast --for <SR=votes> ... [--dry-run | --sign-only]
                     [--wait [--wait-timeout <ms>]] [options]
```

## Description

Submits your **complete** voting distribution — this is TRON's on-chain semantics, not a CLI choice: the set of `--for` entries you pass *replaces* all prior votes, and any SR not listed drops to zero. To change votes, just send a new `vote cast`; there is no un-vote step.

Two hard rules from the chain:

- **Total votes ≥ 1** — you cannot vote everything down to zero. To stop voting entirely, unstake the backing TRX ([`stake unfreeze`](../stake/unfreeze.md)); TP falls and the votes lapse.
- **At most 30 entries per transaction** (java-tron `MAX_VOTE_NUMBER`). Since a cast is the full distribution, an account holds votes on at most 30 SRs — only 27 are ever elected, so normal voting never hits this.

Votes take effect at the next maintenance cycle (~6 h). Each vote uses 1 TP (it is allocated, not spent — re-casting or unstaking frees it); available TP = staked TRX minus votes already placed ([`vote status`](status.md)).

**By default the command returns at submission** (`stage: "submitted"`), not confirmation — add `--wait` to block until confirmed/failed. Requires an account and the master password via `--password-stdin`; watch-only accounts fail with `watch_only_no_signer`.

## Options

| Option | Description |
|---|---|
| `--for <SR=votes>` | **Required, repeatable.** SR address = vote count (positive integer); the whole set becomes your full allocation (1–30 entries) |
| `--dry-run` | Build and estimate only, no signature/broadcast; excludes `--sign-only` |
| `--sign-only` | Sign without broadcasting (feed to [`tx broadcast`](../tx/broadcast.md)); excludes `--dry-run` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin (fd 0) |

Plus the [global options](../index.md#global-options-every-command).

## Examples

In the examples, `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

Default — broadcasts and returns the **submitted** receipt without waiting:

```bash
echo "$PW" | wallet-cli vote cast --for TZ4...=600 --for TT5...=400 --network tron:nile --password-stdin
```

```console
⏳ Submitted — vote 1,000 TP across 2 SRs
  TxID     e5f...
  Votes    TZ4...=600, TT5...=400
  Status   pending — tallied at next maintenance cycle (~6h)
! Track it: wallet-cli tx info --network tron:nile --txid e5f...
```

```bash
echo "$PW" | wallet-cli vote cast --for TZ4...=600 --for TT5...=400 --network tron:nile --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"vote.cast","data":{"kind":"vote-cast","stage":"submitted","txId":"e5f...","votes":[{"witness":"TZ4...","count":600},{"witness":"TT5...","count":400}],"totalVotes":1000},"meta":{"durationMs":18,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

Add `--wait` to block until the vote is confirmed on chain (adds real block / fee):

```bash
echo "$PW" | wallet-cli vote cast --for TZ4...=600 --for TT5...=400 --network tron:nile --wait --password-stdin
```

```console
✅ Voted 1,000 TP across 2 SRs
  TxID     f8a...
  Votes    TZ4...=600, TT5...=400
  Block    84,121,055
  Fee      0 TRX
  Status   success — tallied at next maintenance cycle (~6h)
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "vote-cast"`, `stage: "submitted"`, `txId`, `votes[]` (`witness`, `count`), `totalVotes` |
| `--wait` (confirmed) | above, plus `stage: "confirmed"`, `confirmed` (boolean), `blockNumber`, `feeSun`, `failed` |

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`watch_only_no_signer`, `auth_failed`, `insufficient_voting_power` — total exceeds available TP) · `2` usage error (`invalid_value` — bad SR address, non-positive count, > 30 entries).

## See also

[`vote status`](status.md) · [`vote list`](list.md) · [`reward withdraw`](../reward/withdraw.md) · [`stake freeze`](../stake/freeze.md) · [Script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed)
