# wallet-cli account history

Show transaction history. TRON only.

## Synopsis

```
wallet-cli account history [--limit <n>] [--only <native|token>] [options]
```

## Description

Lists recent activity touching the account, newest first. TRON only — there is no EVM binding, so on an EVM network the command fails with `family_mismatch` rather than returning an empty list. History is served by **TronGrid**, not plain node RPC, so on TRON networks/endpoints without TronGrid it fails while `balance`/`info` still work.

`--only token` selects TronGrid's TRC20 transfer endpoint. The current `--only native` path uses the general transactions endpoint and does not post-filter its records, so it may include non-native contract activity; omitting `--only` uses that same endpoint. Do not treat `only: "native"` in JSON as proof that every returned record is a TRX transfer.

## Options

| Option | Description |
|---|---|
| `--limit <number>` | Max records, 1–200 (default 20) |
| `--only token` | Query TRC20 transfer history |
| `--only native` | Select the general transaction endpoint; currently not a strict native-transfer filter |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli account history --limit 3 --network tron:nile
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
wallet-cli account history --limit 2 --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"account.history","data":{"address":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","only":"all","count":2,"records":[{"txId":"fb7f8e6b44cd9100f6d1133acea341a2f3d53ab140a93c95b8f2bd74d3a2b366","time":1783780503000,"type":"Transfer","amount":"1","symbol":"TRX","from":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","to":"TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH","counterparty":"TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH","status":"ok"},{"txId":"aa9c6d96b582201bda4ca1f7f35eff597371f5ca8e99db0df78d02d78f668a31","time":1783779301000,"type":"Transfer","amount":"2","symbol":"TRX","from":"TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH","to":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","counterparty":"TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH","status":"ok"}]},"meta":{"durationMs":1556,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `address` / `only` / `count` | — | Query echo and returned record count; `only` echoes the selector and does not strengthen the filtering guarantee above |
| `records[].txId` | string | Feed to [`tx info`](../tx/info.md) for detail |
| `records[].time` | number | Epoch ms |
| `records[].type` | string | Transaction type (e.g. `Transfer`, `CreateSmart`) |
| `records[].amount` | string | Transfer amount; empty when not a value transfer |
| `records[].symbol` | string | Asset symbol (e.g. `TRX`) |
| `records[].from` / `to` / `counterparty` | string | Addresses (may be empty per type) |
| `records[].status` | string | `ok` or failure marker |

## Exit status

`0` · `1` execution failure (`history_not_supported`, including a missing or incompatible TronGrid endpoint) · `2` usage error (limit out of 1–200).

## See also

[`tx info`](../tx/info.md) · [`account portfolio`](portfolio.md) · [Troubleshooting](../../troubleshooting.md#not-an-error-code-but-frequently-asked)
