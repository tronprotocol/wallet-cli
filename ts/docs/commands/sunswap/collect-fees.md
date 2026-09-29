# wallet-cli sunswap collect-fees

Take the fees a V3 or V4 position has earned, leaving its principal where it is.

## Synopsis

```
wallet-cli sunswap collect-fees --protocol <V3|V4> --position-id <id>
                                [--recipient <address>]                             (V3)
                                [--token0 <token> --token1 <token>] [--fee <n>]
                                [--deadline <timestamp>]                            (V4)
                                [--fee-limit <sun>]
                                [--dry-run | --build-only | --wait [--wait-timeout <ms>]]
```

## Description

It collects **everything owed**. There is no "how much" — the contract does not offer one, and a partial option would suggest a choice that does not exist.

Nothing is approved and no Permit2 is involved: the position manager already holds the position on both protocols.

**On V4 the position names its own pool.** The pool key is read from the position, so nothing has to be typed to select it. `--token0` / `--token1` and `--fee` are optional **cross-checks**: they select nothing, and a disagreement with what the position reports is refused. The fees always go to the **signing account**, so `--recipient` is not accepted on V4.

[`sunswap remove-liquidity`](remove-liquidity.md) already pays the fees out alongside the principal, on V3 and V4 alike, so this command is for the case where the principal should stay in the pool.

Ownership is checked in the dry run **and again immediately before sending**.

## Why V2 is refused

A V2 pool's fees are real. They are simply not *separable*: they accrue into the LP token's own value and come out when the liquidity does. So `--protocol V2` fails with `invalid_value` and says that, rather than calling the protocol unknown — which would send you looking for a spelling error instead of telling you how the pool works:

```
error [invalid_value]: invalid --protocol: must be V3 or V4; a V2 pool's fees accrue into the LP token itself and are taken out with the liquidity, so there is nothing separate to claim
```

It is the same distinction the `Unclaimed` column draws in [`position-list`](position-list.md).

## A measured zero is refused; an unknown is sent

If the position is **measured** to be owed nothing on **both** sides, the command fails before reaching the node:

```
position 686 has no fees to collect; sending this would spend a fee to receive nothing
```

This is not caution for its own sake. Measured on Nile: the contract **accepts** a collect of zero, emits a `Collect` of zero, charges **8.08 TRX**, and the receipt reads `✅ Fees collected`. Collecting nothing still costs a fee. A transaction that succeeds, achieves nothing, and leaves you poorer is exactly what a preflight check is for.

The refusal needs a **measurement**. On V4, if the owed amount **could not be read**, the collection is **sent anyway** — refusing on an unknown would block you from collecting real fees just because the figure was unavailable. The receipt then carries **no amount** and a warning (`sunswap_v4_owed_fees_unavailable`, or `sunswap_v4_owed_fees_undecodable`), rather than a zero; [`position-list`](position-list.md) reports the unclaimed value in that case (mainnet only).

A position owed dust on one token and nothing on the other is a **real** collection and is sent — whether a small payout is worth its fee is your call, not ours.

`--dry-run` still shows the zero, because that is what you came to find out, and `--build-only` still builds, because an unsigned transaction spends nothing.

## Options

| Option | Description |
|---|---|
| `--protocol <V3\|V4>` | **Required.** V2 is refused as explained above |
| `--position-id <id>` | **Required.** Must be held by this account |
| `--recipient <address>` | Who receives the fees; default the account (**V3 only**) |
| `--token0 <token>` / `--token1 <token>` | The position's pair, checked against what it holds; give both or neither (V4 only) |
| `--fee <n>` | The pool's fee tier, checked against the one the position reports. No default: it selects nothing. Needs `--token0` / `--token1` beside it (V4 only) |
| `--deadline <timestamp>` | Unix seconds; default 30 minutes from submission (V4 only) |
| `--fee-limit <sun>` | Max energy fee to burn; default `100000000`. The dry run's estimate is a **lower bound**, so a limit set from it can fail |
| `--dry-run` / `--build-only` / `--wait` | See [machine-interface.md](../../machine-interface.md) |

There is no `--liquidity` on either protocol: the amount is "everything". On V3 there is also no `--token0` / `--token1` and no `--deadline` — the pair comes from the position, and `collect` takes no deadline. A flag outside its protocol is `invalid_option`.

## Examples

```bash
wallet-cli sunswap collect-fees --protocol V3 --position-id 686 --dry-run --network nile
```

```console
⏳ Dry run sunswap collect-fees
  Account          TNmoJ3Be59...iL3G8HVB (nile)
  Protocol         V3
  Position         #686
  Collected (est)  0 USDT / 0 WTRX
  Recipient        TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB
  Fee (est)        ~76,699 energy
```

Zero here is a true answer: nothing has traded against that position, so it has earned nothing. Sending it would be refused.

```bash
wallet-cli sunswap collect-fees --protocol V4 --position-id 7 --dry-run --account demo --network nile
```

```console
⏳ Dry run sunswap collect-fees
  Account          TNmoJ3Be59...iL3G8HVB (demo)
  Protocol         V4
  Position         #7
  Collected (est)  0 TRX / 0 USDT
  Recipient        TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB
  Fee (est)        ~33,730 energy
```

The pair was read from the position; nothing on the command line named it. This zero is also a measured one, so sending it would be refused.

## Reading the JSON

`kind` is `sunswap-collect-fees` in every mode.

- `token0` / `token1` — `{address, symbol, decimals, amount}`. On V3, before the transaction, `amount` is what the contract's own static `collect` says is claimable — the same figure the transaction will move, so a preview promises what the receipt will report — and afterwards it is what the `Collect` event recorded, because a trade in between changes what was owed. On V4, `amount` is what was owed when read before the call; V4 emits no event this CLI decodes, so there is no after-figure. When that read failed, `amount` is **absent**, not `"0"`.
- `recipient` — always the **resolved** address, never a placeholder. On V3 this command can send money somewhere other than the account that signed, so where it went is a fact a script has to be able to read.
- `tokensAuto` — always `true`: the pair is read from the position. On V4, tokens you pass are only checked against it.
- `poolId`, `feeTier`, `tickSpacing`, `hooks`, `deadline` — the position's pool key and the call's deadline (V4).
- `nftTokenId`, `positionManager`, and the usual `fee` estimate object.

## See also

[`sunswap remove-liquidity`](remove-liquidity.md) · [`sunswap add-liquidity`](add-liquidity.md) · [`sunswap position-info`](position-info.md) · [`sunswap position-list`](position-list.md) · [machine-interface.md](../../machine-interface.md)
