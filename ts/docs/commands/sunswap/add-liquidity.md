# wallet-cli sunswap add-liquidity

Deposit both sides of a pair into a SunSwap pool.

## Synopsis

```
wallet-cli sunswap add-liquidity --protocol <V2|V3|V4>
                                 [--token0 <token> --token1 <token>] [--position-id <id>]
                                 [--amount0 <n>] [--amount1 <n>] [--min0 <n>] [--min1 <n>]
                                 [--fee <n>] [--tick-lower <n>] [--tick-upper <n>]
                                 [--tick-spacing <n>] [--hooks <address>] [--slippage <decimal>]
                                 [--create-pool --sqrt-price <Q64.96>]
                                 [--recipient <address>] [--deadline <timestamp>] [--fee-limit <sun>]
                                 [--dry-run | --build-only | --wait [--wait-timeout <ms>]] [options]
```

## Description

**V2** adds at the pool's current ratio and returns LP tokens. **V3** mints a position NFT over a price range, or adds to one you already hold with `--position-id`. **V4** also mints or adds to a position, but names its pool by its full key (below).

Works on **`tron` and `nile`**; on Shasta it fails with `unsupported_network_capability`, on an EVM network with `family_mismatch`.

**Give one amount and the other is derived** — from the pool's reserves on V2, from the range and the current price on V3 and V4. Give both to deposit exact amounts. A pool that holds nothing has no ratio to derive from, so the first deposit into one must name both sides.

**On V3 your TRX becomes WTRX.** V3 pools are wrapped. On V2 and V4, TRX is deposited natively and travels as the call's value.

