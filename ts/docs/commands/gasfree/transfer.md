# wallet-cli gasfree transfer

Sign and submit a TIP-712 GasFree token transfer. ✍️

## Synopsis

```
wallet-cli gasfree transfer --to <address|contact> --amount <n>
                            [--token <symbol>] [--dry-run] [options]
```

## Description

Moves tokens **without spending any TRX**. Instead of building and broadcasting a transaction, the
command signs a TIP-712 `PermitTransfer` authorization and submits it to the GasFree provider, who
broadcasts it and takes the fee in the transferred token.

Two consequences worth internalizing:

1. The tokens must sit in your **GasFree address**, not your ordinary TRON address — check with
   [`gasfree info`](info.md).
2. Success here means **accepted by the provider**, not confirmed on chain. The command returns a
   `traceId`; follow it with [`gasfree trace`](trace.md) or use `--wait`.

`--to` accepts a TRON address or a local [contact](../contact/index.md) name. When a contact is
used, the receipt shows both — `To  alice (TR7NHq…)` — so the resolution stays auditable.

`--token` defaults to `USDT` and must be one the provider supports.

### What is deducted

| Component | When |
|---|---|
| the transfer `amount` | always |
| the **transfer fee** | always |
| the **activation fee** | only if your GasFree address is not yet active |

The command checks the GasFree balance covers `amount + activation + transfer fee` up front and
fails with `insufficient_token_balance` (with `balance` and `required` in the error details) rather
than letting the provider reject it later.

Note that the **authorized max fee** in the signature is always `activationFee + transferFee`, even
for an already-active address — it is an upper bound the provider may not exceed, not the amount
charged. Both appear in the output so the difference is visible.

The signed authorization is bound to the current nonce and to a provider-supplied deadline, so it
cannot be replayed.

### `--dry-run`

Resolves the recipient, selects the token and provider, computes the exact fee breakdown, and
checks the balance — then stops. Nothing is signed, no unlock is needed, and nothing is submitted.
`--dry-run` cannot be combined with `--wait`.

### `--wait`

Polls the trace until a terminal state, then reports the **settled** amount and fees rather than
the estimates, with `stage` of `confirmed` (`SUCCEED`) or `failed` (`FAILED`). If the timeout
elapses first, it warns and returns the submitted receipt — the transfer is still in flight, so
track it with [`gasfree trace`](trace.md).

## Options

| Option | Description |
|---|---|
| `--to <string>` | **Required.** Recipient TRON address or local contact name |
| `--amount <string>` | **Required.** Human token amount; must be greater than zero |
| `--token <symbol>` | Token symbol (default `USDT`) |
| `--dry-run` | Check balance and fee breakdown without unlocking, signing, or submitting |
| `--wait` / `--wait-timeout <ms>` | Poll the trace until it reaches a terminal state |
| `--password-stdin` | Master password from stdin (software accounts) |

Plus the [global options](../index.md#global-options-every-command).

## Examples

Price it first — no unlock, nothing submitted:

```bash
wallet-cli gasfree transfer --to TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t \
  --amount 25 --network tron:nile --dry-run
```

```console
⏳ Dry run — GasFree transfer 25 USDT (not submitted)
  From                TB6dL8QunEyPUqX95PESxyZ2SHGeAQELW2
  To                  TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
  Service fee         1 USDT
  Activation fee      0 USDT
  Authorized max fee  2 USDT
  Total               26 USDT
  Status              not submitted
```

Submit it, to a contact by name:

```bash
echo "$PW" | wallet-cli gasfree transfer --to alice --amount 25 \
  --network tron:nile --password-stdin
```

```console
⏳ Submitted to GasFree — send 25 USDT
  Trace ID        7f3e9a02-58c1-4d2e-b6a4-91d0c3f8e527
  From            TB6dL8QunEyPUqX95PESxyZ2SHGeAQELW2
  To              alice (TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t)
  Service fee     1 USDT
  Activation fee  0 USDT
  Total           26 USDT
  Status          waiting
! Track it: wallet-cli gasfree trace 7f3e9a02-58c1-4d2e-b6a4-91d0c3f8e527
```

Submit and wait for the terminal state:

```bash
echo "$PW" | wallet-cli gasfree transfer --to alice --amount 25 \
  --network tron:nile --wait --password-stdin
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `kind` | string | `"gasfree-transfer"` |
| `stage` | string | `"dry-run"` \| `"submitted"` \| `"confirmed"` \| `"failed"` |
| `traceId` | string | Provider trace id — absent for `--dry-run` |
| `state` | string | Provider state (`WAITING` … `SUCCEED` / `FAILED`) |
| `txId` | string | On-chain hash, once the provider has broadcast |
| `token`, `tokenAddress`, `decimals` | — | Token identity |
| `amount` | string | Transfer amount in base units |
| `serviceFee` | string | Transfer fee in base units |
| `activateFee` | string | Activation fee in base units — `0` when already active |
| `authorizedMaxFee` | string | Fee ceiling covered by the signature |
| `totalDeducted` | string | `amount + activateFee + serviceFee` |
| `owner` | string | Account that authorized the transfer |
| `from` | string | GasFree address the tokens leave |
| `to` | string | Resolved recipient address |
| `toContact` | string | Contact name, when `--to` was a contact |
| `serviceProvider` | string | Provider address |
| `nonce`, `deadline` | string | Authorization binding |
| `failureReason` | string | Present when `stage` is `failed` |

## Exit status

`0` submitted (or dry-run) · `1` execution failure — `insufficient_token_balance`,
`gasfree_rejected` (address not permitted to submit), `gasfree_integrity`, `signing_rejected`,
`auth_failed` · `2` usage error — `invalid_option` (`--dry-run` with `--wait`), `invalid_amount`,
`unsupported_network` (`tron:shasta`), unknown token or contact.

## See also

[`gasfree info`](info.md) · [`gasfree trace`](trace.md) · [`tx send`](../tx/send.md) ·
[`contact add`](../contact/add.md)
