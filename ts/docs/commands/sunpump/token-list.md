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

**`--owner` has a fixed order.** The by-creator listing is always newest first and ignores any requested order, so `--order-by` and `--sort` are refused alongside `--owner` with `invalid_option`, rather than silently dropped — unless they name that fixed order (`--order-by created`, `--sort desc`). Newest first is this command's default anyway, so `--owner` on its own loses nothing.

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
| Symbol   | Name                | Address                            | Status   | Price (TRX) | Market cap (USD) | 24h change |
| -------- | ------------------- | ---------------------------------- | -------- | ----------- | ---------------- | ---------- |
| 波场人生 | 波场人生            | TNkakCYwNtggwz8WbWhskvonCXNMQ5mqbc | LAUNCHED | 0.062358    | $20,883,339.07   | 0.68%      |
| PUSS     | PUSS                | TX5eXdf8458bZ77fk8xdvUgiQmC3L93iv7 | LAUNCHED | 0.011470    | $3,851,063.25    | 0.00%      |
| CZC      | Crypto Zillion Club | TRJBN2ninnLKUUDR1f686goCYetPcPed8f | LAUNCHED | 0.005782    | $1,941,498.87    | 0.00%      |
```

```bash
wallet-cli sunpump token-list --order-by market-cap --limit 1 --network tron -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"sunpump.token-list","data":{"tokens":[{"address":"TNkakCYwNtggwz8WbWhskvonCXNMQ5mqbc","symbol":"波场人生","name":"波场人生","decimals":18,"totalSupply":"1000000000000000000000000000","status":"LAUNCHED","owner":"TYbwCgQzMP2sDSyf1HrbMcrWRL569qtLZX","market":{"marketCapUsd":"20883339.06680720868780672","priceInTrx":"0.062358171946452976","priceChange24HrPercent":"0.6758","volume24HrSun":"20880768252","virtualLiquidity":"92430.573291792"},"curve":{"pumpPercentage":"100","currentSold":"798623189000000000000000000","tokenReserve":"0","trxReserve":"0"},"swapPoolAddress":"TUTYJHByKCVr9XUEiWrX6eJDe4NgYhBTai","createdAt":"2026-08-25 08:07","launchedAt":"2026-08-25 08:07","createTxHash":"243c973e7dd0fa5409cfefb2509a5f34ffc157a16f99d9f536d6a185c0c797b1","launchTxHash":"25a11a9236ed81e9f0b7aefda0aae37b88aec8a029623d10ddc71756e14b9b67","description":"@TronLife_DAO 波场人生","links":{"logo":"https://cdn.sunpump.meme/public/logo/852508221_TYbwCg_1cj4qlBjYhXZ.jpg","twitter":"@TronLife_DAO"}}]},"meta":{"durationMs":1196,"warnings":[],"pagination":{"offset":0,"limit":1,"total":null},"query":{"orderBy":"market-cap","sort":"desc"}},"chain":{"family":"tron","network":"tron:728126428","chainId":"728126428"}}
```

One creator's tokens, newest first:

```bash
wallet-cli sunpump token-list --owner TRYeDrXweRdBorzH9XE8KWMq3TinW4fmjd --limit 3 --network tron
```

```console
Tokens (limit 3, offset 0)
| Symbol | Name | Address                            | Status  | Price (TRX) | Market cap (USD) | 24h change |
| ------ | ---- | ---------------------------------- | ------- | ----------- | ---------------- | ---------- |
| X      | x    | TVE4aYp7EtKnfQaUQVZezpUVfFybBpPxS8 | CREATED | 0.000032    | $10,982.08       | 0.00%      |
| BACD   | BACD | TTzaiQktEz19rEgYvdjEGa3SXjg5myDgMW | CREATED | 0.000032    | $10,955.08       | 0.01%      |
| OOBX   | oobx | TLx1sHogWMvM14mWHrtb6ZenFCpxqWRySr | CREATED | 0.000032    | $10,982.08       | 0.00%      |
```

## Output

`data.tokens[]`, each the same record [`sunpump token-info`](token-info.md) returns: `address`, `symbol`, `name`, `decimals`, `totalSupply`, `status`, `owner`, `market`, `curve`, `createdAt`, `createTxHash`, `description`, `links` — plus, once a token has launched, `swapPoolAddress`, `launchedAt` and `launchTxHash`.

`meta.pagination` is `{offset, limit, total: null}` — see above. `meta.query` echoes `orderBy` and `sort`.

## Exit status

`0` success · `1` execution failure (`provider_error`, `provider_rate_limited`, `timeout`) · `2` usage error (`invalid_option` — an `--order-by` or `--sort` other than `created` / `desc` with `--owner`; `invalid_value` — an unknown ordering or an `--offset` that is not a multiple of `--limit`; `limit_exceeded` — `--limit` above 50; `invalid_address`; `unsupported_network_capability` off mainnet; `family_mismatch` on an EVM network).

## See also

[`sunpump token-search`](token-search.md) · [`sunpump token-info`](token-info.md) · [`sunpump` group](index.md)
