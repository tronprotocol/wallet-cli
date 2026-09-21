# wallet-cli x402

Pay x402-protected HTTP endpoints and browse the x402 provider catalog.

An x402 endpoint answers an unpaid request with HTTP `402 Payment Required` and the payment routes it accepts: network, token, amount, and recipient. [`x402 pay`](pay.md) picks a matching route, signs a payment authorization with your account, and repeats the request with it. A facilitator service settles the payment on chain.

## Synopsis

```
wallet-cli x402 COMMAND
```

## Subcommands

| Command | Page | Description |
|---|---|---|
| `x402 pay` | [pay.md](pay.md) | Request an endpoint and pay its x402 challenge |
| `x402 serve` | [serve.md](serve.md) | Run a local x402-protected endpoint |
| `x402 roundtrip` | [roundtrip.md](roundtrip.md) | Start a local paywall, pay it once, and exit |
| `x402 provider-list` | [provider-list.md](provider-list.md) | List catalog providers |
| `x402 provider-show` | [provider-show.md](provider-show.md) | Show one provider |
| `x402 endpoint-list` | [endpoint-list.md](endpoint-list.md) | List one provider's endpoints and prices |
| `x402 update-catalog` | [update-catalog.md](update-catalog.md) | Download the catalog to the local cache |

## How it works

- **Routes follow `--network`.** `pay` only considers routes on the selected network, and a catalog service has a separate URL for each network — [`x402 endpoint-list`](endpoint-list.md) shows them. The catalog's services currently take payment on mainnets (`tron`, `bsc`, `base`); for trying things out on a testnet, run your own endpoint with [`x402 serve`](serve.md).
- **Limits come before signing.** `--max-amount` refuses an over-priced route, and a route that matches none of your filters is refused, both before anything is signed — the error says `paymentStatus: "not_sent"`.
- **The facilitator settles, so there is no `--wait`.** `pay` and `roundtrip` return once the facilitator has settled the payment; they do not take `--wait` / `--wait-timeout`.
- **Two schemes.** `exact` pays from the account's token balance; `exact_gasfree` pays from its [GasFree](../gasfree/index.md) account, with no fallback between them.
- **A failed payment may still have gone through.** Read `paymentStatus` and `retryPayment` in `error.details` before paying again — see [x402 and B.AI payment details](../../machine-interface.md#x402-and-bai-payment-details).
- **Catalog commands read the local cache first**, written by `update-catalog`, and download only what it lacks. They never refresh the cache themselves.

## See also

[`bai`](../bai/index.md) · [`gasfree`](../gasfree/index.md) · [`config`](../config.md)
