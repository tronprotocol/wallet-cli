# Recover addresses after `legacy_derivation`

You may see an error like this:

```text
account "main-1" was derived at m/44'/195'/1'/0/0, a TRON path this version no longer produces, so it cannot be signed here. Follow the complete recovery procedure before deleting anything:
  https://github.com/tronprotocol/wallet-cli/blob/wallet-cli-4.13.1/ts/docs/troubleshooting/legacy-derivation-recovery.md
```

## What happened

Before v4.13.1, mnemonic wallets derived TRON sub-accounts with a legacy path. v4.13.1
corrected that path. TRON accounts previously derived at index `1` or later must be re-imported as
standalone private-key accounts to keep using their existing addresses. Index `0` is unchanged.

The recovery phrase still derives every legacy key when used with its original path. The problem
is that v4.13.1's default import and derive flow uses the corrected path and therefore does not
automatically recreate those TRON addresses.

Ethereum derivation did not change. After preserving any legacy TRON accounts, remove and
re-import the mnemonic wallet, then derive the same indexes again. This restores every original
Ethereum address and creates new TRON addresses with the corrected derivation.

This recovery reorganizes local keys; it does not move on-chain funds.

## How to recover the addresses

The examples below start with this wallet:

```bash
wallet-cli list --network tron:728126428
```

```text
HD  wlt_abc123
├─ [0] main    TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6
├─ [1] main-1  TCjow1qG4ZvDNj5ZRCF2RSuS2kMCGKK1JJ  (active)
└─ [2] main-2  TKUwMQUhHTADfAtfG4gAHwXFGa3PYDieMJ
```

Save the account list and recovery phrase before changing anything:

```bash
wallet-cli list -o json > ./accounts-before.json
wallet-cli backup main --out ./main-mnemonic.json
```

Choose **Native wallet backup** when prompted. Keep both files private and out of source control.
The mnemonic backup warning identifies every TRON account that needs the next step.

### 1. Preserve the legacy TRON addresses

Export every affected TRON account as a keystore:

```bash
wallet-cli backup main-1 --keystore --network tron:728126428 \
  --out ./main-1-tron.keystore.json
wallet-cli backup main-2 --keystore --network tron:728126428 \
  --out ./main-2-tron.keystore.json
```

Import the keystores with new labels:

```bash
wallet-cli import keystore ./main-1-tron.keystore.json --label main-1-legacy-tron
wallet-cli import keystore ./main-2-tron.keystore.json --label main-2-legacy-tron
```

For each import, enter the wallet master password, then enter it again as the keystore password.
Confirm that the imported TRON addresses match the original list:

```bash
wallet-cli list --network tron:728126428
```

```text
HD  wlt_abc123
├─ [0] main             TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6
├─ [1] main-1           TCjow1qG4ZvDNj5ZRCF2RSuS2kMCGKK1JJ
└─ [2] main-2           TKUwMQUhHTADfAtfG4gAHwXFGa3PYDieMJ

private key
├─ main-1-legacy-tron   TCjow1qG4ZvDNj5ZRCF2RSuS2kMCGKK1JJ
└─ main-2-legacy-tron   TKUwMQUhHTADfAtfG4gAHwXFGa3PYDieMJ  (active)
```

Do not remove the mnemonic wallet until every TRON address you need appears under `private key`.

> If you are certain you do not need the old TRON addresses, skip this step and continue below.

### 2. Rebuild the mnemonic wallet

Delete the original mnemonic wallet. This removes its entire HD group but leaves the standalone
TRON accounts imported above:

```bash
wallet-cli delete main --yes
```

Re-import the recovery phrase from `main-mnemonic.json`:

```bash
wallet-cli import mnemonic --label main
```

The import recreates the root account at index `0` with the label `main`.

### 3. Restore every Ethereum index

Recreate each previous index from the new root account:

```bash
wallet-cli derive --account main --index 1 --label main-1
wallet-cli derive --account main --index 2 --label main-2
```

`import mnemonic` restores only index `0`; every previous index must be derived explicitly.

Check the result:

```bash
wallet-cli list --network eip155:1
wallet-cli list --network tron:728126428
```

Under the new HD group:

- Every Ethereum address must match the same index in `accounts-before.json`.
- Index `0` has the same TRON address as before.
- Index `1` and later have new TRON addresses using the corrected derivation.

The old TRON addresses and their funds remain available under the imported `private key` accounts.
Move the mnemonic and keystore files to secure storage after verification.
