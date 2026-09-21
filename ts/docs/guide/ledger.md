# Using a Ledger Hardware Wallet

Keep keys on the device; wallet-cli builds transactions and the Ledger signs them on-screen. The private key never touches your computer.

## Prerequisites

- Ledger connected, **unlocked**, with the app you want open on the device — **TRON** or **Ethereum**;
- that app installed via Ledger Live beforehand.

## 1. Register the Ledger account

```bash
wallet-cli import ledger --app tron --index 0 --label cold
```

Locally this creates a **watch-only** entry — no secret is stored; signing happens on the device.

`--app` selects the chain family, and a Ledger account is **single-family**: `--app tron` registers a `tron` account, `--app ethereum` an `evm` one, and each holds only that one address. Unlike a software account — which derives a TRON *and* an EVM address from the same seed — it works only on networks of its own family, and selecting it elsewhere fails with `family_mismatch`. Import the same device twice, once per app, to hold both.

Three ways to pick the account (mutually exclusive):

| Flag | Use when |
|---|---|
| `--index <n>` | You know the account index in Ledger Live |
| `--path <bip32>` | You need an explicit derivation path, e.g. `m/44'/195'/0'/0/0` (TRON) or `m/44'/60'/0'/0/0` (Ethereum) |
| `--address <addr>` | You know the address; wallet-cli scans indexes to find it (`--scan-limit`, default 20) |

With all three omitted, an attached TTY opens a paged account selector; a non-interactive run has no selector and falls back to index 0. `--index <n>`, the selector, and `--address` scanning follow Ledger Live's template: `m/44'/195'/<n>'/0/0` for TRON and `m/44'/60'/<n>'/0/0` for Ethereum. Software accounts use `m/44'/<coin>'/0'/0/<n>`, so the same index number means a different address except at 0. Use `--path` for any other scheme.

Confirm with `wallet-cli list` — the account appears alongside your software accounts and works with `use`, `--account`, and every query command.

## 2. Sign and send

Nothing changes in the commands:

```bash
wallet-cli tx send --to T... --amount 1 --network nile --account cold
```

Instead of a password prompt, the transaction details appear **on the Ledger screen** — verify the recipient and amount there (that is the whole point of the device) and approve. The transaction then broadcasts normally; confirm with [`tx status`](../commands/tx/status.md).

This is your best defense against address-swapping malware: what the device screen shows is what gets signed, regardless of what the host displays.

## 3. When the device doesn't respond

Device calls are bounded by the same `--timeout` as RPC (default 60000 ms) and fail with `error.code: "timeout"`. In order:

1. Is the Ledger unlocked and the right app open — the one the account was registered with, not the dashboard?
2. Replug the cable; avoid USB hubs.
3. Retry with a longer `--timeout` — on-device confirmation counts against it, so leave yourself time to read and press.

More remedies: [Troubleshooting](../troubleshooting.md#timeout-exit-1).

## Offline pattern

Ledger already isolates keys, but you can still split build, sign and broadcast. For a device machine with no chain access: build the TRON unsigned hex with an explicit signing window on a connected machine (`--build-only --expiration 3600000`), sign it with `tx sign --offline` where the Ledger is attached, then broadcast the signed hex from a connected machine. The default TRON expiry is about 60 seconds — usually too short for a cross-machine workflow; the maximum is 24 hours. EVM artifacts have no expiration flag. See [Scripting → Sign here, broadcast there](scripting.md#sign-here-broadcast-there).

## See also

[`import ledger` help](../commands/import/index.md) · [Security model](../concepts/security.md) · [Getting started](getting-started.md)
