# wallet-cli bai recharge-orders

List B.AI recharge orders.

## Synopsis

```
wallet-cli bai recharge-orders [--limit <n>] [--offset <n>] [--sort <asc|desc>] [options]
```

## Description

Lists the recharge orders of the API key's B.AI account, including ones created by [`bai recharge`](recharge.md). No wallet or password is needed.

Requires a B.AI API key stored with [`config baiApiKey`](../config.md); see [`bai`](index.md#the-api-key).

## Options

| Option | Description |
|---|---|
| `--limit <n>` | Rows per page, 1–200 (default `20`); B.AI returns at most 100, so a larger value is lowered to `100` with a warning |
| `--offset <n>` | Rows to skip (default `0`) |
| `--sort <asc\|desc>` | Order by creation time (default `desc`) |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli bai recharge-orders --limit 2
```

```console
B.AI recharge orders
  orders:
    1.
      can Download Invoice: Yes
      chain Key: tron
      created At: 1,782,986,861
      currency: USDT
      id: 31,207
      payment Method: TRON
      points: 1,000,000
      quantity Display: 1
      recharge Type: crypto
      recipient Display Label: Not available
      recipient Relation: self
      status: success
      team Id: Not available
      transaction Id: 5d1e8f3a7c2b90e4f6a18d3c5b7e9f02a4c6e8b1d3f5a7c9e2b4d6f8a0c1e3b5
      type: purchase
    2.
      bonus Type: rebate
      chain Key: Not available
      created At: 1,782,986,861
      currency: -
      id: 351,872
      payment Method: -
      points: 500,000
      quantity Display: -
      recharge Type: bonus
      status: expired
      transaction Id: -
      type: bonus
  pagination:
    offset: 0
    limit: 2
    total: 6
```

```bash
wallet-cli bai recharge-orders --limit 2 -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"bai.recharge-orders","data":{"orders":[{"canDownloadInvoice":true,"chainKey":"tron","createdAt":1782986861,"currency":"USDT","id":31207,"paymentMethod":"TRON","points":1000000,"quantityDisplay":"1","rechargeType":"crypto","recipientDisplayLabel":null,"recipientRelation":"self","status":"success","teamId":null,"transactionId":"5d1e8f3a7c2b90e4f6a18d3c5b7e9f02a4c6e8b1d3f5a7c9e2b4d6f8a0c1e3b5","type":"purchase"},{"bonusType":"rebate","chainKey":null,"createdAt":1782986861,"currency":"-","id":351872,"paymentMethod":"-","points":500000,"quantityDisplay":"-","rechargeType":"bonus","status":"expired","transactionId":"-","type":"bonus"}]},"meta":{"durationMs":2456,"warnings":[],"pagination":{"offset":0,"limit":2,"total":6}}}
```

The first order is a recharge of 1 USDT paid on TRON: `points` is the credits it added, and `transactionId` is the payment transaction. The second is the rebate bonus that came with it, created at the same time. `createdAt` (text `created At`) is a Unix timestamp in seconds, and `total` counts every order, bonuses included. In JSON output, paging is in `meta.pagination`.

## Output

| Field | Type | Meaning |
|---|---|---|
| `orders[]` | array | Orders exactly as B.AI returns them, newest first by default — among others `id`, `type` (`purchase` for a recharge, `bonus` for a rebate that comes with one), `status`, `currency`, `quantityDisplay` (amount paid), `points` (credits added), `chainKey`, `transactionId`, `createdAt` (Unix seconds) |

Paging is in `meta.pagination`: `offset`, `limit` (after any lowering to `100`), and `total` (all orders, bonuses included). An `--offset` past the last order returns an empty list.

## Exit status

`0` success · `1` execution failure (`bai_auth_failed`; `bai_rejected`; `provider_error`; `timeout`) · `2` usage error (`bai_credentials_missing`; `invalid_value` — `--limit` or `--offset` out of range).

## See also

[`bai recharge`](recharge.md) · [`bai usage-records`](usage-records.md)
