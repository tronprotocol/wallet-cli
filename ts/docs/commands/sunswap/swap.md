# wallet-cli sunswap swap

Exchange one token for another.

## Synopsis

```
wallet-cli sunswap swap <tokenIn> <tokenOut> <amountIn>
                        [--quote [--all] | --dry-run | --build-only | --wait [--wait-timeout <ms>]]
                        [--slippage <decimal>] [--fee-limit <sun>] [options]
```

## Description

Spends `<amountIn>` whole tokens of `<tokenIn>` for as much `<tokenOut>` as the market gives.

**Mainnet only.** On Nile or Shasta the command fails with `unsupported_network_capability` (exit 2); on an EVM network, with `family_mismatch`.

### The market is chosen first

Before anything is priced, the command decides **which market** the trade belongs to, from on-chain state, identically in every mode:

- Exactly one side is **TRX** and the other is a **SunPump token that has not launched yet** → that token's **bonding curve**.
- Anything else → the **SunSwap router**, which finds a route across V1, V2, V3 and V4 pools.

The output names the market (`Market` in text, `market` in JSON), because it changes what the numbers mean: on a curve the trading fee is SunPump's **platform fee**, there is one hop, and there is no price impact. If the curve's state cannot be read, the command **stops** with `provider_error` rather than falling back to the router — a quote from one market and a fill on the other is how a swap loses money.

[`sunpump buy`](../sunpump/buy.md) and [`sunpump sell`](../sunpump/sell.md) reach the same curve directly, with a 5% default slippage instead of this command's 0.5%.

### Naming the tokens

Each token is a contract address or a symbol. `TRX` and `WTRX` are built in; any other symbol is looked up, case-insensitively, in the [token address book](../token/index.md) of the account this command uses (`--account`, else the active account) — the official entries plus any added with [`token add`](../token/add.md). `--quote` reads the same book, so a quote and the execution it previews name the same token.

- A symbol matching **more than one** entry is refused with `ambiguous_token_symbol` (exit 2), and the message lists every candidate address. One is never picked for you: a user-added token calling itself `USDT` is exactly how an impersonation would reach a trade.
- A symbol matching nothing is `unsupported_token` (exit 2): pass the contract address, or add it with `token add`.

Every mode shows the contract each side resolved to — `Token in` / `Token out` in text, `tokenIn.address` / `tokenOut.address` in JSON. A side whose symbol came from the account's own book is marked `(from your token book)`, and JSON lists those addresses under `fromTokenBook`.

### Spending TRX vs spending a token

A router swap that spends **TRX** is one transaction: the TRX travels as the call's own value, and nothing needs approving.

A router swap that spends a **token** needs two grants, and neither is unlimited:

1. A TRC20 **approval to Permit2** for exactly this trade — a transaction, sent and confirmed first. Skipped when an existing allowance already covers the trade. Unlike the grant below, this allowance does not expire on its own.
2. A **Permit2 grant** to the router for exactly this trade, **expiring in one hour** — a typed-data signature, which costs nothing and is not a transaction.

If the account already holds a Permit2 grant to the router that covers the trade — for example one left by another SunSwap client, which typically grants far more for thirty days — no new grant is signed and the swap uses the standing one; `permit` is then absent from the output.

Then the swap itself. Before the Permit2 grant is signed, its token, amount, spender, chain and expiry are checked; a mismatch fails with `permit_mismatch` without signing that grant. After signing, the recovered signer is checked; a mismatch fails with `signing_rejected`. The encoded swap is checked against the quote before it is sent; a mismatch fails with `router_call_mismatch` and the swap is not sent. If an approval went out before a later step failed, it remains on chain and its ID is in `error.details.approvalTxIds`; re-running reuses a sufficient allowance.

**Ledger** signs the Permit2 grant by hash, so the device shows a hash rather than the token and amount — check those in the CLI's preview. The TRON app needs **Custom contracts** and **Sign by Hash** allowed; see [TRON app settings](../../guide/ledger.md#tron-app-settings).

