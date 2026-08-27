# Sending Coins and Tokens

One command sends every asset kind — the network's native coin, TRC20/ERC20 contract tokens, and TRC10 assets — the selector flags decide which. Command examples run on Nile; the same commands work on an EVM network by swapping `--network`.

> **Password**: every `tx send` needs your master password on stdin, and signing shows no prompt. The examples below omit it to keep the token flags in focus — prepend `printf '%s' "$PW" |` and append `--password-stdin`, or pipe from a password manager (see [Getting started](getting-started.md#3-send-your-first-transaction)).

## The native coin

```bash
wallet-cli tx send --to TSx72ViULFepRGCS4PM5dP4FqD1d8qggCc --amount 1 --network tron:nile
wallet-cli tx send --to 0x742d35Cc6634C0532925a3b844Bc454e4438f44e --amount 0.01 --network evm:11155111
```

`--amount` is the coin's human unit — `1` = 1 TRX = 1,000,000 SUN on TRON, `0.01` = 0.01 ETH = 10^16 wei on Sepolia. Prefer exact base units? Use `--raw-amount 1000000` instead — one or the other, never both.

## Contract tokens (TRC20 / ERC20)

A contract token is identified by its **contract address**. Pass that address directly, or a short **symbol** that wallet-cli resolves to the contract for you:

```bash
# by contract address — always works
wallet-cli tx send --to T... --contract TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --amount 5 --network tron:nile
wallet-cli tx send --to 0x... --contract 0xdAC17F958D2ee523a2206206994597C13D831ec7 --amount 5 --network evm:1

# by symbol — needs the token to be in the token book (see below)
wallet-cli tx send --to T... --token USDT --amount 5 --network tron:nile
```

A token transfer executes contract code, and the fee flags differ by family:

- **TRON** — it consumes **energy**; `--fee-limit` caps the TRX that may be burned for it (default 100000000 SUN = 100 TRX). If a transfer fails on fee limit, understand why before raising it — see [Energy & bandwidth](../concepts/energy-bandwidth.md).
- **EVM** — it consumes **gas**, estimated from the node. Override with `--gas-limit`, `--max-fee`, `--priority-fee`, `--nonce` — see [Networks → the `evm-gas` model](../concepts/networks.md#fees-the-evm-gas-model).

Each set is refused on the other family with `invalid_option`.

### The token book (symbol → token)

`--token USDT` works by looking the symbol up in a per-network **token book**: a local table mapping a symbol to its on-chain token — a TRC20/ERC20 contract, or a TRC10 asset id. Entries come from two sources, shown in the `Source` column of `token list`:

- **official** — built in, curated per network. `tron:mainnet` ships USDT / USDC / USDD, `tron:nile` ships USDT / USDD, and `evm:1` ships USDT / USDC. The other networks ship none.
- **user** — tokens you add yourself.

```bash
wallet-cli token list --network tron:mainnet
```

```console
| Symbol | Name            | Source   | Contract / ID                      |
| ------ | --------------- | -------- | ---------------------------------- |
| USDT   | Tether USD      | official | TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t |
| USDC   | USD Coin        | official | TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8 |
| USDD   | Usdd Stablecoin | official | TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz |
```

The book is **per network**, and an official entry is never copied between chains — the same symbol can have a different address and different decimals elsewhere (USDT is 6 decimals on Ethereum and 18 on BNB Smart Chain). On a network with no official entries, add a token once before `--token` resolves it there. `token add` reads the symbol and decimals off the token and stores a **user** entry — by `--contract` on either family, or by `--asset-id` for a TRC10 — scoped to that one network:

```bash
wallet-cli token add --contract T... --network tron:nile         # TRC20, by contract
wallet-cli token add --contract 0x... --network evm:11155111     # ERC20, by contract
wallet-cli token add --asset-id 1000001 --network tron:nile      # TRC10, TRON only
```

Manage the rest with the same group: `token list` to see all entries, `token remove` to drop a user entry, `token balance` / `token info` to query a token without adding it.

## TRC10 tokens — TRON only

TRC10 assets have numeric ids, not contracts:

```bash
wallet-cli tx send --to T... --asset-id 1002000 --raw-amount 1000000 --network tron:nile
```

`--asset-id` is a TRON-only flag; on an EVM network it fails with `invalid_option`.

`--token`, `--contract`, and `--asset-id` are mutually exclusive; none of them means the network's native coin.

## Rehearse, then send

`--dry-run` builds the transaction and estimates fees without signing or broadcasting — nothing can leave your wallet:

```bash
wallet-cli tx send --to T... --token USDT --amount 5 --network tron:nile --dry-run -o json
```

Check the `fee` block in the output, then re-run without `--dry-run`. Submission alone is not success — either confirm afterwards with [`tx status`](../commands/tx/status.md), or add `--wait` to the `tx send` command so it blocks until the transaction is confirmed or failed.

> **Mainnet**: the same commands with `--network tron:mainnet`, `--network evm:1` or `--network evm:56` move real assets, irreversibly. Triple-check `--to` (a confirmed transfer to a wrong address is gone), and dry-run first.

## See also

[`tx send` reference](../commands/tx/send.md) — every flag and output field · [`token` commands](../commands/token/index.md) — the token book · [Getting started](getting-started.md) · [Scripting](scripting.md) — automating sends safely
