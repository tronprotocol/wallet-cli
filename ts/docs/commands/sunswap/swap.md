# wallet-cli sunswap swap

Exchange one token for another.

## Synopsis

```
wallet-cli sunswap swap <tokenIn> <tokenOut> <amountIn>
                        [--quote [--all]]
                        [--slippage <decimal>] [--fee-limit <sun>]
                        [--dry-run | --build-only | --wait [--wait-timeout <ms>]]
```

## The market is chosen first

Before anything is priced, the command decides **which market** the trade belongs to, from on-chain state, and it decides identically in every mode:

- Exactly one side is **TRX**, and the other is a **SunPump token that has not launched yet** → that token's **bonding curve**.
- Anything else → the **SunSwap router**.

A pair with no native side is not asked about the curve at all, which also saves an ordinary TRC-20 pair a launchpad read it does not need.

**If the curve's state cannot be read, the command stops** with `provider_error` rather than falling back to the router. A failed probe is not evidence about the market, and pricing on one market while filling on the other is the way this command loses money.

The receipt names the market in every mode, because it changes what the numbers mean: on a curve the trading fee is SunPump's **platform fee**, there is one hop, and there is no price impact.

## Naming the tokens

`<tokenIn>` and `<tokenOut>` each take a contract address or a symbol. `TRX` and `WTRX` are built in. Any other symbol is looked up, case-insensitively, in the **token address book of the account this command uses** — the official entries plus the ones that account added with [`token add`](../token/add.md) — which is `--account` when given, else the active account. `--quote` reads the same book as the execution it previews, so both name the same token; with no account at all, only the official entries apply.

- A symbol that matches **more than one** entry is refused with `ambiguous_token_symbol` (exit 2), even when one of them is official. The message lists every candidate address; pass the one you mean. One is never picked for you: a user-added token calling itself `USDT` is exactly how an impersonation would reach a trade.
- A symbol that matches nothing is `unsupported_token` (exit 2): pass its contract address in its place, or add it with `wallet-cli token add`.

The contract each side resolved to is shown in every mode — `Token in` / `Token out` in text, `address` in JSON — and a side whose symbol came from the account's own book is marked `(from your token book)`.

## How a router swap is authorized

A swap that spends **TRX** needs no permission: the TRX travels as the transaction's own value, and it is one transaction.

