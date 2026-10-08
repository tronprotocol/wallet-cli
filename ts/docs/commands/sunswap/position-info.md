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

A V4 position on mainnet:

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
Amounts      1,061,551.304817 U / 899,201.170382 USDT
Value        $1,958,910.79
Price range  0.995015 – 1.005014 USDT per U
Tick range   [-276374, -276274]
Liquidity    392,657,176,790,371,861,588
Unclaimed    261.782803 U / 255.579125 USDT  ($516.89)
Pool share   99.6420%
Pool fee     0.01%
```

The same command on Nile. There is no price source there, so `Value` is `—`, the USD fields are absent from JSON, and a warning says why (on stderr in text mode):

```bash
wallet-cli sunswap position-info --protocol V4 --position-id 177 --network nile
```

```console
Position     #177
Owner        TXo8GVA3aopDpmQ6c28ZABBaApDzs4QRPB
Pool         2abee5abc450b8b3c69872d7cb7e04ee72c689c38b21480fa8bf61ec3f9a280e
Protocol     V4
Status       IN_RANGE
Pair         TRX/USDT
Amounts      2.214341 TRX / 0.62777 USDT
Value        —
Price range  0.205169 – 0.396946 USDT per TRX
Tick range   [-15840, -9240]
Liquidity    7,751,712
Unclaimed    0 TRX / 0 USDT
Pool share   0.2678%
Pool fee     0.05%
```

```bash
wallet-cli sunswap position-info --protocol V4 --position-id 177 --network nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"sunswap.position-info","data":{"position":{"nftTokenId":"177","owner":"TXo8GVA3aopDpmQ6c28ZABBaApDzs4QRPB","poolAddress":"2abee5abc450b8b3c69872d7cb7e04ee72c689c38b21480fa8bf61ec3f9a280e","protocol":"V4","status":"IN_RANGE","lpTokenName":"SunSwap V4 Positions NFT","lpTokenSymbol":"SUN-SWAP-V4-POSM","lpBalanceAmount":"7751712","poolShare":"0.002677883593657177","poolFeeRate":"0.0005","tokens":[{"address":"T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb","symbol":"TRX","name":"TRON","decimals":6,"amount":"2214341","rewardAmount":"0"},{"address":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf","symbol":"USDT","name":"Tether USD","decimals":6,"amount":"627770","rewardAmount":"0"}],"extra":{"tickLower":-15840,"tickUpper":-9240,"minPrice":"0.20516909108344206","maxPrice":"0.3969464861075113","positionLiquidity":"7751712","derivedToken0Amount":"4416326","derivedToken1Amount":"1259062","isDynamicFee":false,"parameters":"0000000000000000000000000000000000000000000000000000000000210000","hasSubscriber":false}}},"meta":{"durationMs":5172,"warnings":[{"code":"sunswap_prices_unavailable","message":"network tron:3448148188 has no SunSwap price source, so this position is reported without any USD value"}]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

## Output

`data.position`:

- `nftTokenId`, `owner`, `protocol`, `status` (`IN_RANGE` or `OUT_RANGE`). The text output shows `EMPTY` for a position with no liquidity left; the JSON never does — read `extra.positionLiquidity === "0"` instead.
- `poolAddress` — for V4, a 64-hex pool id, not a contract address.
- `lpTokenName` / `lpTokenSymbol` — as the position manager itself reports them.
- `lpBalanceAmount` — the position's liquidity; not a token amount and carries no decimals.
- `lpBalanceUsd` — mainnet only; absent where there is no price source.
- `poolShare` — the position's share of the pool's **active** (in-range) liquidity. `OUT_RANGE` gives `"0"`, which is a measurement: an out-of-range position contributes no active liquidity. Absent when the pool's active liquidity is zero.
- `poolFeeRate` — a decimal fraction, e.g. `"0.0005"` for 0.05%.
- `tokens[]` — `{address, symbol, name, decimals, amount, rewardAmount}`, base units; `rewardAmount` is the unclaimed fees. `priceUsd` is added where there is a price source.
- `extra` — `tickLower`, `tickUpper`, `minPrice`, `maxPrice`, `positionLiquidity`, `derivedToken0Amount` / `derivedToken1Amount` (the whole position valued at the pool price in one side of its own pair — not a USD figure), `tokenRewardUsd` where priced, and on V4 `isDynamicFee`, `parameters` and `hasSubscriber`.

## Exit status

`0` success · `1` execution failure (`position_not_found` — no position with that id under that protocol on this network; `pool_not_found` — the position names a pool that does not exist on chain; `invalid_node_response` — the node answered with data that cannot be decoded, worth retrying; `timeout`) · `2` usage error (`missing_option` — no `--protocol` or `--position-id`; `invalid_value` — a protocol other than `V3` / `V4`; `unsupported_network_capability`; `family_mismatch` on an EVM network).

## See also

[`sunswap position-list`](position-list.md) · [`sunswap remove-liquidity`](remove-liquidity.md) · [`sunswap collect-fees`](collect-fees.md) · [`sunswap` group](index.md)
