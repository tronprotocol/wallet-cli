# wallet-cli sunpump sell

Sell a token back to its SunPump bonding curve for TRX.

## Synopsis

```
wallet-cli sunpump sell <address> --amount <tokens>
                        [--quote | --dry-run | --build-only | --wait [--wait-timeout <ms>]]
                        [--slippage <decimal> | --min-out <sun>] [--fee-limit <sun>] [options]
```

## Description

**Mainnet only** — see the [group page](index.md), which also explains the state gate, the platform fee and the 5% slippage default.

**The first sale of a token approves the launchpad for an unlimited amount.** The curve pulls the tokens on every sale, so the launchpad needs a standing allowance; an exact one would mean an approval transaction before every sale. The approval is sent **once per token** — later sales of the same token send none — and the spender is an **upgradeable proxy**, which the dry run says in so many words:

```
  Spender        TTfvyrAz86hbZk5iDpKD78pqLGgi8C7AAw
  Allowance      unlimited  (approval tx will be sent first; spender is an upgradeable proxy)
```

So a first sale is two transactions: the approval, sent and confirmed, then the sale. If the approval went out and the sale then failed, the approval stays on chain and its ID is in `error.details.approvalTxIds`. While the approval is still pending, a dry run can price only the approval — the `Fee (est)` figure covers that transaction alone, and JSON says so with `feeCovers: "approvals"`.

**The quote is already net.** You receive the quoted TRX; the platform fee is paid to SunPump beside it. The floor applies to what you receive.

**A sale too small to pay anything is refused** with `invalid_amount` (exit 2), and the message names the smallest sale that would work, in base units.

Before anything is approved, the account is checked: one the chain has no record of fails with `account_not_active`, one holding less than `--amount` with `insufficient_token_balance` — so no allowance is granted for a sale that cannot happen.

`--quote` needs no account. `--dry-run` and `--build-only` need an account but no password, and work for a watch-only account.

## Options

| Option | Description |
|---|---|
| `<address>` | **Required.** The SunPump token's contract address |
| `--amount <tokens>` | **Required.** Whole tokens to sell |
| `--quote` | Price only — no account, no password, no transaction. Excludes `--dry-run`, `--build-only`, `--slippage`, `--min-out` and `--wait` |
| `--slippage <decimal>` | Tolerance, e.g. `0.05`; **default `0.05`** (5%). Excludes `--min-out` |
| `--min-out <sun>` | Least TRX to accept, in SUN. Excludes `--slippage` |
| `--fee-limit <sun>` | Maximum energy fee to burn, in SUN; default `100000000` |
| `--dry-run` | Validate and estimate only — no password, no signature, no broadcast |
| `--build-only` | Emit the unsigned transaction(s) in execution order — the approval first when one is needed |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed |
| `--account <label\|accountId>` | Account to sell from; default the active account. Not used by `--quote` |
| `--password-stdin` | Master password from stdin; needed only when sending |

