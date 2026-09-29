# wallet-cli sunswap remove-liquidity

Take liquidity back out of a SunSwap pool.

## Synopsis

```
wallet-cli sunswap remove-liquidity --protocol <V2|V3|V4> --liquidity <n>
                                    [--token0 <token> --token1 <token>] [--position-id <id>]
                                    [--fee <n>] [--min0 <n>] [--min1 <n>] [--slippage <decimal>]
                                    [--recipient <address>] [--deadline <timestamp>]
                                    [--fee-limit <sun>]
                                    [--dry-run | --build-only | --wait [--wait-timeout <ms>]]
```

## Description

**V2** burns LP tokens and returns both sides at the pool's current ratio. **V3** and **V4** withdraw from a position you hold.

The two are not mirror images of adding, and the differences matter:

- **V2 approves the LP token**, for exactly the amount being burned — not the pair's two tokens, which the pool already holds.
- **V3 and V4 approve nothing.** The position manager already holds the NFT.
- **V3 and V4 are one transaction each**, and both pay the position's accrued fees out with the principal. See below.

`--dry-run` validates everything — the position, the balance, the amounts — without a password, and works for a watch-only account.

## `--liquidity` means two different things

| Protocol | What `--liquidity` is | Where to find the current value |
|---|---|---|
| V2 | **LP tokens to burn**, in whole tokens, like any other token amount | The LP token balance of the pair contract |
| V3 and V4 | **The position's internal liquidity** — not a token amount, and not scaled by anything | The `Liquidity` row of [`position-info`](position-info.md) or of an [`add-liquidity`](add-liquidity.md) receipt |

Getting this wrong is silent, which is why help says it too. A V3 or V4 position's liquidity is a number the contract keeps; it has no decimals and is not denominated in either token.

### A real V2 LP balance is very small

An LP token carries 18 decimals while a stablecoin pair's reserves carry 6, so the LP supply of such a pool lives around 1e12 base units — about 0.000001 LP — and one provider's share of it is smaller still. A measured example: an account holding both sides of a one-token deposit twice over held **1,533,269 base units**, which is `0.000000000001533269` LP.

So `--liquidity 0.5` on such a pool is correctly refused as more than you hold, and a real withdrawal of half that balance reads:

```bash
wallet-cli sunswap remove-liquidity --protocol V2 --token0 USDT --token1 WTRX \
  --liquidity 0.000000000000766634 --wait --password-stdin --network nile
```

It is unpleasant to type and it is the honest value. The command does not accept a base-unit or percentage form today.

## V3 and V4 pay out the principal and the fees together

On both, a withdrawal also pays out **every fee the position has accrued**, in the same transaction. **More arrives than the principal the estimate quotes**, and on an older position the fees can be most of it: measured on Nile, one V4 withdrawal paid `324` TRX base units of principal and `6425` of fees — 95% of what arrived was fees.

**V3** gets there by construction. `decreaseLiquidity` on its own only credits the position's owed balances — **it transfers nothing**, so sent alone you would see a successful transaction and receive no tokens. The command sends a position-manager `multicall` carrying `decreaseLiquidity` followed by `collect`, as one transaction. The V3 dry run warns:

```
⚠️ Any fees this position has accrued are collected in the same transaction, so more may
   arrive than the estimate above.
```

**V4** gets there because its `decreaseLiquidity` settles the pair itself, principal and accrued fees alike, in a single call. The V4 dry run does not print that warning, but the same thing happens.

The receipt's `Received` line is the **total**, because that is the number a person is checking. JSON splits it: `amount` is the principal, `feeAmount` is the fees paid out alongside. The two protocols arrive at the split differently:

- **V3** reads the owed fees with a static call **before** sending and subtracts them from what the transaction's `Collect` event says arrived.
- **V4** emits no event this CLI decodes, so `amount` is the principal the plan computed and `feeAmount` is what the position was owed just before sending. `feeAmount` is a **lower bound**: the pool can accrue more between that read and the block.

On both, when the owed-fees read fails, there is no `feeAmount` rather than a split invented from nothing.

If you want the fees **without** touching the principal, use [`sunswap collect-fees`](collect-fees.md).

## V4 names the pool twice, on purpose

A V4 withdrawal needs **both** `--position-id` and `--token0` / `--token1`. The position chooses the pool; the tokens select nothing and are checked against the pair the position holds, so a withdrawal from a position you did not mean is refused rather than sent. `--fee` is an optional check of the same kind.

The tokens always go to the **signing account**: `--recipient` is not accepted on V4.

`--min0` / `--min1` are floors, defaulting to `0`. `--slippage` lowers the computed floors further and cannot be combined with them. That is the **opposite** direction to `--slippage` on a V4 [`add-liquidity`](add-liquidity.md), where it raises a ceiling.

## Options

