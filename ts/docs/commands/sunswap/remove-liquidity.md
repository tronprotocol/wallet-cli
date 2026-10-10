# wallet-cli sunswap remove-liquidity

Take liquidity back out of a SunSwap pool or position.

## Synopsis

```
wallet-cli sunswap remove-liquidity --protocol <V2|V3|V4> --liquidity <n>
                                    [--token0 <token> --token1 <token>] [--position-id <id>]
                                    [--fee <n>] [--min0 <n>] [--min1 <n>] [--slippage <decimal>]
                                    [--recipient <address>] [--deadline <timestamp>] [--fee-limit <sun>]
                                    [--dry-run | --build-only | --wait [--wait-timeout <ms>]] [options]
```

## Description

**V2** burns LP tokens and returns both sides at the pool's current ratio. **V3** and **V4** withdraw from a position you hold.

Works on **`tron` and `nile`**; on Shasta it fails with `unsupported_network_capability`, on an EVM network with `family_mismatch`.

It is not a mirror image of adding:

- **V2 approves the LP token**, for exactly the amount being burned, before the withdrawal. If the approval went out and the withdrawal then failed, its ID is in `error.details.approvalTxIds`.
- **V3 and V4 approve nothing** — the position manager already holds the NFT — and are one transaction each.

`--dry-run` validates everything — the position, the balance, the amounts — without a password, and works for a watch-only account. Ownership is checked in the dry run **and again immediately before sending**.

### `--liquidity` means two different things

| Protocol | What `--liquidity` is | Where to find the current value |
|---|---|---|
| V2 | **LP tokens to burn**, in whole tokens | The LP token balance |
| V3 and V4 | **The position's internal liquidity** — not a token amount, and not scaled by anything | The `Liquidity` row of [`position-info`](position-info.md) or of an [`add-liquidity`](add-liquidity.md) receipt |

**A real V2 LP balance is very small.** An LP token carries 18 decimals while a stablecoin pair's reserves carry 6, so one provider's share is typically far below `0.000001` LP — `--liquidity 0.000000000000770874` is an ordinary value. Asking for more than you hold fails with `insufficient_token_balance` (V2) or `invalid_amount` (V3 / V4).

### V3 and V4 pay out the fees too

A V3 or V4 withdrawal also pays out **every fee the position has accrued**, in the same transaction, so more arrives than the principal the estimate quotes — on an older position, the fees can be most of it. The dry run warns about this. In the confirmed receipt, `Received` is the total; JSON splits it into `amount` (principal) and `feeAmount` (fees), and V4 adds `receivedAmount`, the net amount that actually reached you.

To take the fees **without** touching the principal, use [`sunswap collect-fees`](collect-fees.md).

### V4 names the pool twice, on purpose

A V4 withdrawal needs **both** `--position-id` and `--token0` / `--token1`. The position chooses the pool; the tokens are checked against the pair it holds — in the pool's own `currency0` / `currency1` order, so a reversed pair is refused too (if you swap them round, swap `--min0` / `--min1` as well) — and a withdrawal from a position you did not mean is refused. `--fee` is an optional check of the same kind. The tokens always go to the **signing account**: `--recipient` is not accepted on V4.

`--min0` / `--min1` are floors, defaulting to `0` on V3 and V4 (the dry run then warns that any output is accepted). On V4, `--slippage` lowers them: each `--min0` / `--min1` you give is lowered by that tolerance, and a side you give no minimum for gets the estimated amount lowered by it — so `--min0 0.05 --slippage 0.01` floors token0 at 0.0495 and token1 at 99% of its estimate. That is the **opposite** direction to `--slippage` on a V4 [`add-liquidity`](add-liquidity.md), where it raises a ceiling.

## Options

| Option | Description |
|---|---|
| `--protocol <V2\|V3\|V4>` | **Required** |
| `--liquidity <n>` | **Required.** See the table above |
| `--token0 <token>` / `--token1 <token>` | **Required on V2**, where they name the pool; **required on V4**, where they are checked against the position; refused on V3 |
| `--position-id <id>` | **Required on V3 and V4**; refused on V2. Must be held by this account |
| `--fee <n>` | The pool's fee tier, checked against the position's (V4 only) |
| `--min0 <n>` / `--min1 <n>` | Least to accept back. Default: V2 95% of the expected amount, V3 and V4 `0` — on V4 with `--slippage`, the estimate lowered by it |
| `--slippage <decimal>` | Tolerance **below** `--min0` / `--min1`, or below the estimated amount for a side without one, e.g. `0.005` (V4 only) |
| `--recipient <address>` | Who receives the tokens; default the account. On V3 the fees go here too. **Refused on V4** |
| `--deadline <timestamp>` | Unix seconds; default 30 minutes from now |
| `--fee-limit <sun>` | Maximum energy fee to burn, in SUN; default `100000000` |
| `--dry-run` | Validate and estimate only — no password, no signature, no broadcast |
| `--build-only` | Emit the unsigned transactions in execution order |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed |
| `--account <label\|accountId>` | Account to withdraw for; default the active account |
| `--password-stdin` | Master password from stdin; needed only by the modes that sign |

