# wallet-cli sunswap add-liquidity

Deposit both sides of a pair into a SunSwap pool.

## Synopsis

```
wallet-cli sunswap add-liquidity --protocol <V2|V3|V4> [--token0 <token> --token1 <token>]
                                 [--position-id <id>] [--amount0 <n>] [--amount1 <n>]
                                 [--min0 <n>] [--min1 <n>] [--fee <n>]
                                 [--tick-lower <n>] [--tick-upper <n>]
                                 [--tick-spacing <n>] [--hooks <address>] [--slippage <decimal>]
                                 [--create-pool --sqrt-price <Q64.96>]
                                 [--recipient <address>] [--deadline <timestamp>]
                                 [--fee-limit <sun>]
                                 [--dry-run | --build-only | --wait [--wait-timeout <ms>]]
```

## Description

**V2** adds at the pool's current ratio and returns LP tokens. **V3** mints a position NFT over a price range, or adds to one you already hold with `--position-id` — which fixes the pair, the fee tier, the range and the holder, so those flags and `--recipient` are refused alongside it. **V4** also mints or adds to a position, but names its pool by the full pool key, and an increase takes the pair as well as `--position-id`; see [V4 below](#v4-a-pool-is-named-by-its-key).

Give one amount and the other is derived — from the pool's reserves on V2, from the range and the current price on V3 and V4. Give both to deposit exact amounts. A pool that holds nothing has no ratio to derive from, so the first deposit into one must name both sides.

**On V3 your TRX becomes WTRX.** V3 pools are wrapped. On V2, TRX is deposited natively through `addLiquidityETH` and only the other side is approved. On V4, TRX is native again and travels as the call's value. Three protocols, three answers, and V3 is the one where what you typed is not what the pool receives.

On V2 and V3, each side is approved for **exactly the amount this deposit needs**, never an unbounded allowance. The approval is sent, confirmed, and the allowance re-read from the chain before the deposit follows — the two can never land out of order, and a token whose `approve` caps or refuses what it grants is caught before the deposit reverts for a reason the receipt could not explain.

`--dry-run` validates everything — balances, the pool, the amounts, the allowances — without a password, and works for a watch-only account.

**A new position's NFT id exists only in the confirmed receipt.** The manager assigns it during execution, so pass `--wait` to learn it; [`sunswap position-list`](position-list.md) is mainnet-only and cannot tell you afterwards on Nile. Once you have the id, [`sunswap position-info`](position-info.md) reads the position on either network.

## Two things about the fee estimate

**The estimate is a lower bound.** TRON prices a contract call by simulating it against current state, and the real execution writes storage the simulation does not. A measured example from Nile: a deposit estimated at 107,565 energy burned 120,426. That is true of every estimating command in this CLI, not something this one introduces, and it is why `--fee-limit` defaults to a constant (100000000 SUN) and is **never derived from the estimate** — a limit set from a lower bound can fail.

**A deposit that needs approvals cannot have its own fee estimated in advance.** The estimate is a simulation, and before the allowance is on chain the router cannot pull the tokens, so simulating the deposit reverts. Rather than fail, the dry run prices the approvals alone and says so:

```
  Fee (est, approvals only)  ~45,105 energy
⚠️ The deposit's own fee cannot be estimated until the approval is on-chain.
```

JSON carries `feeCovers: "approvals"` beside `fee`, so a script can tell the two states apart without reading English. When the allowances already suffice it is `feeCovers: "all"` and the deposit is priced for real.

Note the interaction with exact-amount approvals: the router consumes the allowance it was granted, so a **repeat deposit needs fresh approvals just like the first one**. `feeCovers: "all"` is reached only when a larger allowance already exists from somewhere else — a bigger earlier deposit, or one granted by hand.

## Options

