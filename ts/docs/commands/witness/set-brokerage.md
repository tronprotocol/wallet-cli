# wallet-cli witness set-brokerage

Set the share of block rewards the SR keeps.

## Synopsis

```
wallet-cli witness set-brokerage <percent>
                                 [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]]
                                 [--permission-id <n>] [options]
```

## Description

`<percent>` is the **brokerage** — the percentage of block rewards the SR keeps for itself; the remaining `100 − percent` is distributed to its voters in proportion to their votes. It defaults to 20, and is validated locally as an integer 0–100 before anything is broadcast.

This is the same number [`vote list`](../vote/list.md) reports as `brokeragePct`; that page's `Reward ratio` column is its complement — the voters' share. Setting `100` means voters earn nothing from your blocks.

Any registered witness can set it, elected or not. The acting account must be a candidate; otherwise the command fails with `not_a_witness`.

**By default the command returns at submission** (`stage: "submitted"`), not confirmation — add `--wait` to block until confirmed/failed. Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign — `--dry-run` and `--build-only` do not unlock the wallet and run without it. Watch-only accounts fail with `watch_only_no_signer` in a signing mode.

## Options

| Option | Description |
|---|---|
| `<percent>` | **Required.** Share the SR keeps, integer 0–100 |
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

Keep 20 %, pass 80 % to voters:

```bash
echo "$PW" | wallet-cli witness set-brokerage 20 --network tron:nile --wait --password-stdin
```

```console
✅ Brokerage set
  Witness    TSRmq8kP...9dEf (main)
  Brokerage  20%
  TxID       f8c...
  Block      57,881,402
  Fee        0 TRX  (269 bandwidth)
  Status     success
```

```bash
echo "$PW" | wallet-cli witness set-brokerage 20 --network tron:nile --wait --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"witness.set-brokerage","data":{"kind":"witness-set-brokerage","stage":"confirmed","txId":"f8c...","confirmed":true,"blockNumber":57881402,"failed":false,"witnessAddress":"TSRmq8kP...","brokerage":20,"feeSun":0,"resource":{"netUsage":269,"netFeeSun":0,"energyUsage":0,"energyFeeSun":0}},"meta":{"durationMs":6470,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "witness-set-brokerage"`, `stage: "submitted"`, `txId`, `witnessAddress`, `brokerage` |
| `--wait` (confirmed) | above, plus `stage: "confirmed"`, `confirmed` (boolean), `blockNumber`, `feeSun`, `resource`, `failed` |

`brokerage` is the value now in effect, as a number.

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`not_a_witness`, `watch_only_no_signer`, `auth_failed`) · `2` usage error (`invalid_value` — percent missing, not an integer, or outside 0–100).

## See also

[`witness create`](create.md) · [`vote list`](../vote/list.md) · [`reward balance`](../reward/balance.md) · [Script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed)
