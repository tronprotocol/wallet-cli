# wallet-cli account history

Show transaction history (requires TronGrid).

## Synopsis

```
wallet-cli account history [--limit <n>] [--only <native|token>] [options]
```

## Description

Lists recent transfers touching the account, newest first. History is served by **TronGrid**, not plain node RPC — on networks/endpoints without TronGrid this command fails while `balance`/`info` still work.

## Options

| Option | Description |
|---|---|
| `--limit <number>` | Max records, 1–200 (default 20) |
| `--only <native\|token>` | Filter by transfer type; omit for all |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```console
$ wallet-cli account history --limit 3 --network tron:nile
"main" recent transactions
| Time        | Type     | Amount | From / To                          | Status |
| ----------- | -------- | ------ | ---------------------------------- | ------ |
| 07-11 22:35 | Transfer | 1 TRX  | TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH | ✅      |
| 07-11 15:58 | Transfer | 1 TRX  | TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH | ✅      |
| 07-11 15:58 | Transfer | 1 TRX  | TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH | ✅      |
```

```console
$ wallet-cli account history --limit 2 --network tron:nile -o json
{"schema":"wallet-cli.result.v1","success":true,"command":"tron.account.history","data":{"address":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","only":"all","count":2,"records":[{"txId":"fb7f8e6b44cd9100f6d1133acea341a2f3d53ab140a93c95b8f2bd74d3a2b366","time":1783780503000,"type":"Transfer","amount":"1","symbol":"TRX","from":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","to":"TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH","counterparty":"TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH","status":"ok"},…]},"meta":{"durationMs":1556,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `address` / `only` / `count` | — | Query echo and record count |
| `records[].txId` | string | Feed to [`tx info`](../tx/info.md) for detail |
| `records[].time` | number | Epoch ms |
| `records[].type` | string | Transaction type (e.g. `Transfer`, `CreateSmart`) |
| `records[].amount` | string | Transfer amount; empty when not a value transfer |
| `records[].symbol` | string | Asset symbol (e.g. `TRX`) |
| `records[].from` / `to` / `counterparty` | string | Addresses (may be empty per type) |
| `records[].status` | string | `ok` or failure marker |

## Exit status

`0` · `1` execution failure (incl. TronGrid unavailable) · `2` usage error (limit out of 1–200).

## See also

[`tx info`](../tx/info.md) · [`account portfolio`](portfolio.md) · [Troubleshooting](../../troubleshooting.md#not-an-error-code-but-frequently-asked)