| Option | Description |
|---|---|
| `--protocol <V2\|V3\|V4>` | **Required** |
| `--token0 <token>` / `--token1 <token>` | The pair, symbol or contract address. Not accepted with `--position-id` on V3; **required** with it on V4, where they select nothing and are checked against the pair the position holds. A symbol resolves against the official address book plus the [`token add`](../token/add.md) entries of the account the command uses (`--account`, else the active account); a symbol matching more than one entry is `ambiguous_token_symbol` (exit 2), and one marked `(from your token book)` in text came from that account's own entries |
| `--position-id <id>` | Add to this existing position; must be held by this account (V3 and V4) |
| `--amount0 <n>` / `--amount1 <n>` | Amounts in whole tokens. Give one, the other, or both |
| `--min0 <n>` / `--min1 <n>` | Least to accept depositing. Default: V2 95% of the computed amount, V3 `0`. **Not accepted on V4**, which bounds from above — see `--slippage` |
| `--fee <n>` | Fee tier, e.g. `500` or `3000`. Selects the pool on a V3 new position (default `3000`); **required with no default for a V4 new position**; on a V4 increase, optional and checked against the position's own |
| `--tick-lower <n>` / `--tick-upper <n>` | Price range; each a multiple of the pool's tick spacing (V3 and V4 new position only) |
| `--tick-spacing <n>` | **Required for a V4 new position, no default.** The pool's tick spacing — part of its identity. See below |
| `--hooks <address>` | The pool's hook contract; default none, which is what almost every pool has (V4 only) |
| `--slippage <decimal>` | Tolerance on the deposit **ceiling**, e.g. `0.005`; default none, so the ceiling is exactly the computed amounts (V4 only) |
| `--create-pool` | Create the pool as part of this deposit; requires `--sqrt-price` on top of the pool key (V4 only) |
| `--sqrt-price <Q64.96>` | The new pool's starting price in Q64.96 fixed point, **not** a decimal ratio (V4 `--create-pool` only) |
| `--recipient <address>` | Who receives the LP tokens or the position NFT; default the account. Not with `--position-id`: the position already has a holder. A malformed TRON address (an EVM `0x` address included) is `invalid_address` (exit 2), refused before any network call |
| `--deadline <timestamp>` | Unix seconds; default 30 minutes from submission. One already past is refused |
| `--fee-limit <sun>` | Max energy fee to burn; default `100000000`. See the note above |
| `--dry-run` / `--build-only` / `--wait` | See [machine-interface.md](../../machine-interface.md) |

`--sign-only` is **not offered** anywhere in this group: a flow of several transactions cannot guarantee offline what order its parts land in, or that the allowance is there when the deposit is.

A flag outside its scenario is `invalid_option`, not silently ignored. Dropping `--fee` would deposit at a tier you did not choose; dropping `--tick-lower` on an increase would suggest a position's range can be changed, which it cannot.

## The price range, on V3 and V4

A tick you type is **checked** against the pool's tick-spacing grid, never rounded onto it. A range is a price opinion, and moving a boundary by one spacing changes what the position earns. Only a range the CLI chose is aligned — the current tick ± 100 spacings — and the receipt marks it `tickRangeAuto: true` so our choice is never mistaken for yours. The same holds for `feeAuto` when `--fee` was omitted.

A pool that was **initialised and never traded** has no price: its tick sits at the representable floor, a default range collapses against it, and the amounts round to nothing. `mint` reverts on zero liquidity, so the command refuses before the node and names the state:

```
this pool has no established price — it was initialised at tick -887272 and never traded,
so a deposit cannot be sized against it; choose a fee tier whose pool has traded
```

This is a real condition on Nile: the 3000 tier — the default — is in exactly that state, while 100, 500 and 10000 carry live prices.

## V4: a pool is named by its key

A V4 pool has no contract of its own — every pool lives inside one pool manager — so it is named by the five parts of its **pool key**: the two tokens, the fee, the **tick spacing** and the **hooks** contract. On this command that is:

