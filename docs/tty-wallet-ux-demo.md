# TTY Wallet UX Demo

Date: 2026-06-22

This note records the current TTY experience for the six interactive wallet commands:

- `wallet create`
- `wallet import-mnemonic`
- `wallet import-private-key`
- `wallet import-ledger`
- `wallet delete`
- `wallet backup`

The demo was run against an isolated home:

```bash
export WALLET_CLI_HOME=/tmp/wallet-cli-tty-demo-uW85Sq
export NO_COLOR=1
pnpm exec tsx src/index.ts ...
```

`NO_COLOR=1` is only for readable captured output. Normal terminals still get colored prompt markers, warnings, and success headers.

## What Changed

- Hidden prompts now say exactly what is hidden: master password, recovery phrase, or private key.
- Generic prompt labels are humanized: `Label`, `To Address`, `Select account`.
- Wallet creation/import label prompts show a random default like `Label (wallet_a1b2c3)`. Pressing Enter accepts that label.
- `wallet.import-ledger` no longer asks every optional locator (`index`, `path`, `address`, `scan-limit`) when omitted. It prompts only `app` and optional `label`, then enters the command-level Ledger selection/device flow.
- Wallet success output is now a focused receipt instead of a raw object dump.
- Backup output shows only file metadata. Secret material is written only to the `0600` file.
- TTY select input now queues rapid keypresses, so batched `Down+Enter` input does not drop keys.

## Demo Screens

### `wallet create --label main`

```text
? Set master password (hidden):
? Confirm master password:

✓ Created wallet "main"
  Account        wlt_9pdrepm0.0
  Type           HD wallet (encrypted recovery phrase)
  tron address   TSNH46oWzu...A3nqBGJQ
  evm address    0xda387dFd...19886a1B
  Active         yes

! Recovery phrase is encrypted locally and was not printed.
! Run `wallet backup` soon and store the file offline.
```

### `wallet import-mnemonic`

```text
? Master password (hidden):
? Label (wallet_a1b2c3):
? Paste recovery phrase (hidden):

✓ Imported wallet "wallet_a1b2c3"
  Account        wlt_1rht6cfa.0
  Type           HD wallet (encrypted recovery phrase)
  tron address   TWer2Ygk5T...SsGZmaL6
  evm address    0xf39Fd6e5...fFb92266

! Recovery phrase was read from hidden input and was not printed.
```

### `wallet import-private-key --label hot`

```text
? Master password (hidden):
? Paste private key (hidden):

✓ Imported wallet "hot"
  Account        wlt_b3pa8gzq
  Type           Private key wallet (encrypted)
  tron address   TLEaY8Xoqp...1ssNuUcF
  evm address    0x70997970...17dc79C8

! Private key was read from hidden input and was not printed.
```

### `wallet backup`

```text
? Master password (hidden):
? Select account (Up/Down, Enter)
> main [active]
  wallet-2
  hot
? Out (optional, press Enter to skip):

✓ Backup written /tmp/wallet-cli-tty-demo-uW85Sq/backups/wlt_9pdrepm0.0-1782118677010.json
  Account        wlt_9pdrepm0.0
  Secret         recovery phrase
  File mode      0600
  Bytes          322

! Secret material was written only to the backup file, never to stdout.
```

### `wallet delete`

```text
? Select account (Up/Down, Enter)
  main [active]
  wallet-2
> hot
? Delete hot? Type the exact label to confirm:

✓ Deleted wallet wlt_b3pa8gzq
  Secret removed yes
  New active     wlt_9pdrepm0.0
```

Wrong confirmation remains a hard abort:

```text
error [aborted]: deletion not confirmed
```

### `wallet import-ledger`

Without a Ledger transport available in this local build, the command reaches the corrected TTY flow and then fails at device transport:

```text
? App (Up/Down, Enter)
> tron
  ethereum
? Label (wallet_d4e5f6):

error [auth_required]: Ledger HID transport not available in this build
```

The important UX fix is that it no longer asks the user to step through optional locator fields before the Ledger flow.

## Verification

```text
pnpm typecheck
pnpm vitest run src/infra/prompt/prompter.test.ts src/runtime/output/output.test.ts src/commands/wallet.test.ts src/cli/shell/shell.test.ts
pnpm test
```

Final full test result:

```text
Test Files  24 passed (24)
Tests       191 passed | 1 skipped (192)
```
