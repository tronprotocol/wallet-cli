# Sending TRX and Tokens

One command sends all three asset kinds — native TRX, TRC20, TRC10 — the selector flags decide which. Command examples run on Nile.

> **Password**: every `tx send` needs your master password on stdin, and signing shows no prompt. The examples below omit it to keep the token flags in focus — prepend `printf '%s' "$PW" |` and append `--password-stdin`, or pipe from a password manager (see [Getting started](getting-started.md#3-send-your-first-transaction)).

## Native TRX

```bash
wallet-cli tx send --to TSx72ViULFepRGCS4PM5dP4FqD1d8qggCc --amount 1 --network tron:nile
```

`--amount` is human TRX (`1` = 1 TRX = 1,000,000 SUN). Prefer exact base units? Use `--raw-amount 1000000` instead — one or the other, never both.

## TRC20 tokens

A TRC20 token is identified by its **contract address**. Pass that address directly, or a short **symbol** that wallet-cli resolves to the contract for you:

```bash
# by contract address — always works
wallet-cli tx send --to T... --contract TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --amount 5 --network tron:nile

# by symbol — needs the token to be in the token book (see below)
wallet-cli tx send --to T... --token USDT --amount 5 --network tron:nile
```

TRC20 transfers execute contract code, so they consume **energy**; `--fee-limit` caps the TRX that may be burned for it (default 100000000 SUN = 100 TRX). If a transfer fails on fee limit, understand why before raising it — see [Energy & bandwidth](../concepts/energy-bandwidth.md).

### The token book (symbol → token)

`--token USDT` works by looking the symbol up in a per-network **token book**: a local table mapping a symbol to its on-chain token — a TRC20 contract, or a TRC10 asset id. Entries come from two sources, shown in the `Source` column of `token list`:

- **official** — built in for well-known tokens. On **mainnet**, `USDT` and `USDC` are preloaded; the **testnets** (Nile, Shasta) ship with none.
- **user** — tokens you add yourself.

```console
$ wallet-cli token list --network tron:mainnet
| Symbol | Name       | Source   | Contract / ID                      |
| ------ | ---------- | -------- | ---------------------------------- |
| USDT   | Tether USD | official | TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t |
| USDC   | USD Coin   | official | TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8 |
```

Because testnets carry no official entries, add a token once before `--token` resolves it there. `token add` reads the symbol and decimals off the token and stores a **user** entry — TRC20 by `--contract`, TRC10 by `--asset-id` — scoped to that one network:

```bash
wallet-cli token add --contract T... --network tron:nile      # TRC20, by contract
wallet-cli token add --asset-id 1000001 --network tron:nile   # TRC10, by numeric asset id
```

Manage the rest with the same group: `token list` to see all entries, `token remove` to drop a user entry, `token balance` / `token info` to query a token without adding it.

## TRC10 tokens

TRC10 assets have numeric ids, not contracts:

```bash
wallet-cli tx send --to T... --asset-id 1002000 --raw-amount 1000000 --network tron:nile
```

`--token`, `--contract`, and `--asset-id` are mutually exclusive; none of them means native TRX.

## Rehearse, then send

`--dry-run` builds the transaction and estimates fees without signing or broadcasting — nothing can leave your wallet:

```bash
wallet-cli tx send --to T... --token USDT --amount 5 --network tron:nile --dry-run -o json
```

Check the `fee` block in the output, then re-run without `--dry-run`. Submission alone is not success — either confirm afterwards with [`tx status`](../commands/tx/status.md), or add `--wait` to the `tx send` command so it blocks until the transaction is confirmed or failed.

> **Mainnet**: same commands with `--network tron:mainnet` move real assets, irreversibly. Triple-check `--to` (a confirmed transfer to a wrong address is gone), and dry-run first.

## See also

[`tx send` reference](../commands/tx/send.md) — every flag and output field · [`token` commands](../commands/token/index.md) — the token book · [Getting started](getting-started.md) · [Scripting](scripting.md) — automating sends safely
