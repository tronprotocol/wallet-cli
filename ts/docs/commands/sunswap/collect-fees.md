# wallet-cli sunswap collect-fees

Take the fees a V3 position has earned, leaving its principal where it is.

## Synopsis

```
wallet-cli sunswap collect-fees --protocol V3 --position-id <id>
                                [--recipient <address>] [--fee-limit <sun>]
                                [--dry-run | --build-only | --wait [--wait-timeout <ms>]]
```

## Description

It collects **everything owed**. There is no "how much" — the contract does not offer one, and a partial option would suggest a choice that does not exist.

Nothing is approved: the position manager already holds the NFT.

[`sunswap remove-liquidity`](remove-liquidity.md) already collects the fees alongside the principal, so this command is for the case where the principal should stay in the pool.

Ownership is checked in the dry run **and again immediately before sending**.

## Why V2 is refused

A V2 pool's fees are real. They are simply not *separable*: they accrue into the LP token's own value and come out when the liquidity does. So `--protocol V2` fails with `invalid_value` and says that, rather than calling the protocol unknown — which would send you looking for a spelling error instead of telling you how the pool works:

```
must be V3; a V2 pool's fees accrue into the LP token itself and are taken out with
the liquidity, so there is nothing separate to claim
```

It is the same distinction the `Unclaimed` column draws in [`position-list`](position-list.md).

## A collection of nothing is refused

If the position is owed nothing on **both** sides, the command fails before reaching the node:

```
position 686 has no fees to collect; sending this would spend a fee to receive nothing
```

This is not caution for its own sake. Measured on Nile: the contract **accepts** a collect of zero, emits a `Collect` of zero, charges **8.08 TRX**, and the receipt reads `✅ Fees collected`. A transaction that succeeds, achieves nothing, and leaves you poorer is exactly what a preflight check is for.

A position owed dust on one token and nothing on the other is a **real** collection and is sent — whether a small payout is worth its fee is your call, not ours.

`--dry-run` still shows the zero, because that is what you came to find out, and `--build-only` still builds, because an unsigned transaction spends nothing.

## Options

| Option | Description |
|---|---|
| `--protocol V3` | **Required.** V2 is refused as explained above; V4 as not yet supported |
| `--position-id <id>` | **Required.** Must be held by this account |
| `--recipient <address>` | Who receives the fees; default the account |
| `--fee-limit <sun>` | Max energy fee to burn; default `100000000`. The dry run's estimate is a **lower bound**, so a limit set from it can fail |
| `--dry-run` / `--build-only` / `--wait` | See [machine-interface.md](../../machine-interface.md) |

There is no `--liquidity`, no `--token0` / `--token1` and no `--deadline` on V3: the amount is "everything", the pair comes from the position, and `collect` takes no deadline. Passing any of them is `invalid_option`.

## Example

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

## Reading the JSON

`kind` is `sunswap-collect-fees` in every mode.

- `token0` / `token1` — `{address, symbol, decimals, amount}`. Before the transaction, `amount` is what the contract's own static `collect` says is claimable — the same figure the transaction will move, so a preview promises what the receipt will report. Afterwards it is what the `Collect` event recorded, because a trade in between changes what was owed.
- `recipient` — always the **resolved** address, never a placeholder. This command routinely sends money somewhere other than the account that signed, so where it went is a fact a script has to be able to read.
- `tokensAuto` — always `true` on V3: the pair is read from the position and never named by the caller.
- `nftTokenId`, `positionManager`, and the usual `fee` estimate object.

## See also

[`sunswap remove-liquidity`](remove-liquidity.md) · [`sunswap add-liquidity`](add-liquidity.md) · [`sunswap position-list`](position-list.md) · [machine-interface.md](../../machine-interface.md)