### What is checked before anything is spent

In every mode except `--quote`, the account must hold what the swap spends: an account the chain has no record of fails with `account_not_active`, one holding too little with `insufficient_balance` (TRX) or `insufficient_token_balance` (a token) — all exit 1. Checking first is what keeps a real run from paying for an approval it can never use. The network fee is not part of this check; `--fee-limit` bounds that.

### Slippage and the floor

`--slippage` (default `0.005`, i.e. 0.5%; from `0.0001` to `0.5`, in steps no finer than `0.0001`) sets the floor `Min received`: below it the trade reverts on chain. The floor is computed by the CLI from the chosen route and read back out of the encoded call before sending, so it is the one actually enforced.

### Modes

| Mode | Needs | What you get |
|---|---|---|
| `--quote` | nothing — no account, no password | The best route (highest output, then lowest fee, then fewest hops); `--all` lists every candidate. No floor is published — `--quote` refuses `--slippage` |
| `--dry-run` | an account (watch-only works), no password | The chosen route, the floor, the grants it would ask for, and a fee estimate |
| `--build-only` | an account, no password | The unsigned transaction. **Refused for a router swap that spends a token**: the transaction embeds the Permit2 signature, which does not exist yet |
| default / `--wait` | a signing account (software password via stdin/TTY, or Ledger approval) | Sends. Returns at submission unless `--wait` |

For a swap spending **TRX** it prices the swap itself. For a swap spending a **token**, what it can price depends on what is already on chain, and `feeCovers` says which case applies:

- **A standing Permit2 grant covers the trade** and the allowance to Permit2 suffices: it prices the swap itself (`feeCovers: "all"`).
- **An approval to Permit2 is still needed:** it prices the **approval only** and says so — `Fee (est, approval only)` (`feeCovers: "approvals"`). The swap cannot be simulated before that allowance is on chain.
- **Only a new Permit2 grant is needed:** nothing on chain is left to price, so `Fee (est)` carries the reason instead of a figure (`feeCovers: "none"`, with `feeUnavailableReason`). Encoding the swap needs the signature, and a dry run does not sign.

## Options

| Option | Description |
|---|---|
| `<tokenIn>` | **Required.** Token to spend, symbol or contract address |
| `<tokenOut>` | **Required.** Token to receive, symbol or contract address |
| `<amountIn>` | **Required.** Amount of `<tokenIn>` to spend, in whole tokens, > 0 |
| `--quote` | Price only. Excludes `--dry-run`, `--build-only`, `--wait` and `--slippage` |
| `--all` | List every candidate route instead of the best one; only with `--quote` |
| `--dry-run` | Validate and estimate only — no password, no signature, no broadcast |
| `--build-only` | Emit the unsigned transaction(s) without signing them |
| `--slippage <decimal>` | Tolerance, e.g. `0.005` for 0.5%; default `0.005` |
| `--fee-limit <sun>` | Maximum energy fee to burn, in SUN; default `100000000`. The dry run's estimate is a lower bound, so a limit set from it can fail |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--account <label\|accountId>` | Account to trade from; default the active account. `--quote` reads the same account's token book |
| `--password-stdin` | Master password from stdin (fd 0); needed only by the modes that sign |

