# wallet-cli gasfree transfer

Sign a gas-free transfer and submit it to the GasFree provider.

## Synopsis

```
wallet-cli gasfree transfer --to <address|contact> --amount <n> [--token <symbol>]
                            [--dry-run | --wait [--wait-timeout <ms>]] [options]
```

## Description

Signs a transfer with EIP-712 structured-data signing and submits it to the GasFree provider, which puts it on-chain for you. No TRX is needed — the per-transfer service fee (plus a one-time activation fee on the first transfer) is deducted from the GasFree address's token balance, on top of the amount sent.

Submission returns a **`traceId`** (the provider's acceptance id); at that point the transfer is accepted but **not yet on-chain**. Add `--wait` to poll the provider to a terminal state (`SUCCEED` / `FAILED`), or follow it later with [`gasfree trace`](trace.md). On the first transfer, when the GasFree address isn't activated yet, this transfer carries the activation automatically and the total deducted is amount + service fee + activation fee (itemised in the receipt and in `--dry-run`).

There is no `--sign-only` / `--build-only`: the signed payload is bound to the provider's submission protocol, so offline distribution has no meaning. Requires an account and the provider credentials (`gasfreeApiKey` / `gasfreeApiSecret`, set with [`config`](../config.md)). The master password via `--password-stdin` is needed only when submitting the transfer; `--dry-run` does not unlock or sign. Watch-only accounts fail with `watch_only_no_signer` when submitting.

## Options

| Option | Description |
|---|---|
| `--to <address\|contact>` | **Required.** Recipient address, or a name from the [contact book](../contact/index.md) |
| `--amount <n>` | **Required.** Amount in token units (e.g. `25` = 25 USDT); fees are charged on top |
| `--token <symbol>` | Token to transfer; must be supported by the provider (see `gasfree info`) — default `USDT` |
| `--dry-run` | Fee breakdown and balance check only; no signature, no submission, no password |
| `--wait` / `--wait-timeout <ms>` | Poll the provider until the transfer succeeds/fails (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin |

Plus the [global options](../index.md#global-options-every-command).

## Examples

In the examples, `$PW` is your master password, fed on stdin via `--password-stdin`.

Default — submit and return the acceptance receipt (a `traceId`, not yet on-chain):

```bash
echo "$PW" | wallet-cli gasfree transfer --to TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub --amount 25 --network tron:nile --password-stdin
```

```console
⏳ Submitted to GasFree — send 25 USDT
  Trace ID  7f3e9a02-58c1-4d2e-b6a4-91d0c3f8e527
  From      TNER12mMVWruqopsW9FQtKxCGfZcEtb3ER
  To        TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub
  Service fee        0.5 USDT
  Activation fee     0 USDT
  Authorized max fee 1.5 USDT
  Total              25.5 USDT
  Status             waiting
! Track it: wallet-cli gasfree trace 7f3e9a02-58c1-4d2e-b6a4-91d0c3f8e527
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"gasfree.transfer","data":{"kind":"gasfree-transfer","stage":"submitted","traceId":"7f3e9a02-58c1-4d2e-b6a4-91d0c3f8e527","state":"WAITING","token":"USDT","tokenAddress":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","decimals":6,"amount":"25000000","serviceFee":"500000","activateFee":"0","authorizedMaxFee":"1500000","totalDeducted":"25500000","owner":"TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC","from":"TNER12mMVWruqopsW9FQtKxCGfZcEtb3ER","to":"TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub","serviceProvider":"TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E","nonce":"8","deadline":"1700000060"},"meta":{"durationMs":650,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

Add `--wait` to poll to a terminal state, with the on-chain txid and actual deduction:

```bash
echo "$PW" | wallet-cli gasfree transfer --to TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub --amount 25 --network tron:nile --wait --password-stdin
```

```console
✅ Sent 25 USDT via GasFree
  Trace ID  a41b6c88-0d2f-4e73-9a05-3c7d81f2b964
  TxID      d2e...
  From      TNER12mMVWruqopsW9FQtKxCGfZcEtb3ER
  To        TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub
  Service fee        0.5 USDT
  Activation fee     0 USDT
  Authorized max fee 1.5 USDT
  Total              25.5 USDT
  Status             succeed
```

On a first transfer the GasFree address isn't activated yet, so the fee itemises the service fee and the one-time activation fee, and `Total` includes activation:

```bash
wallet-cli gasfree transfer --to TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub --amount 25 --network tron:nile --dry-run
```

```console
⏳ Dry run — GasFree transfer 25 USDT (not submitted)
  From      TNER12mMVWruqopsW9FQtKxCGfZcEtb3ER
  To        TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub
  Service fee        0.5 USDT
  Activation fee     1 USDT
  Authorized max fee 1.5 USDT
  Total              26.5 USDT
  Status             not submitted
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"gasfree.transfer","data":{"kind":"gasfree-transfer","stage":"dry-run","token":"USDT","tokenAddress":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","decimals":6,"amount":"25000000","serviceFee":"500000","activateFee":"1000000","authorizedMaxFee":"1500000","totalDeducted":"26500000","owner":"TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC","from":"TNER12mMVWruqopsW9FQtKxCGfZcEtb3ER","to":"TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub","serviceProvider":"TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E","nonce":"8","deadline":"1700000060"},"meta":{"durationMs":210,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

`data` varies by mode. Amounts and fees are token base units (strings):

| Mode | Fields |
|---|---|
| default (submit) | `kind: "gasfree-transfer"`, `stage: "submitted"`, `traceId`, provider `state`, `token`, `tokenAddress`, `decimals`, `amount`, `serviceFee`, `activateFee`, `authorizedMaxFee`, `totalDeducted`, `owner`, `from`, `to`, `nonce`, `deadline`, `serviceProvider`, plus `toContact` when `--to` was a contact name |
| `--wait` (confirmed) | the above, but `stage: "confirmed"`, `state: "SUCCEED"`, and `txId` when supplied by the provider |
| `--wait` (failed) | the same fields, but `stage: "failed"`, `state: "FAILED"`, and optional `failureReason` / `txId` from the provider |
| `--dry-run` | the default fields except `traceId`, with `stage: "dry-run"`; no signature or submission |

A provider-side failure still leaves the envelope at `success: true` and exit `0` — the command completed; the transfer did not. There are no `confirmed` or `failed` booleans in this view; branch on `data.stage` / `data.state`, not on the exit code. See [script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed).

## Exit status

`0` submitted (or dry-run) · `1` execution failure (`insufficient_token_balance` — token balance < amount + service fee [+ activation fee], `gasfree_rejected` — the provider declined the authorization, `gasfree_integrity` — the provider's fee metadata disagreed with itself, `watch_only_no_signer`, `auth_failed`, `signing_rejected`, `provider_error`) · `2` usage error (`gasfree_credentials_missing`, `unsupported_network`, `unsupported_token`, `invalid_value`, `invalid_amount`).

## See also

[`gasfree info`](info.md) · [`gasfree trace`](trace.md) · [`tx send`](../tx/send.md) · [`config`](../config.md)
