# wallet-cli x402 serve

Run a local x402-protected endpoint.

## Synopsis

```
wallet-cli x402 serve --pay-to <address> [--amount <n> | --raw-amount <n>] [--token <symbol> | --asset <address> [--decimals <n>]]
                      [--scheme <exact|exact_gasfree>] [--valid-for-seconds <n>] [--resource-url <url>]
                      [--host <127.0.0.1|::1>] [--port <n>] [--facilitator-url <url>] [--daemon] [options]
```

## Description

Starts a small HTTP server on the loopback interface that sells one resource, `/pay`, on the selected network, paid to `--pay-to`. It prints the endpoint and its price once, then keeps running until you stop it with Ctrl-C. With `--daemon` it runs in the background instead: the command returns once the server is listening, with its process ID and the path of its log file, and you stop it with `kill <PID>`. It is meant for trying out [`x402 pay`](pay.md); [`x402 roundtrip`](roundtrip.md) starts the same server, pays it once, and exits.

What the server answers:

| Request | Response |
|---|---|
| `/pay` without payment (any method) | `402 Payment Required` with the payment requirements, in the body and in the `payment-required` header |
| `/pay` with a payment | The server has `--facilitator-url` verify and settle it. On success: `200` with `{"success":true,"network":…,"scheme":…,"transaction":…}` and a `payment-response` header. On failure: `400` or `502` with `code`, `error`, `phase` and `paymentStatus` |
| `GET /.well-known/x402` | `200` with the same payment requirements, for discovery |
| `/health` | `200` with `{"ok":true}` |
| anything else | `404` |

**The price** is `--amount` in whole tokens (default `0.0001`) or `--raw-amount` in the token's smallest unit. **The token** is `--token`, a symbol the address book knows on the selected network (default `USDT`; for example `USDC` on Base Sepolia), or `--asset`, a token contract address; a contract the address book does not know also needs `--decimals`. `--amount` may have no more decimals than the token. `exact_gasfree` is offered only on TRON.

`--resource-url` sets the resource URL advertised in the payment requirements (default: the `/pay` URL itself). The server binds only to `127.0.0.1` or `::1`. No wallet or password is needed.

**On TRON the facilitator is asked first.** Before listening, the server reads `--facilitator-url`'s `/supported` list and advertises the network the way the facilitator spells it for x402 v2 and the chosen scheme — the decimal id (`tron:3448148188`) when supported, otherwise the facilitator's hex form (such as `tron:0xcd8690dc`). If the list cannot be read or has no matching entry, the server does not start. [`x402 roundtrip`](roundtrip.md) and [`bai recharge`](../bai/recharge.md) run the same check.

**Access log.** Each request is logged with its status and duration — never its URL query, headers, body or payment signature. In the foreground the lines go to stderr, as `Payment required: HTTP 402 (1 ms)` in text mode or `{"event":"x402.request","method":"GET","route":"/pay","status":402,"durationMs":1}` in JSON mode; with `--daemon` they go to the log file.

## Options

| Option | Description |
|---|---|
| `--pay-to <address>` | **Required.** Recipient address on the selected network |
| `--amount <n>` | Price in whole tokens, no more decimals than the token (default `0.0001`); excludes `--raw-amount` |
| `--raw-amount <n>` | Price in the token's smallest unit |
| `--token <symbol>` | Payment token the address book knows on the network (default `USDT`); excludes `--asset` |
| `--asset <address>` | Payment token by contract address instead of symbol; a contract the address book does not know also needs `--decimals` |
| `--decimals <n>` | Decimals of the `--asset` token, 0–18; requires `--asset`, and must match a token the address book knows |
| `--scheme <exact\|exact_gasfree>` | Payment scheme offered (default `exact`); `exact_gasfree` on TRON only |
| `--valid-for-seconds <n>` | How long a payment authorization stays valid, 1–86400 (default `300`) |
| `--resource-url <url>` | Resource URL advertised in the payment requirements, `http://` or `https://` (default: the `/pay` URL) |
| `--host <127.0.0.1\|::1>` | Loopback address to bind (default `127.0.0.1`) |
| `--port <n>` | Port, 1–65535 (default `4020`) |
| `--facilitator-url <url>` | HTTPS facilitator that verifies and settles payments (default `https://facilitator.bankofai.io`) |
| `--daemon` | Run in the background and return its PID and log file |

