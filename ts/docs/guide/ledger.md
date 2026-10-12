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

Instead of a password prompt, the Ledger asks you to approve. When the TRON app can decode the transaction, its details appear **on the Ledger screen** — verify the recipient and amount there (that is the whole point of the device) and approve. Some contract operations are signed by hash instead; see [Hash signing](#hash-signing). The transaction then broadcasts normally; confirm with [`tx status`](../commands/tx/status.md).

**Time to review.** A TRON transaction normally expires about 60 seconds after it is built, which a careful on-device review can outlast. For a new TRON transaction sent to a Ledger, the CLI therefore sets the expiration to at least ten minutes from signing — or the device timeout (`--timeout`) plus one minute, if longer. An expiration you set yourself is kept, and a transaction file that was already built or signed elsewhere is never changed. The expiration is checked again after the device signs: a transaction that expired while you were reviewing it fails with `tx_expired` and is not broadcast — rebuild and sign again.

This is your best defense against address-swapping malware: what the device screen shows is what gets signed, regardless of what the host displays.

## 3. When the device doesn't respond

Device calls are bounded by the same `--timeout` as RPC (default 60000 ms) and fail with `error.code: "timeout"`. In order:

1. Is the Ledger unlocked and the right app open — the one the account was registered with, not the dashboard?
2. Replug the cable; avoid USB hubs.
3. Retry with a longer `--timeout` — on-device confirmation counts against it, so leave yourself time to read and press.

The error code says what went wrong with the device itself:

| Code | Meaning | What to do |
|---|---|---|
| `device_not_found` | No Ledger was detected | Connect and unlock it |
| `device_unavailable` | A Ledger was detected but could not be opened | Close Ledger Live and any other app using the device, check USB access, reconnect |
| `device_disconnected` | The connection was lost during the operation | Reconnect, unlock, reopen the right app, retry |
| `ledger_unsupported` | The open app cannot sign this, or is not the right app | Open the right app and check its version |
| `ledger_setting_required` | A TRON app setting is off | Enable the setting the message names — see [TRON app settings](#tron-app-settings) |
| `signing_rejected` | You declined on the device | — |

On a timeout or cancellation the CLI closes the device without waiting for it; if the next command cannot open it, reconnect it.

More remedies: [Troubleshooting](../troubleshooting.md#timeout-exit-1).

## Offline pattern

Ledger already isolates keys, but you can still split build, sign and broadcast. For a device machine with no chain access: build the TRON unsigned hex with an explicit signing window on a connected machine (`--build-only --expiration 3600000`), sign it with `tx sign --offline` where the Ledger is attached, then broadcast the signed hex from a connected machine. The default TRON expiry is about 60 seconds — usually too short for a cross-machine workflow; the maximum is 24 hours. EVM artifacts have no expiration flag. See [Scripting → Sign here, broadcast there](scripting.md#sign-here-broadcast-there).

## TRON app settings

Two settings under **TRON app → Settings** gate contract signing, and both default to *Not allowed*:

- **Custom contracts** — every smart-contract call, including TRC20 approvals and the SunSwap and SunPump trades.
- **Sign by Hash** — TIP-712 typed data such as Permit2 grants, and transactions too large for the device to display.

The [`sunswap`](../commands/sunswap/index.md) and [`sunpump`](../commands/sunpump/index.md) write commands need both. A missing setting fails with `ledger_setting_required`, naming the setting to enable. In a command that sends several transactions, any approval sent before the failure stays on chain; its ID is in `error.details.approvalTxIds`.

<a id="hash-signing-and-recovery"></a>

## Hash signing

Permit2 grants (a router `sunswap swap` that spends a token, a V4 `sunswap add-liquidity`) are signed by hash, and so are contract transactions too large for the device to decode. The device then shows a **hash**, not the token, amount and spender — so check those in the CLI's preview (`--dry-run` shows them) before you approve. When a transaction falls back to hash signing, the CLI warns. Not every swap is signed by hash: a swap that spends TRX is an ordinary contract call the device can display.

## See also

[`import ledger` help](../commands/import/index.md) · [Security model](../concepts/security.md) · [Getting started](getting-started.md)
