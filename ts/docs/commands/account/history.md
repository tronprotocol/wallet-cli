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
$ wallet-cli account history --limit 2 --network tron:nile -o json
{"schema":"wallet-cli.result.v1","success":true,"command":"tron.account.history","data":{"address":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","only":"all","count":2,"records":[{"txId":"9ce070435f69f5697da967908b38a8e0345822263b5f24914ca309a41bb93903","time":1783047132000,"type":"CreateSmart","amount":"","from":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","to":"","counterparty":"","status":"ok"},…]},"meta":{"durationMs":1081,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `address` / `only` / `count` | — | Query echo and record count |
| `records[].txId` | string | Feed to [`tx info`](../tx/info.md) for detail |
| `records[].time` | number | Epoch ms |
| `records[].type` | string | Node contract type (e.g. `TransferContract`, `CreateSmart`) |
| `records[].amount` | string | Raw units; empty when not a value transfer |
| `records[].from` / `to` / `counterparty` | string | Addresses (may be empty per type) |
| `records[].status` | string | `ok` or failure marker |

## Exit status

`0` · `1` execution failure (incl. TronGrid unavailable) · `2` usage error (limit out of 1–200).

## See also

[`tx info`](../tx/info.md) · [`account portfolio`](portfolio.md) · [Troubleshooting](../../troubleshooting.md#not-an-error-code-but-frequently-asked)
