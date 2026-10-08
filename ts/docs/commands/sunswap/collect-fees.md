# wallet-cli sunswap collect-fees

Take the fees a V3 or V4 position has earned, leaving its principal where it is.

## Synopsis

```
wallet-cli sunswap collect-fees --protocol <V3|V4> --position-id <id>
                                [--recipient <address>]
                                [--token0 <token> --token1 <token> [--fee <n>]] [--deadline <timestamp>]
                                [--fee-limit <sun>]
                                [--dry-run | --build-only | --wait [--wait-timeout <ms>]] [options]
```

## Description

Collects **everything the position is owed** — there is no partial amount. Nothing is approved: the position manager already holds the position. One transaction.

Works on **`tron` and `nile`**; on Shasta it fails with `unsupported_network_capability`, on an EVM network with `family_mismatch`.

[`sunswap remove-liquidity`](remove-liquidity.md) already pays the fees out with the principal, so this command is for when the principal should stay in the pool.

**On V4 the position names its own pool.** `--token0` / `--token1` and `--fee` are optional cross-checks: they select nothing, and a disagreement with the position is refused. The fees always go to the **signing account**, so `--recipient` is not accepted on V4.

**V2 is refused.** A V2 pool's fees are real but not separable: they accrue into the LP token's value and come out with the liquidity. `--protocol V2` fails with `invalid_value`, saying so.

**A position owed nothing is refused.** The contract accepts a collection of zero and still charges the fee, so when the position is measured to be owed nothing on both sides, the command fails before anything is estimated or sent — in every mode, with `invalid_value`. A position owed dust on one side is a real collection and is sent. On V4, a position with **no liquidity** is refused even if the owed amount could not be read (`CannotUpdateEmptyPosition`). For a position with liquidity whose owed amount **could not be read**, the collection is sent anyway, and the receipt carries a warning instead of an amount.

Ownership is checked in the dry run **and again immediately before sending**. `--dry-run` needs no password and works for a watch-only account.

## Options

| Option | Description |
|---|---|
| `--protocol <V3\|V4>` | **Required** |
| `--position-id <id>` | **Required.** Must be held by this account |
| `--recipient <address>` | Who receives the fees; default the account (**V3 only**) |
| `--token0 <token>` / `--token1 <token>` | The position's pair, checked against what it holds; give both or neither (V4 only) |
| `--fee <n>` | The pool's fee tier, checked against the position's; needs `--token0` / `--token1` (V4 only) |
| `--deadline <timestamp>` | Unix seconds; default 30 minutes from now (V4 only) |
| `--fee-limit <sun>` | Maximum energy fee to burn, in SUN; default `100000000` |
| `--dry-run` | Validate and estimate only — no password, no signature, no broadcast |
| `--build-only` | Emit the unsigned transaction |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed |
| `--account <label\|accountId>` | Account holding the position; default the active account |
| `--password-stdin` | Master password from stdin; needed only by the modes that sign |

Plus the [global options](../index.md#global-options-every-command). `--recipient` applies to V3 only; `--token0` / `--token1`, `--fee` and `--deadline` to V4 only. A flag given for the other protocol is `invalid_option`.

## Examples

In the examples, `$PW` is your master password, fed on stdin via `--password-stdin`.

Collecting everything position #690 is owed. `Collected` is what the transaction's `Collect` event says arrived; `tokensAuto: true` in JSON means the pair was read from the position, not given:

```bash
echo "$PW" | wallet-cli sunswap collect-fees --protocol V3 --position-id 690 --wait --password-stdin --account led --network nile
```

```console
✅ Fees collected
  Account    TXo8GVA3ao...Dzs4QRPB (led)
  Protocol   V3
  Position   #690
  Collected  0.000004 USDT / 0.000699 WTRX
  Recipient  TXo8GVA3aopDpmQ6c28ZABBaApDzs4QRPB
  TxID       7e3a9c1f5d2b8e40a6c3f9d7b1e5a2c8d0f4b6e9a3c7d1f5b2e8a4c6d0f9b3e1
  Block      #71,637,105
  Energy     151,204
  Fee        8.11 TRX
  Status     success
```

```bash
echo "$PW" | wallet-cli sunswap collect-fees --protocol V3 --position-id 690 --wait --password-stdin --account led --network nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"sunswap.collect-fees","data":{"kind":"sunswap-collect-fees","account":"TXo8GVA3aopDpmQ6c28ZABBaApDzs4QRPB","protocol":"V3","positionManager":"TPQzqHbCzQfoVdAV6bLwGDos8Lk2UjXz2R","nftTokenId":"690","tokensAuto":true,"recipient":"TXo8GVA3aopDpmQ6c28ZABBaApDzs4QRPB","token0":{"address":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","symbol":"USDT","decimals":6,"amount":"4"},"token1":{"address":"TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a","symbol":"WTRX","decimals":6,"amount":"699"},"stage":"confirmed","txId":"7e3a9c1f5d2b8e40a6c3f9d7b1e5a2c8d0f4b6e9a3c7d1f5b2e8a4c6d0f9b3e1","confirmed":true,"blockNumber":71637105,"feeSun":8110000,"energyUsed":151204,"energyFeeSun":7765000,"netFeeSun":345000,"result":"SUCCESS","failed":false,"amountsEstimated":false},"meta":{"durationMs":11906,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

## Output

`kind` is `sunswap-collect-fees` in every mode.

| Field | Type | Meaning |
|---|---|---|
| `account` / `recipient` | string | Who holds the position, and who receives the fees |
| `protocol`, `nftTokenId` | string | The position |
| `positionManager` | string | The contract the collection goes through |
| `token0` / `token1` | object | `{address, symbol, decimals, amount}` — the fees owed (dry run), then collected (receipt), in base units |
| `tokensAuto` | boolean | The pair came from the position rather than from `--token0` / `--token1` |
| `poolId`, `feeTier`, `tickSpacing`, `hooks` | — | V4: the position's pool key |
| `fee` / `feeCovers` | — | The estimated network cost; always `feeCovers: "all"`, since nothing is approved |

The default mode returns at submission (`stage: "submitted"`, `txId`); `--wait` adds `stage: "confirmed"`, `confirmed`, `blockNumber`, `feeSun` (with its parts `energyUsed`, `energyFeeSun`, `netFeeSun`), `result` and `failed`.

## Exit status

`0` success (submitted, or built/estimated) · `1` execution failure (`position_not_found`, `watch_only_no_signer`, `auth_failed`, `transaction_rejected`, `tx_expired`) · `2` usage error (`missing_option` — no `--protocol` or `--position-id`; `invalid_value` — `V2` or another protocol, a position owed nothing, a position held by another account, a pair or fee that does not match the position; `invalid_option` — a flag outside its protocol, such as `--recipient` on V4; `invalid_address`; `unsupported_network_capability`; `family_mismatch`).

## See also

[`sunswap remove-liquidity`](remove-liquidity.md) · [`sunswap position-info`](position-info.md) · [`sunswap position-list`](position-list.md) · [machine-interface.md](../../machine-interface.md)
