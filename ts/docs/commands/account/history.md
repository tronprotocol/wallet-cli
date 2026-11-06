# wallet-cli account history

Show transaction history (requires TronGrid).

## Synopsis

```
wallet-cli account history [--limit <n>] [--only <native|token>] [options]
```

## Description

> **TRON only.** There is no EVM binding for this listing, so on an EVM network the command fails with `family_mismatch` rather than returning an empty list.

Lists recent activity touching the account, newest first. History is served by **TronGrid**, not plain node RPC — on networks/endpoints without TronGrid this command fails while `balance`/`info` still work.

`--only token` selects TronGrid's TRC20 transfer endpoint. `--only native` selects the general transactions endpoint and does not post-filter its records, so it can include non-native contract activity, such as TRC10 transfers (reported in the asset's own units, never as TRX); omitting `--only` queries that same endpoint. Do not read `only: "native"` in the JSON as proof that every record is a TRX transfer.

## Options

| Option | Description |
|---|---|
| `--limit <number>` | Max records, 1–200 (default 20) |
| `--only token` | Query TRC20 transfer history |
| `--only native` | Select the general transaction endpoint; not a strict native-transfer filter |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli account history --limit 3 --network nile
```

```console
"main" recent transactions
| Time        | Type     | Amount | From / To                          | Status |
| ----------- | -------- | ------ | ---------------------------------- | ------ |
| 07-11 22:35 | Transfer | 1 TRX  | TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH | ✅      |
| 07-11 15:58 | Transfer | 1 TRX  | TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH | ✅      |
| 07-11 15:58 | Transfer | 1 TRX  | TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH | ✅      |
```

```bash
wallet-cli account history --limit 2 --network nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"account.history","data":{"address":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","only":"all","count":2,"records":[{"txId":"fb7f8e6b44cd9100f6d1133acea341a2f3d53ab140a93c95b8f2bd74d3a2b366","time":1783780503000,"type":"Transfer","amount":"1","symbol":"TRX","from":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","to":"TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH","counterparty":"TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH","status":"ok"},{"txId":"aa9c6d96b582201bda4ca1f7f35eff597371f5ca8e99db0df78d02d78f668a31","time":1783779301000,"type":"Transfer","amount":"2","symbol":"TRX","from":"TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH","to":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","counterparty":"TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH","status":"ok"}]},"meta":{"durationMs":1556,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `address` / `only` / `count` | — | Query echo and record count |
| `records[].txId` | string | Feed to [`tx info`](../tx/info.md) for detail |
| `records[].time` | number | Epoch ms |
| `records[].type` | string | Transaction type (e.g. `Transfer`, `CreateSmart`) |
| `records[].amount` | string | Transfer amount in `symbol` units; empty when not a value transfer, or for a TRC10 transfer whose asset metadata could not be read |
| `records[].rawAmount` | string | TRC10 transfers (`type: "TransferAsset"`) only: the amount in the asset's base units |
| `records[].assetId` | string | TRC10 transfers only: the asset id |
| `records[].symbol` | string | Asset symbol: `TRX`, or a TRC10 asset's abbreviation or name when known (absent otherwise) |
| `records[].from` / `to` / `counterparty` | string | Addresses (may be empty per type) |
| `records[].status` | string | `ok`, `failed`, or `unknown` when the record carries no execution result |

## Exit status

`0` · `1` execution failure (`history_not_supported` — no TronGrid endpoint is configured, or it answers HTTP 404; `timeout`, `rpc_error` — the endpoint did not answer or failed, retry; `provider_rate_limited` — HTTP 429, `error.details.httpStatus: 429`, retry later; `invalid_node_response` — the endpoint returned a body that is not a history page) · `2` usage error (limit out of 1–200; `family_mismatch` on an EVM network).

## See also

[`tx info`](../tx/info.md) · [`account portfolio`](portfolio.md) · [Troubleshooting](../../troubleshooting.md#not-an-error-code-but-frequently-asked)