Plus the [global options](../index.md#global-options-every-command).

## Examples

Sell a resource for 0.0001 USDT on Nile:

```bash
wallet-cli x402 serve --pay-to TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ --network nile
```

```console
✅ Payment endpoint ready (Ctrl+C to stop)
  URL      http://127.0.0.1:4020/pay
  Network  nile
  Scheme   exact
  Amount   0.0001 USDT
  Pay to   TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ
```

```bash
wallet-cli x402 serve --pay-to TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ --network nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"x402.serve","data":{"payUrl":"http://127.0.0.1:4020/pay","network":"tron:3448148188","scheme":"exact","token":"USDT","asset":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","decimals":6,"validForSeconds":300,"resourceUrl":"http://127.0.0.1:4020/pay","rawAmount":"100","payTo":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ"},"meta":{"durationMs":981,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

The same server in the background, for scripts that need the terminal back:

```bash
wallet-cli x402 serve --pay-to TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ --network nile --daemon
```

```console
✅ Payment endpoint running in background
  URL      http://127.0.0.1:4020/pay
  Network  nile
  Scheme   exact
  Amount   0.0001 USDT
  Pay to   TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ
  PID      15076
  Log      /var/folders/pz/jfbc2kzs54bfwtphmkj5zzlc0000gn/T/wallet-cli-x402-BRIQLn/access.log
```

```bash
wallet-cli x402 serve --pay-to TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ --network nile --daemon -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"x402.serve","data":{"payUrl":"http://127.0.0.1:4020/pay","network":"tron:3448148188","scheme":"exact","token":"USDT","asset":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","decimals":6,"validForSeconds":300,"resourceUrl":"http://127.0.0.1:4020/pay","rawAmount":"100","payTo":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","daemon":true,"pid":15598,"logFile":"/var/folders/pz/jfbc2kzs54bfwtphmkj5zzlc0000gn/T/wallet-cli-x402-dhxHjU/access.log"},"meta":{"durationMs":1282,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

Stop it with `kill 15076` (the `PID`). To check the price and pay it, see [`x402 pay`](pay.md).

## Output

Printed once at start-up:

| Field | Type | Meaning |
|---|---|---|
| `payUrl` | string | The paid endpoint |
| `network` | string | Network the price is on |
| `scheme` | string | Payment scheme offered |
| `token` | string | Payment token symbol; absent when the token was given with `--asset` |
| `asset` | string | Payment token contract |
| `decimals` | number | Decimals of the payment token |
| `validForSeconds` | number | How long a payment authorization stays valid |
| `resourceUrl` | string | Resource URL advertised in the payment requirements |
| `rawAmount` | string | Price in the token's smallest unit |
| `payTo` | string | Recipient |
| `daemon` / `pid` / `logFile` | boolean / number / string | With `--daemon`: `true`, the background process ID, and its log file |

## Exit status

`0` stopped with Ctrl-C, or with `--daemon` the server started · `1` execution failure (`port_in_use` — the port is taken; `provider_error` — the facilitator's `/supported` list could not be read, or with `--daemon` the background server failed to start, including when the port is taken, with its log file in `error.details.logFile`; `provider_rate_limited` — the facilitator answered 429; `invalid_x402_response` — its `/supported` list is malformed) · `2` usage error (`unsupported_network_capability` — on TRON, the facilitator does not support this network and scheme; `missing_option` — no `--pay-to`; `invalid_address` — `--pay-to` or `--asset` is not a valid address; `family_mismatch` — `--pay-to` belongs to the other chain family; `invalid_option` — `--amount` with `--raw-amount`, `--token` with `--asset`, `--decimals` without `--asset`, or `--decimals` that differs from a known token's; `invalid_amount` — the price is not positive or has more decimals than the token; `invalid_value` — the token is not registered on the network and no `--asset` with `--decimals` was given, `exact_gasfree` on an EVM network, `--facilitator-url` is not HTTPS, `--resource-url` is not HTTP(S), `--host` is not a loopback address, `--port` is outside 1–65535, or `--valid-for-seconds` is outside 1–86400).

## See also

[`x402 pay`](pay.md) · [`x402 roundtrip`](roundtrip.md)
