# wallet-cli exchange trade

Swap one side of a pair for the other.

## Synopsis

```
wallet-cli exchange trade <id> --sell <TRX|asset-id>
                          (--amount <n> | --raw-amount <n>)
                          [--min-received <n> | --raw-min-received <n> | --slippage <percent>]
                          [--dry-run | (--sign-only | --build-only) [--expiration <ms>] | --wait [--wait-timeout <ms>]]
                          [--permission-id <n>] [options]
```

## Description

Sells one side of the pair for the other along the Bancor curve. Settlement is immediate and needs no counterparty, and **anyone can trade** — unlike liquidity, trading is not restricted to the pair's creator.

The floor is optional, and **omitting it means no slippage protection at all**:

- `--min-received` is an absolute floor, **not an estimate**. If the trade would return less, the whole thing is rejected on chain as `slippage_exceeded` and only bandwidth is spent. It is the only defence against the price moving between signing and execution. `--raw-min-received` is the same figure in minimal units.
- `--slippage` is the convenience form: the CLI reads the current reserves, computes what the trade would return, subtracts that percentage, and sends the result as the floor. What reaches the chain is always an absolute number.
- **With none of the three**, the floor sent on chain is `1` — the lowest value the protocol accepts — so the trade takes any non-zero return at any price. The response carries a warning in `meta.warnings` saying so.

At most one of the three may be given; combining them is a usage error.

Slippage grows with trade size relative to the reserves — that is the curve, not a fee; the protocol takes no cut. Check depth with [`exchange show`](show.md), and price a specific amount with `exchange trade --dry-run`.

**Tokens are named by id only** — `TRX` (or its on-chain id `_`) and a numeric TRC10 id; a TRC10 name may contain `:`. `--amount` is in whole tokens of the side being sold, `--raw-amount` in minimal units; exactly one of them is required.

> **Trading may be closed on the network you are on.** java-tron refuses `ExchangeTransactionContract` outright until the TIP-836 hardening proposal (`getAllowHardenExchangeCalculation`) is activated — it is unset on both mainnet and Nile, and the command then fails with `exchange_trading_disabled`. [`exchange create`](create.md), [`inject`](inject.md) and [`withdraw`](withdraw.md) are unaffected.

**By default the command returns at submission** (`stage: "submitted"`), not confirmation — add `--wait` to block until confirmed/failed. Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign — `--dry-run` and `--build-only` do not unlock the wallet and run without it. Watch-only accounts fail with `watch_only_no_signer` in a signing mode.

## Options

| Option | Description |
|---|---|
| `<id>` | **Required.** Exchange pair id |
| `--sell <TRX\|asset-id>` | **Required.** The side you are selling; the other side is what you receive |
| `--amount <n>` | How much to sell, in whole tokens, > 0. One of `--amount` / `--raw-amount` |
| `--raw-amount <n>` | The same amount in minimal units. One of `--amount` / `--raw-amount` |
| `--min-received <n>` | Lowest acceptable return, in whole tokens; below it the trade reverts. At most one of the three floor flags |
| `--raw-min-received <n>` | The same floor in minimal units |
| `--slippage <percent>` | Derive the floor from current reserves, minus this percentage; > 0 and < 100 |
| `--dry-run` | Build and estimate only, no signature/broadcast; excludes `--sign-only` / `--build-only` |
| `--sign-only` | Sign without broadcasting, output the signed hex; excludes `--dry-run` / `--build-only`; pairs with `--expiration` |
| `--build-only` | Build only, output the **unsigned** hex; excludes `--dry-run` / `--sign-only`; pairs with `--expiration` |
| `--expiration <ms>` | Transaction expiration in ms, up to `86400000` (24h); only with `--sign-only` or `--build-only`; omitted = node default (~60s) |
| `--permission-id <n>` | Permission group to sign with (0=owner, 1=witness, 2-9=active); default `0` |
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--password-stdin` | Master password from stdin (fd 0) |

Plus the [global options](../index.md#global-options-every-command).

## Examples

In the examples, `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

With an explicit floor:

```bash
echo "$PW" | wallet-cli exchange trade 12 --sell TRX --amount 100 --min-received 4900 --network tron:nile --wait --password-stdin
```

```console
✅ Trade completed
  Exchange id   12
  Trader        TQkXm4vN...5Zt7Uw
  Sold          100 TRX
  Received      4,950 MyToken
  Min accepted  4,900 MyToken
  TxID          d9a...
  Block         #57,884,455
  Fee           0 TRX
  Status        success
```

The same trade via `--slippage 1`: the CLI computes 4,950 from the current reserves, takes 1 % off, and sends 4,900 as the floor.

```bash
echo "$PW" | wallet-cli exchange trade 12 --sell TRX --amount 100 --slippage 1 --network tron:nile --wait --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"exchange.trade","data":{"kind":"exchange-trade","stage":"confirmed","txId":"d9a...","confirmed":true,"blockNumber":57884455,"failed":false,"exchangeId":12,"pair":"TRX:1000123","traderAddress":"TQkXm4vN...","soldTokenId":"_","soldQuant":"100000000","soldLabel":"TRX","soldDecimals":6,"receivedTokenId":"1000123","receivedLabel":"MyToken","receivedDecimals":6,"receivedQuant":"4950000000","estimatedReceivedQuant":"4950000000","minReceivedQuant":"4900000000","feeSun":0},"meta":{"durationMs":6490,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `exchangeId` / `pair` / `traderAddress` | number / string / string | The pair and the account that traded |
| `soldTokenId` / `soldQuant` | string | The side sold and how much, in minimal units |
| `soldLabel` / `soldDecimals` | string / number | How text renders that side in whole tokens |
| `receivedTokenId` / `receivedLabel` / `receivedDecimals` | — | The same three for the side received |
| `estimatedReceivedQuant` | string | What the Bancor curve predicted at build time — advisory, always present |
| `receivedQuant` | string | What the trade actually returned; **only once confirmed**, since it exists only in the receipt |
| `minReceivedQuant` | string | The floor that went on chain — yours, the one `--slippage` derived, or `"1"` when no floor was given |

TRX is identified as `"_"`; every quantity is a **string** in minimal units. Before confirmation text shows `Estimated return` in place of `Received`. `--wait` adds `stage: "confirmed"`, `confirmed`, `blockNumber`, `feeSun`, `failed`.

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`exchange_not_found` — no such pair, `token_not_in_exchange`, `exchange_closed` — a side holds zero, `exchange_trading_disabled` — the network is not accepting Bancor trades, `slippage_exceeded` — the return fell below the floor, `transaction_rejected` — the node refused it, for example for lack of balance, `watch_only_no_signer`, `auth_failed`) · `2` usage error (`missing_option` — no `--sell`; `invalid_option` — both or neither of `--amount` / `--raw-amount`, or more than one floor flag; `invalid_amount` — the amount or `--min-received` is not a decimal number, or has more decimal places than that token allows; `invalid_value` — amount ≤ 0, or a `--slippage` outside 0–100).

## See also

[`exchange show`](show.md) · [`exchange list`](list.md) · [`asset info`](../asset/info.md) · [Script safety](../../machine-interface.md#script-safety-never-mistake-submitted-for-confirmed)
