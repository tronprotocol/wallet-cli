# wallet-cli reward withdraw

Withdraw accrued rewards to balance.

## Synopsis

```
wallet-cli reward withdraw [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]]
                           [--permission-id <n>] [options]
```

## Description

Moves your accumulated voting rewards (plus block rewards if you are an SR) into the account's available balance. The chain allows this **at most once every 24 hours** — check first with [`reward balance`](balance.md); an early attempt fails with `withdraw_too_frequent`, and an empty balance with `no_reward`.

`Amount` in the receipt: at the `submitted` stage it is the claimable amount read at broadcast time; the `--wait` confirmed receipt shows the actual on-chain amount (they differ only by seconds of accrual — negligible).

**By default the command returns at submission**; `--wait` blocks until confirmed. Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign — `--dry-run` and `--build-only` do not unlock the wallet and run without it. Watch-only accounts fail with `watch_only_no_signer` in a signing mode.

## Options

| Option | Description |
|---|---|
| `--dry-run` | Build and estimate only, no signature/broadcast; excludes `--sign-only` / `--build-only` |
| `--sign-only` | Sign without broadcasting, output the signed hex; excludes `--dry-run` / `--build-only`; pairs with `--expiration` |
| `--build-only` | Build only, output the **unsigned** hex; excludes `--dry-run` / `--sign-only`; pairs with `--expiration` |
| `--expiration <ms>` | Transaction expiration in ms, up to `86400000` (24h); only with `--sign-only` or `--build-only`; omitted = node default (~60s) |
| `--permission-id <n>` | Permission group to sign with (0=owner, 1=witness, 2-9=active); default `0` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin |

Plus the [global options](../index.md#global-options-every-command).

## Examples

In the examples, `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

Default — broadcasts and returns the **submitted** receipt:

```bash
echo "$PW" | wallet-cli reward withdraw --network tron:nile --password-stdin
```

```console
⏳ Submitted — withdraw voting/block rewards
  TxID     a1b...
  Amount   123.456789 TRX
  Status   pending — next withdrawal available in ~24h
! Track it: wallet-cli tx info --network tron:nile --txid a1b...
```

```bash
echo "$PW" | wallet-cli reward withdraw --network tron:nile --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"reward.withdraw","data":{"kind":"reward-withdraw","stage":"submitted","txId":"a1b...","rewardSun":"123456789"},"meta":{"durationMs":17,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

Add `--wait` to block until confirmed (adds real block / fee):

```bash
echo "$PW" | wallet-cli reward withdraw --network tron:nile --wait --password-stdin
```

```console
✅ Withdrew voting/block rewards
  TxID     c7d...
  Amount   123.456789 TRX
  Block    84,121,010
  Fee      0.268 TRX
  Status   success — next withdrawal available in ~24h
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "reward-withdraw"`, `stage: "submitted"`, `txId`, `rewardSun` (string) |
| `--wait` (confirmed) | above, plus `stage: "confirmed"`, `confirmed`, `blockNumber`, `feeSun`, `failed` |

## Exit status

`0` submitted · `1` execution failure (`watch_only_no_signer`, `auth_failed`, `withdraw_too_frequent` — < 24 h since last withdrawal, `no_reward` — nothing to claim) · `2` usage error.

## See also

[`reward balance`](balance.md) · [`vote cast`](../vote/cast.md) · [`stake withdraw`](../stake/withdraw.md) (unstaked TRX is a different command)
