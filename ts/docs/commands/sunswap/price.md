# wallet-cli sunswap price

Show the USD price of one or more tokens.

## Synopsis

```
wallet-cli sunswap price [<token>] [options]
```

## Description

Prices come from the SunSwap market data service. Give either a token **symbol** as the positional argument or a comma-separated list of **contract addresses** with `--address` — one or the other, never both.

A symbol is resolved locally, not by the service: `TRX` and `WTRX` are built in, and anything else is looked up in the **official** token address book for the network. The user layer of that book is per-account and this command takes no account, so a symbol added with [`token add`](../token/add.md) does **not** resolve here; pass its address instead.

A price of `0` is a real answer. The service returns it for any address it has not indexed — an unlisted token, an impersonation, or a plain wallet address — so zero means "not indexed", not "worthless".

The text `Symbol` column is filled from the SunSwap catalogue and is **display only**: a symbol is what a contract calls itself, and an impersonation of USDT is listed as `USDT` too. JSON deliberately omits it, so a caller keys on the address. If the catalogue lookup fails the column shows `—`, a note is added to `meta.warnings`, and the command still exits 0 with the prices intact.

## Options

| Option | Description |
|---|---|
| `--address <addresses>` | Comma-separated token contract addresses; mutually exclusive with the token argument |

Plus the [global options](../index.md#global-options-every-command). No `--account`: this command reads no wallet, and the flag is rejected with `invalid_option`.

## Examples

```bash
wallet-cli sunswap price TRX --network tron
```

```console
| Symbol | Address                            | Price (USD) | Quoted at (UTC)  |
| ------ | ---------------------------------- | ----------- | ---------------- |
| TRX    | T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb | $0.3428     | 2026-09-23 11:49 |
```

```bash
wallet-cli sunswap price --address T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb,TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7,TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4 --network tron
```

```console
| Symbol | Address                            | Price (USD)   | Quoted at (UTC)  |
| ------ | ---------------------------------- | ------------- | ---------------- |
| WIN    | TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7 | $0.00003980   | 2026-09-23 11:49 |
| TRX    | T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb | $0.3428       | 2026-09-23 11:49 |
| BTT    | TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4 | $0.0000003830 | 2026-09-23 11:49 |
```

A price at or above a cent shows four decimals; below a cent it switches to four significant digits, truncated, so a sub-cent token does not collapse to `$0.0000`.

```bash
wallet-cli sunswap price TRX --network tron -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"sunswap.price","data":{"prices":[{"address":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","priceUsd":"0.342756916444","quotedAt":"2026-09-23 11:50"}]},"meta":{"durationMs":540,"warnings":[]},"chain":{"family":"tron","network":"tron:728126428","chainId":"728126428"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `prices[].address` | string | The token contract address, as the service keyed it |
| `prices[].priceUsd` | string | USD price, the service's exact digits; `"0"` means "not indexed" |
| `prices[].quotedAt` | string | UTC minute the service answered. **Not** a freshness claim about the price |

Rows come back in the service's order, which need not match the order given; match on `address`. Duplicate addresses are deduplicated before the request, so there may be fewer rows than addresses.

## Exit status

`0` success · `1` execution failure (`provider_error`, `provider_rate_limited` — with `details.retryAfterSeconds` when the service sent a usable `Retry-After`, `timeout`) · `2` usage error (`missing_option` — neither the token argument nor `--address`; `invalid_option` — both; `unsupported_token` — the symbol does not resolve on this network; `invalid_address`; `unsupported_network_capability`).

## See also

[`sunswap token-list`](token-list.md) · [`token list`](../token/list.md) · [`sunswap` group](index.md)