```
--token0 <token> --token1 <token> --fee <n> --tick-spacing <n> [--hooks <address>]
```

There is **no `--pool` flag**. A V4 pool id is a hash of that key; naming the key is the only way in.

**V4 new positions require both `--fee` and `--tick-spacing`, with no defaults.** This also applies to `--create-pool`. Existing positions use their on-chain pool parameters. On V3 the spacing follows from the fee tier; on V4 it does not — it is part of the pool's identity. Measured on Nile: TRX/USDT at fee `500` exists **twice**, once at spacing `10` and once at spacing `12`, as two separate pools. A default taken from the V3 convention would name one of them for you, and if that pool exists your deposit goes into it silently. Omitting the flag is refused:

```
error [missing_option]: invalid --tick-spacing: --tick-spacing is required on V4 and has no default: two V4 pools at the SAME fee tier can have different tick spacings — measured, USDC/USDT at fee 500 has spacing 12 while TRX/USDT at fee 500 has spacing 10 — so it cannot be derived from --fee. 'sunswap pool-list --protocol V4' publishes each pool's tickSpacing and hooks
```

**Get the value from [`sunswap pool-list --protocol V4`](pool-list.md)**, which publishes each pool's `tickSpacing` and `hooks` under `extra` in its JSON (`-o json`). `--hooks` defaults to none, which is what almost every pool has.

The same flags create a pool: add `--create-pool` and `--sqrt-price`, and the pool that is created is the pool that is then deposited into, because one key builder serves both.

Creation initializes the pool and mints the position in one main transaction. Any required Permit2
grants are forwarded between initialization and the deposit. A reverting deposit rolls back that
transaction's initialization; earlier TRC20 approval transactions are separate and remain on-chain.
The initial price must be within the contract's Q64.96 bounds. When no range is supplied, its tick
is calculated from that price, then the default range extends 100 tick spacings on each side,
aligned to the grid. The preview says so on one line,
`Create pool  yes — initial sqrtPriceX96 <value> (≈ 1 <token0> = <price> <token1>)`; JSON carries
`initialSqrtPriceX96` on creation plans and receipts. `initialPrice.token1PerToken0` expresses
human token1 per human token0 (eight significant digits, rounded down) as a plain decimal string,
never in scientific notation however small or large; `createPool: true`
is published alongside the existing `poolCreated` field.

