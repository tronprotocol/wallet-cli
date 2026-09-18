# wallet-cli bai recharge

Recharge a B.AI account with stablecoins.

## Synopsis

```
wallet-cli bai recharge <amount> [--token <symbol>] [--to <email|address>] [--network <tron|bsc|base>]
                         [--scheme <exact|exact_gasfree>] [--gasfree-relay <official|gasfree|url>]
                         [--max-gasfree-fee <n> | --max-gasfree-fee-raw <n>] [--dry-run] [--password-stdin] [options]
```

## Description

Creates a recharge order with B.AI, pays it from the active account (or `--account`) with an x402 payment — `exact` by default, or `exact_gasfree` on TRON — and reports the transaction to B.AI so the credits are added. **This spends real tokens** — recharge works only on mainnet:

| `--network` | Tokens | Default `--token` |
|---|---|---|
| `tron` (`tron:728126428`) | `USDT`, `USDD` | `USDT` |
| `bsc` (`eip155:56`) | `USDT` | `USDT` |
| `base` (`eip155:8453`) | `USDC` | `USDC` |

The minimum is 1 for USDT and USDC; USDD has none.

**Who gets the credits.** Without `--to`, the account that owns the API key. With `--to`, the B.AI account behind that email or wallet address (EVM, TRON, or Solana); B.AI resolves it before the order is created.

**Checked before an order is created:**

- The amount must be a positive number that meets the minimum (`invalid_amount`).
- The network: anything but `tron`, `bsc` and `base` fails with `unsupported_network_capability`.
- The paying address must be bound to the API key's B.AI account. The CLI asks B.AI each time; if the address is not bound yet, it signs B.AI's binding message with the paying account (after the master password is checked) and binds it. A binding that fails stops the command. A binding that succeeds stays in place even if a later step fails.
- The token must be one the network accepts (`invalid_value`), and the amount may have at most 6 decimal places (`invalid_amount`). `exact_gasfree` is refused outside TRON (`invalid_value`).
- With `--to`, B.AI must recognize the recipient; otherwise it fails with `provider_error`.
- The master password: without `--password-stdin` the command stops with `auth_required`.

Each of these fails with no order and no payment. The order is created only after all of them pass.

**Preview with `--dry-run`.** It runs the same checks (except the password), then reads the payment requirements without binding, creating an order, unlocking the wallet or signing. `bindingRequired` says whether a real recharge would first bind the paying address (with a warning when it would). It reports who pays whom, the price in smallest units, the payment route, and the payer's current balances. The fee is not known until payment, so `estimatedFee` is `null`. No password is needed.

**`exact_gasfree`** pays from the account's [GasFree](../gasfree/index.md) account instead of its own token balance, as with [`x402 pay`](../x402/pay.md): `--gasfree-relay` chooses where the GasFree account data comes from, and `--max-gasfree-fee` caps the fee you authorize. The balances in a `--dry-run` preview are those of the paying wallet, not its GasFree account.

**If reporting fails after payment**, the command does not fail. It returns `creditStatus: "unconfirmed"` with the transaction hash and `retryPayment: false` — the payment went through, so **do not recharge again**. Report the same transaction with [`bai report-recharge`](report-recharge.md). The CLI already retries the report a few times over about 90 seconds when B.AI cannot see the transaction yet.

