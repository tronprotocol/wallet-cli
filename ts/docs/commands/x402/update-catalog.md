# wallet-cli x402 update-catalog

Download the x402 catalog to the local cache.

## Synopsis

```
wallet-cli x402 update-catalog [options]
```

## Description

Downloads the whole catalog, including every provider's details, and saves it to `~/.cache/wallet-cli/x402/catalog.json` (file mode 0600, directory 0700). [`x402 provider-list`](provider-list.md), [`provider-show`](provider-show.md) and [`endpoint-list`](endpoint-list.md) then answer from that file without contacting the catalog.

Those commands never refresh the file themselves, so run `update-catalog` again when you want the latest providers and prices.

The cache is replaced only when every download succeeds; a failed update — for example a `timeout` — leaves the previous cache in place. A catalog in a version this build cannot read fails with `catalog_schema_unsupported`. No wallet or password is needed.

## Options

No command-specific options; the [global options](../index.md#global-options-every-command) only.

## Examples

```bash
wallet-cli x402 update-catalog
```

```console
✅ Provider catalog updated
  Providers     5
  Cache         /home/you/.cache/wallet-cli/x402/catalog.json
  Generated at  2026-07-30T08:04:57Z
```

```bash
wallet-cli x402 update-catalog -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"x402.update-catalog","data":{"updated":true,"cache":"/home/you/.cache/wallet-cli/x402/catalog.json","providers":5,"generatedAt":"2026-07-30T08:04:57Z"},"meta":{"durationMs":2873,"warnings":[]}}
```

`Providers` is how many providers the catalog lists, and `Generated at` (JSON `generatedAt`) is when the catalog itself was last published.

## Output

| Field | Type | Meaning |
|---|---|---|
| `updated` | boolean | Whether the cache was replaced |
| `cache` | string | Absolute path of the cache file |
| `providers` | number | Providers in the downloaded catalog |
| `generatedAt` | string | When the catalog was generated |

Catalog warnings, when there are any, are in `meta.warnings`.

## Exit status

`0` success · `1` execution failure (`provider_error` — a download failed, or the cache file could not be written; `catalog_schema_unsupported`; `response_too_large`; `timeout`) · `2` usage error.

## See also

[`x402 provider-list`](provider-list.md) · [`x402 endpoint-list`](endpoint-list.md)
