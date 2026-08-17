# wallet-cli asset unfreeze

Release matured frozen supply of the TRC10 you issued.

## Synopsis

```
wallet-cli asset unfreeze
                          [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]]
                          [--permission-id <n>] [options]
```

## Description

Returns the part of the issued supply that was frozen at issuance and whose lock period is over, back to the issuer's balance.

There is no argument of any kind: the command always targets the token issued by the signing account, and the chain accepts neither "which tranche" nor "how much" — **every matured tranche is released in one transaction**. Tranches that have not matured are untouched; run the command again once they are.

A tranche matures at its issuance `--start` plus its `days`, not at the moment the token was actually issued: the chain writes each tranche's `expire_time` as `start_time + days × 86400000` when the token is created. The resulting dates are visible in the `Frozen` section of [`asset info`](info.md).

This is unrelated to [`stake unfreeze`](../stake/unfreeze.md), which releases staked TRX; the only thing they share is the word.

**By default the command returns at submission** (`stage: "submitted"`), not confirmation — add `--wait` to block until confirmed/failed. Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign — `--dry-run` and `--build-only` do not unlock the wallet and run without it. Watch-only accounts fail with `watch_only_no_signer` in a signing mode.

## Options

This command has no options of its own.

| Option | Description |
|---|---|
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
echo "$PW" | wallet-cli asset unfreeze --network tron:nile --wait --password-stdin
```

```console
✅ Frozen supply released
  Asset         MyToken  (id 1000123)
  Issuer        TQkXm4vN...5Zt7Uw (main)
  Released      100,000,000 MyToken
  Still frozen  50,000,000 MyToken
  TxID          6a5...
  Block         57,883,560
  Fee           0 TRX  (288 bandwidth)
  Status        success
```

```bash
echo "$PW" | wallet-cli asset unfreeze --network tron:nile --wait --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"asset.unfreeze","data":{"kind":"asset-unfreeze","stage":"confirmed","txId":"6a5...","confirmed":true,"blockNumber":57883560,"failed":false,"assetId":"1000123","name":"MyToken","issuerAddress":"TQkXm4vN...","releasedAmount":100000000000000,"stillFrozenAmount":50000000000000,"feeSun":0,"resource":{"netUsage":288,"netFeeSun":0,"energyUsage":0,"energyFeeSun":0}},"meta":{"durationMs":6410,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "asset-unfreeze"`, `stage: "submitted"`, `txId`, `assetId`, `name`, `issuerAddress` |
| `--wait` (confirmed) | above, plus `stage: "confirmed"`, `confirmed` (boolean), `blockNumber`, `feeSun`, `resource`, `failed`, `releasedAmount`, `stillFrozenAmount` |

`releasedAmount` and `stillFrozenAmount` are raw amounts (smallest unit) and reflect what the confirmed transaction actually did.

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`not_an_issuer` — this account has not issued a TRC10, `no_frozen_supply`, `not_yet_unfreezable` — nothing has matured yet, `watch_only_no_signer`, `auth_failed`) · `2` usage error.

## See also

[`asset info`](info.md) · [`asset issue`](issue.md) · [`stake unfreeze`](../stake/unfreeze.md) · [Script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed)
