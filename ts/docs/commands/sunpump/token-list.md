# wallet-cli sunpump token-list

List tokens on the SunPump launchpad, ranked, or filtered to one creator.

## Synopsis

```
wallet-cli sunpump token-list [--order-by <field>] [--sort <asc|desc>]
                              [--owner <address> | --contract <address>]
                              [--limit <n>] [--offset <n>]
```

## Description

Ranks the launchpad's tokens by one of four fields, or lists one creator's tokens with `--owner`. To find tokens by symbol or name, use [`sunpump token-search`](token-search.md).

**`Status` is the indexer's own**, not the contract's: `CREATED` means still on the bonding curve, `LAUNCHED` means liquidity has moved to a SunSwap pool. It is not evidence that a trade will succeed — [`sunpump buy`](buy.md) and [`sunpump sell`](sell.md) read the curve contract for that.

**There is no result total.** The service reports `0` for every total, including on pages that returned tokens, so `meta.pagination.total` is `null` rather than a number that would read as "no results". The only end-of-results signal is a page shorter than `--limit`.

**`--owner` has a fixed order.** The by-creator listing is always newest first and ignores any requested order, so `--order-by` and `--sort` are refused alongside `--owner` rather than silently dropped — unless they name that fixed order (`--order-by created`, `--sort desc`), which is accepted. Newest first is this command's default anyway, so `--owner` on its own loses nothing.

**Only orderings that work are offered.** The service accepts any sort field and silently falls back to its own order for one it does not honour, so `--order-by` is limited to the four fields verified to order the results: `created`, `market-cap`, `volume-24h` and `price-change-24h`.

**Symbols and names are not unique.** Key on `Address`.

## Options

| Option | Default | Description |
|---|---|---|
| `--order-by <field>` | `created` | `created`, `market-cap`, `volume-24h` or `price-change-24h`. Not with `--owner` |
| `--sort <asc\|desc>` | `desc` | Sort direction. Not with `--owner` |
| `--owner <address>` | — | Only tokens created by this address (exact) |
| `--contract <address>` | — | Only the token at this contract address (exact) |
| `--limit <n>` | `20` | Maximum rows; at most `50` |
| `--offset <n>` | `0` | Rows to skip; must be a multiple of `--limit` |

Plus the [global options](../index.md#global-options-every-command). No `--account`: it is rejected with `invalid_option`.

## Examples

```bash
wallet-cli sunpump token-list --order-by market-cap --limit 3 --network tron
```

```console
Tokens (limit 3, offset 0)
| Symbol   | Name     | Address                            | Status   | Price (TRX) | Market cap (USD) | 24h change |
| -------- | -------- | ---------------------------------- | -------- | ----------- | ---------------- | ---------- |
| 波场人生 | 波场人生 | TNkakCYwNtggwz8WbWhskvonCXNMQ5mqbc | LAUNCHED | 0.063102    | $21,167,050.64   | 1.48%      |
| PUSS     | PUSS     | TX5eXdf8458bZ77fk8xdvUgiQmC3L93iv7 | LAUNCHED | 0.011538    | $3,861,901.76    | 0.00%      |
| SUNDOG   | Sundog   | TXL6rJbvmjD46zeN1JssfgxvSo99qC8MRT | LAUNCHED | 0.008359    | $2,804,170.85    | -3.38%     |
```

```bash
wallet-cli sunpump token-list --owner TRYeDrXweRdBorzH9XE8KWMq3TinW4fmjd --order-by market-cap --network tron
```

```console
error [invalid_option]: invalid --order-by: cannot be given with --owner: the by-creator listing is always ordered by created, desc
```

## Output

`data.tokens[]`, each the same record [`sunpump token-info`](token-info.md) returns: `address`, `symbol`, `name`, `decimals`, `totalSupply`, `status`, `owner`, `market`, `curve`, `createdAt`, `createTxHash`, `description`, `links` — plus, once a token has launched, `swapPoolAddress`, `launchedAt` and `launchTxHash`.

`meta.pagination` is `{offset, limit, total: null}` — see above. `meta.query` echoes `orderBy` and `sort`.

## Exit status

`0` success · `1` execution failure (`provider_error`, `provider_rate_limited`, `timeout`) · `2` usage error (`invalid_option` — `--order-by` or `--sort` with `--owner`; `invalid_value` — an unknown ordering or an `--offset` that is not a multiple of `--limit`; `limit_exceeded` — `--limit` above 50; `invalid_address`; `unsupported_network_capability` off mainnet; `family_mismatch` on an EVM network).

## See also

[`sunpump token-search`](token-search.md) · [`sunpump token-info`](token-info.md) · [`sunpump` group](index.md)
