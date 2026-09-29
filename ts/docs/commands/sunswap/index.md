# wallet-cli sunswap

Manage liquidity and look up pools, positions and prices on SunSwap.

This release ships six **queries** against the SunSwap market data service, `position-info`, which reads one position from the chain, three **liquidity** commands that sign and broadcast on V2, V3 and V4, and `swap`, which prices both markets and sends on the SunPump curve.

> **TRON only.** The six queries are additionally **mainnet only**: the market data service holds no testnet data, so on Nile or Shasta they fail with `unsupported_network_capability` (exit 2) and the message names the networks that do work. The three liquidity commands and `position-info` talk to contracts rather than to that service, so they work on **`tron` and `nile`** (`position-info` shows USD values on mainnet only). Availability is a config question, not a build one: a network gains the queries when its `sunswap.marketApiBaseUrl` is set, and the contract-based commands when its `sunswap.contracts` block carries the routers and position managers.

## Synopsis

```
wallet-cli sunswap COMMAND
```

## Subcommands

| Command | Page | Description |
|---|---|---|
| `sunswap position-list` | [position-list.md](position-list.md) | Liquidity positions held by an address |
| `sunswap position-info` | [position-info.md](position-info.md) | One V3 or V4 position, read from the chain |
| `sunswap pool-list` | [pool-list.md](pool-list.md) | Pools, ranked by TVL, volume, fees or APR |
| `sunswap pool-search` | [pool-search.md](pool-search.md) | Search pools by token symbol or pool identifier |
| `sunswap token-list` | [token-list.md](token-list.md) | Tokens traded on SunSwap |
| `sunswap token-search` | [token-search.md](token-search.md) | Search those tokens by symbol |
| `sunswap price` | [price.md](price.md) | USD price of one or more tokens |
| `sunswap add-liquidity` | [add-liquidity.md](add-liquidity.md) | Deposit both sides of a pair into a pool |
| `sunswap remove-liquidity` | [remove-liquidity.md](remove-liquidity.md) | Withdraw liquidity from a pool or position |
| `sunswap collect-fees` | [collect-fees.md](collect-fees.md) | Take a V3 or V4 position's earned fees |
| `sunswap swap` | [swap.md](swap.md) | Exchange one token for another |

## Things worth knowing before you script against these

**A symbol is not an identifier.** Every table in this group carries an `Address` column, and it is never decoration. The SunSwap catalogue lists impersonation tokens whose symbol *and* name match a real one — searching `USDT` returns several. Key on the address; treat the symbol as a label.

**A V4 pool id is not a contract address.** V4 pools share a single pool manager, so a V4 pool is identified by a 64-hex id. Querying it as a contract fails. Read `protocol` before deciding what a `poolAddress` is. Where a pool id is accepted as input, a leading `0x` is stripped for you; the service will not match one that still carries it.

**A protocol scope is not a filter, and `--protocol` is not one flag.** On the token listings it chooses a statistic SCOPE: `ALL` reports figures combined across every protocol and `V3` reports what happened inside V3, so rows from different scopes overlap and must never be added together. On `pool-list`, `pool-search` and `position-list` it FILTERS rows instead, and there `ALL` is not a value — a pool or a position belongs to one protocol, and "all of them" is spelled by omitting the flag. Each command's help and `--json-schema` list exactly what it accepts.

**Zero is an answer.** `sunswap price` returns `"0"` for any address the service has not indexed — an unlisted token, an impersonation, or a plain wallet address. It does not mean the token is worthless.

**Paging is by whole pages.** `--limit` and `--offset` work as they do everywhere else in this CLI, but the upstream service pages by page number, so `--offset` must be a multiple of `--limit`. Anything else is refused rather than quietly rounded to a page boundary.

**Amounts are strings.** Reserves, liquidity and prices carry up to 27 significant digits — well past what a float holds. They are decimal strings in JSON and must stay that way; `JSON.parse` in a consumer will damage them the same way it would here.

**No account, no password.** None of the six queries, nor `position-info`, reads a wallet. They run against an empty `WALLET_CLI_HOME`. The liquidity commands need an account, and a password only in the modes that sign — `--dry-run` and `--build-only` unlock nothing and work for a watch-only account.

## Things worth knowing before you move money

**The protocols disagree about TRX.** On V2 and V4 a TRX side is deposited and returned **natively**. On V3 the pools are wrapped, so your TRX becomes **WTRX**. Naming `WTRX` explicitly always means the wrapped token.

**A V4 pool is named by its key, not by one flag.** `--token0 --token1 --fee --tick-spacing [--hooks]`, where `--tick-spacing` is required with no default: on V4 it is part of the pool's identity, and two pools at the same fee can differ only in it. [`pool-list --protocol V4`](pool-list.md) publishes each pool's `tickSpacing` and `hooks`. See [`add-liquidity`](add-liquidity.md#v4-a-pool-is-named-by-its-key).

**V4 slippage bounds point opposite ways.** On a V4 deposit, `--slippage` raises a **ceiling** on what the deposit may cost; on a V4 withdrawal, it lowers a **floor** on what comes back.

**Approvals are exact and are consumed.** Every approval this group sends is for precisely the amount its call needs, never unbounded — and the contract spends it, so the next call of the same shape needs a fresh one. The one exception is a V4 deposit, whose token allowance to Permit2 is unlimited while each Permit2 grant it signs is exact and short-lived; see [`add-liquidity`](add-liquidity.md#approvals-on-v4). That is why a dry run of a first deposit prices the approvals alone: the deposit itself cannot be simulated until its allowance is on chain. `feeCovers` in the JSON says which of the two states you are looking at.

**A fee estimate is a lower bound.** TRON prices a call by simulating it against current state, and the real execution writes storage the simulation does not. Measured: 107,565 energy estimated, 120,426 burned. `--fee-limit` defaults to a constant and is never derived from the estimate.

**Amounts carry their scale; a position's liquidity does not.** Every token amount in these receipts is base units with `decimals` beside it. A V3 or V4 position's `liquidity` is a number the contract keeps — not denominated in either token, and with no decimals to carry.

**The commands refuse transactions that would succeed and achieve nothing.** A mint into a pool with no established price, and a fee collection on a position owed nothing, are both accepted by the contracts and both cost a real fee. They are refused here instead.

## See also

[`token list`](../token/list.md) — the *local* address book, which is a different thing from the on-chain DEX catalogue · [machine-interface.md](../../machine-interface.md)