Plus the [global options](../index.md#global-options-every-command). `--sign-only` is not offered in this group.

## Examples

In the examples, `$PW` is your master password, fed on stdin via `--password-stdin`. All of them were broadcast on Nile. To check a withdrawal before sending it, add `--dry-run`: it needs no password and shows what is expected back.

**V3**, burning 1,000,000 units of position #701's liquidity — one transaction, no approval. `Received` includes any fees the position had accrued (none yet here, so `feeAmount` is `0`):

```bash
echo "$PW" | wallet-cli sunswap remove-liquidity --protocol V3 --position-id 701 --liquidity 1000000 \
  --wait --password-stdin --network nile
```

```console
✅ Liquidity removed
  Account           TMSgJxtPw2...UwbCToHJ (main)
  Protocol          V3
  Position          #701
  Liquidity burned  1,000,000
  Liquidity now     25,825,356
  Received          0.055917 USDT / 0.042532 WTRX
  Recipient         TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ
  TxID              989ac94eac5f4842f8bff89990e56c4e9d80e855f65941142bcc2d04fe910b87
  Block             #71,636,712
  Energy            296,797
  Fee               30.5066 TRX
  Status            success
```

```bash
echo "$PW" | wallet-cli sunswap remove-liquidity --protocol V3 --position-id 702 --liquidity 1000000 \
  --wait --password-stdin --network nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"sunswap.remove-liquidity","data":{"kind":"sunswap-remove-liquidity","account":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","protocol":"V3","positionManager":"TPQzqHbCzQfoVdAV6bLwGDos8Lk2UjXz2R","nftTokenId":"702","liquidity":"1000000","recipient":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","token0":{"address":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","symbol":"USDT","decimals":6,"amount":"55917","feeAmount":"0"},"token1":{"address":"TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a","symbol":"WTRX","decimals":6,"amount":"42532","feeAmount":"0"},"stage":"confirmed","txId":"110ac4aa0de576d58f7ddcca0a24b46d23783d80d30089ecdcaa0046cdb42e02","confirmed":true,"blockNumber":71636717,"feeSun":30506600,"energyUsed":296797,"energyFeeSun":29679600,"netFeeSun":827000,"result":"SUCCESS","failed":false,"amountsEstimated":false,"liquidityAfter":"16883571"},"meta":{"durationMs":12819,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

**V4**, naming the pair as a check on position #188. JSON adds `receivedAmount`, the net amount that reached the account:

```bash
echo "$PW" | wallet-cli sunswap remove-liquidity --protocol V4 --position-id 188 --token0 TRX --token1 USDT \
  --liquidity 1000000 --wait --password-stdin --network nile
```

```console
✅ Liquidity removed
  Account           TMSgJxtPw2...UwbCToHJ (main)
  Protocol          V4
  Pool              977d6ad6be3a3206f7ca881434bb8a08ecaf1abe4690eed6ee23e3e7e0ae9b6a
  Fee tier          0.05%
  Tick spacing      10
  Hooks             none
  Range             [-11160, -9160]
  Position          #188
  Liquidity burned  1,000,000
  Liquidity now     23,554,580
  Received          0.081451 TRX / 0.029198 USDT
  Recipient         TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ
  TxID              9978d4d8f302defafbc78b2d1d3ed1495abdb746b7b9d9f8a7c2bd4c6cbe34e7
  Block             #71,636,728
  Energy            85,868
  Fee               9.5417 TRX
  Status            success
```

```bash
echo "$PW" | wallet-cli sunswap remove-liquidity --protocol V4 --position-id 189 --token0 TRX --token1 USDT \
  --liquidity 1000000 --wait --password-stdin --network nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"sunswap.remove-liquidity","data":{"kind":"sunswap-remove-liquidity","account":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","protocol":"V4","recipient":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","deadline":1791441544,"nftTokenId":"189","liquidity":"1000000","token0":{"address":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","symbol":"TRX","decimals":6,"amount":"81451","feeAmount":"0","receivedAmount":"81451"},"token1":{"address":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","symbol":"USDT","decimals":6,"amount":"29198","feeAmount":"0","receivedAmount":"29198"},"poolId":"977d6ad6be3a3206f7ca881434bb8a08ecaf1abe4690eed6ee23e3e7e0ae9b6a","feeTier":500,"tickSpacing":10,"hooks":"none","tickLower":-11160,"tickUpper":-9160,"positionManager":"TMTQ1BYo15aGgZXHcsBWXyae8bVaAdgfLP","stage":"confirmed","txId":"07d11ba027d860f61656439dc97efb7900ec75c931569d7f54c6ae08ac75e7e5","confirmed":true,"blockNumber":71636733,"feeSun":9541700,"energyUsed":85868,"energyFeeSun":8586700,"netFeeSun":955000,"result":"SUCCESS","failed":false,"amountsEstimated":false,"liquidityAfter":"11277290"},"meta":{"durationMs":14166,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

**V2**, burning the LP tokens one [`add-liquidity`](add-liquidity.md) deposit minted (`lpAmount` 770874 at 18 decimals). The LP token is approved first:

```bash
echo "$PW" | wallet-cli sunswap remove-liquidity --protocol V2 --token0 USDT --token1 TRX \
  --liquidity 0.000000000000770874 --wait --password-stdin --network nile
```

```console
✅ Liquidity removed
  Account        TMSgJxtPw2...UwbCToHJ (main)
  Protocol       V2
  LP burned      <0.000001
  Received       0.999999 USDT / 0.693728 TRX
  Recipient      TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ
  Pool reserves  8,920,609.853347 USDT / 6,188,486.743187 TRX
  Approval tx 1  e2769cd5c6c61c916cb98d7b22d3a0c5c3ea00deb9f278351a78a3e990103778
  TxID           7b03c8265a91332f49d5b09c02de4a0b12b054075d1e23b28d716290f37ebaff
  Block          #71,636,740
  Energy         195,987
  Fee            20.0736 TRX
  Status         success
```

```bash
echo "$PW" | wallet-cli sunswap remove-liquidity --protocol V2 --token0 USDT --token1 TRX \
  --liquidity 0.000000000000770874 --wait --password-stdin --network nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"sunswap.remove-liquidity","data":{"kind":"sunswap-remove-liquidity","account":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","protocol":"V2","router":"TMn1qrmYUMSTXo9babrJLzepKZoPC7M6Sy","recipient":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","lpAmount":"770874","lpDecimals":18,"token0":{"address":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","symbol":"USDT","decimals":6,"amount":"999999"},"token1":{"address":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","symbol":"TRX","decimals":6,"amount":"693728"},"approvalTxIds":["e061d881aa560ce802e10e203c834f6c11da82d6498f7b6c0ca0067529c1757a"],"stage":"confirmed","txId":"7dbf85fc0927522eb150564a06dd3bcdd18b22be5ab28911a120692e5d68f840","confirmed":true,"blockNumber":71636747,"feeSun":20073600,"energyUsed":195987,"energyFeeSun":19598600,"netFeeSun":475000,"result":"SUCCESS","failed":false,"amountsEstimated":false,"reservesAfter":{"token0":"8920608853348","token1":"6188486049459"}},"meta":{"durationMs":21567,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

## Output

`kind` is `sunswap-remove-liquidity` in every mode.

| Field | Type | Meaning |
|---|---|---|
| `account` / `recipient` / `deadline` | — | As in [`add-liquidity`](add-liquidity.md#output) |
| `lpAmount` / `lpDecimals` | string / number | V2: LP tokens burned, base units |
| `nftTokenId`, `liquidity` | string | V3 / V4: the position and the liquidity burned; after confirmation, `liquidityAfter` is what it still holds. No decimals |
| `token0` / `token1` | object | `{address, symbol, decimals, amount, amountMinimum}`. Before sending, `amount` is what current reserves say is coming back; once confirmed, what arrived — with `feeAmount` beside it on V3 / V4, and `receivedAmount` on V4 |
| `poolId`, `feeTier`, `tickSpacing`, `hooks`, `tickLower`, `tickUpper` | — | V4: the position's pool key and range |
| `router` (V2) / `positionManager` (V3, V4) | string | The contract the withdrawal goes through |
| `approvals[]` | array | V2: the LP-token approval to be sent first |
| `reservesAfter` | object | V2, once confirmed: the pool read back |
| `fee` / `feeCovers` | — | The estimate and what it covers |
| `approvalTxIds[]`, `amountsEstimated` | — | Once sent, as in [`add-liquidity`](add-liquidity.md#output) |

The default mode returns at submission (`stage: "submitted"`, `txId`); `--wait` adds `stage: "confirmed"`, `confirmed`, `blockNumber`, `feeSun` (with its parts `energyUsed`, `energyFeeSun`, `netFeeSun`), `result` and `failed`.

## Exit status

`0` success (submitted, or built/estimated) · `1` execution failure (`insufficient_token_balance` — more LP than held (V2), `position_not_found`, `watch_only_no_signer`, `auth_failed`, `transaction_rejected`, `tx_expired`) · `2` usage error (`missing_option` — no `--protocol` or `--liquidity`, or the flags the protocol needs; `invalid_option` — a flag outside its protocol, such as `--recipient` on V4 or `--position-id` on V2; `invalid_amount` — more position liquidity than held (V3 / V4); `invalid_value` — a position held by another account, a pair that does not match the position (V4: in its order), a past `--deadline`; `invalid_address`; `unsupported_token`, `ambiguous_token_symbol`; `unsupported_network_capability`; `family_mismatch`).

## See also

[`sunswap add-liquidity`](add-liquidity.md) · [`sunswap collect-fees`](collect-fees.md) · [`sunswap position-info`](position-info.md) · [machine-interface.md](../../machine-interface.md)
