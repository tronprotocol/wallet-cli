# wallet-cli account activate

Activate a new TRON account. ✍️

## Synopsis

```
wallet-cli account activate --address <address>
                            [--dry-run | --sign-only | --build-only] [options]
```

## Description

A TRON address exists as soon as you generate a key, but it is not *activated* until it appears on
chain. An unactivated address cannot receive TRC10, hold resources, or be the owner of a
transaction. Activation is a funded operation: this command builds an `AccountCreateContract` paid
for by the **active account** (or `--account`) and broadcasts it.

Preconditions checked before anything is signed:

- `--address` must be a valid TRON base58 address (`invalid_value`, exit 2).
- The target must not already be active — otherwise `account_already_active` (exit 1).
- The payer's balance must cover the creation fee — otherwise `insufficient_balance` (exit 1),
  with `balance` and `required` in the error details.

Because the fee comes from the chain's current parameters rather than a fixed constant, run
`--dry-run` first to see what it costs right now.

With `--wait`, the command additionally re-reads the target account after confirmation and fails
with `provider_error` if the node does not report it as active — a confirmed activation that is
invisible to the node is treated as a failure, not a success.

## Options

| Option | Description |
|---|---|
| `--address <string>` | **Required.** Unactivated TRON base58 address to activate |
| `--dry-run` | Build and estimate only — no signature, no broadcast |
| `--sign-only` | Sign and output the complete transaction hex without broadcasting |
| `--build-only` | Build and output the unsigned transaction hex without unlocking |
| `--permission-id <0-9>` | TRON permission group id used to authorize this transaction (default `0`) |
| `--expiration <ms>` | Expiration duration in ms (1–86400000); only with `--sign-only` / `--build-only` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed |
| `--password-stdin` | Master password from stdin (software accounts) |

`--dry-run`, `--sign-only`, and `--build-only` are mutually exclusive.

Plus the [global options](../index.md#global-options-every-command).

## Examples

Check the current cost before spending anything:

```bash
wallet-cli account activate --address TB6dL8QunEyPUqX95PESxyZ2SHGeAQELW2 \
  --network tron:nile --dry-run
```

Activate and wait for confirmation:

```bash
echo "$PW" | wallet-cli account activate --address TB6dL8QunEyPUqX95PESxyZ2SHGeAQELW2 \
  --network tron:nile --wait --password-stdin
```

```console
✅ Account activated
  TxID     4c0a1f4b1e0e0d8a5f0a2c6f9e1d3b7a8c5e2f4d6b8a0c2e4f6a8c0e2f4a6b8c
  Block    #66,012,345
  Fee      1.1 TRX
  Address  TB6dL8QunEyPUqX95PESxyZ2SHGeAQELW2
  Payer    TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ
  Status   success
```

An address that is already on chain is refused rather than paid for twice:

```json
{"schema":"wallet-cli.result.v1","success":false,"command":"account.activate","error":{"code":"account_already_active","message":"TRON account is already active: TB6dL8QunEyPUqX95PESxyZ2SHGeAQELW2"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `kind` | string | `"account-activate"` |
| `stage` | string | `"submitted"` / `"confirmed"` / `"failed"` (absent for `--dry-run`) |
| `mode` | string | `"dry-run"` / `"sign-only"` / `"build-only"` when a mode flag was used |
| `txId` | string | Transaction id |
| `address` | string | The address that was activated |
| `payer` | string | Address that paid the creation fee |
| `blockNumber`, `feeSun` | number \| string | Present after `--wait` |

## Exit status

`0` · `1` execution failure (`account_already_active`, `insufficient_balance`, `provider_error`,
`auth_failed`) · `2` usage error (`invalid_value`, conflicting mode flags).

## See also

[`address generate`](../address/generate.md) — make a keypair to activate ·
[`account info`](info.md) · [`tx send`](../tx/send.md) — a transfer to a fresh address also
activates it