**Approvals come first.** On V2 and V3, each token side is approved for **exactly the amount this deposit needs**; the approval is sent, confirmed and re-read before the deposit follows. The router consumes it, so a repeat deposit needs a fresh one. V4 is different — see [Approvals on V4](#approvals-on-v4). A TRX side never needs approving. If an approval went out and a later step failed, its ID is in `error.details.approvalTxIds` and the approval stays on chain.

**A new position's id exists only in the confirmed receipt.** The contract assigns it during execution, so pass `--wait` to learn it ([`position-list`](position-list.md) is mainnet only). Once you have it, [`position-info`](position-info.md) reads the position on either network.

**A V3 deposit that rounds to zero liquidity is refused.** The command checks the computed liquidity, not the pool's trading history, and fails with `invalid_value` before estimating or sending. At the minimum or maximum representable tick, the message identifies the pool's price-bound state; otherwise it asks for a wider range or a larger deposit.

**`--dry-run` validates everything** — balances, the pool, the amounts, the allowances — without a password, and works for a watch-only account. Until an approval is on chain the deposit itself cannot be simulated, so the dry run prices the approvals only (`Fee (est, approvals only)`, JSON `feeCovers: "approvals"`).

### The price range (V3 and V4)

`--tick-lower` / `--tick-upper` must each be a multiple of the pool's tick spacing; a tick you type is **checked**, never rounded. Omit both and the CLI chooses the current tick ± 100 spacings, marked `(default)` in text and `tickRangeAuto: true` in JSON. On V3 an omitted `--fee` defaults to `3000`, marked `feeAuto: true`.

Adding to an existing position with `--position-id` keeps its pair, fee tier, range and holder, so `--tick-lower`, `--tick-upper` and `--recipient` are refused alongside it. On V3, `--fee`, `--token0` and `--token1` are also refused; on V4, `--fee` is an optional check against the position's fee tier.

On V3, the receipt names `token0` / `token1` in the pool's on-chain order, which may differ from the order you typed; when adding to a position later, `--amount0` refers to the pool's `token0`.

### V4: a pool is named by its key

A V4 pool has no contract of its own — every pool lives inside one pool manager — so it is named by its five-part key:

```
--token0 <token> --token1 <token> --fee <n> --tick-spacing <n> [--hooks <address>]
```

**A new V4 position needs both `--fee` and `--tick-spacing`, with no defaults.** On V3 the spacing follows from the fee tier; on V4 it does not, and two pools of the same pair at the same fee can differ only in spacing — on Nile, TRX/USDT at fee 500 exists at spacing 10 and at spacing 33. Get the value from [`sunswap pool-list --protocol V4`](pool-list.md) (`extra.tickSpacing` and `extra.hooks` in its JSON). `--hooks` defaults to none, which is what almost every pool has. The dry run prints the resulting `Pool` id so you can check you named the pool you meant.

**Adding to a V4 position** takes `--position-id` **and** `--token0` / `--token1`. The position already names its pool; the tokens are checked against the pair it holds — **in the pool's own order** (its `currency0` / `currency1`, the order the dry run and `position-info` print) — and a mismatch or a reversed pair is refused with `invalid_value` rather than sent. If you swap the tokens round, swap `--amount0` / `--amount1` too. `--fee` is checked the same way when given; `--tick-spacing`, `--hooks`, the tick range, `--create-pool` and `--sqrt-price` are refused, since the position fixes them.

**Creating a pool**: add `--create-pool` and `--sqrt-price` (the starting price in Q64.96 fixed point, not a decimal ratio) to the key. The pool is initialised and the position minted in one transaction. A key that already names a live pool is refused with `pool_already_exists`; deposit into it without `--create-pool`.

**On V4 the bound is a ceiling, not a floor.** `--min0` / `--min1` are refused on V4. `--slippage` widens what the deposit may cost **upward**; with no `--slippage` the ceiling is exactly the computed amounts. On a native pair the ceiling is sent as the call's value and the remainder returned, so **the account must hold the ceiling**. (On [`remove-liquidity`](remove-liquidity.md), V4 `--slippage` works the other way.)

### Approvals on V4

The token side goes through Permit2 in two layers:

- The token's allowance **to Permit2** is **unlimited**. An existing allowance that covers the deposit is reused; otherwise an unlimited approval is sent first, shown as `Allowance  unlimited`.
- The **Permit2 grant** the deposit signs is for **exactly this deposit's ceiling** and lasts **one hour**. It travels inside the deposit's own transaction. JSON lists the grants under `permits[]`.

Because the deposit carries its signed grant, **`--build-only` is refused** on a V4 deposit that still needs one, and a dry run cannot price the deposit itself (`feeCovers` is `approvals` or `none`, with `feeUnavailableReason`). **Ledger** signs the grant by hash; see [TRON app settings](../../guide/ledger.md#tron-app-settings).

## Options

| Option | Description |
|---|---|
| `--protocol <V2\|V3\|V4>` | **Required** |
| `--token0 <token>` / `--token1 <token>` | The pair, symbol or contract address. Refused with `--position-id` on V3; **required** with it on V4, where they are checked against the position. A symbol resolves against the account's [token book](../token/index.md); one matching several entries is `ambiguous_token_symbol` |
| `--position-id <id>` | Add to this existing position; must be held by this account (V3 and V4) |
| `--amount0 <n>` / `--amount1 <n>` | Amounts in whole tokens. Give one, the other, or both |
| `--min0 <n>` / `--min1 <n>` | Least to accept depositing. Default: V2 95% of the computed amount, V3 `0`. **Refused on V4** |
| `--fee <n>` | Fee tier, e.g. `500` or `3000`. V3 new position: selects the pool, default `3000`. V4 new position: **required**. V4 increase: optional check |
| `--tick-lower <n>` / `--tick-upper <n>` | Price range; each a multiple of the pool's tick spacing (V3 and V4 new position only) |
| `--tick-spacing <n>` | **Required for a V4 new position**; no default |
| `--hooks <address>` | The pool's hook contract; default none (V4 only) |
| `--slippage <decimal>` | Tolerance on the deposit **ceiling**, e.g. `0.005`; default none (V4 only) |
| `--create-pool` | Create the pool as part of this deposit; requires `--sqrt-price` (V4 only) |
| `--sqrt-price <Q64.96>` | The new pool's starting price in Q64.96 fixed point (V4 `--create-pool` only) |
| `--recipient <address>` | Who receives the LP tokens or the position NFT; default the account. Not with `--position-id`: the position already has a holder |
| `--deadline <timestamp>` | Unix seconds; default 30 minutes from now. One already past is refused |
| `--fee-limit <sun>` | Maximum energy fee to burn, in SUN; default `100000000`. The estimate is a lower bound, so a limit set from it can fail |
| `--dry-run` | Validate and estimate only — no password, no signature, no broadcast |
| `--build-only` | Emit the unsigned transactions in execution order (`data.transactions[]` as `{purpose, tx, hex}` when there are approvals); they share a one-hour lifetime. Send each approval and wait for it to confirm before the deposit |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed |
| `--account <label\|accountId>` | Account to deposit from; default the active account |
| `--password-stdin` | Master password from stdin; needed only by the modes that sign |

Plus the [global options](../index.md#global-options-every-command). A flag outside its protocol or scenario is `invalid_option`, never silently ignored. `--sign-only` is not offered in this group.

## Examples

In the examples, `$PW` is your master password, fed on stdin via `--password-stdin`. All of them were broadcast on Nile. To check a deposit before sending it, add `--dry-run`: it needs no password and shows the approvals it would send.

**V2**, giving the USDT side. The TRX side is derived from the pool's ratio and deposited natively, so only USDT is approved — the approval is sent and confirmed before the deposit:

```bash
echo "$PW" | wallet-cli sunswap add-liquidity --protocol V2 --token0 USDT --token1 TRX --amount0 1 \
  --wait --password-stdin --network nile
```

```console
✅ Liquidity added
  Account        TMSgJxtPw2...UwbCToHJ (main)
  Protocol       V2
  Deposited      1 USDT / 0.693729 TRX
  LP received    <0.000001
  Recipient      TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ
  Pool reserves  8,920,609.853346 USDT / 6,188,486.743186 TRX
  Approval tx 1  845728d8b92fbd71ac780064595f084673207caa81bde6e0bceaf59c3c9efcdf
  TxID           1d21466d5e23f71e19303c665b7828a1d60502015c1bd861a552de0bc69f26ed
  Block          #71,636,642
  Energy         157,734
  Fee            16.2522 TRX
  Status         success
```

```bash
echo "$PW" | wallet-cli sunswap add-liquidity --protocol V2 --token0 USDT --token1 TRX --amount0 1 \
  --wait --password-stdin --network nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"sunswap.add-liquidity","data":{"kind":"sunswap-add-liquidity","account":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","protocol":"V2","router":"TMn1qrmYUMSTXo9babrJLzepKZoPC7M6Sy","lpDecimals":18,"recipient":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","token0":{"address":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","symbol":"USDT","decimals":6,"amount":"1000000"},"token1":{"address":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","symbol":"TRX","decimals":6,"amount":"693729"},"approvalTxIds":["8768dbecd9f0f1e75d18f62af6026239dff2446a65a871cf05f82ab10f7c6604"],"stage":"confirmed","txId":"29313870a17282f24e85207149d34029818845a732ffda579b6c457efb9207e2","confirmed":true,"blockNumber":71636650,"feeSun":13466100,"energyUsed":129873,"energyFeeSun":12987100,"netFeeSun":479000,"result":"SUCCESS","failed":false,"amountsEstimated":false,"lpAmount":"770874","reservesAfter":{"token0":"8920610853346","token1":"6188487436915"},"pool":"TKioHQsGLkaEWwBwkUB2T4Rm6nwGATtJyh"},"meta":{"durationMs":21616,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

`LP received  <0.000001` is not a rounding failure: a V2 LP token has 18 decimals while this pair's reserves have 6, so a one-token deposit mints a fraction far below display precision. The exact figure is `lpAmount`, with `lpDecimals` beside it — keep it for [`remove-liquidity`](remove-liquidity.md).

**V3**, a new position at fee 500 with the default range. Both sides are approved, exactly, and the position id is in the confirmed receipt:

```bash
echo "$PW" | wallet-cli sunswap add-liquidity --protocol V3 --token0 USDT --token1 WTRX --fee 500 --amount0 1 \
  --wait --password-stdin --network nile
```

```console
✅ Liquidity added
  Account        TMSgJxtPw2...UwbCToHJ (main)
  Protocol       V3
  Position       #701 (new)
  Fee tier       0.05%
  Tick range     [-3650, -1650]  (default)
  Deposited      1 USDT / 0.760632 WTRX
  Liquidity      17,883,571
  Recipient      TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ
  Approval tx 1  51ab05445286b730145e1d237bb2235e9a800c5df909ab9268b9de87ec0aae90
  Approval tx 2  a9be3340818a2286ca8d80c4b0b979bb6da7a0c5b1dd0a081ca4ca75f7bf0426
  TxID           72fee7dfa5e7988080c6b6de65ab10b2995af0b0996d2f0af5c06e3672f3bb87
  Block          #71,636,664
  Energy         370,547
  Fee            37.6896 TRX
  Status         success
```

```bash
echo "$PW" | wallet-cli sunswap add-liquidity --protocol V3 --token0 USDT --token1 WTRX --fee 500 --amount0 1 \
  --wait --password-stdin --network nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"sunswap.add-liquidity","data":{"kind":"sunswap-add-liquidity","account":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","protocol":"V3","positionManager":"TPQzqHbCzQfoVdAV6bLwGDos8Lk2UjXz2R","recipient":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","token0":{"address":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","symbol":"USDT","decimals":6,"amount":"1000000"},"token1":{"address":"TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a","symbol":"WTRX","decimals":6,"amount":"760632"},"nftTokenId":"702","newPosition":true,"feeTier":500,"tickLower":-3650,"tickUpper":-1650,"liquidity":"17883571","tickRangeAuto":true,"approvalTxIds":["8d93460aad695407ccaf742795e9c334acf86c740cdb211809a52854eda7b512","c8969e1b46501f3e8a29fc3d5bbc86895b6db4fb4c4205c92ecd47772b35f1b5"],"stage":"confirmed","txId":"89857a751304e864b42965263ae74826374c2a3609113f6fe187ac9cf8ff2e66","confirmed":true,"blockNumber":71636673,"feeSun":36189600,"energyUsed":355547,"energyFeeSun":35554600,"netFeeSun":635000,"result":"SUCCESS","failed":false,"amountsEstimated":false,"liquidityAfter":"17883571"},"meta":{"durationMs":25376,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

Adding to position #701 — the pair, fee and range come from the position. The earlier approvals were consumed, so fresh ones are sent:

```bash
echo "$PW" | wallet-cli sunswap add-liquidity --protocol V3 --position-id 701 --amount0 0.5 \
  --wait --password-stdin --network nile
```

```console
✅ Liquidity added
  Account        TMSgJxtPw2...UwbCToHJ (main)
  Protocol       V3
  Position       #701
  Fee tier       0.05%
  Tick range     [-3650, -1650]
  Deposited      0.5 USDT / 0.380316 WTRX
  Liquidity      8,941,785
  Recipient      TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ
  Approval tx 1  eec993a5b76f3d9b2569f1fb6a5e94a45ca28e1e08125b56c50927d9e2370d6d
  Approval tx 2  d55f5662d4e62d69692b554754fb860ede519861d6ef28b8f9d1c57cf31bd80f
  TxID           a5226421f294efd0a4f35b98681bf1f19a39b5aab2934c707a41ba74da947909
  Block          #71,636,686
  Energy         193,268
  Fee            19.8017 TRX
  Status         success
```

**V4**, a new position in the TRX/USDT pool at fee 500, spacing 10. This account's USDT allowance to Permit2 already covered the deposit, so no approval transaction was needed; the one-hour Permit2 grant was signed and travelled inside the deposit (`permits[]` in JSON):

```bash
echo "$PW" | wallet-cli sunswap add-liquidity --protocol V4 --token0 TRX --token1 USDT --fee 500 --tick-spacing 10 \
  --amount0 1 --wait --password-stdin --network nile
```

```console
✅ Liquidity added
  Account       TMSgJxtPw2...UwbCToHJ (main)
  Protocol      V4
  Position      #188
  Pool          977d6ad6be3a3206f7ca881434bb8a08ecaf1abe4690eed6ee23e3e7e0ae9b6a
  Fee tier      0.05%
  Tick spacing  10
  Hooks         none
  Range         [-11160, -9160]  (default)
  Deposited     1 TRX / 0.358483 USDT
  Liquidity     12,277,290
  Recipient     TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ
  TxID          7c03394283155b63f82b913de5fd762986f4a27a51e225124448f5aa181a354e
  Block         #71,636,692
  Energy        297,756
  Fee           31.8865 TRX
  Status        success
```

```bash
echo "$PW" | wallet-cli sunswap add-liquidity --protocol V4 --token0 TRX --token1 USDT --fee 500 --tick-spacing 10 \
  --amount0 1 --wait --password-stdin --network nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"sunswap.add-liquidity","data":{"kind":"sunswap-add-liquidity","account":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","protocol":"V4","recipient":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","deadline":1791441436,"token0":{"address":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","symbol":"TRX","decimals":6,"amount":"1000000"},"token1":{"address":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","decimals":6,"symbol":"USDT","amount":"358483"},"poolId":"977d6ad6be3a3206f7ca881434bb8a08ecaf1abe4690eed6ee23e3e7e0ae9b6a","feeTier":500,"tickSpacing":10,"hooks":"none","tickLower":-11160,"tickUpper":-9160,"liquidity":"12277290","newPosition":true,"tickRangeAuto":true,"permits":[{"token":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","amount":"358483","expiration":"1791443236"}],"positionManager":"TMTQ1BYo15aGgZXHcsBWXyae8bVaAdgfLP","stage":"confirmed","txId":"b3bac5b997d92b74d8bc748d979ec68061dc7a24b43016f7aa1eaa3c020c0d55","confirmed":true,"blockNumber":71636697,"feeSun":20819400,"energyUsed":187085,"energyFeeSun":18708400,"netFeeSun":2111000,"result":"SUCCESS","failed":false,"amountsEstimated":false,"nftTokenId":"189"},"meta":{"durationMs":13680,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

`Pool` is the id the key hashes to — the same id [`pool-list`](pool-list.md) and [`position-info`](position-info.md) print.

Adding to V4 position #188 with a 1% ceiling. The tokens are checked against the position's pair; the ceiling only bounds what the deposit may cost, and the receipt shows what it actually took:

```bash
echo "$PW" | wallet-cli sunswap add-liquidity --protocol V4 --position-id 188 --token0 TRX --token1 USDT \
  --amount0 1 --slippage 0.01 --wait --password-stdin --network nile
```

```console
✅ Liquidity added
  Account       TMSgJxtPw2...UwbCToHJ (main)
  Protocol      V4
  Position      #188
  Pool          977d6ad6be3a3206f7ca881434bb8a08ecaf1abe4690eed6ee23e3e7e0ae9b6a
  Fee tier      0.05%
  Tick spacing  10
  Hooks         none
  Range         [-11160, -9160]
  Deposited     1 TRX / 0.358483 USDT
  Liquidity     12,277,290
  Recipient     TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ
  TxID          5c53c990b1cb7fb1e6cc37ee9124406a26420b3c0c82a7433c2ad4c0f1afea84
  Block         #71,636,707
  Energy        125,275
  Fee           14.4144 TRX
  Status        success
```

## Output

`kind` is `sunswap-add-liquidity` in every mode.

| Field | Type | Meaning |
|---|---|---|
| `mode` | string | `dry-run` or `build-only`; absent once sent (`stage` instead) |
| `account` / `recipient` / `deadline` | string / string / number | Who deposits, who receives, and the deadline (Unix seconds) |
| `protocol` | string | `V2`, `V3` or `V4` |
| `token0` / `token1` | object | `{address, symbol, decimals, amount}` in base units, plus `amountMinimum` (V2 / V3) |
| `router` (V2) / `positionManager` (V3, V4) | string | The contract the deposit goes through |
| `lpAmountExpected` → `lpAmount`, `lpDecimals` | string / number | V2: LP tokens expected, then received |
| `pool`, `reservesAfter` | string / object | V2, once confirmed: the pair contract, and its reserves read back after the deposit |
| `newPosition`, `nftTokenId` | boolean / string | V3 / V4: whether a position is minted; its id (known in advance only when adding to one) |
| `feeTier`, `tickLower`, `tickUpper`, `tickRangeAuto`, `feeAuto` | — | V3 / V4: the pool tier (`500` = 0.05%) and range; the `*Auto` flags mark values the CLI chose |
| `liquidityExpected` → `liquidity`, `liquidityAfter` | string | V3 / V4: the position liquidity this deposit funds (expected, then actual), and the total afterwards. Not a token amount; carries no decimals |
| `poolId`, `tickSpacing`, `hooks` | string / number / string | V4: the pool key and the id it hashes to |
| `amount0Max` / `amount1Max`, `nativeLocked` | string | V4: the ceiling (only when `--slippage` raised it) and the TRX locked as the call's value |
| `poolCreated`, `initialSqrtPriceX96` | boolean / string | V4 with `--create-pool` |
| `approvals[]` | array | `{token, symbol, decimals, spender, amount, currentAllowance}` — the approvals to be sent first; `amount` is `"unlimited"` on V4 |
| `permits[]` | array | V4: `{token, amount, expiration}` — the Permit2 grants the deposit will sign |
| `fee` / `feeCovers` / `feeUnavailableReason` | — | The estimate and what it covers (`all`, `approvals` or `none`) |
| `approvalTxIds[]` | string[] | Once sent: the approvals, in the order sent, beside the deposit's own `txId` |
| `amountsEstimated` | boolean | Once sent: `false` when amounts were read from this transaction's receipt, `true` when they are still the pre-transaction estimate (text then labels them `(est)`) |

`fee` is always the estimated network cost; the V3 / V4 pool tier is the separate key `feeTier`. The default mode returns at submission (`stage: "submitted"`, `txId`); `--wait` adds `stage: "confirmed"`, `confirmed`, `blockNumber`, `feeSun` (with its parts `energyUsed`, `energyFeeSun`, `netFeeSun`), `result` and `failed`.

## Exit status

`0` success (submitted, or built/estimated) · `1` execution failure (`insufficient_balance`, `insufficient_token_balance`, `pool_not_found` — no pool for that pair to size a one-sided deposit against, `pool_already_exists` — `--create-pool` on a live pool, `position_not_found`, `same_token`, `watch_only_no_signer`, `auth_failed`, `transaction_rejected`, `tx_expired`) · `2` usage error (`missing_option` — no `--protocol`, or no `--fee` / `--tick-spacing` for a new V4 position; `invalid_option` — a flag outside its protocol or scenario, such as `--min0` on V4, or `--recipient` with `--position-id`, or `--fee` with `--position-id` on V3; `invalid_value` — a V3 deposit that rounds to zero liquidity, a position held by another account, V4 tokens that do not match the position's pair in its order, a tick off the spacing grid, a past `--deadline`; `invalid_amount`; `invalid_address`; `unsupported_token`, `ambiguous_token_symbol`; `unsupported_network_capability`; `family_mismatch`).

## See also

[`sunswap remove-liquidity`](remove-liquidity.md) · [`sunswap collect-fees`](collect-fees.md) · [`sunswap position-info`](position-info.md) · [`sunswap pool-list`](pool-list.md) · [machine-interface.md](../../machine-interface.md)
