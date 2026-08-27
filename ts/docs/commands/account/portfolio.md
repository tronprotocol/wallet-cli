# wallet-cli account portfolio

Show native + token balances with best-effort USD value.

## Synopsis

```
wallet-cli account portfolio [options]
```

## Description

Aggregates the account's native coin and address-book token balances into one view, attaching USD prices from an external price source **best-effort**. Expect this to be the slowest `account` query — it fans out to the price source.

Three outcomes are kept distinct, because they are different claims:

- **Priced** — `priceUsd` / `valueUsd` carry the number.
- **Test network** — priced at `0` without asking anyone. A testnet coin is not traded, so there is nothing to look up; the network declares itself a testnet rather than being guessed from its id.
- **Unknown** — `priceUsd` / `valueUsd` are `null` (an unlisted chain, or the price source failed). `null` means "we could not find out", which is not the same as worthless. If the price source itself errored, `data.priceUnavailable` is `true` with `priceReason: "price_provider_error"`.

A token whose **balance** cannot be read keeps its row rather than vanishing: `balance` / `rawBalance` are `null` and `balanceUnavailable: true` with a `reason`. One unreadable token never takes the whole portfolio down. `totalValueUsd` sums only the rows that could be valued, and is `null` when none could.

## Options

Only the [global options](../index.md#global-options-every-command).

## Examples

```bash
wallet-cli account portfolio --network tron:nile
```

```console
"demo" Portfolio
| Token | Balance      | Price (USD) | Value (USD) |
| ----- | ------------ | ----------- | ----------- |
| TRX   | 9915.80311   | $0.0000     | $0.00       |
| USDT  | 17061.463423 | $0.0000     | $0.00       |
| USDD  | 0            | $0.0000     | $0.00       |
Total ≈ $0.00
```

```bash
wallet-cli account portfolio --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"account.portfolio","data":{"network":"tron:nile","account":"wlt_gd2x8vyk","address":"TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB","priceSource":"coingecko","holdings":[{"kind":"native","symbol":"TRX","decimals":6,"rawBalance":"9915803110","balance":"9915.80311","priceUsd":0,"valueUsd":0},{"kind":"trc20","symbol":"USDT","decimals":6,"rawBalance":"17061463423","balance":"17061.463423","priceUsd":0,"valueUsd":0,"id":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","name":"Tether USD","source":"official"}],"totalValueUsd":0},"meta":{"durationMs":724,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

The same command on an EVM network, with `kind` reporting `erc20` instead of `trc20`:

```bash
wallet-cli account portfolio --network evm:11155111 -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"account.portfolio","data":{"network":"evm:11155111","account":"wlt_fjeca27y.0","address":"0x541B10b92b45C08513e67bb8209f035D810212B6","priceSource":"coingecko","holdings":[{"kind":"native","symbol":"ETH","decimals":18,"rawBalance":"0","balance":"0","priceUsd":0,"valueUsd":0}],"totalValueUsd":0},"meta":{"durationMs":232,"warnings":[]},"chain":{"family":"evm","network":"evm:11155111","chainId":"11155111"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `network` / `account` / `address` | string | Query context |
| `priceSource` | string | e.g. `coingecko` |
| `priceUnavailable` / `priceReason` | boolean / string | Present only when the price source failed |
| `holdings[].kind` | string | `native`, `trc20`, `trc10` (TRON), `erc20` (EVM) |
| `holdings[].symbol` / `decimals` | — | Token identity |
| `holdings[].rawBalance` | string\|null | Base units; `null` when the balance could not be read |
| `holdings[].balance` | string\|null | Human units; `null` when the balance could not be read |
| `holdings[].balanceUnavailable` / `reason` | boolean / string | Present only on a row whose balance could not be read |
| `holdings[].id` / `name` / `source` | string | Token rows only: contract address (or TRC10 id), name, and whether it came from the built-in list (`official`) or was user-added |
| `holdings[].priceUsd` / `valueUsd` | number\|null | **Best-effort estimate**; `0` on a test network, `null` when unknown |
| `totalValueUsd` | number\|null | Sum of priced holdings, `null` if none priced |

## Exit status

`0` (even with all prices `null` or a token's balance unavailable) · `1` execution failure · `2` usage error.

## See also

[`account balance`](balance.md) · `token` — manage the address book that defines which tokens appear here
