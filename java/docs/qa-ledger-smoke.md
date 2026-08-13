# QA: Ledger smoke test (Standard CLI)

This runbook is the merge gate for the Standard CLI Ledger feature when the
PR author does not have a physical Ledger device. A reviewer with hardware
runs all 5 steps and confirms each outcome before approving the PR.

**Time:** ~5 minutes with a connected device.

## Prerequisites

- A Ledger Nano S or Nano X
- Tron app installed on the device, "Sign By Hash" set to **Allowed** in
  the app's settings
- A wallet imported via REPL once:
  ```
  ./gradlew run
  > importwalletbyledger
  ```
  Choose a default path, set a local password, note the wallet name (the
  file name will start with `Ledger-`).

For brevity, the rest of this runbook uses:

- `P` = the local keystore password from the import step
- `A` = the Tron address shown after import
- `W` = the wallet name (e.g. `ledger-alpha`)
- `R` = a destination address (any valid Tron address; doesn't need to be
  funded — broadcast may fail downstream, but the sign outcome is what we
  are verifying)

## Build

```
./gradlew shadowJar
```

Output: `build/libs/wallet-cli.jar`.

## Step 1 — Normal sign (success path)

```
echo "$P" | java -jar build/libs/wallet-cli.jar \
    --password-stdin --output json \
    --wallet $W \
    send-coin --to $R --amount 1
```

Press the **confirm** button on the device when prompted.

**Expected:**

- stderr contains exactly one line: `Please confirm transaction on Ledger device for A`
- stdout contains a single JSON envelope with `"success": true`
- Exit code `0`
- No other text on stdout

## Step 2 — User rejects

Run the same command as Step 1. Press **reject** on the device instead.

**Expected:**

- stdout JSON: `"success": false`, `"error": "ledger_user_rejected"`
- Exit code `1`
- stderr contains the confirmation notice + the error message

## Step 3 — Device disconnected

Unplug the Ledger. Run the same command.

**Expected:**

- stdout JSON: `"success": false`, `"error": "ledger_not_connected"`
- Exit code `1`

## Step 4 — Tron app not open

Reconnect the device. Leave it on the home screen — do **not** open the
Tron app. Run the same command.

**Expected:**

- stdout JSON: `"success": false`, `"error": "ledger_app_not_open"`
- Exit code `1`

(Some Ledger firmware versions surface this as `ledger_not_connected`
instead — accept either.)

## Step 5 — REPL regression check

This step is independent of the Standard CLI changes. It verifies the
5-line additive patch to `LedgerEventListener` did not perturb the REPL
sign path.

```
./gradlew run
> login
[enter password P]
> sendcoin $R 1
```

Press confirm on the device when prompted.

**Expected:**

- The REPL produces output visually identical to the pre-PR REPL behavior.
  Specifically: the prompts, color codes, and final `Send 1 to R successful !!`
  line all appear as before.

## Sign-off template

```
- [ ] Step 1 (success) passed
- [ ] Step 2 (reject) passed
- [ ] Step 3 (disconnected) passed
- [ ] Step 4 (app not open) passed
- [ ] Step 5 (REPL regression) passed

Tested on:
- Ledger model: ___________________
- Ledger firmware: ________________
- Tron app version: _______________
- Date: __________________________
- Reviewer: ______________________
```
