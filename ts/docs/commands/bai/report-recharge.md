# wallet-cli bai report-recharge

Report an existing recharge transaction to B.AI, without paying again.

## Synopsis

```
wallet-cli bai report-recharge <txHash> --chain <tron|bnb|base> [--amount <n>] [--to <identifier> --target-id <id>] [options]
```

## Description

The recovery step after [`bai recharge`](recharge.md) paid but ended with `creditStatus: "unconfirmed"`. It sends the transaction hash to B.AI again so the credits can be added. It creates no order, signs nothing, and pays nothing; B.AI decides whether the transaction can be credited. No wallet or password is needed.

Give the values of the original recharge:

- the same API key;
- `--chain` — the chain it was paid on (`bnb` for BSC);
- `--amount`, when you have it;
- for a recharge to someone else, **both** the original `--to` and the `targetId` from its `rechargeTarget`. This command does not look the recipient up again. Omit both for a recharge of your own account.

The hash must be 64 hex characters on TRON and `0x` plus 64 hex characters on BSC and Base.

When B.AI cannot find the transaction yet, the CLI retries a few times within about 90 seconds. If it still cannot confirm, the command succeeds with `creditStatus: "unconfirmed"` and a `code` / `warning`; run it again later. Do not recharge again. Reporting a transaction that is already credited is safe: it returns `credited` again and adds nothing.

Requires a B.AI API key stored with [`config baiApiKey`](../config.md); see [`bai`](index.md#the-api-key).

## Arguments

- `txHash` — the payment transaction of the original recharge

## Options

| Option | Description |
|---|---|
| `--chain <tron\|bnb\|base>` | **Required.** Chain of the original recharge |
| `--amount <n>` | Original amount, in whole tokens |
| `--to <identifier>` | Original recipient email or address; requires `--target-id` |
| `--target-id <id>` | Original `rechargeTarget.confirmedTarget.targetId`; requires `--to` |

Plus the [global options](../index.md#global-options-every-command).

## Examples

Report a recharge of 1 USDT paid on TRON:

```bash
wallet-cli bai report-recharge 3f7a9c2e1b8d4f60a5c3e7b9d1f2a4c6e8b0d3f5a7c9e1b2d4f6a8c0e2b4d6f8 --chain tron --amount 1
```

```console
✅ B.AI recharge credited
  chain: tron
  tx Hash: 3f7a9c2e1b8d4f60a5c3e7b9d1f2a4c6e8b0d3f5a7c9e1b2d4f6a8c0e2b4d6f8
  amount: 1
  retry Payment: No
  credit Status: credited
  order:
    can Download Invoice: No
    chain Key: tron
    created At: 1,789,569,840
    currency: USDT
    id: 31,215
    payment Method: TRON
    points: 1,000,000
    quantity Display: 1
    recharge Type: crypto
    recipient Display Label: Not available
    recipient Relation: self
    status: success
    team Id: Not available
    transaction Id: 3f7a9c2e1b8d4f60a5c3e7b9d1f2a4c6e8b0d3f5a7c9e1b2d4f6a8c0e2b4d6f8
    type: purchase
```

```bash
wallet-cli bai report-recharge 3f7a9c2e1b8d4f60a5c3e7b9d1f2a4c6e8b0d3f5a7c9e1b2d4f6a8c0e2b4d6f8 --chain tron --amount 1 -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"bai.report-recharge","data":{"chain":"tron","txHash":"3f7a9c2e1b8d4f60a5c3e7b9d1f2a4c6e8b0d3f5a7c9e1b2d4f6a8c0e2b4d6f8","amount":"1","retryPayment":false,"creditStatus":"credited","order":{"canDownloadInvoice":false,"chainKey":"tron","createdAt":1789569840,"currency":"USDT","id":31215,"paymentMethod":"TRON","points":1000000,"quantityDisplay":"1","rechargeType":"crypto","recipientDisplayLabel":null,"recipientRelation":"self","status":"success","teamId":null,"transactionId":"3f7a9c2e1b8d4f60a5c3e7b9d1f2a4c6e8b0d3f5a7c9e1b2d4f6a8c0e2b4d6f8","type":"purchase"}},"meta":{"durationMs":972,"warnings":[]}}
```

`credited` (the heading `B.AI recharge credited`) means B.AI has matched the transaction to its order, shown in `order`. Reporting a transaction that was already credited returns the same result and adds no credits.

Reporting a transaction B.AI cannot verify — here an ordinary TRX transfer that was never a B.AI recharge — still exits `0`. After retrying for about a minute, it returns `creditStatus: unconfirmed` (the heading `B.AI credit not confirmed`) and a reason:

```bash
wallet-cli bai report-recharge 54a7315953ded3b8565cf36973cb56fa3d65f63eccb86aaf1033f28d2bdea01a --chain tron
```

```console
⚠️ B.AI credit not confirmed — reconcile before paying again
  chain: tron
  tx Hash: 54a7315953ded3b8565cf36973cb56fa3d65f63eccb86aaf1033f28d2bdea01a
  retry Payment: No
  credit Status: unconfirmed
  code: TX_NOT_FOUND_OR_INVALID
  warning: B.AI could not verify the transaction. Check confirmation, chain, recipient and sender; do not pay again
```

```bash
wallet-cli bai report-recharge 54a7315953ded3b8565cf36973cb56fa3d65f63eccb86aaf1033f28d2bdea01a --chain tron -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"bai.report-recharge","data":{"chain":"tron","txHash":"54a7315953ded3b8565cf36973cb56fa3d65f63eccb86aaf1033f28d2bdea01a","retryPayment":false,"creditStatus":"unconfirmed","code":"TX_NOT_FOUND_OR_INVALID","warning":"B.AI could not verify the transaction. Check confirmation, chain, recipient and sender; do not pay again"},"meta":{"durationMs":69635,"warnings":[]}}
```

Check the transaction hash and `--chain`, then report again later. Do not pay again.

## Output

| Field | Type | Meaning |
|---|---|---|
| `creditStatus` | string | `credited` or `unconfirmed` |
| `txHash` / `chain` / `amount` | string | What was reported; `amount` only when given |
| `rechargeTarget` | object | With `--to` / `--target-id`: the recipient reported |
| `retryPayment` | boolean | Always `false` |
| `order` | object | With `credited`: the order as B.AI returns it |
| `code` / `warning` / `error` | string / string / object | With `unconfirmed`: why it is not confirmed, e.g. `code: TX_NOT_FOUND_OR_INVALID` |

## Exit status

`0` reported — **check `creditStatus`**: a failed report, including a rejected key or an unreachable B.AI, still exits `0` with `unconfirmed` and the failure in `code` / `error` · `2` usage error (`bai_credentials_missing`; `invalid_value` — bad hash for the chain, or `--to` without `--target-id` or the reverse; `invalid_amount` — `--amount` is not a positive amount).

## See also

[`bai recharge`](recharge.md) · [`bai recharge-orders`](recharge-orders.md)
