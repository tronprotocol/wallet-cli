# wallet-cli sunpump buy

Spend TRX to buy a token on its SunPump bonding curve.

## Synopsis

```
wallet-cli sunpump buy <address> --trx <amount>
                       [--quote | --dry-run | --build-only | --wait [--wait-timeout <ms>]]
                       [--slippage <decimal> | --min-out <base-units>] [--fee-limit <sun>] [options]
```

## Description

**Mainnet only** — see the [group page](index.md), which also explains the state gate, the platform fee and the 5% slippage default.

The TRX travels as the call's **value**, so **nothing is approved**: a buy is one transaction. `--trx` is the **total** — SunPump's platform fee is taken out of it, not added to it.

Before anything is built, the account is checked: one the chain has no record of fails with `account_not_active`, one holding less than `--trx` with `insufficient_balance`. The energy fee is not part of that check.

`--quote` needs no account. `--dry-run` and `--build-only` need an account but no password, and work for a watch-only account. The default mode signs and sends, and returns at submission unless `--wait`.

## Options

| Option | Description |
|---|---|
| `<address>` | **Required.** The SunPump token's contract address |
| `--trx <amount>` | **Required.** Whole TRX to spend, platform fee included |
| `--quote` | Price only — no account, no password, no transaction. Excludes `--dry-run`, `--build-only`, `--slippage`, `--min-out` and `--wait` |
| `--slippage <decimal>` | Tolerance, e.g. `0.05`; **default `0.05`** (5%). Excludes `--min-out` |
| `--min-out <base-units>` | Least to accept, in the token's smallest unit. Excludes `--slippage` |
| `--fee-limit <sun>` | Maximum energy fee to burn, in SUN; default `100000000`. The estimate is a lower bound |
| `--dry-run` | Validate and estimate only — no password, no signature, no broadcast |
| `--build-only` | Emit the unsigned transaction |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed |
| `--account <label\|accountId>` | Account to buy with; default the active account. Not used by `--quote` |
| `--password-stdin` | Master password from stdin; needed only when sending |

Plus the [global options](../index.md#global-options-every-command). `--sign-only` is not offered.

## Examples

In the examples, `$PW` is your master password, fed on stdin via `--password-stdin`.

```bash
wallet-cli sunpump buy TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E --trx 1 --quote --network tron
```

```console
⏳ Quote sunpump buy
  Token          Justin (TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E)
  Spend          1 TRX (incl. 0.01 TRX platform fee)
  Receive (est)  25,125.337148 Justin
```

```bash
wallet-cli sunpump buy TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E --trx 1 --quote --network tron -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"sunpump.buy","data":{"kind":"sunpump-buy","tokenAddress":"TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E","tokenSymbol":"Justin","tokenDecimals":18,"platformFee":"10000","trxIn":"1000000","mode":"quote","tokensOutExpected":"25125337148664452174594"},"meta":{"durationMs":2381,"warnings":[]},"chain":{"family":"tron","network":"tron:728126428","chainId":"728126428"}}
```

One TRX pays the **0.01 TRX minimum** fee — the fee is 1% only above 1 TRX.

Buying with 1 TRX. A buy is one transaction; `Received` is what actually arrived:

```bash
echo "$PW" | wallet-cli sunpump buy TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E --trx 1 --wait --password-stdin --account lp --network tron
```

```console
✅ Buy confirmed
  Account       TT2T17KZho...dkEWkU9N
  Token         Justin (TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E)
  Spent         1 TRX (incl. 0.01 TRX platform fee)
  Received      25,125.337148 Justin
  Min received  23,869.070291 Justin
  Slippage      5%
  TxID          2a7d5e9f0c3b8a14d6e2f7c9b05a3d8e1f4c6b2a9d7e0c5f3b8a1d6e4c2f9a07
  Block         #86,922,902
  Energy        64,212
  Fee           6.7628 TRX
  Status        success
```

```bash
echo "$PW" | wallet-cli sunpump buy TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E --trx 1 --wait --password-stdin --account lp --network tron -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"sunpump.buy","data":{"kind":"sunpump-buy","tokenAddress":"TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E","tokenSymbol":"Justin","tokenDecimals":18,"slippage":"0.05","platformFee":"10000","trxIn":"1000000","account":"TT2T17KZhoDu47i2E4FWxfG79zdkEWkU9N","tokensOutExpected":"25125337148664452174594","tokensOutMinimum":"23869070291231229565864","stage":"confirmed","txId":"2a7d5e9f0c3b8a14d6e2f7c9b05a3d8e1f4c6b2a9d7e0c5f3b8a1d6e4c2f9a07","confirmed":true,"blockNumber":86922902,"feeSun":6762800,"energyUsed":64212,"energyFeeSun":6417800,"netFeeSun":345000,"result":"SUCCESS","failed":false,"amountsEstimated":false,"tokensOut":"25125337148664452174594"},"meta":{"durationMs":8462,"warnings":[]},"chain":{"family":"tron","network":"tron:728126428","chainId":"728126428"}}
```

## Output

`kind` is `sunpump-buy` in every mode.

| Field | Type | Meaning |
|---|---|---|
| `tokenAddress` / `tokenSymbol` / `tokenDecimals` | — | The token, read from the contract |
| `trxIn` | string | SUN spent, platform fee included |
| `platformFee` / `platformFeePercent` | string | SunPump's fee in SUN, and the rate it worked out to (only when the 0.01 TRX minimum pushed it above 1%) |
| `tokensOutExpected` | string | Base units the curve quoted |
| `tokensOutMinimum` / `slippage` | string | The enforced floor and the tolerance it came from; absent from a quote |
| `account` | string | The buying address; absent from a quote |
| `fee` / `feeCovers` | — | The chain's energy estimate, separate from `platformFee`; always `feeCovers: "all"` |
| `tokensOut` | string | Confirmed receipts only: the tokens that actually arrived, read from the transaction (`amountsEstimated: false`). If the receipt could not be read, `tokensOutExpected` stands, `amountsEstimated` is `true` and a warning says why |

The default mode returns at submission (`stage: "submitted"`, `txId`); `--wait` adds `stage: "confirmed"`, `confirmed`, `blockNumber`, `feeSun` (with its parts `energyUsed`, `energyFeeSun`, `netFeeSun`), `result` and `failed`.

## Exit status

`0` success (submitted, or quoted/built/estimated) · `1` execution failure (`launchpad_token_not_found`, `launchpad_trading_closed`, `account_not_active`, `insufficient_balance`, `slippage_exceeded`, `watch_only_no_signer`, `auth_failed`, `transaction_rejected`, `provider_error`, `timeout`) · `2` usage error (`missing_option` — no `<address>` or `--trx`; `invalid_option` — `--quote` with another mode, `--slippage`, `--min-out` or `--wait`, or `--slippage` with `--min-out`; `invalid_amount`; `invalid_value` — a `--slippage` out of range; `invalid_address`; `account_not_found`; `unsupported_network_capability`; `family_mismatch`).

## See also

[`sunpump sell`](sell.md) · [`sunpump token-info`](token-info.md) · [`sunswap swap`](../sunswap/swap.md) · [machine-interface.md](../../machine-interface.md)
