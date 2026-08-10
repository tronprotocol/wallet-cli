# wallet-cli account activate

Activate a not-yet-existing account on-chain.

## Synopsis

```
wallet-cli account activate --address <T...>
                            [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]]
                            [--permission-id <n>] [options]
```

## Description

A TRON address doesn't exist on-chain until it receives its first asset or is explicitly created — until then queries return `not_found` and it cannot initiate a transaction. This command creates (activates) such an account **without transferring any asset**; the payer account covers the on-chain account-creation fee.

Use it only when an address needs to *exist* on its own — to be queryable, or able to initiate its own transactions. If you're sending it funds anyway, [`tx send`](../tx/send.md) activates the recipient automatically in one step; and adding an address to a multi-sig permission does **not** require activation.

Requires the payer account and the master password via `--password-stdin`; watch-only accounts fail with `watch_only_no_signer`.

## Options

| Option | Description |
|---|---|
| `--address <T...>` | **Required.** The address to activate (a valid, not-yet-activated TRON address) |
| `--dry-run` | Build and estimate only; no signature/broadcast, no password. Excludes `--sign-only` / `--build-only` |
| `--sign-only` | Build and sign, output the signed hex (feed [`tx broadcast`](../tx/broadcast.md)). Excludes `--dry-run` / `--build-only`; pairs with `--expiration` |
| `--build-only` | Build only, output the **unsigned** hex (feed [`tx multisig --create`](../tx/multisig.md)). Excludes `--dry-run` / `--sign-only`; pairs with `--expiration` |
| `--expiration <ms>` | Transaction expiration in ms, up to `86400000` (24h); only with `--sign-only` or `--build-only` |
| `--permission-id <n>` | Permission group to sign with (default `0`) |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin |

Plus the [global options](../index.md#global-options-every-command). `--account` selects the payer.

## Examples

In the examples, `$PW` is your master password, fed on stdin via `--password-stdin`.

Default — broadcast and return the **submitted** receipt:

```bash
echo "$PW" | wallet-cli account activate --address TNewAddr9k2fP7cW4bXm1sV8dRj6eL3aQz --network tron:nile --password-stdin
```

```console
⏳ Submitted — activate account
  TxID     a1b...
  Address  TNewAddr9k2fP7cW4bXm1sV8dRj6eL3aQz
  Payer    TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw (main)
  Status   pending
! Track it: wallet-cli tx info --network tron:nile --txid a1b...
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"account.activate","data":{"kind":"account-activate","stage":"submitted","txId":"a1b...","address":"TNewAddr9k2fP7cW4bXm1sV8dRj6eL3aQz","payer":"TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw"},"meta":{"durationMs":17,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

Add `--wait` to block until confirmed, with the actual block and fee:

```bash
echo "$PW" | wallet-cli account activate --address TNewAddr9k2fP7cW4bXm1sV8dRj6eL3aQz --network tron:nile --wait --password-stdin
```

```console
✅ Account activated
  TxID     e7a...
  Address  TNewAddr9k2fP7cW4bXm1sV8dRj6eL3aQz
  Payer    TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw (main)
  Block    #84,340,277
  Fee      1.1 TRX
  Status   success
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"account.activate","data":{"kind":"account-activate","stage":"confirmed","txId":"e7a...","confirmed":true,"blockNumber":84340277,"feeSun":1100000,"failed":false,"address":"TNewAddr9k2fP7cW4bXm1sV8dRj6eL3aQz","payer":"TQkXm4vN8pR2sD6fWbYc3LhJa9Ee5Zt7Uw"},"meta":{"durationMs":6540,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` varies by stage:

| Stage | Fields |
|---|---|
| default (submit) | `kind: "account-activate"`, `stage: "submitted"`, `txId`, `address`, `payer` |
| `--wait` (confirmed) | the above, but `stage: "confirmed"`, plus `confirmed`, `blockNumber`, `feeSun`, `failed` |
| `--dry-run` | `kind`, `mode: "dry-run"`, fee estimate, `address`, `payer`; no `txId` |

## Exit status

`0` submitted (or built/signed/dry-run in early-exit modes) · `1` execution failure (`account_already_active`, `watch_only_no_signer`, `wrong_password`, `auth_failed`, `insufficient_balance`, `rpc_error`, `timeout`) · `2` usage error (`invalid_value` — malformed address).

After a **confirmed** transaction the command reads the account back to verify the change took effect. That follow-up never turns an already-paid transaction into a command failure: a mismatch or an unreadable read is reported as a `meta.warnings` entry (`account_activate_postcheck_mismatch` / `account_activate_postcheck_unavailable`) with `success` still `true` and exit `0`.

## See also

[`account set`](set.md) · [`tx send`](../tx/send.md) · [`account info`](info.md) · [`chain params`](../chain/params.md)
