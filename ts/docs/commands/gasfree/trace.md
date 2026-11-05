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
wallet-cli gasfree trace 7f3e9a02-58c1-4d2e-b6a4-91d0c3f8e527 --network nile
```

```console
Trace ID        7f3e9a02-58c1-4d2e-b6a4-91d0c3f8e527
Status          succeed
TxID            d2e...
Token           USDT
Amount          25 USDT
Service fee     0.5 USDT
Activation fee  0 USDT
Total           25.5 USDT
To              TF9yB7bAL2oBbonYaMvGTqoXxExS14x73c
```

```bash
wallet-cli gasfree trace 7f3e9a02-58c1-4d2e-b6a4-91d0c3f8e527 --network nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"gasfree.trace","data":{"traceId":"7f3e9a02-58c1-4d2e-b6a4-91d0c3f8e527","state":"SUCCEED","txId":"d2e...","token":"USDT","tokenAddress":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","decimals":6,"amount":"25000000","serviceFee":"500000","activateFee":"0","totalDeducted":"25500000","from":"TNER12mMVWruqopsW9FQtKxCGfZcEtb3ER","owner":"TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC","to":"TF9yB7bAL2oBbonYaMvGTqoXxExS14x73c","nonce":"8"},"meta":{"durationMs":290,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `traceId` | string | The provider's acceptance id |
| `state` | string | Raw state enum: `WAITING` / `INPROGRESS` / `CONFIRMING` / `SUCCEED` / `FAILED` |
| `tokenAddress` | string | TRC20 contract address |
| `decimals` | number | Token decimals used to render amounts |
| `totalDeducted` | string | Amount plus the settled service and activation fees, in token base units |
| `from` / `owner` | string | GasFree holding address / owning account address |
| `nonce` | string | Authorization nonce |
| `failureReason` | string | Provider explanation, only when supplied for a failed transfer |
| `txId` | string | On-chain transaction id (once submitted) |
| `token` | string | Token symbol |
| `amount` | string | Amount, in token base units |
| `serviceFee` / `activateFee` | string | Fees charged, in token base units |
| `to` | string | Recipient address |

## Exit status

`0` success · `1` execution failure (`not_found` — no such trace id (HTTP 404, or the service returned no data), `gasfree_integrity`, `gasfree_rejected` — the service declined the request or returned a 4xx status other than 401, 403, 404 and 429, `timeout` — the service did not answer within `--timeout`, `gasfree_auth_failed` — the service rejected the API credentials (HTTP 401 or 403), `provider_error` — the service could not be reached, returned a 5xx status, answered with malformed or oversized JSON, or returned a field this CLI will not act on; `provider_rate_limited` — the service returned 429, with `details.httpStatus: 429` and `details.retryAfterSeconds` when it sent a usable `Retry-After`) · `2` usage error (`gasfree_credentials_missing`, `unsupported_network`, `unsupported_network_capability` — Shasta, `invalid_value`, `invalid_config` — the network's GasFree `baseUrl` or `apiPrefix` is invalid).

A `FAILED` transfer is a successful query: the envelope stays `success: true` at exit `0`, and `data.failureReason` carries the provider's explanation.

## See also

[`gasfree transfer`](transfer.md) · [`gasfree info`](info.md) · [`config`](../config.md)