A swap that spends a **token** needs two, because the Universal Router does not move tokens itself — [Permit2](https://github.com/Uniswap/permit2) does, on its behalf:

1. A **TRC-20 approval to Permit2**, for **exactly this trade**.
2. A **Permit2 grant** to the router, for exactly this trade, **lapsing in one hour** — signed as EIP-712 typed data, which costs nothing and is not a transaction.

Then the swap itself. So a token swap is two transactions and one signature.

**A standing Permit2 grant is used as it stands.** If the account already holds a Permit2 grant to the router that covers the trade — for example one left by another client built on the SunSwap SDK, whose swap planner grants `MAX_UINT160` for thirty days — no new grant is signed and the swap goes out without a permit, as the SDK itself encodes it. The TRC-20 allowance to Permit2 is a separate layer and is still checked and approved when short. The JSON then carries no `permit`.

**Neither grant is unlimited, and that took work.** The SDK's own swap planner asks for `MAX_UINT160` for **thirty days** in every authorizing mode, with no option to bound either figure. This command plans the authorization separately so the grant is exactly the trade and expires within the hour. [machine-interface.md](../../machine-interface.md) lists the two paths in this CLI that do grant unlimited allowances; this is not one of them.

### The balance is checked first

Before the permit or the approval is planned, in every mode, the account must hold what the swap spends: the TRX for a swap spending TRX, the token for a swap spending a token. An account the chain has no record of is `account_not_active`; an activated one that holds too little is `insufficient_balance` (TRX) or `insufficient_token_balance` (a token), all exit 1. Checking first is what keeps an execute from paying for a Permit2 approval it can never use. The chain's own fee is not added — `--fee-limit` bounds that.

### What is checked, and when

The permit is a **bearer grant**: signed, it lets the router move the tokens with no transaction of ours in the way. So it is checked against the swap on both sides of being signed.

**Before signing** — the typed data must name this token, exactly this amount, the Universal Router as spender, this chain, Permit2 as the verifying contract, a `PermitSingle` (never a `PermitBatch`, which would authorize several tokens at once), the exact EIP-712 field list, and an expiry no further out than the hour asked for. Any mismatch is `permit_mismatch` (exit 1) and **nothing is signed**.

**After signing** — the signature must recover to the account being traded for. This one cannot happen earlier: `PermitSingle` carries no owner field, so until a signature exists there is nothing to compare.

**Then the encoded call** — the minimum output, the recipient and the deadline live inside `execute(bytes,bytes[],uint256)` as ABI words and nowhere else. They are read back out and compared to what the receipt says, along with the permit's own amount and expiry, and an unlimited grant is refused by value. A mismatch is `router_call_mismatch` (exit 1).

### The approval goes first, and that has a cost

Permit2 cannot move the token until the allowance exists, so the approval is **broadcast before** the encoded call is checked. If that check then fails, the approval is on chain and the swap is not: a fee spent for nothing, leaving an allowance that is exactly this trade and lapses within the hour. Re-running recovers it — an allowance that already covers the trade is not approved again.

For the curve, [`sunpump buy`](../sunpump/buy.md) and [`sunpump sell`](../sunpump/sell.md) reach the same contract with the same two commands' worth of options.

## Quoting a router pair

`--quote` takes **no account and no password**, and publishes the **best** candidate — which is not the first one the service returns. Measured on mainnet, the service has answered with its worst output first; taking `route[0]` would have quoted 34.344609 USDT where 34.376047 was on offer. Best means **highest output**, then lowest fee, then fewest hops.

```bash
wallet-cli sunswap swap TRX USDT 100 --quote --network tron
```

```console
Market  SunSwap
Token in  T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb
Token out  TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t

| Route      | Amount in | Amount out     | Trading fee | Price impact |
| ---------- | --------- | -------------- | ----------- | ------------ |
| TRX → USDT | 100 TRX   | 34.334861 USDT | 0.05 TRX    | 0.000000%    |

1 of 3 routes shown — --all lists them.
```

`--all` lists every candidate, in the order the service returned them:

```console
| Route                    | Amount in | Amount out     | Trading fee  | Price impact |
| ------------------------ | --------- | -------------- | ------------ | ------------ |
| TRX → USDT               | 100 TRX   | 34.334861 USDT | 0.05 TRX     | 0.000000%    |
| TRX → WTRX → USD1 → USDT | 100 TRX   | 34.33455 USDT  | 0.059994 TRX | -0.000010%   |
| TRX → WTRX → USDT        | 100 TRX   | 34.322571 USDT | 0.05 TRX     | 0.000000%    |
```

**A negative price impact is a real answer**, not a formatting slip: the route paid better than the service's reference price. It is published as measured rather than clamped to zero.

A quote publishes **no minimum and no slippage**, anywhere in the payload — `--quote` refuses `--slippage`, so a floor would come from a default the caller never chose and nothing would enforce it. It is also why `--all` is refused without `--quote`: an execution takes one route, not a list.

If the route service rate-limits the request (HTTP 429) the command fails with `provider_rate_limited` (exit 1, retry later), with `Retry-After` in `error.details.retryAfterSeconds` when sent. The request honours `--timeout` (`timeout`) and the CLI's response-size cap (`response_too_large`); any other failure is `provider_error`.

**The floor is ours, not the service's.** The route service returns an `amountOutMinimum` field that is *equal to* `amountOut` even when slippage was requested, so it is never published and never used: reading it would report no protection where there is some. The minimum is computed from `--slippage` and then read back out of the encoded call to confirm it is the one being enforced.

## Options

| Option | Description |
|---|---|
| `--quote` | Price only — no account, no password, no transaction. Excludes `--dry-run`, `--build-only` and `--slippage` |
| `--all` | List every candidate route instead of the best one. **Only with `--quote`** |
| `--slippage <decimal>` | Tolerance, e.g. `0.005`. **Default 0.5%** — note that [`sunpump buy`](../sunpump/buy.md) and [`sell`](../sunpump/sell.md) reach the same curve with a **5%** default, because a command named after a meme-token market budgets for its volatility |
| `--fee-limit <sun>` | Max energy fee to burn; default `100000000`. The dry run's estimate is a **lower bound**, so a limit set from it can fail |
| `--dry-run` / `--wait` | See [machine-interface.md](../../machine-interface.md) |
| `--build-only` | **Refused** for a router swap that spends a token: the transaction embeds the Permit2 signature, so it cannot be built before that signature exists. A swap spending TRX has no permit and does build |

`--sign-only` is not offered in this group.

### What `--dry-run` can and cannot tell you

For a swap spending **TRX** it prices the swap itself. For a swap spending a **token** it prices the **approval only** and says so — `Fee (est, approval only)` — because encoding the swap needs the signature and a dry run does not sign. It publishes the grant it *would* ask for, which is what a caller came to check:

```console
⏳ Dry run sunswap swap
  Account                   TE9kPMtaMj...wx9EcJW8
  Market                    SunSwap
  Token in                  TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
  Token out                 T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb
  Spend                     1 USDT
  Receive (est)             2.921823 TRX
  Min received              2.907213 TRX
  Slippage                  0.5%
  Fee (est, approval only)  ~99,764 energy
  Spender                   TTJxU3P8rHycAyFY4kVtGNfmnMH4ezcuM9
  Allowance                 1000000  (approval tx will be sent first; exactly this trade)
  Permit2                   TTJxU3P8rHycAyFY4kVtGNfmnMH4ezcuM9
  Permit grants             1000000 to TQqgNg13s2...wZGvb7Y4
  Permit expires            2026-09-24 06:48:26 UTC (1 hour)

⚠️ The swap's own fee cannot be estimated until the Permit2 authorization is signed, which a dry run does not do.
```

## Availability

**TRON mainnet only**, and it is a config question rather than a branch on the network's name: `swap` is registered where a network's config carries **either** a SunPump launchpad address **or** a `sunswap.routerApiBaseUrl`. Nile and Shasta carry neither, so there it fails with `unsupported_network_capability` (exit 2) and the message names the network that works. An EVM network fails earlier still, on the family.

## Reading the JSON

`kind` is `sunswap-swap` in every mode, and `market` is `sunswap` or `sunpump`.

`fromTokenBook` — present only when a symbol resolved from the account's own token book: the contract addresses that did, so a script can tell a user-added token from an official one.

A quote is **plural**: `routes` is an array whether one candidate came back or five, with `routesAvailable` counting how many exist, so an agent parses `--quote` and `--quote --all` the same way.

Per route:

- `amountIn` / `amountOut` — **base units**. The route service's own `amountIn` field is a human decimal and its `amountInRaw` is the base-unit one; the raw figures are what this publishes.
- `tradingFee` — base units of the **input** token. **Derived**: the service sends the fee only as a human decimal, and has no raw field at all.
- `priceImpactPercent` — as the service reports it, negative included.
- `path` — `{address, symbol}` per token, with `decimals` on the **two ends**, which are the tokens this command resolved. An intermediate hop is published **without** `decimals` rather than with a guessed default. The ends are identified by position, not by ticker: two different contracts sharing a symbol is ordinary on TRON.
- `protocols` — uppercase, **one per pool**, so one fewer than `path`.
- `poolFees` — fee tiers as the service sends them, which is **one per token in `path`** — a trailing `0` past the last pool. Published unchanged rather than trimmed to a shape the service does not use.
- `inUsd` / `outUsd` — present only when the service sends them.
- `containsUnverifiedHook` — the route passes through a hook contract nobody has verified. A fact about the route, not a decode failure: the route is still offered and the caller decides, and it is warned about in **every** mode rather than only in the quote table.

Every other mode publishes one chosen `route` instead, with `amountOutExpected`, `amountOutMinimum` and `slippage` beside it, plus:

- `approvals` — the TRC-20 approval to Permit2, `{token, spender, amount, …}`, absent when the allowance already covers the trade or the input is TRX.
- `permit` — `{permit2, spender, amount, expiration}`: the grant that was authorized, not merely that one was. Absent for a TRX input, which needs none, and when a standing Permit2 grant already covers the trade.
- `approvalTxIds` — in the order sent, beside the swap's own `txId`.
- `feeCovers` — `"approvals"` when a dry run could only price the approval, `"none"` when an unsigned Permit2 grant prevents estimation and there are no on-chain approvals to price, and `"all"` when the complete transaction can be estimated.

## See also

[`sunpump buy`](../sunpump/buy.md) · [`sunpump sell`](../sunpump/sell.md) · [`sunswap price`](price.md) · [machine-interface.md](../../machine-interface.md)


Ledger accounts need **Custom contracts** and **Sign by Hash** allowed in the TRON app; see
[TRON app settings](../../guide/ledger.md#tron-app-settings). On hash-signing paths the device
displays hashes, not full transaction details; verify the CLI preview before approving. See
[Ledger signing and recovery](../../guide/ledger.md#hash-signing-and-recovery).


With `--wait`, a successful confirmed trade publishes `amountOut` from output-token Transfer logs
or native TRX internal transfers to the recipient, net of outgoing transfers of that asset within
the same transaction. Network fees are excluded. `amountsEstimated: false` identifies verified
output; absent, malformed or unavailable receipt evidence keeps `amountOutExpected`, sets
`amountsEstimated: true` and adds a warning. Concurrent account activity cannot alter these figures.
`priceImpactPercent` on a router trade remains the route's quoted impact and is explicitly marked
`priceImpactEstimated: true`; it is not a post-trade measurement. `tradingFee` remains quoted too.
