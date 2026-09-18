# wallet-cli x402 roundtrip

Start a local paywall, pay it once, and exit.

## Synopsis

```
wallet-cli x402 roundtrip --pay-to <address> [--amount <n> | --raw-amount <n>] [--token <symbol> | --asset <address> [--decimals <n>]]
                          [--scheme <exact|exact_gasfree>] [--valid-for-seconds <n>] [--port <n>] [--facilitator-url <url>]
                          [--gasfree-relay <official|gasfree|url>] [--max-gasfree-fee <n> | --max-gasfree-fee-raw <n>]
                          [--password-stdin] [options]
```

## Description

Runs [`x402 serve`](serve.md) and [`x402 pay`](pay.md) in one step: it starts the same local endpoint, pays it once from the active account (or `--account`), and shuts the server down. Use it to check the whole x402 flow — payment requirements, signature, facilitator settlement — end to end.

**This is a real payment** of the price to `--pay-to`, and `pay` only accepts the route the server was started with, so nothing else can be paid.

The server always binds to `127.0.0.1`. The same validation as `x402 serve` applies to the price, token, scheme, port and facilitator options. Requires an account and the master password (via `--password-stdin`).

## Options

| Option | Description |
|---|---|
| `--pay-to <address>` | **Required.** Recipient address on the selected network |
| `--amount <n>` | Price in whole tokens, no more decimals than the token (default `0.0001`); excludes `--raw-amount` |
| `--raw-amount <n>` | Price in the token's smallest unit |
| `--token <symbol>` | Payment token the address book knows on the network (default `USDT`); excludes `--asset` |
| `--asset <address>` | Payment token by contract address instead of symbol; a contract the address book does not know also needs `--decimals` |
| `--decimals <n>` | Decimals of the `--asset` token, 0–18; requires `--asset` |
| `--scheme <exact\|exact_gasfree>` | Payment scheme (default `exact`); `exact_gasfree` on TRON only |
| `--valid-for-seconds <n>` | How long a payment authorization stays valid, 1–86400 (default `300`) |
| `--port <n>` | Port, 1–65535 (default `4020`) |
| `--facilitator-url <url>` | HTTPS facilitator (default `https://facilitator.bankofai.io`) |
| `--gasfree-relay <official\|gasfree\|url>` | GasFree account data source for `exact_gasfree`; see [`x402 pay`](pay.md) |
| `--max-gasfree-fee <n>` / `--max-gasfree-fee-raw <n>` | Cap on the GasFree fee; mutually exclusive |
| `--password-stdin` | Master password from stdin |

Plus the [global options](../index.md#global-options-every-command).

## Examples

Pay 0.0001 USDT on Nile to `TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ` through a local paywall. `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`:

```bash
printf '%s' "$PW" | wallet-cli x402 roundtrip --pay-to TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ --network nile --password-stdin
```

```console
✅ Payment settled
  Network      nile
  Scheme       exact
  Amount       0.0001 USDT
  From         TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6
  To           TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ
  Transaction  d6e0bb3015dce28ac9813f4d90be442d0f1ef61a6d4268cb023c5e8cfc09ef36
  Delivery     Delivered
```

```bash
printf '%s' "$PW" | wallet-cli x402 roundtrip --pay-to TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ --network nile --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"x402.roundtrip","data":{"serve":{"payUrl":"http://127.0.0.1:4020/pay","network":"tron:3448148188","scheme":"exact","token":"USDT","asset":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","decimals":6,"validForSeconds":300,"resourceUrl":"http://127.0.0.1:4020/pay","rawAmount":"100","payTo":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ"},"pay":{"url":"http://127.0.0.1:4020/pay","status":200,"delivered":true,"settled":true,"payer":{"address":"TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6"},"paymentResponse":{"success":true,"transaction":"1ca932a4cda16fe9485689d6b7daa38ca34c601bbd970f609fb1c5a56b375438","network":"tron:0xcd8690dc","payer":"0xe2e1a54926527fbb4e4420de4c6bab82beaee24d"},"response":{"success":true,"network":"tron:3448148188","scheme":"exact","transaction":"1ca932a4cda16fe9485689d6b7daa38ca34c601bbd970f609fb1c5a56b375438"}}},"meta":{"durationMs":7594,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

`Payment settled` with `Delivery Delivered` means the payment went through on chain and the paywall returned its response. `From` is the paying account and `Transaction` the payment's transaction ID. In JSON, `serve` is what the paywall charged (`rawAmount` in the token's smallest unit), and `pay` is the payment result: `paymentResponse` is the facilitator's receipt, whose `payer` is your address in hex form, and `response` is what the paywall returned after payment.

## Output

| Field | Type | Meaning |
|---|---|---|
| `serve` | object | What the server offered — the same fields as [`x402 serve`](serve.md#output) |
| `pay` | object | The payment result — the same fields as [`x402 pay`](pay.md#output) |

## Exit status

`0` paid · `1` execution failure (the payment errors of [`x402 pay`](pay.md#exit-status); `auth_required` — no `--password-stdin`; `missing_wallet_address`; `port_in_use`) · `2` usage error (the usage errors of [`x402 serve`](serve.md#exit-status); `invalid_option` — two exclusive options (`--amount` / `--raw-amount`, `--token` / `--asset`, both GasFree fee caps), `--decimals` without `--asset`, or `--wait` / `--wait-timeout`, which this command does not take; `gasfree_credentials_missing`).

## See also

[`x402 serve`](serve.md) · [`x402 pay`](pay.md)
