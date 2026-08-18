# wallet-cli witness create

Register the account as a super representative candidate.

## Synopsis

```
wallet-cli witness create --url <url>
                          [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]]
                          [--permission-id <n>] [options]
```

## Description

Registers the acting account as an SR candidate, making it votable and eligible to produce blocks once its votes reach the top 27. It also makes the account a witness for governance purposes — [`proposal create`](../proposal/create.md) and [`proposal approve`](../proposal/approve.md) require it.

**Registration burns a fee — currently about 9,999 TRX — and it is not refundable.** The exact amount is the chain parameter `getAccountUpgradeCost` ([`chain params`](../chain/params.md)), so read it there rather than assuming; the receipt's `Fee` line reports what was actually burned. There is no way to unregister.

The account must already be activated and hold at least the registration fee. `--url` is the candidate info page — the website explorers show next to the SR — and is the only business field the chain stores for a candidate; change it later with [`witness update`](update.md).

**By default the command returns at submission** (`stage: "submitted"`), not confirmation — add `--wait` to block until confirmed/failed. Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign — `--dry-run` and `--build-only` do not unlock the wallet and run without it. Watch-only accounts fail with `watch_only_no_signer` in a signing mode.

## Options

| Option | Description |
|---|---|
| `--url <url>` | **Required.** Candidate info page |
| `--dry-run` | Build and estimate only, no signature/broadcast; reports the registration fee; excludes `--sign-only` / `--build-only` |
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
echo "$PW" | wallet-cli witness create --url https://sr.acme.io --network tron:nile --wait --password-stdin
```

```console
✅ Witness registered
  Witness  TSRmq8kP...9dEf (main)
  Url      https://sr.acme.io
  TxID     d3a...
  Block    57,881,020
  Fee      9,999 TRX  (285 bandwidth)
  Status   success
```

```bash
echo "$PW" | wallet-cli witness create --url https://sr.acme.io --network tron:nile --wait --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"witness.create","data":{"kind":"witness-create","stage":"confirmed","txId":"d3a...","confirmed":true,"blockNumber":57881020,"failed":false,"witnessAddress":"TSRmq8kP...","url":"https://sr.acme.io","feeSun":9999000000,"resource":{"netUsage":285,"netFeeSun":0,"energyUsage":0,"energyFeeSun":0},"registrationFeeSun":9999000000},"meta":{"durationMs":6620,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "witness-create"`, `stage: "submitted"`, `txId`, `witnessAddress`, `url` |
| `--wait` (confirmed) | above, plus `stage: "confirmed"`, `confirmed` (boolean), `blockNumber`, `feeSun`, `resource`, `failed`, `registrationFeeSun` |

`registrationFeeSun` is the burned registration fee on its own; `feeSun` is the transaction's total cost, which includes it.

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`already_witness`, `account_not_active`, `insufficient_balance` — below the registration fee, `watch_only_no_signer`, `auth_failed`) · `2` usage error (`missing_option` — no `--url`).

## See also

[`witness update`](update.md) · [`witness set-brokerage`](set-brokerage.md) · [`proposal create`](../proposal/create.md) · [`chain params`](../chain/params.md) · [Script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed)
