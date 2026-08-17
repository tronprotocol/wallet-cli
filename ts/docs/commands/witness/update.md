# wallet-cli witness update

Change the candidate info page URL.

## Synopsis

```
wallet-cli witness update --url <url>
                          [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]]
                          [--permission-id <n>] [options]
```

## Description

Replaces the info page URL of an existing SR candidacy. The url is the only field the chain keeps for a candidate, so this is the whole of "editing" an SR. It can be changed as often as needed and costs only bandwidth.

The acting account must already be a candidate; otherwise the command fails with `not_a_witness`.

**By default the command returns at submission** (`stage: "submitted"`), not confirmation — add `--wait` to block until confirmed/failed. Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign — `--dry-run` and `--build-only` do not unlock the wallet and run without it. Watch-only accounts fail with `watch_only_no_signer` in a signing mode.

## Options

| Option | Description |
|---|---|
| `--url <url>` | **Required.** New candidate info page |
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
echo "$PW" | wallet-cli witness update --url https://sr.acme.io/v2 --network tron:nile --wait --password-stdin
```

```console
✅ Witness updated
  Witness  TSRmq8kP...9dEf (main)
  Url      https://sr.acme.io/v2
  TxID     e5b...
  Block    57,881,190
  Fee      0 TRX  (270 bandwidth)
  Status   success
```

```bash
echo "$PW" | wallet-cli witness update --url https://sr.acme.io/v2 --network tron:nile --wait --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"witness.update","data":{"kind":"witness-update","stage":"confirmed","txId":"e5b...","confirmed":true,"blockNumber":57881190,"failed":false,"witnessAddress":"TSRmq8kP...","url":"https://sr.acme.io/v2","feeSun":0,"resource":{"netUsage":270,"netFeeSun":0,"energyUsage":0,"energyFeeSun":0}},"meta":{"durationMs":6440,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "witness-update"`, `stage: "submitted"`, `txId`, `witnessAddress`, `url` |
| `--wait` (confirmed) | above, plus `stage: "confirmed"`, `confirmed` (boolean), `blockNumber`, `feeSun`, `resource`, `failed` |

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`not_a_witness`, `watch_only_no_signer`, `auth_failed`) · `2` usage error (`missing_option` — no `--url`).

## See also

[`witness create`](create.md) · [`witness set-brokerage`](set-brokerage.md) · [`vote list`](../vote/list.md) · [Script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed)
