# wallet-cli sunswap add-liquidity

Deposit both sides of a pair into a SunSwap pool.

## Synopsis

```
wallet-cli sunswap add-liquidity --protocol <V2|V3> [--token0 <token> --token1 <token>]
                                 [--position-id <id>] [--amount0 <n>] [--amount1 <n>]
                                 [--min0 <n>] [--min1 <n>] [--fee <n>]
                                 [--tick-lower <n>] [--tick-upper <n>]
                                 [--recipient <address>] [--deadline <timestamp>]
                                 [--fee-limit <sun>]
                                 [--dry-run | --build-only | --wait [--wait-timeout <ms>]]
```

## Description

**V2** adds at the pool's current ratio and returns LP tokens. **V3** mints a position NFT over a price range, or adds to one you already hold with `--position-id` — which fixes the pair, the fee tier and the range, so those flags are refused alongside it.

Give one amount and the other is derived — from the pool's reserves on V2, from the range and the current price on V3. Give both to deposit exact amounts. A pool that holds nothing has no ratio to derive from, so the first deposit into one must name both sides.

**On V3 your TRX becomes WTRX.** V3 pools are wrapped. On V2, TRX is deposited natively through `addLiquidityETH` and only the other side is approved. Three protocols, three answers, and V3 is the one where what you typed is not what the pool receives.

Each side is approved for **exactly the amount this deposit needs**, never an unbounded allowance. The approval is sent, confirmed, and the allowance re-read from the chain before the deposit follows — the two can never land out of order, and a token whose `approve` caps or refuses what it grants is caught before the deposit reverts for a reason the receipt could not explain.

`--dry-run` validates everything — balances, the pool, the amounts, the allowances — without a password, and works for a watch-only account.

**A new position's NFT id exists only in the confirmed receipt.** The manager assigns it during execution, so pass `--wait` to learn it; [`sunswap position-list`](position-list.md) is mainnet-only and cannot tell you afterwards on Nile.

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
| `--protocol <V2\|V3>` | **Required.** V4 is refused as not yet supported |
| `--token0 <token>` / `--token1 <token>` | The pair, symbol or contract address. Not accepted with `--position-id` |
| `--position-id <id>` | Add to this existing position; must be held by this account (V3 only) |
| `--amount0 <n>` / `--amount1 <n>` | Amounts in whole tokens. Give one, the other, or both |
| `--min0 <n>` / `--min1 <n>` | Least to accept depositing. Default: V2 95% of the computed amount, V3 `0` |
| `--fee <n>` | Fee tier: `100`, `500`, `3000` or `10000` (V3 new position only; default `3000`) |
| `--tick-lower <n>` / `--tick-upper <n>` | Price range; each a multiple of the tier's tick spacing (V3 new position only) |
| `--recipient <address>` | Who receives the LP tokens or the position NFT; default the account |
| `--deadline <timestamp>` | Unix seconds; default 30 minutes from submission. One already past is refused |
| `--fee-limit <sun>` | Max energy fee to burn; default `100000000`. See the note above |
| `--dry-run` / `--build-only` / `--wait` | See [machine-interface.md](../../machine-interface.md) |

`--sign-only` is **not offered** anywhere in this group: a flow of several transactions cannot guarantee offline what order its parts land in, or that the allowance is there when the deposit is.

A flag outside its scenario is `invalid_option`, not silently ignored. Dropping `--fee` would deposit at a tier you did not choose; dropping `--tick-lower` on an increase would suggest a position's range can be changed, which it cannot.

## The price range, on V3

A tick you type is **checked** against the tier's grid, never rounded onto it. A range is a price opinion, and moving a boundary by one spacing changes what the position earns. Only a range the CLI chose is aligned — the current tick ± 100 spacings — and the receipt marks it `tickRangeAuto: true` so our choice is never mistaken for yours. The same holds for `feeAuto` when `--fee` was omitted.

A pool that was **initialised and never traded** has no price: its tick sits at the representable floor, a default range collapses against it, and the amounts round to nothing. `mint` reverts on zero liquidity, so the command refuses before the node and names the state:

```
position has no established price — it was initialised at tick -887272 and never traded,
so a deposit cannot be sized against it; choose a fee tier whose pool has traded
```

This is a real condition on Nile: the 3000 tier — the default — is in exactly that state, while 100, 500 and 10000 carry live prices.

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

## Reading the JSON

`kind` is `sunswap-add-liquidity` in every mode.

**`fee` is the estimated cost, always** — the `{feeModel, energy, …}` object every dry run in this CLI carries. The V3 fee tier is `feeTier`, a number in hundredths of a basis point (`3000` = 0.3%). They are separate keys on purpose: one key whose meaning depended on the mode is how a script reads a tier as a cost.

**Amounts are base units and carry their scale.** Each side is `{address, symbol, decimals, amount}`, plus `amountMinimum` in the plan. `lpAmount` is accompanied by `lpDecimals`.

**A confirmed receipt reports what happened, not what was asked for.** A V2 pool takes the two sides at its own ratio, so `token0.amount` / `token1.amount` in the confirmed state are the amounts the reserves actually moved by, `lpAmount` is the LP balance delta, and `reservesAfter` is the pool read back. On V3, `liquidity` is what the position actually gained — read from the position after confirmation, not the figure the plan predicted, because the pool credits slightly less than the amounts were worth a moment earlier. **That is the number [`remove-liquidity`](remove-liquidity.md) wants for `--liquidity`**, so it has to be the real one.

`--build-only` with approvals returns `data.transactions[]` as `[{purpose, tx, hex}, …]` in execution order; without them it keeps the ordinary single-transaction shape.

## See also

[`sunswap remove-liquidity`](remove-liquidity.md) · [`sunswap collect-fees`](collect-fees.md) · [`sunswap position-list`](position-list.md) · [machine-interface.md](../../machine-interface.md)