If the payment itself fails, the error carries the payment details (`paymentStatus`, `retryPayment: false`, the transaction hash when one is known) plus `chain`, `amount`, and for `--to` the resolved `rechargeTarget`. See [x402 and B.AI payment details](../../machine-interface.md#x402-and-bai-payment-details).

Requires an account, the master password (via `--password-stdin`), and a stored B.AI API key.

## Arguments

- `amount` — amount in whole tokens, e.g. `10`

## Options

| Option | Description |
|---|---|
| `--token <symbol>` | Token to pay with (default: `USDC` on Base, `USDT` elsewhere) |
| `--to <email\|address>` | Recharge another B.AI account; omit to recharge your own |
| `--scheme <exact\|exact_gasfree>` | Payment scheme (default `exact`); `exact_gasfree` on TRON only |
| `--gasfree-relay <official\|gasfree\|url>` | GasFree account data source for `exact_gasfree` (default `official`); see [`x402 pay`](../x402/pay.md) |
| `--max-gasfree-fee <n>` | Highest GasFree fee to authorize, in whole tokens; excludes `--max-gasfree-fee-raw` |
| `--max-gasfree-fee-raw <n>` | The same cap in smallest units |
| `--dry-run` | Run the checks and preview the payment, without creating an order or paying |
| `--password-stdin` | Master password from stdin |

Plus the [global options](../index.md#global-options-every-command).

## Examples

Recharging takes two steps: preview, then pay.

**1. Preview the recharge.** `--dry-run` checks everything and shows what would be paid, without creating an order or signing anything:

```bash
wallet-cli bai recharge 1 --network tron --dry-run
```

```console
✅ B.AI recharge preview — no order or payment created
  dry Run: Yes
  binding Required: No
  network: tron:728126428
  token: USDT
  amount: 1
  payer: TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6
  pay To: TSNEPtuCagKEgF2EU4pAKWLzXLz1bekfTE
  scheme: exact
  raw Amount: 1000000
  recharge Target:
    type: self
    wallet Address: TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6
  payment:
    url: http://127.0.0.1:60758/pay
    status: 402
    delivered: No
    settled: No
    dry Run: Yes
    payment Required: Yes
    selected:
      scheme: exact
      network: tron:728126428
      amount: 1000000
      asset: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
      pay To: TSNEPtuCagKEgF2EU4pAKWLzXLz1bekfTE
      max Timeout Seconds: 300
      extra:
        asset Transfer Method: permit2
  balance:
    token Raw: 2500000
    native Raw: 7000006
  estimated Fee: Not available
  fee Limit:
    amount: Not available
    raw Amount: Not available
  warning: Preview only; final network/relay fee is unavailable until payment authorization. Balance refers to the payer wallet, not its GasFree account. No order or payment was created.
```

```bash
wallet-cli bai recharge 1 --network tron --dry-run -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"bai.recharge","data":{"dryRun":true,"bindingRequired":false,"network":"tron:728126428","token":"USDT","amount":"1","payer":"TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6","payTo":"TSNEPtuCagKEgF2EU4pAKWLzXLz1bekfTE","scheme":"exact","rawAmount":"1000000","rechargeTarget":{"type":"self","walletAddress":"TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6"},"payment":{"url":"http://127.0.0.1:60779/pay","status":402,"delivered":false,"settled":false,"dryRun":true,"paymentRequired":true,"selected":{"scheme":"exact","network":"tron:728126428","amount":"1000000","asset":"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t","payTo":"TSNEPtuCagKEgF2EU4pAKWLzXLz1bekfTE","maxTimeoutSeconds":300,"extra":{"assetTransferMethod":"permit2"}}},"balance":{"tokenRaw":"2500000","nativeRaw":"7000006"},"estimatedFee":null,"feeLimit":{},"warning":"Preview only; final network/relay fee is unavailable until payment authorization. Balance refers to the payer wallet, not its GasFree account. No order or payment was created."},"meta":{"durationMs":1851,"warnings":[]},"chain":{"family":"tron","network":"tron:728126428","chainId":"728126428"}}
```

`payer` pays 1 USDT (`rawAmount` `1000000`, 6 decimals) to `payTo`, B.AI's receiving address. `balance` is the payer's current balance in smallest units: `tokenRaw` for USDT, `nativeRaw` for TRX (in SUN).

**2. Recharge.** This spends real USDT. `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`:

```bash
printf '%s' "$PW" | wallet-cli bai recharge 1 --network tron --password-stdin
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
  network: tron:728126428
  token: USDT
  payer: TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6
```

```bash
printf '%s' "$PW" | wallet-cli bai recharge 1 --network tron --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"bai.recharge","data":{"chain":"tron","txHash":"3f7a9c2e1b8d4f60a5c3e7b9d1f2a4c6e8b0d3f5a7c9e1b2d4f6a8c0e2b4d6f8","amount":"1","retryPayment":false,"creditStatus":"credited","order":{"canDownloadInvoice":false,"chainKey":"tron","createdAt":1789569840,"currency":"USDT","id":31215,"paymentMethod":"TRON","points":1000000,"quantityDisplay":"1","rechargeType":"crypto","recipientDisplayLabel":null,"recipientRelation":"self","status":"success","teamId":null,"transactionId":"3f7a9c2e1b8d4f60a5c3e7b9d1f2a4c6e8b0d3f5a7c9e1b2d4f6a8c0e2b4d6f8","type":"purchase"},"network":"tron:728126428","token":"USDT","payer":"TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6"},"meta":{"durationMs":14385,"warnings":[]},"chain":{"family":"tron","network":"tron:728126428","chainId":"728126428"}}
```

`credited` (the heading `B.AI recharge credited`) means B.AI has added the credits — `order.points` is how many. `txHash` is the payment transaction and `payer` the address that paid.

## Output

| Field | Type | Meaning |
|---|---|---|
| `creditStatus` | string | `credited` — B.AI confirmed the credits; `unconfirmed` — paid, but not confirmed yet |
| `txHash` | string | The payment transaction |
| `chain` | string | `tron`, `bnb`, or `base` |
| `network` | string | Canonical network id |
| `token` | string | Token paid |
| `amount` | string | Amount paid, in whole tokens |
| `payer` | string | Paying address |
| `rechargeTarget` | object | With `--to`: the identifier you gave and the B.AI `targetId` it resolved to — keep it for `report-recharge` |
| `retryPayment` | boolean | Always `false` |
| `order` | object | With `credited`: the order as B.AI returns it |
| `code` / `warning` / `error` | string / string / object | With `unconfirmed`: why reporting did not confirm |

With `--dry-run`:

| Field | Type | Meaning |
|---|---|---|
| `dryRun` | boolean | `true` |
| `bindingRequired` | boolean | `true` when the paying address is not bound to the key's B.AI account yet, so a real recharge would sign and bind it first |
| `network` / `token` / `amount` | string | What would be paid |
| `payer` / `payTo` | string | Paying address, and B.AI's receiving address |
| `scheme` | string | `exact` or `exact_gasfree` |
| `rawAmount` | string | Amount in the token's smallest unit |
| `rechargeTarget` | object | Who gets the credits: `{type: "self", walletAddress}`, or the resolved `--to` recipient |
| `payment` | object | The payment route that would be used — the same fields as an [`x402 pay --dry-run`](../x402/pay.md#output) result |
| `balance` | object \| null | The payer's `tokenRaw` and `nativeRaw` balances in smallest units; `null` when they could not be read (with a warning) |
| `estimatedFee` | null | The fee is not known before payment |
| `feeLimit` | object | The `--max-gasfree-fee` / `--max-gasfree-fee-raw` given, if any |
| `warning` | string | Reminder that nothing was created or paid |

## Exit status

`0` paid (check `creditStatus`), or previewed with `--dry-run` · `1` execution failure (the payment errors of [`x402 pay`](../x402/pay.md#exit-status); `auth_required` — no `--password-stdin`, before any order is created; `provider_error` — including a `--to` recipient B.AI does not recognize, or a binding B.AI returns for a different address or chain; `bai_auth_failed` — B.AI rejected the stored key; `bai_rejected` — with `error.details.reason`) · `2` usage error (`bai_credentials_missing`; `unsupported_network_capability`; `invalid_value` — a token the network does not accept, or `exact_gasfree` outside TRON; `invalid_amount` — not a positive amount, below the minimum, or more than 6 decimal places; `invalid_option` — both GasFree fee caps, or `--wait` / `--wait-timeout`, which this command does not take).

## See also

[`bai report-recharge`](report-recharge.md) · [`bai recharge-orders`](recharge-orders.md) · [`config`](../config.md)
