# Using a Ledger Hardware Wallet

Keep keys on the device; wallet-cli builds transactions and the Ledger signs them on-screen. The private key never touches your computer.

## Prerequisites

- Ledger connected, **unlocked**, with the **TRON app open** on the device;
- the TRON app installed via Ledger Live beforehand.

## 1. Register the Ledger account

```bash
wallet-cli import ledger --app tron --index 0 --label cold
```

Locally this creates a **watch-only** entry — no secret is stored; signing happens on the device. Three ways to pick the account (mutually exclusive):

| Flag | Use when |
|---|---|
| `--index <n>` | You know the HD account index (omit everything for index 0) |
| `--path <bip32>` | You need an explicit derivation path, e.g. `m/44'/195'/0'/0/0` |
| `--address <T…>` | You know the address; wallet-cli scans indexes to find it (`--scan-limit`, default 20) |

Confirm with `wallet-cli list` — the account appears alongside your software accounts and works with `use`, `--account`, and every query command.

## 2. Sign and send

Nothing changes in the commands:

```bash
wallet-cli tx send --to T... --amount 1 --network tron:nile --account cold
```

Instead of a password prompt, the transaction details appear **on the Ledger screen** — verify the recipient and amount there (that is the whole point of the device) and approve. The transaction then broadcasts normally; confirm with [`tx status`](../commands/tx/status.md).

This is your best defense against address-swapping malware: what the device screen shows is what gets signed, regardless of what the host displays.

## 3. When the device doesn't respond

Device calls are bounded by the same `--timeout` as RPC (default 60000 ms) and fail with `error.code: "timeout"`. In order:

1. Is the Ledger unlocked and the TRON app open (not the dashboard)?
2. Replug the cable; avoid USB hubs.
3. Retry with a longer `--timeout` — on-device confirmation counts against it, so leave yourself time to read and press.

More remedies: [Troubleshooting](../troubleshooting.md#timeout-exit-1).

## Offline pattern

Ledger already isolates keys, but you can combine it with the split flow — `--sign-only` on the machine with the device, [`tx broadcast`](../commands/tx/broadcast.md) on a connected one. See [Scripting → Sign here, broadcast there](scripting.md#sign-here-broadcast-there).

## See also

[`import ledger` help](../commands/import/index.md) · [Security model](../concepts/security.md) · [Getting started](getting-started.md)
