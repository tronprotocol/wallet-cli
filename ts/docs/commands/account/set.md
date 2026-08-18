# wallet-cli account set

Set the account's on-chain name or account id.

## Synopsis

```
wallet-cli account set (--name <name> | --id <account-id>)
                       [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]]
                       [--permission-id <n>] [options]
```

## Description

Sets the account's on-chain **name** (a display alias, up to 32 bytes) or its **account id** (a globally unique identifier, 8–32 bytes). One at a time — `--name` and `--id` are mutually exclusive; to set both, run it twice.

⚠️ **On mainnet each can be set only once and can never be changed** — the value is permanent, and there is no confirmation prompt. This is different from [`rename`](../rename.md), which changes the local label and can be redone anytime.

Requires the account and the master password via `--password-stdin`; watch-only accounts fail with `watch_only_no_signer`. The account id's uniqueness is enforced on-chain — a taken id fails with `id_taken`.

## Options

| Option | Description |
|---|---|
| `--name <name>` | **Required** (one of). On-chain account name, up to 32 bytes; mainnet allows setting it once |
| `--id <account-id>` | **Required** (one of). Account id, 8–32 bytes, globally unique; can be set once |
| `--dry-run` | Build and estimate only; no signature/broadcast, no password. Excludes `--sign-only` / `--build-only` |
| `--sign-only` | Build and sign, output the signed hex (feed [`tx broadcast`](../tx/broadcast.md)). Excludes `--dry-run` / `--build-only`; pairs with `--expiration` |
| `--build-only` | Build only, output the **unsigned** hex (feed [`tx multisig --create`](../tx/multisig.md)). Excludes `--dry-run` / `--sign-only`; pairs with `--expiration` |
| `--expiration <ms>` | Transaction expiration in ms, up to `86400000` (24h); only with `--sign-only` or `--build-only`; omitted = node default (~60s) |
| `--permission-id <n>` | Permission group to sign with (0=owner, 1=witness, 2-9=active); default `0` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin |

Plus the [global options](../index.md#global-options-every-command).

## Examples

In the examples, `$PW` is your master password, fed on stdin via `--password-stdin`.

Set the on-chain name and wait for confirmation:

```bash
echo "$PW" | wallet-cli account set --name "Acme Treasury" --network tron:nile --wait --password-stdin
```

```console
✅ On-chain name set
  Account  TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw (main)
  Name     Acme Treasury
  TxID     f2b...
  Block    #84,341,590
  Fee      0.3 TRX
  Status   success
```

```bash
echo "$PW" | wallet-cli account set --name "Acme Treasury" --network tron:nile --wait --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"account.set","data":{"kind":"account-set","stage":"confirmed","txId":"f2b...","confirmed":true,"blockNumber":84341590,"feeSun":300000,"failed":false,"field":"name","value":"Acme Treasury","address":"TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw"},"meta":{"durationMs":6420,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

Set the account id instead (`--id`); the id's uniqueness is enforced on-chain:

```bash
echo "$PW" | wallet-cli account set --id acme-treasury-01 --network tron:nile --wait --password-stdin
```

```console
✅ Account id set
  Account  TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw (main)
  Id       acme-treasury-01
  TxID     3d9...
  Block    #84,341,730
  Fee      0.3 TRX
  Status   success
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "account-set"`, `stage: "submitted"`, `txId`, `field` (`name`/`id`), `value`, `address` |
| `--wait` (confirmed) | the above, but `stage: "confirmed"`, plus `confirmed`, `blockNumber`, `feeSun`, `failed` |
| `--dry-run` | `kind`, `mode: "dry-run"`, fee estimate, `field`, `value`, `address`; no `txId` |

## Exit status

`0` submitted (or built/signed/dry-run in early-exit modes) · `1` execution failure (`name_already_set`, `id_already_set`, `id_taken`, `watch_only_no_signer`, `auth_failed`, `rpc_error`, `timeout`) · `2` usage error (`invalid_value`, `invalid_option` — malformed or missing name/id).

After a **confirmed** transaction the command reads the account back to verify the change took effect. That follow-up never turns an already-paid transaction into a command failure: a mismatch or an unreadable read is reported as a `meta.warnings` entry (`account_set_postcheck_mismatch` / `account_set_postcheck_unavailable`) with `success` still `true` and exit `0`.

## See also

[`account activate`](activate.md) · [`rename`](../rename.md) · [`account info`](info.md)
