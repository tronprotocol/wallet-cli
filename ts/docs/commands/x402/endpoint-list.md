# wallet-cli x402 endpoint-list

List one provider's endpoints and prices.

## Synopsis

```
wallet-cli x402 endpoint-list <provider> [options]
```

## Description

Lists the paid endpoints of one catalog provider, with each endpoint's price and the networks it accepts payment on. In the table, a price range shows as `min–max`, and a missing value as `——` rather than a zero price.

The table does not show URLs. **Each network has its own URL to pay** — find it in JSON under `x402Routes[].url`, fill in the `{placeholders}` in the path, and pass it to [`x402 pay`](pay.md) with the matching `--network`. The endpoint's top-level `url` is just one of them.

Like [`x402 provider-list`](provider-list.md), it reads the local cache first and downloads only what the cache lacks. No wallet or password is needed.

## Arguments

- `provider` — the provider's `fqn`, as listed by [`x402 provider-list`](provider-list.md)

## Options

No command-specific options; the [global options](../index.md#global-options-every-command) only.

## Examples

```bash
wallet-cli x402 endpoint-list dia
```

```console
| Method | Path                                      | Price (USD) | Networks        | Description                                                 |
| ------ | ----------------------------------------- | ----------- | --------------- | ----------------------------------------------------------- |
| GET    | /v1/quotation/{symbol}                    | 0.000001    | tron, bsc, base | Aggregated price quotation by asset symbol                  |
| GET    | /v1/assetQuotation/{blockchain}/{address} | 0.000001    | tron, bsc, base | Aggregated price quotation by blockchain + contract address |
```

The table has no URLs: each network's payment URL is in JSON, under `x402Routes[].url`. For DIA's first endpoint on TRON it is `https://x402-gateway.bankofai.io/providers/dia-price-tron/v1/quotation/{symbol}` — replace `{symbol}` with `BTC` and pay it with `--network tron`, as in the [`x402 pay`](pay.md#examples) examples.

## Output

| Field | Type | Meaning |
|---|---|---|
| `fqn` | string | Provider name |
| `endpoints[]` | array | One record per endpoint, as the catalog publishes it |

Main fields of an endpoint:

| Field | Type | Meaning |
|---|---|---|
| `method` / `path` | string | HTTP method and path |
| `url` | string | URL of one of its routes (the first network's); use `x402Routes[].url` for the network you pay on |
| `title` / `description` | string | What it returns |
| `minPriceUsd` / `maxPriceUsd` | number | Price per call, in USD |
| `metered` | boolean | Whether usage is metered |
| `x402Routes[]` | array | One entry per way to pay: `network`, `scheme` (`exact` / `exact_gasfree`), `assetTransferMethod` (e.g. `permit2`, `eip3009`; absent for `exact_gasfree`), `provider`, and the `url` to pay on that network |

## Exit status

`0` success · `1` execution failure (`provider_not_found` — no provider by that name; `provider_error`; `catalog_schema_unsupported`; `timeout`) · `2` usage error (`missing_option` — no provider given; `invalid_value` — a name with characters a provider name cannot contain).

## See also

[`x402 provider-show`](provider-show.md) · [`x402 pay`](pay.md)