Plus the [global options](../index.md#global-options-every-command). `--sign-only` is not offered in this group.

## Examples

In the examples, `$PW` is your master password, fed on stdin via `--password-stdin`.

A quote needs no account:

```bash
wallet-cli sunswap swap TRX USDT 100 --quote --network tron
```

```console
Market  SunSwap
Token in  T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb
Token out  TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t

| Route                   | Amount in | Amount out     | Trading fee  | Price impact |
| ----------------------- | --------- | -------------- | ------------ | ------------ |
| TRX → WTRX → JST → USDT | 100 TRX   | 33.503693 USDT | 0.349849 TRX | -0.000010%   |

1 of 3 routes shown — --all lists them.
```

```bash
wallet-cli sunswap swap TRX USDT 100 --quote --network tron -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"sunswap.swap","data":{"kind":"sunswap-swap","mode":"quote","market":"sunswap","routes":[{"amountIn":"100000000","amountOut":"33503693","inUsd":"33.482586577700000002","outUsd":"33.481091433293910662","priceImpactPercent":"-0.000010","tradingFee":"349849","containsUnverifiedHook":false,"path":[{"address":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","symbol":"TRX","decimals":6},{"address":"TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR","symbol":"WTRX"},{"address":"TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9","symbol":"JST"},{"address":"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t","symbol":"USDT","decimals":6}],"protocols":["V2","V2","V4"],"poolFees":["0","3000","500","0"]}],"routesAvailable":3},"meta":{"durationMs":3314,"warnings":[]},"chain":{"family":"tron","network":"tron:728126428","chainId":"728126428"}}
```

`--all` lists every candidate, in the order the service returned them — the single quote above is the one with the highest output:

```bash
wallet-cli sunswap swap TRX USDT 100 --quote --all --network tron
```

```console
Market  SunSwap
Token in  T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb
Token out  TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t

| Route                   | Amount in | Amount out     | Trading fee  | Price impact |
| ----------------------- | --------- | -------------- | ------------ | ------------ |
| TRX → USDT              | 100 TRX   | 33.491511 USDT | 0.3 TRX      | -0.000051%   |
| TRX → WTRX → JST → USDT | 100 TRX   | 33.503693 USDT | 0.349849 TRX | -0.000010%   |
| TRX → JST → USDT        | 100 TRX   | 33.501478 USDT | 0.349846 TRX | -0.000069%   |
```

A negative price impact is a real answer, not a formatting slip: the route paid better than the service's reference price.

A token that is still on its SunPump curve is quoted on the curve:

```bash
wallet-cli sunswap swap TRX TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E 10 --quote --network tron
```

```console
Market  SunPump bonding curve
Token in  T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb
Token out  TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E

| Route        | Amount in | Amount out            | Platform fee |
| ------------ | --------- | --------------------- | ------------ |
| TRX → Justin | 10 TRX    | 251,195.108099 Justin | 0.1 TRX      |
```

Swapping 10 TRX for USDT. `--wait` returns the confirmed receipt, whose `Received` is what actually arrived, read from the transaction:

```bash
echo "$PW" | wallet-cli sunswap swap TRX USDT 10 --wait --password-stdin --account lp --network tron
```

```console
✅ Swapped 10 TRX for 3.351902 USDT
  Account               TT2T17KZho...dkEWkU9N
  Market                SunSwap
  Token in              T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb
  Token out             TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
  Spent                 10 TRX
  Received              3.351902 USDT
  Min received          3.335107 USDT
  Slippage              0.5%
  Price impact (quote)  -0.000001%
  TxID                  4f1c9a7e3b2d8c50e6a1f9b7d34c2e8a0b5f6d1c7e9a3b4c2d8e0f1a6b5c9d7e
  Block                 #86,922,731
  Energy                405,118
  Fee                   40.8534 TRX
  Status                success
```

```bash
echo "$PW" | wallet-cli sunswap swap TRX USDT 10 --wait --password-stdin --account lp --network tron -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"sunswap.swap","data":{"kind":"sunswap-swap","market":"sunswap","account":"TT2T17KZhoDu47i2E4FWxfG79zdkEWkU9N","amountIn":"10000000","tokenIn":{"address":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","symbol":"TRX","decimals":6},"tokenOut":{"address":"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t","decimals":6,"symbol":"USDT"},"route":{"path":[{"address":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","symbol":"TRX","decimals":6},{"address":"TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR","symbol":"WTRX"},{"address":"TPFqcBAaaUMCSVRCqPaQ9QnzKhmuoLR6Rc","symbol":"USD1"},{"address":"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t","symbol":"USDT","decimals":6}],"protocols":["V2","V3","V3"],"poolFees":["0","500","100","0"]},"tradingFee":"5999","amountOutExpected":"3351867","priceImpactPercent":"-0.000001","priceImpactEstimated":true,"amountOutMinimum":"3335107","slippage":"0.005","stage":"confirmed","txId":"4f1c9a7e3b2d8c50e6a1f9b7d34c2e8a0b5f6d1c7e9a3b4c2d8e0f1a6b5c9d7e","confirmed":true,"blockNumber":86922731,"feeSun":40853400,"energyUsed":405118,"energyFeeSun":40508400,"netFeeSun":345000,"result":"SUCCESS","failed":false,"amountsEstimated":false,"amountOut":"3351902"},"meta":{"durationMs":9184,"warnings":[]},"chain":{"family":"tron","network":"tron:728126428","chainId":"728126428"}}
```

Swapping 1 USDT for TRX. The Permit2 grant is signed locally and travels inside the swap; no approval transaction was needed, because the allowance to Permit2 already covered the trade:

```bash
echo "$PW" | wallet-cli sunswap swap USDT TRX 1 --wait --password-stdin --account lp --network tron
```

```console
✅ Swapped 1 USDT for 3.012871 TRX
  Account               TT2T17KZho...dkEWkU9N
  Market                SunSwap
  Token in              TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
  Token out             T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb
  Spent                 1 USDT
  Received              3.012871 TRX
  Min received          2.99794 TRX
  Slippage              0.5%
  Price impact (quote)  -0.002370%
  Permit2               TTJxU3P8rHycAyFY4kVtGNfmnMH4ezcuM9
  Permit grants         1000000 to TQqgNg13s2...wZGvb7Y4
  Permit expires        2026-10-08 05:46:07 UTC (1 hour)
  TxID                  b83e0d5a9c17f42e6b0a8d3c5f91e27d4a6c0b8e3f5d2a9c7e1b4f60d8a3c25e
  Block                 #86,922,815
  Energy                286,437
  Fee                   28.9887 TRX
  Status                success
```

```bash
echo "$PW" | wallet-cli sunswap swap USDT TRX 1 --wait --password-stdin --account lp --network tron -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"sunswap.swap","data":{"kind":"sunswap-swap","market":"sunswap","account":"TT2T17KZhoDu47i2E4FWxfG79zdkEWkU9N","amountIn":"1000000","tokenIn":{"address":"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t","decimals":6,"symbol":"USDT"},"tokenOut":{"address":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","symbol":"TRX","decimals":6},"route":{"path":[{"address":"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t","symbol":"USDT","decimals":6},{"address":"TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9","symbol":"JST"},{"address":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","symbol":"TRX","decimals":6}],"protocols":["V4","V4"],"poolFees":["500","3000","0"]},"tradingFee":"3498","amountOutExpected":"3013006","priceImpactPercent":"-0.002370","priceImpactEstimated":true,"amountOutMinimum":"2997940","slippage":"0.005","approvals":[],"permit":{"permit2":"TTJxU3P8rHycAyFY4kVtGNfmnMH4ezcuM9","spender":"TQqgNg13s2DjvXhW1ky4v6TsR8wZGvb7Y4","amount":"1000000","expiration":"1791438367"},"stage":"confirmed","txId":"b83e0d5a9c17f42e6b0a8d3c5f91e27d4a6c0b8e3f5d2a9c7e1b4f60d8a3c25e","confirmed":true,"blockNumber":86922815,"feeSun":28988700,"energyUsed":286437,"energyFeeSun":28643700,"netFeeSun":345000,"result":"SUCCESS","failed":false,"amountsEstimated":false,"amountOut":"3012871"},"meta":{"durationMs":14327,"warnings":[]},"chain":{"family":"tron","network":"tron:728126428","chainId":"728126428"}}
```

## Output

`kind` is `sunswap-swap` in every mode, and `market` is `sunswap` or `sunpump`.

**`--quote`** returns `routes[]` — always an array, one element unless `--all` — with `routesAvailable` counting the candidates:

| Field | Type | Meaning |
|---|---|---|
| `amountIn` / `amountOut` | string | Base units |
| `tradingFee` | string | Base units of the **input** token — text shows it in that token too (`0.005 USDT` for a USDT sale); on the curve, SunPump's platform fee in TRX |
| `priceImpactPercent` | string | As the service reports it, negative included. Absent on the curve |
| `path[]` | array | `{address, symbol}` per token; the two ends also carry `decimals` |
| `protocols[]` | string[] | One per pool hop, so one fewer than `path` (`SUNPUMP` on the curve) |
| `poolFees[]` | string[] | Fee tiers, one per token in `path` — a trailing `0` past the last pool |
| `inUsd` / `outUsd` | string | Present only when the service sends them |
| `containsUnverifiedHook` | boolean | The route passes through an unverified V4 hook contract. The route is still offered; the CLI warns in every mode |

**Every other mode** returns one chosen `route`, plus:

| Field | Type | Meaning |
|---|---|---|
| `account` | string | The trading address |
| `amountIn` | string | Base units of `tokenIn` |
| `tokenIn` / `tokenOut` | object | `{address, symbol, decimals}` |
| `amountOutExpected` / `amountOutMinimum` | string | Expected output and the enforced floor, base units of `tokenOut` |
| `slippage` | string | The tolerance the floor was computed from |
| `tradingFee`, `priceImpactPercent` | string | Quoted figures; `priceImpactEstimated: true` marks the router's impact as a quote, not a measurement |
| `approvals[]` | array | The TRC20 approval to Permit2, `{token, spender, amount, …}`; empty or absent when none is needed |
| `permit` | object | `{permit2, spender, amount, expiration}` — the Permit2 grant (expiration in Unix seconds). Absent when spending TRX |
| `fee` / `feeCovers` / `feeUnavailableReason` | — | The estimate and what it covers (`all`, `approvals` or `none`) |
| `approvalTxIds[]` | string[] | Once sent: the approvals, in the order sent, beside the swap's own `txId` |
| `amountOut` | string | Confirmed receipts only: what actually arrived, read from the transaction. `amountsEstimated: false` marks it as measured; if the receipt could not be read, `amountOutExpected` stands, `amountsEstimated` is `true` and a warning says why |

The default mode returns at submission (`stage: "submitted"`, `txId`); `--wait` adds `stage: "confirmed"`, `confirmed`, `blockNumber`, `feeSun` (with its parts `energyUsed`, `energyFeeSun`, `netFeeSun`), `result` and `failed`.

## Exit status

`0` success (submitted, or quoted/built/estimated) · `1` execution failure (`account_not_active`, `insufficient_balance`, `insufficient_token_balance`, `same_token` — the two sides are the same token, `no_matching_route` — no path for that pair (retry later), `launchpad_trading_closed`, `permit_mismatch`, `router_call_mismatch`, `slippage_exceeded`, `watch_only_no_signer` — a watch-only account in a mode that signs, `auth_failed`, `provider_error`, `provider_rate_limited` — the route service returned HTTP 429, with `details.retryAfterSeconds` when sent, `timeout`) · `2` usage error (`invalid_amount` — `<amountIn>` not a positive number; `invalid_value` — a `--slippage` outside 0.0001–0.5 or finer than 0.0001; `invalid_option` — two modes together, `--wait` with `--quote` / `--dry-run` / `--build-only`, `--slippage` with `--quote`, `--all` without `--quote`, `--build-only` for a token swap; `account_not_found`; `unsupported_token`, `ambiguous_token_symbol`; `unsupported_network_capability`; `family_mismatch`).

## See also

[`sunpump buy`](../sunpump/buy.md) · [`sunpump sell`](../sunpump/sell.md) · [`sunswap price`](price.md) · [`sunswap` group](index.md) · [machine-interface.md](../../machine-interface.md)
