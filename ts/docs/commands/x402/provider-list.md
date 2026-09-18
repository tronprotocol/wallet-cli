# wallet-cli x402 provider-list

List providers in the x402 catalog.

## Synopsis

```
wallet-cli x402 provider-list [--network <id>] [--category <c>] [--capability <c>]
                              [--include-blocked] [--limit <n>] [--offset <n>] [options]
```

## Description

Lists the providers of the x402 catalog (`https://x402-catalog.bankofai.io/api/catalog.json`) — paid APIs you can call with [`x402 pay`](pay.md). Each is named by its `fqn`, which [`x402 provider-show`](provider-show.md) and [`x402 endpoint-list`](endpoint-list.md) take.

It reads the local cache written by [`x402 update-catalog`](update-catalog.md) when that is valid, and downloads from the catalog only when the cache is missing or does not have what was asked for. It never writes the cache.

Filters:

- `--network` takes a network id or alias, as everywhere else, and keeps the providers that take payment on that chain — currently the mainnets `tron:728126428`, `eip155:56` and `eip155:8453`. A network where no provider takes payment, such as the Nile testnet (`tron:3448148188`), returns an empty list; an unknown network fails with `unsupported_network`.
- `--category` takes a category id, currently `finance`.
- `--capability` matches the providers' `featuredTags`, such as `security` or `defi`.

A `--category` or `--capability` value the catalog does not use fails with `invalid_value` and lists the accepted values in `error.details.matches`.

No wallet or password is needed.

## Options

| Option | Description |
|---|---|
| `--network <id>` | Only providers with a payment route on this chain (network id or alias) |
| `--category <c>` | Only this category, e.g. `finance` |
| `--capability <c>` | Only providers with this tag in `featuredTags` |
| `--include-blocked` | Include providers marked as blocked |
| `--limit <n>` | Maximum rows, 1–200 (default `20`) |
| `--offset <n>` | Rows to skip (default `0`) |

Plus the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli x402 provider-list
```

```console
| Provider             | Title       | Type | Category | Endpoints | Networks        | Tags                                                      |
| -------------------- | ----------- | ---- | -------- | --------- | --------------- | --------------------------------------------------------- |
| sunpump-token-launch | SunPump     |      | finance  | 1         | tron, bsc, base | sunpump, token-launch, agent-token, tron, bsc, base       |
| defillama            | DefiLlama   |      | finance  | 9         | tron, bsc, base | defillama, defi, tvl, paid                                |
| dexscreener          | DexScreener |      | finance  | 3         | tron, bsc, base | dexscreener, dex, new-pairs, meme, liquidity, price, paid |
| dia                  | DIA         |      | finance  | 2         | tron, bsc, base | dia, price, oracle, quotation, multi-source, paid         |
| goplus               | GoPlus      |      | finance  | 3         | tron, bsc, base | goplus, security, honeypot, risk, token-security, paid    |
```

`Provider` is the name to pass to [`x402 endpoint-list`](endpoint-list.md). `Networks` are the chains that take payment, and `Tags` are the values `--capability` matches. `Type` stays empty because the catalog does not publish provider types.

Only providers tagged `security` — here GoPlus, which checks tokens and addresses for risks:

```bash
wallet-cli x402 provider-list --capability security
```

```console
| Provider | Title  | Type | Category | Endpoints | Networks        | Tags                                                   |
| -------- | ------ | ---- | -------- | --------- | --------------- | ------------------------------------------------------ |
| goplus   | GoPlus |      | finance  | 3         | tron, bsc, base | goplus, security, honeypot, risk, token-security, paid |
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `catalog` | string | Catalog URL |
| `generatedAt` | string | When the catalog was generated |
| `count` | number | Providers returned on this page |
| `filters` | object | The filters applied |
| `results[]` | array | Provider records as the catalog publishes them — among others `fqn`, `title`, `category`, `chains`, `endpointCount`, `minPriceUsd` / `maxPriceUsd`, `serviceUrl`, `featuredTags`. The endpoint list itself is left out; use [`x402 endpoint-list`](endpoint-list.md) |

`meta.pagination` carries `offset`, `limit`, and `total` (all matching providers). Text output shows only the table.

## Exit status

`0` success · `1` execution failure (`provider_error` — catalog unreachable or invalid; `catalog_schema_unsupported`; `response_too_large`; `timeout`) · `2` usage error (`unsupported_network` — an unknown `--network`; `invalid_value` — a `--category` / `--capability` value the catalog does not use, or `--limit` out of range).

## See also

[`x402 provider-show`](provider-show.md) · [`x402 endpoint-list`](endpoint-list.md) · [`x402 update-catalog`](update-catalog.md)
