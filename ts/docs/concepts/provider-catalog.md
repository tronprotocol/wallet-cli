# Provider catalog queries and snapshots

`wallet-cli x402 provider-list`, `provider-show` and `provider-endpoints` read a valid local snapshot first, without contacting the catalog. If the snapshot or requested details are absent or invalid, the command queries the online catalog.

`wallet-cli x402 provider-update` explicitly refreshes the catalog and all provider details. The snapshot is replaced atomically only after every download succeeds. Failed refreshes preserve the previous snapshot. Its result includes the `cache` file path and upstream timestamp and warnings, when present. An unsupported catalog version returns `catalog_schema_unsupported`; a filesystem write failure returns `provider_error` without filesystem details.

Text output shows selected fields, a first-sentence summary and network aliases. Endpoint tables show exact prices or ranges; missing routes are shown as `——`, not a zero price. JSON retains complete provider data.

Catalog requests honor the CLI `--timeout` value and limit response bodies to 10 MiB, including responses without a Content-Length header. Facilitator requests use the same configured per-request timeout and a 1 MiB response limit. The timeout does not stop the lifetime of a running `x402 serve` process.