| Option | Description |
|---|---|
| `--protocol <V2\|V3\|V4>` | **Required** |
| `--liquidity <n>` | **Required.** See the table above — it means different things per protocol |
| `--token0 <token>` / `--token1 <token>` | **Required on V2**, where they name the pool; **required on V4**, where they are checked against the position; refused on V3 |
| `--position-id <id>` | **Required on V3 and V4**; refused on V2, where a pool has no positions. Must be held by this account |
| `--fee <n>` | The pool's fee tier, checked against the one the position reports; it selects nothing (V4 only) |
| `--min0 <n>` / `--min1 <n>` | Least to accept back. Default: V2 95% of the expected amount, V3 and V4 `0` |
| `--slippage <decimal>` | Tolerance **below** the computed minimums, e.g. `0.005`; not combinable with `--min0` / `--min1` (V4 only) |
| `--recipient <address>` | Who receives the tokens; default the account. On V3 the collected fees go here too. **Not accepted on V4** |
| `--deadline <timestamp>` | Unix seconds; default 30 minutes from submission |
| `--fee-limit <sun>` | Max energy fee to burn; default `100000000`. The dry run's estimate is a **lower bound**, so a limit set from it can fail |
| `--dry-run` / `--build-only` / `--wait` | See [machine-interface.md](../../machine-interface.md) |

`--sign-only` is not offered in this group.

Ownership is checked in the dry run **and again immediately before sending** — a dry run can be minutes old, and a position that changed hands in between must not be decreased on your behalf.

## Examples

```bash
wallet-cli sunswap remove-liquidity --protocol V3 --position-id 686 --liquidity 1000 \
  --dry-run --network nile
```

```console
⏳ Dry run sunswap remove-liquidity
  Account           TNmoJ3Be59...iL3G8HVB (nile)
  Protocol          V3
  Position          #686
  Liquidity burned  1,000
  Received (est)    0.000069 USDT / 0.000034 WTRX
  Min received      0 USDT / 0 WTRX
  Recipient         TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB
  Deadline          2026-09-23 19:33:10 UTC
  Fee (est)         ~296,972 energy

⚠️ No minimum set — this transaction accepts any output amount.

⚠️ Any fees this position has accrued are collected in the same transaction, so more may arrive than the estimate above.
```

```bash
wallet-cli sunswap remove-liquidity --protocol V4 --position-id 7 --token0 TRX --token1 USDT \
  --liquidity 1000 --dry-run --account demo --network nile
```

```console
⏳ Dry run sunswap remove-liquidity
  Account           TNmoJ3Be59...iL3G8HVB (demo)
  Protocol          V4
  Pool              977d6ad6be3a3206f7ca881434bb8a08ecaf1abe4690eed6ee23e3e7e0ae9b6a
  Fee tier          0.05%
  Tick spacing      10
  Hooks             none
  Range             [-887270, 887270]
  Position          #7
  Liquidity burned  1,000
  Received (est)    0.00166 TRX / 0.000602 USDT
  Min received      0 TRX / 0 USDT
  Recipient         TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB
  Deadline          2026-09-29 08:52:40 UTC
  Fee (est)         ~86,431 energy

⚠️ No minimum set — this transaction accepts any output amount.
```

`Received (est)` is the principal only. Any fees the position is owed arrive with it.

```bash
wallet-cli sunswap remove-liquidity --protocol V2 --token0 USDT --token1 WTRX \
  --liquidity 0.000000000000766634 --wait --password-stdin --network nile
```

```console
✅ Liquidity removed
  Account        TNmoJ3Be59...iL3G8HVB (nile)
  Protocol       V2
  LP burned      <0.000001
  Received       0.999957 USDT / 0.686127 WTRX
  Recipient      TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB
  Pool reserves  8,970,648.409085 USDT / 6,155,266.472591 WTRX
  Approval tx 1  e508eb5e8a1a8552c6522c8ac3ea36cdbd15be4e93abed6e722eb43e4e44564a
  TxID           3b233b0064bba6ee6622d1a4ece471a1db27154fc89aa4e9459a8351814f8669
  Block          #71,221,683
  Energy         129,157
  Fee            13.4227 TRX
  Status         success
```

## Reading the JSON

`kind` is `sunswap-remove-liquidity` in every mode.

- `lpAmount` — LP tokens burned, base units, with `lpDecimals` beside it (V2).
- `liquidity` — the position liquidity burned; `liquidityAfter` is what the position holds now, read back after confirmation (V3 and V4). Neither carries decimals, because a position's liquidity is not a token amount.
- `token0` / `token1` — `{address, symbol, decimals, amount}`. Before the transaction, `amount` is what the current reserves say is coming back. Afterwards, on V2 and V3, it is what actually arrived — from the recipient's balances on V2 and from the `Collect` event on V3 — with `feeAmount` beside it on V3. On V4, `amount` is the planned principal and `feeAmount` the fees owed just before sending, as described above.
- `poolId`, `feeTier`, `tickSpacing`, `hooks`, `tickLower`, `tickUpper` — the position's pool key and range (V4).
- `reservesAfter` — the pool read back after confirmation (V2).
- `fee` and `feeCovers` — the estimated cost and what it covers, as in [`add-liquidity`](add-liquidity.md).

## See also

[`sunswap add-liquidity`](add-liquidity.md) · [`sunswap collect-fees`](collect-fees.md) · [`sunswap position-info`](position-info.md) · [machine-interface.md](../../machine-interface.md)
