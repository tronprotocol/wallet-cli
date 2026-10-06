# wallet-cli sunswap position-info

Show one SunSwap V3 or V4 position: who holds it, its pair, its price range, its liquidity and the fees it has not yet claimed.

## Synopsis

```
wallet-cli sunswap position-info --protocol <V3|V4> --position-id <id>
```

## Description

Everything is read **from the chain** by the position's NFT id, so no account is needed and none is accepted — any position can be looked up, not just your own.

**It works on Nile as well as mainnet.** The market data service that the six `sunswap` queries depend on holds mainnet data only, but this command does not depend on it for the position: it reads the position manager and the pool directly, so it works wherever the SunSwap contracts are configured — `tron` and `nile`. On Shasta it fails with `unsupported_network_capability`.

**USD values need a price source, and only mainnet has one.** On a network without it, the USD fields are **absent** — not `"0"` — and a `sunswap_prices_unavailable` warning says why. The text shows `—` in the `Value` row. Everything else is the same on both networks.

**V3 and V4 number their positions separately**, which is why `--protocol` is required: the same id names a different position under each. V2, V1, V1_5 and CURVE positions are not NFTs and have no id; list those with [`sunswap position-list`](position-list.md), which is also where to find a position's id.

## Options

| Option | Description |
|---|---|
| `--protocol <V3\|V4>` | **Required.** Anything else is `invalid_value` |
| `--position-id <id>` | **Required.** The position NFT id — the `Position` (`#N`) in [`position-list`](position-list.md) |

Plus the [global options](../index.md#global-options-every-command). No `--account`.

## Examples

A mainnet V4 position, with USD values:

```bash
wallet-cli sunswap position-info --protocol V4 --position-id 88 --network tron
```

```console
Position     #88
Owner        TT2T17KZhoDu47i2E4FWxfG79zdkEWkU9N
Pool         61446c8062cdc7f165946650c5ca6b6aa1809d19fcdf69b58824b01dd581333e
Protocol     V4
Status       IN_RANGE
Pair         U/USDT
Amounts      1,006,750.541167 U / 953,987.069525 USDT
Value        $1,959,819.81
Price range  0.995015 – 1.005014 USDT per U
Tick range   [-276374, -276274]
Liquidity    392,657,176,790,371,861,588
Unclaimed    255.800694 U / 255.077852 USDT  ($510.64)
Pool share   99.6420%
Pool fee     0.01%
```

A Nile V4 position. No price source, so no USD value:

```bash
wallet-cli sunswap position-info --protocol V4 --position-id 1 --network nile
```

```console
warning: network tron:3448148188 has no SunSwap price source, so this position is reported without any USD value
Position     #1
Owner        TNrVLZTqJ14FoFxcPHAHNJTD7taZeMK1vT
Pool         a37317013986f63c1f31e13b9b66d5217b8be0e42729c55389817307ab5e2de1
Protocol     V4
Status       IN_RANGE
Pair         USDC/USDT
Amounts      1,011.669166 USDC / 988.379967 USDT
Value        —
Price range  0.406587 – 2.459492 USDT per USDC
Tick range   [-9000, 9000]
Liquidity    2,759,705,520
Unclaimed    0.005838 USDC / 0 USDT
Pool share   89.5796%
Pool fee     0.05%
```

`Liquidity` is the figure [`remove-liquidity`](remove-liquidity.md) takes as `--liquidity` on V3 and V4. `Unclaimed` is what [`collect-fees`](collect-fees.md) would collect, and what `remove-liquidity` pays out alongside the principal.

## Output

`data.position`:

- `nftTokenId`, `owner`, `protocol`, `status` (`IN_RANGE`, `OUT_RANGE` or `EMPTY`).
- `poolAddress` — for V4, a 64-hex pool id, not a contract address.
- `lpTokenName` / `lpTokenSymbol` — as the position manager itself reports them.
- `lpBalanceAmount` — the position's liquidity; not a token amount and carries no decimals.
- `lpBalanceUsd` — mainnet only; absent where there is no price source.
- `poolShare` — the position's share of the pool's **active** (in-range) liquidity. `OUT_RANGE` gives `"0"`, which is a measurement: an out-of-range position contributes no active liquidity. Absent when the pool's active liquidity is zero.
- `poolFeeRate` — a decimal fraction, e.g. `"0.0005"` for 0.05%.
- `tokens[]` — `{address, symbol, name, decimals, amount, rewardAmount}`, base units; `rewardAmount` is the unclaimed fees. `priceUsd` is added where there is a price source.
- `extra` — `tickLower`, `tickUpper`, `minPrice`, `maxPrice`, `positionLiquidity`, `derivedToken0Amount` / `derivedToken1Amount` (the whole position valued at the pool price in one side of its own pair — not a USD figure), `tokenRewardUsd` where priced, and on V4 `isDynamicFee`, `parameters` and `hasSubscriber`.

## Exit status

`0` success · `1` execution failure (`position_not_found` — no position with that id under that protocol on this network; `invalid_node_response` — the node answered with data that cannot be decoded, worth retrying; `timeout`) · `2` usage error (`invalid_value` — a protocol other than `V3` / `V4`; `unsupported_network_capability`; `family_mismatch` on an EVM network).

## See also

[`sunswap position-list`](position-list.md) · [`sunswap remove-liquidity`](remove-liquidity.md) · [`sunswap collect-fees`](collect-fees.md) · [`sunswap` group](index.md)
