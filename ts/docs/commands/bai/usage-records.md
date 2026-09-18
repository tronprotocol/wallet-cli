# wallet-cli bai usage-records

List individual B.AI usage records.

## Synopsis

```
wallet-cli bai usage-records [--limit <n>] [--offset <n>] [--sort <asc|desc>] [--cursor <c>] [options]
```

## Description

Lists the API key's usage, one record per request: model, tokens, credits, and latency. No wallet or password is needed.

Page with `--limit` / `--offset`, or pass the `nextCursor` of one page back with `--cursor` to get the following page.

Requires a B.AI API key stored with [`config baiApiKey`](../config.md); see [`bai`](index.md#the-api-key).

## Options

| Option | Description |
|---|---|
| `--limit <n>` | Rows per page, 1–200 (default `20`) |
| `--offset <n>` | Rows to skip (default `0`); must be a multiple of `--limit`, because B.AI pages by page number |
| `--sort <asc\|desc>` | Order by creation time (default `desc`) |
| `--cursor <c>` | `nextCursor` from the previous page |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli bai usage-records --limit 3
```

```console
B.AI usage records
  records:
    1.
      id: usg_8f3a2c71
      created At: 2026-09-15T08:21:44.000Z
      model: gpt-5-mini
      input Tokens: 1840
      output Tokens: 612
      total Tokens: 2452
      credits: 1200
      latency Ms: 2,840
      source: api
    2.
      id: usg_8f3a2b09
      created At: 2026-09-15T08:19:02.000Z
      model: claude-sonnet-5
      input Tokens: 3210
      output Tokens: 958
      total Tokens: 4168
      credits: 4600
      latency Ms: 5,120
      source: api
    3.
      id: usg_8f39f6d4
      created At: 2026-09-14T13:05:37.000Z
      model: gpt-5-mini
      input Tokens: 920
      output Tokens: 301
      total Tokens: 1221
      credits: 600
      latency Ms: 1,730
      source: api
  pagination:
    offset: 0
    limit: 3
    total: Not available
    has More: Yes
    next Cursor: eyJpZCI6InVzZ184ZjM5ZjZkNCJ9
```

```bash
wallet-cli bai usage-records --limit 3 -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"bai.usage-records","data":{"records":[{"id":"usg_8f3a2c71","createdAt":"2026-09-15T08:21:44.000Z","model":"gpt-5-mini","inputTokens":"1840","outputTokens":"612","totalTokens":"2452","credits":"1200","latencyMs":2840,"source":"api"},{"id":"usg_8f3a2b09","createdAt":"2026-09-15T08:19:02.000Z","model":"claude-sonnet-5","inputTokens":"3210","outputTokens":"958","totalTokens":"4168","credits":"4600","latencyMs":5120,"source":"api"},{"id":"usg_8f39f6d4","createdAt":"2026-09-14T13:05:37.000Z","model":"gpt-5-mini","inputTokens":"920","outputTokens":"301","totalTokens":"1221","credits":"600","latencyMs":1730,"source":"api"}]},"meta":{"durationMs":1323,"warnings":[],"pagination":{"offset":0,"limit":3,"total":null,"hasMore":true,"nextCursor":"eyJpZCI6InVzZ184ZjM5ZjZkNCJ9"}}}
```

Records are newest first. `credits` is what each request cost, and `latencyMs` how long it took. `hasMore: true` (text `has More: Yes`) means there are more records: fetch the next page with `--offset 3`, or with `--cursor eyJpZCI6InVzZ184ZjM5ZjZkNCJ9`.

## Output

| Field | Type | Meaning |
|---|---|---|
| `records[]` | array | Usage records, below |

Paging is in `meta.pagination`: `offset`, `limit`, `total` (always `null`, since B.AI returns no count), and when B.AI supplies them `hasMore` and `nextCursor`. `hasMore: false` means this is the last page.

Each record (a field B.AI does not supply is absent):

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Record id |
| `createdAt` | string | When the request was made |
| `model` | string | Model used |
| `inputTokens` / `outputTokens` / `totalTokens` | string | Token counts |
| `credits` | string | Credits charged |
| `latencyMs` | number | Request duration, in milliseconds |
| `source` | string | Where the request came from |

## Exit status

`0` success · `1` execution failure (`bai_auth_failed`; `bai_rejected`; `provider_error` — including a `--cursor` B.AI does not accept; `timeout`) · `2` usage error (`bai_credentials_missing`; `invalid_value` — `--offset` not a multiple of `--limit`, or out of range).

## See also

[`bai usage-summary`](usage-summary.md) · [`bai recharge-orders`](recharge-orders.md)