Plus the [global options](../index.md#global-options-every-command). `--sign-only` is not offered.

## Examples

In the examples, `$PW` is your master password, fed on stdin via `--password-stdin`.

```bash
wallet-cli sunpump sell TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E --amount 1000 --quote --network tron
```

```console
⏳ Quote sunpump sell
  Token          Justin (TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E)
  Sell           1,000 Justin
  Receive (est)  0.029401 TRX (after 0.01 TRX platform fee)

⚠️ Platform fee is 25.38% of this sell (0.01 TRX minimum).
```

```bash
wallet-cli sunpump sell TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E --amount 1000 --quote --network tron -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"sunpump.sell","data":{"kind":"sunpump-sell","tokenAddress":"TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E","tokenSymbol":"Justin","tokenDecimals":18,"platformFee":"10000","platformFeePercent":"25.38","tokensIn":"1000000000000000000000","mode":"quote","trxOutExpected":"29401"},"meta":{"durationMs":2395,"warnings":[]},"chain":{"family":"tron","network":"tron:728126428","chainId":"728126428"}}
```

The point of the warning: 1,000 tokens gross 0.039401 TRX, the fee floor takes 0.01 of it, and a quarter of the sale goes to the platform. A sale large enough that the fee is the plain 1% shows no rate and no warning.

Selling 1,000 Justin. As the first sale of this token from this account, the unlimited approval went first (`Approval tx`), then the sale:

```bash
echo "$PW" | wallet-cli sunpump sell TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E --amount 1000 --wait --password-stdin --account jh --network tron
```

```console
✅ Sale confirmed
  Account       TANkYWRT6N...oMa6MTwn
  Token         Justin (TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E)
  Sold          1,000 Justin
  Received      0.029401 TRX
  Min received  0.02793 TRX
  Slippage      5%
  Approval tx   9e4b1c7a2d5f8e03b6c9a4d1f7e2b5c8a0d3f6e9b2c5a8d1e4f7b0c3a6d9e2f5
  TxID          c5f2a8d1e7b40c9f3a6d2e8b5c1f7a04d9e3b6c2a8f5d1e7c4b0a9f3e6d2c8b1
  Block         #86,922,988
  Energy        71,834
  Fee           7.5284 TRX
  Status        success
```

```bash
echo "$PW" | wallet-cli sunpump sell TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E --amount 1000 --wait --password-stdin --account jh --network tron -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"sunpump.sell","data":{"kind":"sunpump-sell","tokenAddress":"TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E","tokenSymbol":"Justin","tokenDecimals":18,"slippage":"0.05","platformFee":"10000","platformFeePercent":"25.38","tokensIn":"1000000000000000000000","account":"TANkYWRT6NZ2YLtWkFfKYBEGJroMa6MTwn","trxOutExpected":"29401","trxOutMinimum":"27930","approvalTxIds":["9e4b1c7a2d5f8e03b6c9a4d1f7e2b5c8a0d3f6e9b2c5a8d1e4f7b0c3a6d9e2f5"],"stage":"confirmed","txId":"c5f2a8d1e7b40c9f3a6d2e8b5c1f7a04d9e3b6c2a8f5d1e7c4b0a9f3e6d2c8b1","confirmed":true,"blockNumber":86922988,"feeSun":7528400,"energyUsed":71834,"energyFeeSun":7183400,"netFeeSun":345000,"result":"SUCCESS","failed":false,"amountsEstimated":false,"trxOut":"29401"},"meta":{"durationMs":19841,"warnings":[]},"chain":{"family":"tron","network":"tron:728126428","chainId":"728126428"}}
```

## Output

`kind` is `sunpump-sell` in every mode.

| Field | Type | Meaning |
|---|---|---|
| `tokenAddress` / `tokenSymbol` / `tokenDecimals` | — | The token, read from the contract |
| `tokensIn` | string | Base units sold |
| `trxOutExpected` | string | SUN **net** of the platform fee — what arrives |
| `trxOutMinimum` / `slippage` | string | The floor on that net figure and the tolerance it came from; absent from a quote |
| `platformFee` / `platformFeePercent` | string | SunPump's fee in SUN, and its share of the gross (`trxOutExpected + platformFee`) — only when the 0.01 TRX minimum pushed it above 1% |
| `account` | string | The selling address; absent from a quote |
| `approvals[]` | array | The unlimited grant (`amount: "unlimited"`) with its spender, when one is needed |
| `fee` / `feeCovers` | — | The chain's energy estimate and what it covers (`approvals` while the grant is pending, else `all`) |
| `approvalTxIds[]` | string[] | Once sent: the approval, beside the sale's own `txId` |
| `trxOut` | string | Confirmed receipts only: the TRX that actually arrived, read from the transaction (`amountsEstimated: false`); otherwise `trxOutExpected` stands with `amountsEstimated: true` and a warning |

The default mode returns at submission (`stage: "submitted"`, `txId`); `--wait` adds `stage: "confirmed"`, `confirmed`, `blockNumber`, `feeSun` (with its parts `energyUsed`, `energyFeeSun`, `netFeeSun`), `result` and `failed`.

## Exit status

`0` success (submitted, or quoted/built/estimated) · `1` execution failure (`launchpad_token_not_found`, `launchpad_trading_closed`, `account_not_active`, `insufficient_token_balance`, `slippage_exceeded`, `watch_only_no_signer`, `auth_failed`, `transaction_rejected`, `provider_error`, `timeout`) · `2` usage error (`missing_option` — no `<address>` or `--amount`; `invalid_option` — `--quote` with another mode, `--slippage`, `--min-out` or `--wait`, or `--slippage` with `--min-out`; `invalid_amount` — not a positive number, or a sale too small to pay anything; `invalid_value` — a `--slippage` out of range; `invalid_address`; `account_not_found`; `unsupported_network_capability`; `family_mismatch`).

## See also

[`sunpump buy`](buy.md) · [`sunpump token-info`](token-info.md) · [`sunswap swap`](../sunswap/swap.md) · [machine-interface.md](../../machine-interface.md)
