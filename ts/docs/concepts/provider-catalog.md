# Provider catalog queries and snapshots

`wallet-cli x402 provider-list`, `provider-show` and `provider-endpoints` query the online catalog. They do not read the local snapshot or silently fall back to stale data.

`wallet-cli x402 provider-update` downloads a catalog snapshot for inspection or external tooling. Its result includes the `cache` file path. Updating this snapshot does not change subsequent online queries. Offline catalog lookup is not currently implemented.

Catalog requests honor the CLI `--timeout` value and limit response bodies to 10 MiB, including responses without a Content-Length header. Facilitator requests use the same configured per-request timeout and a 1 MiB response limit. The timeout does not stop the lifetime of a running `x402 serve` process.
