# Recover addresses after `legacy_derivation`

Before 4.13.1, wallet-cli derived TRON accounts at `m/44'/195'/<index>'/0/0`. It now uses `m/44'/195'/0'/0/<index>`, the same layout as EVM. Account #0 is the same under both, and EVM paths never changed. **TRON accounts #1 and later in an older wallet keep their old address**, and this version handles them like this:

| What you do | Result |
|---|---|
| Sign as that TRON address (`tx send`, `message sign`, …) | `legacy_derivation` (exit 1) |
| `derive` a new account in that wallet | `legacy_derivation` (exit 1) |
| Use the same account's EVM address | works |
| Query balances, `--build-only`, `list`, `use` | works |
| `import mnemonic` with the recovery phrase | account #1 and later come back with **new** TRON addresses |

The old key is not lost — the recovery phrase still produces it at the old path. The steps below move each old TRON key into a standalone account, then rebuild the wallet on the new path. Only local data changes; nothing moves on chain.

## The error

```console
error [legacy_derivation]: account "main-1" was derived at m/44'/195'/1'/0/0, a TRON path this version no longer produces, so it cannot be signed here. Follow the complete recovery procedure before deleting anything:
  https://github.com/tronprotocol/wallet-cli/blob/wallet-cli-4.13.1/ts/docs/troubleshooting/legacy-derivation-recovery.md
```

## Before you start

The example wallet has one affected account, `main-1`:

```bash
wallet-cli list --network tron:728126428
```

```console
HD  wlt_n5g8s27j
├─ [0] main    TRTEhBEhyiXfRxG2kRbZ3KgenwpcZ4yUJA
└─ [1] main-1  TXyPxeWda1vGTj7mS5eF7gqSmbQ6p3PDKP  (active)
```

Save the account list and a native backup of the wallet:

```bash
wallet-cli list -o json > ./accounts-before.json
```

```bash
wallet-cli backup main --out ./main-mnemonic.json
```

Choose **Native wallet backup** at the prompt. The backup lists every account that needs step 1, with the command for it:

```console
warning: this version's default mnemonic recovery will NOT recreate wlt_n5g8s27j.1 (m/44'/195'/1'/0/0) — that account was derived at a TRON path this version no longer produces, but the recovery phrase can still derive that key at the listed path. Export it separately before deleting anything:
  wallet-cli backup wlt_n5g8s27j.1 --keystore --network tron:728126428 --password-stdin
```

Keep both files private and out of version control.

## 1. Keep the old TRON addresses

Export each listed account's TRON key as a keystore:

```bash
wallet-cli backup main-1 --keystore --network tron:728126428 --out ./main-1-tron.keystore.json
```

Import it as a standalone account. Enter the master password, then the keystore password — which is the master password the keystore was exported with:

```bash
wallet-cli import keystore ./main-1-tron.keystore.json --label main-1-legacy-tron
```

```console
✅ Imported wallet "main-1-legacy-tron"
  Account ID    wlt_pafmpa51
  Type          private key
  TRON address  TXyPxeWda1vGTj7mS5eF7gqSmbQ6p3PDKP
  EVM address   0xF15BeA353364D1022BCAa2f3F0A318ca2676A440
  Active        yes
```

The TRON address matches the old one and signs normally. The EVM address comes from the same private key and is **not** the wallet's EVM address for `main-1` — ignore it unless you mean to use it.

Check that every old TRON address now also appears under `private key`:

```bash
wallet-cli list --network tron:728126428
```

```console
HD  wlt_n5g8s27j
├─ [0] main            TRTEhBEhyiXfRxG2kRbZ3KgenwpcZ4yUJA
└─ [1] main-1          TXyPxeWda1vGTj7mS5eF7gqSmbQ6p3PDKP

private key
└─ main-1-legacy-tron  TXyPxeWda1vGTj7mS5eF7gqSmbQ6p3PDKP  (active)
```

Do not go on until it does. If you are sure you don't need an old TRON address, you can skip it.

## 2. Rebuild the wallet

Delete the HD wallet. This removes all of its accounts, but not the standalone accounts from step 1:

```bash
wallet-cli delete main --yes
```

Import the recovery phrase from `main-mnemonic.json`. This restores account #0:

```bash
wallet-cli import mnemonic --label main
```

## 3. Derive the other accounts again

`import mnemonic` only restores index 0. Derive every other index you had (`derive` takes the master password on stdin only; `$PW` holds it):

```bash
printf '%s' "$PW" | wallet-cli derive --account main --index 1 --label main-1 --password-stdin
```

Compare with `accounts-before.json`:

```bash
wallet-cli list --network eip155:1
```

```console
private key
└─ main-1-legacy-tron  0xF15BeA353364D1022BCAa2f3F0A318ca2676A440

HD  wlt_6xzxsmj5
├─ [0] main            0x811Bae29A75A3e283cC9B1ae4b7D7280429BD316
└─ [1] main-1          0x6F63D9e65070319885d1B46D3df31D6f1dB042e1  (active)
```

- Every EVM address matches the same index as before.
- Account #0 has the same TRON address as before.
- Account #1 and later have new TRON addresses. The old ones, with their funds, are under the `private key` accounts from step 1.

Move the backup and keystore files to secure storage once you have checked everything.

## `derivation_mismatch`

A different error: an address stored in `wallets.json` matches no path of its seed at all, so the wallet file and the encrypted vault disagree — usually because the file was edited or copied from another wallet. Signing as that account and deriving from its wallet fail with this code. Restore the files from your own copy, or rebuild the wallet from its recovery phrase.

## See also

[Accounts & HD](../concepts/accounts-and-hd.md) · [`backup`](../commands/backup.md) · [`derive`](../commands/derive.md) · [`import keystore`](../commands/import/keystore.md)
