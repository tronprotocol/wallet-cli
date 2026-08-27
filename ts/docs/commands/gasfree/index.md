# wallet-cli gasfree

Gas-free token transfers via the GasFree service.

`gasfree` moves tokens without holding any TRX: you sign a transfer with EIP-712 structured-data signing and the GasFree service ([open.gasfree.io](https://open.gasfree.io)) puts it on-chain for you. The fee is charged in the transferred token itself — a per-transfer service fee, plus a one-time activation fee on your first transfer — so **no TRX is needed**.

**TRON only.** GasFree is a TRON service; every subcommand here fails with `family_mismatch` on an EVM network.

## Synopsis

```
wallet-cli gasfree COMMAND
```

## Subcommands

| Command | Page | Description |
|---|---|---|
| `gasfree info` | [info.md](info.md) | Your GasFree address, activation status, nonce, and fee schedule |
| `gasfree transfer` | [transfer.md](transfer.md) | Sign a gas-free transfer and submit it to the provider |
| `gasfree trace` | [trace.md](trace.md) | Track a submitted transfer by its trace id |

## How it works

- Each account has a **deterministically-derived GasFree address**. Assets are received and paid from that address — to receive USDT gas-free, give the sender your GasFree address (`gasfree info`).
- On your **first** transfer, the provider activates the GasFree address on-chain and charges a one-time activation fee, on top of the per-transfer service fee. Both are deducted in the token.
- Signatures are ordered by a per-address **nonce** to prevent replay.
- Requires provider **API credentials** — set `gasfreeApiKey` / `gasfreeApiSecret` with [`config`](../config.md). `--network` selects the service environment (mainnet / testnet).

Compared with [`tx send`](../tx/send.md): `tx send` broadcasts on-chain, spending bandwidth/energy or burning TRX; `gasfree transfer` goes through the provider's API — zero TRX, but a token-denominated fee per transfer. When you have TRX or energy, `tx send` is usually cheaper; `gasfree` is for the "no TRX at all" case.

## See also

[`gasfree info`](info.md) · [`gasfree transfer`](transfer.md) · [`gasfree trace`](trace.md) · [`config`](../config.md) · [`tx send`](../tx/send.md)