A pool already initialized at planning time, or at the check after permit signing, is refused as
`pool_already_exists`. These checks cannot reserve the pool until mining: the position manager's
[`initializePool`](https://github.com/sun-protocol/sunswap-v4-periphery/blob/main/contracts/pool-cl/CLPositionManager.sol)
catches initialization errors, including another transaction creating the pool first. A concurrent
creation after the last check can therefore make the mint execute against that pool, subject to the
deposit's amount ceilings. The requested initial price is not an on-chain guarantee in that race.

**Adding to a V4 position** takes `--position-id` **and** `--token0` / `--token1`. The position already names its pool, so the tokens select nothing — they are checked against the pair the position holds, and a mismatch is refused rather than sent. `--fee` is checked the same way when given. `--tick-spacing`, `--hooks`, the tick range, `--recipient`, `--create-pool` and `--sqrt-price` are refused with `invalid_option`: the position already fixes them.

The tokens must match the position's `currency0` / `currency1` order, as with V4 mint. Reversed input is rejected. Set `--amount0` / `--amount1` for the corresponding assets in that order; when correcting the token order, adjust the amounts too.

### On V4 the bound is a ceiling, not a floor

On V2 and V3, `--min0` / `--min1` bound the deposit **from below**: the least you will accept depositing. **V4 bounds it from above**: the most the deposit may cost. `--min0` / `--min1` are refused on V4:

```
error [invalid_option]: invalid --min0: is not accepted on V4: a V4 deposit is bounded from ABOVE, by --slippage on the ceiling, not from below by a minimum
```

`--slippage` widens that ceiling **upward**. With no `--slippage`, the ceiling is exactly the computed amounts. Note that [`remove-liquidity`](remove-liquidity.md) also has a V4 `--slippage`, and there it works the other way — it lowers the floor on what comes back. The same flag name moves in opposite directions on the two commands.

On a native pair the ceiling is sent as the call's value and the remainder is returned, so **the account must hold the ceiling, not the deposit**. The dry run says so.

### Approvals on V4

V4 is the one exception to exact approvals. The token side goes through **Permit2** in two layers:

- The token's allowance **to Permit2** is checked against the deposit ceiling. A sufficient allowance (including a finite one) is reused; only an insufficient allowance triggers a new **unlimited** approval.
- The **Permit2 grant** each deposit signs locally is for **exactly this deposit's ceiling**, and lives **one hour**. It travels inside the deposit's own call, so the signature and the transaction that spends it cannot be separated.

The limit sits on the grant, not on the allowance — that is what Permit2 is for. The JSON lists the grants a deposit will sign under `permits`; a dry run checks standing grants and omits covered amounts from `permits` (empty or absent when fully covered). Live execution rechecks the grants before signing. A native TRX side needs neither.

Because the deposit carries its signed grants, **`--build-only` is refused** on a V4 deposit that still needs one; it builds when nothing is left to sign. When a grant is still needed, a dry run cannot price the deposit itself: `fee` carries a note instead of an energy figure, and `feeCovers` is `approvals` when approval transactions are priced, or `none` when only
an unsigned Permit2 grant prevents estimation. `feeUnavailableReason` explains this dependency. When standing grants and token allowances cover the deposit, the dry run estimates the main transaction and reports `feeCovers: "all"`.

If the Permit2 grants already suffice but a TRC20 allowance is short, `--build-only` returns the unsigned approval transactions followed by the deposit in `transactions[]`. Sign and broadcast them in that order, confirming the approvals before the deposit. Only the approvals are estimated (`feeCovers: "approvals"`); building does not send them or require them to have landed.

## Examples

```bash
wallet-cli sunswap add-liquidity --protocol V2 --token0 USDT --token1 WTRX --amount0 1 \
  --dry-run --network nile
```

```console
⏳ Dry run sunswap add-liquidity
  Account                    TNmoJ3Be59...iL3G8HVB (nile)
  Protocol                   V2
  Deposit                    1 USDT / 0.686044 WTRX
  Min deposit                0.95 USDT / 0.651741 WTRX
  LP received (est)          <0.000001
  Recipient                  TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB
  Deadline                   2026-09-23 18:24:45 UTC
  Fee (est, approvals only)  ~45,105 energy
  Spender 1                  TMn1qrmYUMSTXo9babrJLzepKZoPC7M6Sy
  Allowance 1                1 USDT  (approval tx will be sent first)
  Spender 2                  TMn1qrmYUMSTXo9babrJLzepKZoPC7M6Sy
  Allowance 2                0.686044 WTRX  (approval tx will be sent first)

⚠️ The deposit's own fee cannot be estimated until the approval is on-chain.
```

`LP received (est)  <0.000001` is not a rounding failure. A V2 pair's LP token has 18 decimals while a stablecoin pair's reserves have 6, so the LP supply of such a pool lives around 1e12 base units and a one-token deposit mints a fraction far below display precision. The exact figure is in `lpAmountExpected`, with `lpDecimals` beside it.

```bash
wallet-cli sunswap add-liquidity --protocol V3 --token0 USDT --token1 WTRX --fee 500 \
  --amount0 1 --wait --password-stdin --network nile
```

```console
✅ Liquidity added
  Account        TNmoJ3Be59...iL3G8HVB (nile)
  Protocol       V3
  Position       #686 (new)
  Fee tier       0.05%
  Tick range     [-8030, -6030]  (default)
  Deposited      1 USDT / 0.493089 WTRX
  Liquidity      14,398,816
  Recipient      TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB
  Approval tx 1  02ada75ce3392820c839da5575c68326a2cf752edc9c46dcdd096f007b85c0be
  TxID           3c18630a7cf77656930e070a796fa638ae4140ba559a143f95b81b76775b1ce3
  Block          #71,221,150
  Energy         355,907
  Fee            36.2257 TRX
  Status         success
```

A V4 dry run for a new position in the TRX/USDT pool at fee 500, spacing 10:

```bash
wallet-cli sunswap add-liquidity --protocol V4 --token0 TRX --token1 USDT --fee 500 \
  --tick-spacing 10 --amount0 1 --dry-run --account demo --network nile
```

```console
⏳ Dry run sunswap add-liquidity
  Account       TNmoJ3Be59...iL3G8HVB (demo)
  Protocol      V4
  Pool          977d6ad6be3a3206f7ca881434bb8a08ecaf1abe4690eed6ee23e3e7e0ae9b6a
  Fee tier      0.05%
  Tick spacing  10
  Hooks         none
  Range         [-11140, -9140]  (default)
  Deposit       1 TRX / 0.362993 USDT
  Liquidity     12,354,133
  Recipient     TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB
  Deadline      2026-09-29 08:51:48 UTC
  Fee (est)     the main transaction cannot be estimated until the Permit2 authorization is signed

⚠️ the main transaction cannot be estimated until the Permit2 authorization is signed
```

Here the USDT allowance to Permit2 is already on chain, so no approval is left to price and the deposit cannot be priced before its Permit2 authorization is signed: `Fee (est)` carries the reason instead of a figure (`feeCovers: "none"`). When an approval is still needed, the row reads `Fee (est, approvals only)` with that approval's estimate, followed by `Spender` and `Allowance  unlimited` rows.

`Pool` is the id the key hashes to — the same id [`pool-list`](pool-list.md) and [`position-info`](position-info.md) print — so you can confirm you named the pool you meant before anything is sent.

Adding to an existing V4 position, with a 1% ceiling:

```bash
wallet-cli sunswap add-liquidity --protocol V4 --position-id 7 --token0 TRX --token1 USDT \
  --amount0 1 --slippage 0.01 --dry-run --account demo --network nile
```

```console
⏳ Dry run sunswap add-liquidity
  Account       TNmoJ3Be59...iL3G8HVB (demo)
  Protocol      V4
  Position      #7
  Pool          977d6ad6be3a3206f7ca881434bb8a08ecaf1abe4690eed6ee23e3e7e0ae9b6a
  Fee tier      0.05%
  Tick spacing  10
  Hooks         none
  Range         [-887270, 887270]
  Deposit       1 TRX / 0.362794 USDT
  Max deposit   1.01 TRX / 0.366421 USDT
  Liquidity     602,323
  Recipient     TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB
  Deadline      2026-09-29 08:51:54 UTC
  Fee (est)     the main transaction cannot be estimated until the Permit2 authorization is signed

⚠️ This deposit locks 1.01 TRX as the transaction's value — about 1 TRX is expected to be deposited and the rest returned. The full amount must be available.

⚠️ the main transaction cannot be estimated until the Permit2 authorization is signed
```

`Max deposit` is the ceiling — the deposit plus the slippage, **upward**. There is no `Min deposit` row on V4.

## Reading the JSON

Broadcast results include `amountsEstimated`: `false` when the reported token amounts were read from this transaction’s receipt, `true` when they still come from the pre-transaction estimate. Pending, failed, and estimated results use `(est)` labels in text output. A confirmed transaction can still carry estimated amounts if the receipt read is unavailable.

`kind` is `sunswap-add-liquidity` in every mode.

**`fee` is the estimated cost, always** — the `{feeModel, energy, …}` object every dry run in this CLI carries. The V3 fee tier is `feeTier`, a number in hundredths of a basis point (`3000` = 0.3%). They are separate keys on purpose: one key whose meaning depended on the mode is how a script reads a tier as a cost.

**The contract is `router` on V2 and `positionManager` on V3 and V4**, under the same key in every mode (dry run, build and receipt).

**Liquidity: `liquidityExpected` before, `liquidity` after.** A V3 / V4 dry run or build gives the liquidity the amounts are expected to fund as `liquidityExpected`. The confirmed receipt gives what the position actually gained as `liquidity`, plus `liquidityAfter` for what it holds now. They are separate keys so that an estimate is never read as a settlement.

**Amounts are base units and carry their scale.** Each side is `{address, symbol, decimals, amount}`, plus `amountMinimum` in the plan. `lpAmount` is accompanied by `lpDecimals`.

**V4 adds the pool key and the ceiling.** `poolId`, `feeTier`, `tickSpacing` and `hooks` describe the pool; `nftTokenId` and `newPosition` the position. `amount0Max` / `amount1Max` are the ceiling, present only when `--slippage` moved it above the deposit; `nativeLocked`, beside them on a native pair, is the TRX locked as the call's value; `permits[]` lists the Permit2 grants the deposit will sign. On V4 the bound is the ceiling — `amountMinimum` does not bound a V4 deposit.

V3 plans and receipts always name `token0` and `token1` in the pool's on-chain order, so the
same names apply when adding to the position later. For a new position, input `--amount0` /
`--min0` still correspond to the caller's `--token0` (and likewise for side 1); with
`--position-id`, amounts correspond to the position's on-chain token order.

**V2 confirmed amounts come from this transaction.** When `amountsEstimated` is `false`, `token0.amount`, `token1.amount`, and `lpAmount` are the Router return values. `reservesAfter` is a separate current-state read; concurrent swaps and transfers do not affect the reported deposit amounts. V3 reads token amounts and liquidity from the transaction's `IncreaseLiquidity` event. V4 matches the pool and position `ModifyLiquidity` events and reports token amounts as the account's net expenditure, including native refunds and any fees or hook adjustments settled during the deposit, but excluding network fees. A negative V4 amount means the account received a net credit on that side. V4 `liquidity` comes from the position event, so later position changes cannot alter what this deposit reports. `liquidityAfter` is a separate current-state read.

`--build-only` with approvals returns `data.transactions[]` as `[{purpose, tx, hex}, …]` in execution order; without them it keeps the ordinary single-transaction shape.

## See also

[`sunswap remove-liquidity`](remove-liquidity.md) · [`sunswap collect-fees`](collect-fees.md) · [`sunswap position-list`](position-list.md) · [machine-interface.md](../../machine-interface.md)


### Transaction lifetime and partial progress

A multi-transaction `--build-only` result uses a one-hour transaction lifetime.
Send the approvals in order and confirm them before
sending the deposit. The lifetime starts at each transaction's timestamp, not when a later signer
opens the file; contract deadlines and Permit2 expiry still apply independently.

New TRON transactions signed with Ledger reserve at least ten minutes, or the configured device
signing timeout plus one minute if longer, before signing. Imported transaction files and explicit
expiration settings are preserved. If a transaction expires while being signed, the CLI returns
`tx_expired` and does not broadcast it; rebuild and sign again.

If approval transactions were submitted before a later step failed, their IDs appear in
`error.details.approvalTxIds` and the text error. Check these transactions before retrying;
they are not rolled back when the deposit or Permit2 signing fails.


Ledger accounts need **Custom contracts** and **Sign by Hash** allowed in the TRON app; see
[TRON app settings](../../guide/ledger.md#tron-app-settings). On hash-signing paths the device
displays hashes, not full transaction details; verify the CLI preview before approving. See
[Ledger signing and recovery](../../guide/ledger.md#hash-signing-and-recovery).


V4 JSON publishes an unbounded grant as `approvals[].amount: "unlimited"`; the on-chain approval
payload still encodes MAX_UINT256.
