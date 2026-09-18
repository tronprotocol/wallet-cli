# wallet-cli x402 pay

Request an HTTP endpoint and pay its x402 challenge.

## Synopsis

```
wallet-cli x402 pay <url> [--method <m>] [--header "Name: value"]... [--body <s> | --body-file <path>]
                          [--max-amount <n> | --max-raw-amount <n>] [--token <symbol>] [--asset <address> [--decimals <n>]]
                          [--scheme <exact|exact_gasfree>] [--gasfree-relay <official|gasfree|url>]
                          [--max-gasfree-fee <n> | --max-gasfree-fee-raw <n>]
                          [--out <path>] [--dry-run] [--password-stdin] [options]
```

## Description

Sends the request. If the endpoint answers with a successful status (2xx), that response is returned as-is and nothing is paid; any other status except `402` fails with `provider_error`, carrying `httpStatus` and `phase: "request"`. If it answers `402 Payment Required`, `pay` reads the payment routes it offers, picks one that matches the selected `--network` and your filters, signs a payment authorization with the active account (or `--account`), and sends the request again with it. The endpoint's facilitator settles the payment on chain.

**Nothing is signed until a route matches.** Routes on other networks are ignored; `--token`, `--asset` and `--scheme` narrow the choice further, and `--max-amount` (whole tokens) or `--max-raw-amount` (smallest units) rules out a route priced above it. If no route matches, the command fails with `no_matching_requirement`; if the matching route is priced over the limit, with `amount_exceeds_limit`. Both are raised before signing, with `paymentStatus: "not_sent"`, and no password is asked for — with or without `--dry-run`.

**Two payment schemes:**

- `exact` — pays from the account's own token balance.
- `exact_gasfree` — pays from the account's GasFree account (TRON). The GasFree balance must cover the price **plus** the maximum service fee, or it fails with `gasfree_insufficient_balance` before anything is sent; there is no fallback to the ordinary balance. `--gasfree-relay` chooses where the GasFree account data comes from: `official` (default, no credentials), `gasfree` (the GasFree Open API, which needs `gasfreeApiKey` / `gasfreeApiSecret` from [`config`](../config.md)), or an HTTPS URL of your own. `--max-gasfree-fee` caps the fee you authorize.

`--dry-run` stops after reading the challenge: it reports the route that would be paid, without signing.

While it runs, `pay` prints progress lines starting with `⏳` on stderr (in JSON mode, `{"type":"activity",...}` lines); stdout carries only the result.

The response body is returned in `data.response` — parsed when the endpoint says it is JSON — or written to a new file with `--out`. Responses are limited to 10 MB.

