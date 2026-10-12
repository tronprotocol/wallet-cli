# wallet-cli sunswap

Swap, manage liquidity, and look up pools, positions and prices on SunSwap.

The group has three kinds of command:

- **Six market queries** — `pool-list`, `pool-search`, `position-list`, `token-list`, `token-search`, `price`. They read the SunSwap market data service, need no password, and run against an empty `WALLET_CLI_HOME` (`position-list` then needs `--account <address>`).
- **`position-info`** — reads one V3 or V4 position straight from the chain.
- **Four commands that move money** — `add-liquidity`, `remove-liquidity` and `collect-fees` on SunSwap V2, V3 and V4, and `swap`, which trades through the SunSwap router or, for a SunPump token that has not launched yet, through its bonding curve.

> **TRON only.** On an EVM network every command here fails with `family_mismatch` before any node call.
>
> **Not every TRON network has every command.** The six market queries and `swap` are **mainnet only** — on Nile or Shasta they fail with `unsupported_network_capability` (exit 2), and the message names the network that works. `position-info` and the three liquidity commands talk to contracts instead, so they work on **`tron` and `nile`** (`position-info` shows USD values on mainnet only). None of the group runs on Shasta.

The examples on these pages use four example accounts by label: `main` and `led` on Nile, `lp` and `jh` on mainnet. Pass your own with `--account`, or leave it out to use the active account.

## Synopsis

```
wallet-cli sunswap COMMAND
```

## Subcommands

| Command | Page | Description |
|---|---|---|
| `sunswap swap` | [swap.md](swap.md) | Exchange one token for another |
| `sunswap add-liquidity` | [add-liquidity.md](add-liquidity.md) | Deposit both sides of a pair into a pool |
| `sunswap remove-liquidity` | [remove-liquidity.md](remove-liquidity.md) | Withdraw liquidity from a pool or position |
| `sunswap collect-fees` | [collect-fees.md](collect-fees.md) | Take a V3 or V4 position's earned fees |
| `sunswap position-list` | [position-list.md](position-list.md) | Liquidity positions held by an address |
| `sunswap position-info` | [position-info.md](position-info.md) | One V3 or V4 position, read from the chain |
| `sunswap pool-list` | [pool-list.md](pool-list.md) | Pools, ranked by TVL, volume, fees or APR |
| `sunswap pool-search` | [pool-search.md](pool-search.md) | Search pools by token symbol or pool identifier |
| `sunswap token-list` | [token-list.md](token-list.md) | Tokens traded on SunSwap |
| `sunswap token-search` | [token-search.md](token-search.md) | Search those tokens by symbol |
| `sunswap price` | [price.md](price.md) | USD price of one or more tokens |

## Before you read the market data

**A symbol is not an identifier.** Every table in this group carries an `Address` column, and it is never decoration. The SunSwap catalogue lists impersonation tokens whose symbol *and* name match a real one — searching `USDT` returns several. Key on the address; treat the symbol as a label.

**A V4 pool id is not a contract address.** V4 pools share a single pool manager, so a V4 pool is identified by a 64-hex id. Read `protocol` before deciding what a `poolAddress` is. Where a pool id is accepted as input, a leading `0x` is stripped for you.

**`--protocol` is a scope on the token listings and a filter everywhere else.** On `token-list` / `token-search` it chooses which statistics are reported: `ALL` reports figures combined across every protocol and `V3` reports what happened inside V3, so rows from different scopes overlap and must never be added together. On `pool-list`, `pool-search` and `position-list` it filters rows instead, and `ALL` is not a value there — a pool belongs to one protocol, and "all of them" is spelled by omitting the flag.

**Zero is an answer.** `sunswap price` returns `"0"` for any address the service has not indexed — an unlisted token, an impersonation, or a plain wallet address. It does not mean the token is worthless.

**Paging is by whole pages, and only the first 1000 rows exist.** `--offset` must be a multiple of `--limit`, and a window whose `--offset` + `--limit` passes 1000 is refused as `invalid_value` before any request — the data service will not serve rows beyond that.

**Amounts are strings.** Reserves, liquidity and prices carry up to 27 significant digits, well past what a float holds. Keep them as decimal strings.

## Before you move money

**The protocols disagree about TRX.** On V2 and V4 a TRX side is deposited and returned **natively**. V3 pools are wrapped, so your TRX becomes **WTRX**. Naming `WTRX` explicitly always means the wrapped token.

**A V4 pool is named by its key.** `--token0 --token1 --fee --tick-spacing [--hooks]`, where `--tick-spacing` has no default: on V4 it is part of the pool's identity, and two pools at the same fee can differ only in it. [`pool-list --protocol V4`](pool-list.md) publishes each pool's `tickSpacing` and `hooks`.

**V4 slippage bounds point opposite ways.** On a V4 deposit, `--slippage` raises a **ceiling** on what the deposit may cost; on a V4 withdrawal, it lowers a **floor** on what comes back.

**Most approvals are exact, and are consumed.** On V2 and V3, each approval is for exactly the amount the call needs, and the contract spends it, so the next call of the same shape needs a fresh one. A router swap that spends a token approves exactly the trade too. The exception is a **V4 deposit**: the token's allowance to Permit2 is **unlimited**, while each Permit2 grant it signs is exact and lasts one hour. The dry run shows which you are getting (`Allowance  unlimited`). [`sunpump sell`](../sunpump/sell.md) also grants an unlimited allowance.

**A command may send several transactions.** Approvals are sent and confirmed before the call that spends them — always, even without `--wait`; each approval waits up to `--wait-timeout`, so several can lengthen the run. If an approval does not confirm in time the command stops with `timeout` before anything depends on it. If a later step fails, the approvals stay on chain and their IDs are listed in `error.details.approvalTxIds` (and in the text error); check them before retrying. Re-running is safe: an allowance that already suffices is not approved again.

**A dry run before an approval prices the approval only.** The deposit, withdrawal or swap itself cannot be simulated until its allowance is on chain, so the dry run says `Fee (est, approvals only)` and JSON carries `feeCovers: "approvals"`. See [fee is an estimate](../../machine-interface.md#fee-is-an-estimate-and-feecovers-says-what-it-covers).

**A fee estimate is a lower bound.** TRON prices a call by simulating it against current state, and the real execution writes storage the simulation does not. `--fee-limit` defaults to a constant (`100000000` SUN) and is never derived from the estimate.

**Transactions that would succeed and achieve nothing are refused.** A deposit into a pool that has no established price, and a fee collection on a position owed nothing, are both accepted by the contracts and both cost a real fee. They are refused here instead.

**No `--sign-only`.** A flow of several transactions cannot guarantee offline what order its parts land in. `--dry-run` and `--build-only` need no password and work for a watch-only account; signing uses the software password channel or Ledger approval.

**Ledger** accounts need **Custom contracts** and **Sign by Hash** allowed in the TRON app — see [TRON app settings](../../guide/ledger.md#tron-app-settings).

## See also

[`sunpump`](../sunpump/index.md) — the SunPump launchpad, whose tokens `swap` also reaches · [`token list`](../token/list.md) — the *local* address book, a different thing from the DEX catalogue · [machine-interface.md](../../machine-interface.md)
