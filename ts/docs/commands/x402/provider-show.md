# wallet-cli x402 provider-show

Show one provider from the x402 catalog.

## Synopsis

```
wallet-cli x402 provider-show <provider> [options]
```

## Description

Shows one provider's catalog record. Text output shows its name, website, number of endpoints, summary, category, and payment networks; JSON returns the full record, including every endpoint. Like [`x402 provider-list`](provider-list.md), it reads the local cache first and downloads only what the cache lacks.

No wallet or password is needed.

## Arguments

- `provider` — the provider's `fqn`, as listed by [`x402 provider-list`](provider-list.md)

## Options

No command-specific options; the [global options](../index.md#global-options-every-command) only.

## Examples

```bash
wallet-cli x402 provider-show dia
```

```console
Provider   dia
Name       DIA
Service    https://www.diadata.org
Endpoints  2
Summary    What it does  DIA oracle price feeds over x402: transparent,
           multi-source aggregated token quotations across 80+ CEX/DEX markets
           for 3,000+ assets, through one provider with TRON, BSC and Base
           Mainnet payment routes.
Category   finance
Networks   tron, bsc, base
```

`Endpoints` is how many paid APIs the provider offers — list them, with their URLs and prices, with [`x402 endpoint-list`](endpoint-list.md). `Networks` are the chains it takes payment on. JSON output returns the provider's full catalog record, including every endpoint.

## Output

The provider record as the catalog publishes it. Main fields:

| Field | Type | Meaning |
|---|---|---|
| `fqn` | string | Provider name |
| `title` / `subtitle` / `description` | string | Display name and descriptions |
| `serviceUrl` | string | The provider's website |
| `category` | string | Category id |
| `chains` | string[] | CAIP-2 ids of the chains it accepts payment on |
| `endpointCount` / `endpoints` | number / array | Its endpoints — see [`x402 endpoint-list`](endpoint-list.md#output) |
| `minPriceUsd` / `maxPriceUsd` | number | Price range per call, in USD |
| `status` | object | Catalog, gateway, payment and upstream status |

## Exit status

`0` success · `1` execution failure (`provider_not_found` — no provider by that name; `provider_error`; `catalog_schema_unsupported`; `timeout`) · `2` usage error (`missing_option` — no provider given; `invalid_value` — a name with characters a provider name cannot contain, such as a space or `..`).

## See also

[`x402 provider-list`](provider-list.md) · [`x402 endpoint-list`](endpoint-list.md)