**When a payment fails, read `error.details` before trying again.** `paymentStatus: "not_sent"` means nothing left the account; `"unknown"` means the CLI cannot tell, so treat it as possibly paid and reconcile first; `retryPayment: false` means do not pay again to recover. See [x402 and B.AI payment details](../../machine-interface.md#x402-and-bai-payment-details).

Requires an account, even for an endpoint that turns out to be free. The master password (via `--password-stdin`) is needed only when a payment is signed.

## Arguments

- `url` — the endpoint URL

## Options

| Option | Description |
|---|---|
| `--method <GET\|POST\|PUT\|PATCH\|DELETE>` | HTTP method (default `GET`) |
| `--header <"Name: value">` | Request header in `Name: value` form; repeat for more |
| `--body <string>` | Request body; excludes `--body-file` |
| `--body-file <path>` | Read the request body from a file, or from stdin with `-`; excludes `--body` |
| `--max-amount <n>` | Refuse a route priced above this, in whole tokens; excludes `--max-raw-amount` |
| `--max-raw-amount <n>` | The same limit in smallest units |
| `--token <symbol>` | Accept only routes paying in this token |
| `--asset <address>` | Accept only routes paying in this token contract |
| `--decimals <n>` | Decimals of the `--asset` token; requires `--asset` |
| `--scheme <exact\|exact_gasfree>` | Accept only routes using this scheme |
| `--gasfree-relay <official\|gasfree\|url>` | Source of GasFree account data for `exact_gasfree` (default `official`); a URL must be HTTPS with no credentials, query, or fragment |
| `--max-gasfree-fee <n>` | Highest GasFree fee to authorize, in whole tokens; excludes `--max-gasfree-fee-raw` |
| `--max-gasfree-fee-raw <n>` | The same cap in smallest units |
| `--out <path>` | Write the response body to a new file instead of `data.response`; an existing file is never overwritten |
| `--dry-run` | Read the challenge and report the selected route, without signing |
| `--password-stdin` | Master password from stdin |

Plus the [global options](../index.md#global-options-every-command). `--timeout` limits each HTTP request.

## Examples

Paying an x402 endpoint takes two steps: see what it charges, then pay. The examples use DIA's BTC price quotation from the x402 catalog (see [`x402 endpoint-list`](endpoint-list.md)), which takes payment on TRON mainnet.

**1. See what the endpoint charges.** `--dry-run` reads the price without signing anything, so nothing is paid:

```bash
wallet-cli x402 pay https://x402-gateway.bankofai.io/providers/dia-price-tron/v1/quotation/BTC --network tron --dry-run
```

```console
Payment preview — no payment sent
URL        https://x402-gateway.bankofai.io/providers/dia-price-tron/v1/quotation/BTC
Status     402
Settled    No
Delivered  No
Payment requirements:
  scheme: exact
  network: tron:728126428
  amount: 1
  asset: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
  pay To: TLXPgJVJFgL97gc49j8w8kC22mDTpH9EGa
  max Timeout Seconds: 300
  extra:
    asset Transfer Method: permit2
```

```bash
wallet-cli x402 pay https://x402-gateway.bankofai.io/providers/dia-price-tron/v1/quotation/BTC --network tron --dry-run -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"x402.pay","data":{"url":"https://x402-gateway.bankofai.io/providers/dia-price-tron/v1/quotation/BTC","status":402,"delivered":false,"settled":false,"dryRun":true,"paymentRequired":true,"selected":{"scheme":"exact","network":"tron:728126428","amount":"1","asset":"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t","payTo":"TLXPgJVJFgL97gc49j8w8kC22mDTpH9EGa","maxTimeoutSeconds":300,"extra":{"assetTransferMethod":"permit2"}}},"meta":{"durationMs":900,"warnings":[]},"chain":{"family":"tron","network":"tron:728126428","chainId":"728126428"}}
```

`status: 402` means the endpoint wants payment. `selected` (text: `Payment requirements`) is the route that would be paid: `amount` is in the token's smallest unit, so `"1"` is 0.000001 USDT (6 decimals); `asset` is the USDT contract on TRON mainnet; `payTo` is who receives it.

**2. Pay.** This spends real USDT on mainnet. `--max-amount 0.001` refuses any price above 0.001 USDT, and `--out` saves the response to `btc-quote.json`. `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`:

```bash
printf '%s' "$PW" | wallet-cli x402 pay https://x402-gateway.bankofai.io/providers/dia-price-tron/v1/quotation/BTC --network tron --max-amount 0.001 --out btc-quote.json --password-stdin
```

```console
URL          https://x402-gateway.bankofai.io/providers/dia-price-tron/v1/quotation/BTC
Status       200
Settled      Yes
Delivered    Yes
From         TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6
Transaction  9b41c7e2d05f83a6e1c4b8d27f9a03e5c6d8b1f4a2e7c9d0b3f5a8e1c6d2b7f4
Output       btc-quote.json
```

```bash
printf '%s' "$PW" | wallet-cli x402 pay https://x402-gateway.bankofai.io/providers/dia-price-tron/v1/quotation/BTC --network tron --max-amount 0.001 --out btc-quote.json --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"x402.pay","data":{"url":"https://x402-gateway.bankofai.io/providers/dia-price-tron/v1/quotation/BTC","status":200,"delivered":true,"settled":true,"payer":{"address":"TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6"},"paymentResponse":{"success":true,"transaction":"9b41c7e2d05f83a6e1c4b8d27f9a03e5c6d8b1f4a2e7c9d0b3f5a8e1c6d2b7f4","network":"tron:0x2b6653dc","payer":"0xe2e1a54926527fbb4e4420de4c6bab82beaee24d"},"output":{"path":"btc-quote.json","bytes":214}},"meta":{"durationMs":6412,"warnings":[]},"chain":{"family":"tron","network":"tron:728126428","chainId":"728126428"}}
```

`Settled Yes` means the payment went through on chain; `Delivered Yes` means the paid response arrived and was written to `btc-quote.json`. `From` is the paying account and `Transaction` the payment's transaction ID (JSON: `data.payer.address` and `data.paymentResponse.transaction`). The facilitator submits the payment transaction and pays its energy, so the account spends only the quoted price.

## Output

| Field | Type | Meaning |
|---|---|---|
| `url` | string | The requested URL |
| `status` | number | HTTP status of the final response |
| `delivered` | boolean | Whether the final response was successful (2xx) |
| `settled` | boolean | Whether a valid settlement receipt for the selected network came back |
| `payer` | object | `{address}` of the paying account; present when a payment was signed |
| `paymentResponse` | object | The facilitator's settlement receipt, when the endpoint sent one: `success`, `transaction` (the payment's transaction ID), `network`, and `payer` — both as the facilitator writes them, e.g. `tron:0xcd8690dc` and a hex address |
| `response` | any | The response body — parsed JSON, or text; absent with `--out` |
| `output` | object | With `--out`: `{path, bytes}` written |
| `dryRun` / `paymentRequired` / `selected` | — | With `--dry-run` on a `402`: `true`, `true`, and the route that would be paid (`scheme`, `network`, `amount` in smallest units, `asset`, `payTo`, `maxTimeoutSeconds`, `extra`) |

## Exit status

`0` success, including a free response · `1` execution failure (`no_matching_requirement`, `amount_exceeds_limit` — both before signing, `paymentStatus: "not_sent"`; `gasfree_insufficient_balance` / `gasfree_not_activated`, `permit2_allowance_required` / `approval_reset_required`, `fee_cap_exceeded`, `payer_mismatch`, `invalid_settlement`, `invalid_x402_response`, `response_too_large`, `provider_rate_limited` — HTTP 429; `provider_error` — any other failed request or payment, with `error.details.phase` and `httpStatus`; `missing_wallet_address`; `auth_required` — a payment needs signing and no `--password-stdin` was given; `auth_failed`, `timeout`) · `2` usage error (`output_exists` — the `--out` file exists; `gasfree_credentials_missing`; `invalid_option` — two exclusive options, `--decimals` without `--asset`, or `--wait` / `--wait-timeout`, which this command does not take because the facilitator settles the payment; `invalid_amount` — a limit that is not a positive amount; `invalid_value` — e.g. a malformed `--header`, an unsupported `--method`, or a `--gasfree-relay` URL that is not HTTPS).

## See also

[`x402 serve`](serve.md) · [`x402 roundtrip`](roundtrip.md) · [`x402 endpoint-list`](endpoint-list.md) · [`gasfree info`](../gasfree/info.md)
