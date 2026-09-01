# Using a Ledger Hardware Wallet

Keep keys on the device; wallet-cli builds transactions and the Ledger signs them on-screen. The private key never touches your computer.

## Prerequisites

- Ledger connected, **unlocked**, with the right app open on the device — the **TRON app** for a TRON account, the **Ethereum app** for an EVM one;
- that app installed via Ledger Live beforehand.

## 1. Register the Ledger account

```bash
wallet-cli import ledger --app tron --index 0 --label cold
wallet-cli import ledger --app ethereum --index 0 --label cold-evm
```

Locally this creates a **watch-only** entry — no secret is stored; signing happens on the device. Three ways to pick the account (mutually exclusive):

| Flag | Use when |
|---|---|
| `--index <n>` | You know the account index under wallet-cli's family path template |
| `--path <bip32>` | You need an explicit derivation path, e.g. `m/44'/195'/0'/0/0` (TRON) or `m/44'/60'/0'/0/0` (Ethereum) |
| `--address <addr>` | You know the address; wallet-cli scans indexes to find it (`--scan-limit`, default 20) |

**`--app` fixes the account to one chain family.** Unlike a software account — which holds a TRON *and* an EVM address from the same seed — a Ledger account has exactly the one address its app derives, and only works on networks of that family. Selecting it elsewhere fails with `family_mismatch`. Import the same device twice, once per app, to cover both.

With no locator, a TTY presents a paged account selector; a non-interactive invocation falls back to index 0. For Ethereum, wallet-cli's `--index <n>` template is `m/44'/60'/0'/0/<n>` (MetaMask style), while Ledger Live commonly uses `m/44'/60'/<n>'/0/0`. Use `--path` to register the exact Ledger Live account instead of assuming the indexes are interchangeable.

Confirm with `wallet-cli list` — the account appears alongside your software accounts and works with `use`, `--account`, and every query command. `list` shows one family at a time, so a TRON-app account is invisible under `--network sepolia` and vice versa; `-o json` shows every account regardless.

## 2. Sign and send

Nothing changes in the commands:

```bash
wallet-cli tx send --to T... --amount 1 --network tron:nile --account cold
```

Instead of a password prompt, the transaction details appear **on the Ledger screen** — verify the recipient and amount there (that is the whole point of the device) and approve. The transaction then broadcasts normally; confirm with [`tx status`](../commands/tx/status.md).

This is your best defense against address-swapping malware: what the device screen shows is what gets signed, regardless of what the host displays.

## 3. When the device doesn't respond

Device calls are bounded by the same `--timeout` as RPC (default 60000 ms) and fail with `error.code: "timeout"`. In order:

1. Is the Ledger unlocked and the right app open (not the dashboard)?
2. Replug the cable; avoid USB hubs.
3. Retry with a longer `--timeout` — on-device confirmation counts against it, so leave yourself time to read and press.

More remedies: [Troubleshooting](../troubleshooting.md#timeout-exit-1).

## Offline pattern

Ledger already isolates keys, but you can still split build/sign/broadcast. For a device machine with no chain access, build TRON unsigned hex with an explicit signing window, for example `--build-only --expiration 3600000`, on a connected machine; sign it with `tx sign --offline` where the Ledger is attached; then broadcast the signed hex from a connected machine. The default TRON expiry is about 60 seconds and is usually too short for a cross-machine workflow; the maximum is 24 hours. EVM artifacts have no expiration flag. See [Scripting → Sign here, broadcast there](scripting.md#sign-here-broadcast-there).

## See also

[`import ledger` help](../commands/import/index.md) · [Security model](../concepts/security.md) · [Getting started](getting-started.md)
