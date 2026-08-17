# wallet-cli proposal create

Create a governance proposal that changes chain parameters.

## Synopsis

```
wallet-cli proposal create --set <name|id>=<value> [--set ...]
                           [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]]
                           [--permission-id <n>] [options]
```

## Description

Submits a proposal carrying one or more chain-parameter changes for super representatives to vote on. Only a registered witness can create one; other accounts fail with `not_a_witness`.

`--set` takes a parameter **name** — the `getXxx` vocabulary of [`chain params`](../chain/params.md) — and resolves it to the on-chain parameter id; a raw numeric id also works. Unknown names and out-of-range values are rejected locally, before anything is broadcast.

Pass `--set` once per parameter. The receipt and `data.changes[]` order changes by parameter id, not by the order you typed them, so the same proposal always renders the same way.

**By default the command returns at submission** (`stage: "submitted"`), not confirmation — add `--wait` to block until confirmed/failed. Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign — `--dry-run` and `--build-only` do not unlock the wallet and run without it. Watch-only accounts fail with `watch_only_no_signer` in a signing mode.

## Options

| Option | Description |
|---|---|
| `--set <name\|id>=<value>` | **Required, repeatable.** One parameter change, e.g. `--set getTransactionFee=15`; `name` is a `chain params` key, a raw parameter id is also accepted |
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

One parameter, waiting for confirmation:

```bash
echo "$PW" | wallet-cli proposal create --set getTransactionFee=15 --network tron:nile --wait --password-stdin
```

```console
✅ Proposal created
  Proposal  #48
  Proposer  TSRmq8kP...9dEf (main)
  Parameter changes (1)
    getTransactionFee   10 → 15   sun/byte
  TxID      9c4...
  Block     57,880,102
  Fee       0 TRX  (268 bandwidth)
  Status    success
```

Several parameters in one proposal — the receipt lists them by parameter id:

```bash
echo "$PW" | wallet-cli proposal create --set getTransactionFee=15 --set getCreateAccountFee=200000 --network tron:nile --wait --password-stdin
```

```console
✅ Proposal created
  Proposal  #49
  Proposer  TSRmq8kP...9dEf (main)
  Parameter changes (2)
    getCreateAccountFee   100000 → 200000   sun
    getTransactionFee         10 →     15   sun/byte
  TxID      a1b...
  Block     57,880,140
  Fee       0 TRX  (292 bandwidth)
  Status    success
```

```bash
echo "$PW" | wallet-cli proposal create --set getTransactionFee=15 --network tron:nile --wait --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"proposal.create","data":{"kind":"proposal-create","stage":"confirmed","txId":"9c4...","confirmed":true,"blockNumber":57880102,"feeSun":0,"resource":{"netUsage":268,"netFeeSun":0,"energyUsage":0,"energyFeeSun":0},"failed":false,"proposalId":48,"changes":[{"id":3,"name":"getTransactionFee","currentValue":10,"proposedValue":15,"unit":"sun/byte"}]},"meta":{"durationMs":6480,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "proposal-create"`, `stage: "submitted"`, `txId`, `changes[]` |
| `--wait` (confirmed) | above, plus `stage: "confirmed"`, `confirmed` (boolean), `blockNumber`, `feeSun`, `resource`, `failed`, and `proposalId` — the new proposal's id, known only once it is on chain |

`proposalId` is **omitted** when the id cannot be established beyond doubt. The chain does not
report it, so it is recognised by comparing the proposal list against a snapshot taken before
submitting; if the node's list has not caught up yet, or more than one new proposal matches these
parameters, a warning says so and the field is absent. Treat it as optional and fall back to
[`proposal list`](list.md) — a guessed id would be passed on to `proposal approve` or the
irreversible `proposal delete`. The transaction itself has succeeded either way.

`changes[]` entries carry `id`, `name`, `currentValue`, `proposedValue`, and `unit`, ordered by `id`.

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`not_a_witness`, `watch_only_no_signer`, `auth_failed`) · `2` usage error (`missing_option` — no `--set` given; `unknown_parameter` — no such name or id; `invalid_value` — value out of range or not a number).

## See also

[`proposal approve`](approve.md) · [`proposal delete`](delete.md) · [`proposal show`](show.md) · [`chain params`](../chain/params.md) · [Script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed)
