# Getting Started

Create a wallet, fund it on the Nile testnet, check the balance, and send your first transaction — about 10 minutes end to end. Everything here runs on **Nile** (test TRX, no real value).

Prerequisite: wallet-cli is installed — `wallet-cli --version` prints a version number. If it doesn't, see [Install](../../README.md#install).

## 1. Create a wallet

```bash
wallet-cli create --label main
```

You will be prompted for a **master password** — it encrypts all local secrets and cannot be recovered if you lose it. It must be at least 8 characters and include an uppercase letter, a lowercase letter, a digit, and a special character.

**Tip — a password manager is preferable.** It generates a strong, unique password and keeps it out of your shell history, process list, and plaintext files. Any password manager with a command-line tool works — the examples here use 1Password's `op` purely as an illustration (install and sign in — [docs](https://developer.1password.com/docs/cli/)). Save your chosen master password as an item, then create the wallet by reading it back:

```bash
op read "op://Private/wallet-cli/password" | wallet-cli create --label main --password-stdin
```

`create` does **not** print your recovery phrase — the seed is encrypted locally. To get a written backup, run [`backup`](../commands/backup.md), which writes a `0600` file containing the plaintext BIP39 mnemonic; store that file offline. It is the only way to restore the wallet on another machine.

Already have a mnemonic or private key? Use [`import mnemonic`](../commands/import/mnemonic.md) or [`import private-key`](../commands/import/private-key.md) instead.

Confirm the new account exists:

```bash
wallet-cli list
```

```console
HD  wlt_4473p34m
└─ [0] main        TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ  (active)
```

The `T…` string is your TRON address, same on every network. `(active)` marks the account commands act on by default; switch with `wallet-cli use <label>`.

## 2. Get test TRX

Open the Nile faucet at [nileex.io/join/getJoinPage](https://nileex.io/join/getJoinPage), find the "Get 2000 test coins" section, paste your `T…` address, pass the captcha, and submit (once per day; arrives in under a minute). Then verify it arrived:

```bash
wallet-cli account balance --network tron:nile
```

```console
Label    main
Balance  1976.489 TRX
```

Tip: set Nile as your default so you can drop `--network` while learning:

```bash
wallet-cli config defaultNetwork tron:nile
```

## 3. Send your first transaction

Sending a transaction takes your master password on stdin via `--password-stdin`:

```bash
printf '%s' "$MY_PASSWORD" | wallet-cli tx send --to TSx72ViULFepRGCS4PM5dP4FqD1d8qggCc --amount 1 --network tron:nile --password-stdin
```

**Tip — a password manager is preferable** (setup in step 1). Pipe the password straight from it:

```bash
op read "op://Private/wallet-cli/password" | wallet-cli tx send --to TSx72ViULFepRGCS4PM5dP4FqD1d8qggCc --amount 1 --network tron:nile --password-stdin
```

The transaction is signed and **submitted**. Submission is not confirmation — check where it landed:

```bash
wallet-cli tx status --txid <the txid you got back> --network tron:nile
```

```console
TxID    7d9b6a08505537f7fd51ed4fb4223ce89098403d26e8d3fe07bdb3d625a46364
Status  confirmed ✅
```

`pending` means wait and re-run; `failed` means the chain rejected it (see [troubleshooting](../troubleshooting.md)). To make `tx send` block until confirmed, add `--wait`.

Not sure about a transaction? Rehearse it first — `--dry-run` builds and estimates without signing or broadcasting:

```bash
wallet-cli tx send --to TSx72ViULFepRGCS4PM5dP4FqD1d8qggCc --amount 1 --network tron:nile --dry-run
```

## 4. Where to go next

- Send TRC20/TRC10 tokens (e.g. USDT): [Sending tokens](send-tokens.md)
- Stop burning TRX on fees: [Staking and resources](stake-and-resources.md)
- Vote for super representatives and claim voting rewards after staking: [`vote`](../commands/vote/index.md), [`reward`](../commands/reward/index.md)
- Hardware-wallet signing: [Ledger guide](ledger.md)
- Full transaction detail and receipts: [`tx info`](../commands/tx/info.md)
- Your history and holdings: [`account history`](../commands/account/history.md), [`account portfolio`](../commands/account/portfolio.md)
- Automating any of this: [Scripting guide](scripting.md)
- What `tron:nile` / `tron:mainnet` actually are: [Networks](../concepts/networks.md)

> **Before touching mainnet**: mainnet TRX is real money. Re-check the recipient address, prefer `--dry-run` first, and understand that a confirmed transaction cannot be reversed.
