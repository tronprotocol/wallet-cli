# wallet-cli gasfree trace

Track a submitted gas-free transfer by its trace id.

## Synopsis

```
wallet-cli gasfree trace <traceId> [options]
```

## Description

Looks up a GasFree transfer by the `traceId` returned from [`gasfree transfer`](transfer.md) and reports its current state. Once the transfer is on-chain, the response includes the transaction id and the actual fees charged.

The provider's states are: `WAITING` (accepted, queued) → `INPROGRESS` (submitted on-chain) → `CONFIRMING` (awaiting solidification) → `SUCCEED` / `FAILED`. The text `Status` line shows the state in lowercase (consistent with the other commands); the raw uppercase enum is kept in the JSON `state`. On `FAILED`, the provider's failure reason is included as returned by the API.

Requires the provider API credentials (`gasfreeApiKey` / `gasfreeApiSecret`, set with [`config`](../config.md)).

## Options

No command-specific options; `traceId` is a positional argument, plus the [global options](../index.md#global-options-every-command) (`--network`).

## Examples

```bash
wallet-cli gasfree trace 7f3e9a02-58c1-4d2e-b6a4-91d0c3f8e527 --network tron:nile
```

```console
Trace ID  7f3e9a02-58c1-4d2e-b6a4-91d0c3f8e527
Status    succeed
TxID      d2e...
Token     USDT
Amount    25 USDT
Fee       0.5 USDT
To        TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub
```

```bash
wallet-cli gasfree trace 7f3e9a02-58c1-4d2e-b6a4-91d0c3f8e527 --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"gasfree.trace","data":{"traceId":"7f3e9a02-58c1-4d2e-b6a4-91d0c3f8e527","state":"SUCCEED","txId":"d2e...","token":"USDT","amount":"25000000","serviceFee":"500000","activateFee":"0","to":"TBy6mQ7Y3nJ8sD2fWpXk4LhVc9Ra1Zt5Ub"},"meta":{"durationMs":290,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `traceId` | string | The provider's acceptance id |
| `state` | string | Raw state enum: `WAITING` / `INPROGRESS` / `CONFIRMING` / `SUCCEED` / `FAILED` |
| `txId` | string | On-chain transaction id (once submitted) |
| `token` | string | Token symbol |
| `amount` | string | Amount, in token base units |
| `serviceFee` / `activateFee` | string | Fees charged, in token base units |
| `to` | string | Recipient address |

## Exit status

`0` success · `1` execution failure (`not_found` — no such trace id, `gasfree_integrity`, `provider_error`) · `2` usage error (`gasfree_credentials_missing`, `unsupported_network`, `invalid_value`).

A `FAILED` transfer is a successful query: the envelope stays `success: true` at exit `0`, and `data.failureReason` carries the provider's explanation.

## See also

[`gasfree transfer`](transfer.md) · [`gasfree info`](info.md) · [`config`](../config.md)
