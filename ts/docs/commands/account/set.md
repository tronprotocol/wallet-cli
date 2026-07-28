# wallet-cli account set

Set the one-time on-chain account name or ID. ✍️

## Synopsis

```
wallet-cli account set (--name <name> | --id <id>)
                       [--dry-run | --sign-only | --build-only] [options]
```

## Description

TRON accounts carry two optional on-chain text fields:

| Field | Contract | Constraint |
|---|---|---|
| `--name` | `AccountUpdateContract` | 1–32 UTF-8 bytes |
| `--id` | `SetAccountIdContract` | 8–32 UTF-8 bytes, **unique across the chain** |

Both are effectively **immutable** — the chain accepts them once, and a second attempt is rejected.
Treat this as a one-way decision and confirm the value with `--dry-run` before broadcasting.

Exactly one of `--name` / `--id` per invocation (`invalid_option`, exit 2). The target account must
already be activated, otherwise the command fails before signing.

These fields are on-chain metadata and are unrelated to the local wallet label set by
[`rename`](../rename.md), which never touches the chain.

After a confirmed broadcast the command re-reads the account and fails with `provider_error` if the
stored value does not match what was submitted.

## Options

| Option | Description |
|---|---|
| `--name <string>` | One-time on-chain account name (1–32 UTF-8 bytes) |
| `--id <string>` | One-time unique account ID (8–32 UTF-8 bytes) |
| `--dry-run` | Build and estimate only — no signature, no broadcast |
| `--sign-only` | Sign and output the complete transaction hex without broadcasting |
| `--build-only` | Build and output the unsigned transaction hex without unlocking |
| `--permission-id <0-9>` | TRON permission group id used to authorize this transaction (default `0`) |
| `--expiration <ms>` | Expiration duration in ms (1–86400000); only with `--sign-only` / `--build-only` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed |
| `--password-stdin` | Master password from stdin (software accounts) |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli account set --name alice --network tron:nile --dry-run
```

```bash
echo "$PW" | wallet-cli account set --id alice-001 --network tron:nile \
  --wait --password-stdin
```

```console
✅ On-chain id set
  TxID     9b2f...c1d4
  Block    #66,012,401
  Address  TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ
  ID       alice-001
  Status   success
```

Passing both selectors is a usage error:

```console
error [invalid_option]: provide exactly one of --name or --id
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `kind` | string | `"account-set"` |
| `field` | string | `"name"` or `"id"` |
| `value` | string | The value written on chain |
| `address` | string | Account that was updated |
| `stage`, `txId`, `blockNumber`, `feeSun` | — | Standard broadcast receipt fields |

## Exit status

`0` · `1` execution failure (account not activated, chain rejected an already-set field,
`provider_error`, `auth_failed`) · `2` usage error (neither/both of `--name` / `--id`, conflicting
mode flags).

## See also

[`rename`](../rename.md) — local label only · [`account info`](info.md) ·
[`account activate`](activate.md)
