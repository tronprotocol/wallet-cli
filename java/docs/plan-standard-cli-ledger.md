# Plan: Ledger support in Standard CLI

**Status:** Ready to implement
**Spike basis:** `docs/spike-standard-cli-ledger.md`
**Approach:** Option A — reuse keystore + password auth, narrow `LedgerSigner`
abstraction injected into the existing sign sites.
**Estimated effort:** 1.5–2 working days net coding (excluding reviewer-run
hardware smoke).

## 1. Goal

All standard CLI commands that currently produce a signed transaction must
work when the resolved wallet is a Ledger keystore — without prompts on
stdin/stdout, with structured JSON output, with deterministic exit codes,
and with explicit error codes for every failure mode.

The user authenticates exactly as for software wallets:
`MASTER_PASSWORD` env var or `--password-stdin`. The Ledger device must be
connected at sign time and the user must press the on-device confirmation
button. The 60-second device timeout that the existing REPL path enforces
applies unchanged.

### Reach: standard-CLI signing commands through one sign exit

The change converges on `WalletApi.signTransactionForCli` — the single sign
exit shared by every standard-CLI signing command. After this plan ships,
every `*ForCli` method that goes through that exit and whose transaction type
is supported by the existing Ledger allowlist (e.g. `sendCoinForCli`,
`triggerContractForCli`, `freezeBalanceForCli`, `voteWitnessForCli`,
`accountPermissionUpdateForCli`, …) gains Ledger support simultaneously, plus
the gasfree path through `WalletApiWrapper`.

This high reach-per-effort ratio is the central justification for the work.

## 2. Non-goals

- **Ledger import / pairing in standard CLI.** Path selection requires a
  human in the loop; users run `importwalletbyledger` once in REPL.
- **Password-less Ledger signing** (a future `--ledger-path` direct mode).
- **Refactoring REPL Ledger paths.** The two REPL sign sites
  (`WalletApi.signTransaction(...)` overloads) are not touched.
- **Configurable timeout.** REPL hard-codes 60 seconds; standard CLI
  inherits the same constant. `--ledger-timeout` is deferred.
- **Multi-device disambiguation flag.** Documented behavior on multi-device
  setups; `--ledger-device` is deferred.
- **Unifying `wf.getName().contains("Ledger")` vs `isLedgerUser()` detection
  inconsistency.** Out of scope.

## 3. Mental model

- Ledger keystores share the WalletFile JSON shape with software keystores.
  Their encrypted payload is a UTF-8 BIP44 path string instead of a 32-byte
  private key. The address is plaintext.
- Standard CLI's existing `authenticate()` flow loads the keystore and
  verifies the password identically for both wallet types.
- The two diverge at the **signing call**: software wallets sign locally
  with the decrypted private key; Ledger wallets send an APDU and wait for
  the on-device confirmation button.
- The keystore password's role for Ledger wallets is format consistency,
  not security. Funds are protected by the device, not the password.

## 4. Architecture

### 4.1 The `LedgerSigner` interface

```
package org.tron.walletcli.cli.ledger;

interface LedgerSigner {
    LedgerSignOutcome sign(Chain.Transaction transaction,
                           String bip44Path,
                           String address,
                           boolean gasfree);
}
```

`LedgerSignOutcome` is a value type:

```
final class LedgerSignOutcome {
    enum Status {
        OK,
        NOT_CONNECTED,
        APP_NOT_OPEN,
        SIGN_BY_HASH_DISABLED,
        ALREADY_SIGNING,
        USER_REJECTED,
        TIMEOUT,
        SIGN_FAILED,
    }
    Status status;
    String message;             // human-readable detail, never user-prompt-style
    Chain.Transaction signedTransaction;  // populated when status == OK and not gasfree
    String gasfreeSignature;    // populated when status == OK and gasfree == true
}
```

The interface lives in the standard-CLI package because both implementations
exist for the standard CLI use case (production + test fake). REPL is not a
client.

### 4.2 The single implementation: `NonInteractiveLedgerSigner`

```
package org.tron.walletcli.cli.ledger;

final class NonInteractiveLedgerSigner implements LedgerSigner {
    private final OutputFormatter formatter;
    private final SystemOutSuppressor suppressor;
    NonInteractiveLedgerSigner(OutputFormatter formatter,
                               SystemOutSuppressor suppressor) { ... }

    @Override
    public LedgerSignOutcome sign(...) { ... }
}
```

Internal flow (derived from spike F1–F8):

1. `HidServicesWrapper.getInstance().getHidDevice(address, path)` →
   `null` ⇒ `NOT_CONNECTED`; throws ⇒ `NOT_CONNECTED` (with caught message).
2. Pre-check `LedgerSignResult.getLastTransactionState(devicePath)` → if
   `SIGN_RESULT_SIGNING`, return `ALREADY_SIGNING` (mirrors REPL line-58
   check, but typed instead of printed).
3. Defensively reset `TransactionSignManager.setTransaction(null)` and
   `setGasfreeSignature(null)`.
4. Emit one stderr info line via the formatter:
   `"Please confirm transaction on Ledger device for " + address`.
5. Open the suppressor (redirects `System.out` for the duration of the HID
   call) and invoke
   `LedgerEventListener.getInstance().executeSignListen(device, tx, path, gasfree)`.
6. Close the suppressor regardless of outcome (try/finally).
7. Inspect the listener's recorded last APDU response (see §4.4 patch):
   `0x6511` ⇒ `APP_NOT_OPEN`; `0x6a8c` ⇒ `SIGN_BY_HASH_DISABLED`; other
   non-empty bytes ⇒ `SIGN_FAILED` with hex in `message`.
8. Otherwise derive outcome from post-sign state:
   - signature present in `TransactionSignManager` ⇒ `OK`
   - `LedgerSignResult.getLastTransactionState` ==
     `SIGN_RESULT_REJECTED` ⇒ `USER_REJECTED`
   - else ⇒ `TIMEOUT`
9. `finally`: always reset `TransactionSignManager` transaction +
   signature fields and close the HID device.

The implementation is roughly 180 LOC including imports and Javadoc.

### 4.3 Wire-up: inject signer into `WalletApi` and `WalletApiWrapper`

No back-reference interface, no hook indirection. Both classes get a
nullable `LedgerSigner` field with a setter:

```
class WalletApi {
    private LedgerSigner ledgerSigner;   // null in REPL; set in standard CLI
    public void setLedgerSigner(LedgerSigner s) { this.ledgerSigner = s; }
    public LedgerSigner getLedgerSigner() { return ledgerSigner; }
}

class WalletApiWrapper {
    public void setLedgerSigner(LedgerSigner s) {
        if (wallet != null) wallet.setLedgerSigner(s);
    }
}
```

`StandardCliRunner.authenticate()`, after constructing the `WalletApi`,
calls `wrapper.setLedgerSigner(new NonInteractiveLedgerSigner(...))`
unconditionally. The signer is cheap to construct and idle when no Ledger
sign happens.

REPL never calls these setters; the field stays `null`; existing REPL
paths continue to call `LedgerSignUtil.requestLedgerSignLogic` directly.
**Zero REPL behavior change.**

### 4.4 Sign-site changes

Two edits, plus a 5-line additive patch.

#### 4.4.1 `WalletApi.signTransactionForCli` (line 1064-1093)

Existing Ledger branch:

```java
if (isLedgerFile) {
    boolean result = LedgerSignUtil.requestLedgerSignLogic(transaction, ledgerPath, wf.getAddress(), false);
    if (!result) { recordLastCliOperationError(...); return null; }
    transaction = TransactionSignManager.getInstance().getTransaction();
    Response.TransactionSignWeight weight = getTransactionSignWeight(transaction);
    if (ENOUGH_PERMISSION) { ...return transaction; }
    HidDevice hidDevice = HidServicesWrapper.getInstance().getHidDevice(...);
    if (hidDevice == null) { ...return null; }
    Optional<String> state = LedgerSignResult.getLastTransactionState(hidDevice.getPath());
    boolean confirmed = state.isPresent() && SUCCESS.equals(state.get());
    if (NOT_ENOUGH_PERMISSION && confirmed && multi) { return transaction; }
    throw new CancelException(weight.getResult().getMessage());
}
```

New branch:

```java
if (isLedgerFile) {
    if (this.ledgerSigner != null) {
        LedgerSignOutcome r = this.ledgerSigner.sign(transaction, ledgerPath, wf.getAddress(), false);
        if (r.status != OK) {
            recordLastCliOperationError(r.errorCode() + ": " + r.message);
            throw new CommandErrorException(r.errorCode(), r.message);
        }
        transaction = r.signedTransaction;  // signer extracts from TransactionSignManager
        Response.TransactionSignWeight weight = getTransactionSignWeight(transaction);
        if (ENOUGH_PERMISSION) { return transaction; }
        if (NOT_ENOUGH_PERMISSION && multi) { return transaction; }
        throw new CancelException(weight.getResult().getMessage());
    }
    // Legacy path retained as safety net; unreachable when signer is injected.
    boolean result = LedgerSignUtil.requestLedgerSignLogic(...);
    /* existing 25 lines unchanged */
}
```

The post-sign permission-weight verification (lines 1073-1093) stays in
`WalletApi`. The signer's job ends at "got a signature back"; the
multi-permission semantics belong to `WalletApi`.

When `ledgerSigner != null` (standard CLI), the legacy 25-line block is
unreachable. Kept as a safety net for the (currently impossible) case
where a non-standard-CLI caller reaches this method.

#### 4.4.2 `WalletApiWrapper.gasFreeTransferInternal` (line 3268-3286)

The method already takes a `boolean standardCli` parameter. Branch
explicitly:

```java
if (isLedgerFile) {
    Chain.Transaction transaction = ...;
    String signature = null;
    if (standardCli) {
        if (this.wallet.getLedgerSigner() == null) {
            throw new CommandErrorException("execution_error",
                    "Standard CLI Ledger signer not initialized");
        }
        LedgerSignOutcome r = this.wallet.getLedgerSigner().sign(transaction, ledgerPath, wf.getAddress(), true);
        if (r.status != OK) {
            throw new CommandErrorException(r.errorCode(), r.message);
        }
        signature = r.gasfreeSignature;
    } else {
        // REPL path: existing behavior, byte-for-byte
        boolean ledgerResult = LedgerSignUtil.requestLedgerSignLogic(transaction, ledgerPath, wf.getAddress(), true);
        if (ledgerResult) signature = TransactionSignManager.getInstance().getGasfreeSignature();
        if (signature == null) {
            TransactionSignManager.getInstance().setTransaction(null);
            TransactionSignManager.getInstance().setGasfreeSignature(null);
            System.out.println("Listening ledger did not obtain signature.");
            return false;
        }
        TransactionSignManager.getInstance().setTransaction(null);
        TransactionSignManager.getInstance().setGasfreeSignature(null);
    }
    /* rest of method unchanged: signature validation + submit */
}
```

REPL path is preserved literally; standard-CLI path uses the signer.

#### 4.4.3 `LedgerEventListener` 5-line additive patch

`NonInteractiveLedgerSigner` needs to read the last APDU response after
calling `executeSignListen`. The cheapest seam is to record it as a field:

```java
private byte[] lastSendResult;
public byte[] getLastSendResultBytes() { return lastSendResult; }

// inside executeSignListen, line 81:
this.lastSendResult = handleTransSign(hidDevice, transaction, path, gasfree);
byte[] sendResult = this.lastSendResult;
```

Pure addition; no existing caller reads this; REPL is unaffected.
`LedgerEventListener` is a process-wide singleton and is single-threaded
in practice (REPL and standard CLI never run concurrently in the same JVM).

### 4.5 Stdout suppression

REPL prints inside `LedgerEventListener` and the unchanged-for-REPL
`LedgerSignUtil` would pollute JSON output if they reach stdout during a
standard-CLI sign. The bridge wraps the HID-call section in a
`SystemOutSuppressor` (try-with-resources):

```
final class SystemOutSuppressor implements AutoCloseable {
    static SystemOutSuppressor capture();   // saves System.out, swaps for sink
    String drained();                       // captured bytes (for --verbose echo)
    @Override public void close();          // restores System.out
}
```

Phase 0 must grep for an existing equivalent before we write a new one.
If nothing exists, we write it (~50 LOC).

In `--verbose` mode the captured content is replayed to stderr, prefixed
with `[ledger-noise]`. In other modes it is discarded.

## 5. Files touched

| File | Change | LOC |
|------|--------|-----|
| **NEW** `cli/ledger/LedgerSigner.java` | Interface | 15 |
| **NEW** `cli/ledger/LedgerSignOutcome.java` | Value type + Status enum | 60 |
| **NEW** `cli/ledger/NonInteractiveLedgerSigner.java` | Implementation | 180 |
| **NEW** `cli/ledger/SystemOutSuppressor.java` | Stdout capture util (Phase 0 may make this reuse) | 50 |
| `cli/StandardCliRunner.java` | Construct + inject signer in `authenticate()` | +8 |
| `walletcli/WalletApiWrapper.java` | Add `setLedgerSigner` delegating to `WalletApi`; replace 1 sign branch (gasfree) under `if (standardCli)` | +30, -10 |
| `walletserver/WalletApi.java` | Add `ledgerSigner` field/setter/getter; replace Ledger branch in `signTransactionForCli` | +25, -15 |
| `ledger/listener/LedgerEventListener.java` | Add `lastSendResult` field + accessor | +5 |
| **NEW** `cli/ledger/NonInteractiveLedgerSignerTest.java` | Bridge unit tests (12) | 250 |
| **NEW** `cli/ledger/LedgerSignOutcomeTest.java` | Trivial coverage | 30 |
| `cli/StandardCliRunnerTest.java` | Five integration tests with `FakeLedgerSigner` | +120 |
| **NEW** `docs/qa-ledger-smoke.md` | Manual QA runbook | 80 |
| `docs/standard-cli-contract-spec.md` | Additive subsection on Ledger error codes | +40 |
| `docs/standard-cli-user-manual.md` | "Using Ledger" section | +60 |
| `docs/release-notes-wallet-cli-*.md` | Bullet point | +3 |

**Net: ~810 LOC added, ~25 LOC removed.** ~400 LOC of that is tests.

## 6. Behavior specification

### 6.1 Discovery

- Exactly one connected Ledger whose Tron-app-derived address at the
  keystore's path matches the keystore's address ⇒ proceed.
- Zero matching devices ⇒ `ledger_not_connected` (exit 1).
- Multiple connected devices ⇒ the standard CLI validates the derived address
  at the keystore path and uses the matching device. If no connected device
  derives the keystore address at that path, return `ledger_not_connected`.
  A future `--ledger-device` flag may make multi-device selection explicit.

### 6.2 Stderr output

Exactly one info line per sign attempt, on stderr:

```
Please confirm transaction on Ledger device for TXxx...
```

No further progress output. On failure, the structured error message
appears in stderr (text mode) or in the JSON envelope's `message` field
(JSON mode).

### 6.3 Stdout

- `--output json`: stdout contains exactly one JSON envelope.
- `--output text`: stdout contains exactly the result string the command
  produces (transaction id on success, nothing on failure).
- The suppressor guarantees no listener prints reach stdout.

### 6.4 Error code → exit code

All Ledger errors are execution errors (exit 1).

| Error code | Trigger |
|-----------|---------|
| `ledger_not_connected` | No matching device, or HID transport failure |
| `ledger_app_not_open` | APDU `0x6511` |
| `ledger_sign_by_hash_disabled` | APDU `0x6a8c` |
| `ledger_unsupported_contract` | Transaction type is outside the Ledger allowlist |
| `ledger_already_signing` | `LedgerSignResult` indicates a prior sign is still `SIGNING` |
| `ledger_user_rejected` | `LedgerSignResult` is `SIGN_RESULT_REJECTED` after wait |
| `ledger_timeout` | 60-second wait elapsed without confirm or reject state |
| `ledger_sign_failed` | Any other failure |

All codes start with `ledger_` for prefix matching by agents.

### 6.5 Singleton state hygiene

`NonInteractiveLedgerSigner.sign(...)` invariants:

- Always reset `TransactionSignManager` transaction + signature fields in
  a `finally`.
- Always close the HID device in a `finally`.
- Never throws. Always returns an outcome; the caller (sign-site code)
  translates non-`OK` to `CommandErrorException`.

## 7. Phased delivery (~1.5–2 days net coding)

### Phase 0 — confirmation grep (≤ 1 hour, code-only)

- Verify no `SystemOutSuppressor`-equivalent already exists (grep
  `System.setOut`, look for utility classes).
- Confirm `OutputFormatter.info(...)` writes to stderr in both text and
  JSON modes (it should, per existing usage).
- Confirm singletons `HidServicesWrapper.getInstance()` and
  `LedgerEventListener.getInstance()` have a testable seam (existing
  pattern in the codebase, or PowerMock setup).

If any answer surprises, update §4.5 / §8.1 before Phase 1.

### Phase 1 — full signer + tests (~½–1 day)

Deliverables:

- `LedgerSigner` interface
- `LedgerSignOutcome` value type
- `NonInteractiveLedgerSigner` with **all 8 Status values reachable**
  (no half-baked stubs)
- `SystemOutSuppressor` (or reuse if Phase 0 found one)
- `LedgerEventListener` 5-line additive patch
- `NonInteractiveLedgerSignerTest` — 12 unit tests covering each
  enum value + state-cleanup invariants + stderr message shape
- `LedgerSignOutcomeTest` — trivial coverage

Acceptance: tests green; `NonInteractiveLedgerSigner.sign(...)` is
callable in isolation with mock collaborators.

### Phase 2 — wire to both sign sites + integration tests (~½ day)

Deliverables:

- `WalletApi.setLedgerSigner` field/setter/getter
- `WalletApiWrapper.setLedgerSigner` delegation
- `signTransactionForCli` Ledger branch routes through `ledgerSigner`
  when injected; legacy block kept as safety net
- `gasFreeTransferInternal` Ledger branch splits on `standardCli`
- `StandardCliRunner.authenticate()` constructs and injects
  `NonInteractiveLedgerSigner`
- `StandardCliRunnerTest` — 5 integration tests:
  1. `gasFreeTransferSucceedsWithFakeLedgerSigner`
  2. `gasFreeTransferReportsLedgerUserRejected`
  3. `sendCoinSucceedsWithFakeLedgerSigner`
  4. `sendCoinReportsLedgerNotConnected`
  5. `nonLedgerCommandsUnaffectedByInjectedSigner`

Acceptance: gasfree and one mainline command both flow through the
signer end-to-end with a `FakeLedgerSigner`; software-wallet sign paths
are unchanged.

### Phase 3 — documentation (~2 hours)

Deliverables:

- `docs/qa-ledger-smoke.md` — 5-step manual runbook (§8.3)
- `docs/standard-cli-user-manual.md` "Using Ledger" section
- `docs/standard-cli-contract-spec.md` additive subsection on Ledger
  error codes
- Release notes bullet

Acceptance: docs reviewed.

### Phase 4 — merge gate (reviewer-driven, not author time)

PR description explicitly states:

> Author has no physical Ledger. The following items are unverified by
> the author and require a reviewer-driven smoke test (see
> `docs/qa-ledger-smoke.md`):
>
> - All 5 steps of the runbook
> - One REPL Ledger sign (regression check on the additive listener
>   patch)
>
> All other behavior is verified by unit and integration tests with
> mocked HID and listener state.

Merge requires:

- All automated tests green
- A reviewer with a Ledger device runs `qa-ledger-smoke.md` and confirms
  all 5 steps
- A reviewer runs **one** Ledger sign in REPL and confirms output is
  visually identical to before this PR

## 8. Test strategy

### 8.1 Unit tests (`NonInteractiveLedgerSignerTest`)

12 tests, each ~20 LOC. Mock collaborators: `HidServicesWrapper`,
`LedgerEventListener`, `LedgerSignResult`, `TransactionSignManager`.

| Test | Setup | Asserts |
|------|-------|---------|
| `signSucceedsWhenUserConfirms` | mock device valid; signature set in TSM; state SUCCESS | outcome `OK`, signature populated |
| `returnsNotConnectedWhenDeviceMissing` | wrapper returns null | outcome `NOT_CONNECTED` |
| `returnsNotConnectedWhenWrapperThrows` | wrapper throws `IllegalStateException` | outcome `NOT_CONNECTED` |
| `returnsAppNotOpenOn0x6511` | `lastSendResult = [0x65, 0x11]` | outcome `APP_NOT_OPEN` |
| `returnsSignByHashDisabledOn0x6a8c` | `lastSendResult = [0x6a, 0x8c]` | outcome `SIGN_BY_HASH_DISABLED` |
| `returnsSignFailedOnUnknownApduResponse` | `lastSendResult = [0xff, 0xff]` | outcome `SIGN_FAILED`, message contains hex |
| `returnsAlreadySigningWhenStateIsSigning` | LedgerSignResult returns `SIGNING` before sign | outcome `ALREADY_SIGNING`, listener never called |
| `returnsUserRejectedWhenStateIsRejected` | post-sign state `SIGN_RESULT_REJECTED` | outcome `USER_REJECTED` |
| `returnsTimeoutWhenNeitherStateNorSignaturePresent` | post-sign neither | outcome `TIMEOUT` |
| `clearsTransactionSignManagerOnEveryExitPath` | parameterized by every outcome | TSM cleared afterwards |
| `closesHidDeviceOnEveryExitPath` | parameterized | mock HidDevice.close() invoked |
| `emitsExactlyOneStderrInfoLine` | success path | formatter recorded one info call, message contains address |

### 8.2 Integration tests (`StandardCliRunnerTest`)

5 tests, each ~25 LOC, using `FakeLedgerSigner` (test-package class that
records calls and returns programmable outcomes).

(Listed in Phase 2 deliverables.)

### 8.3 Manual QA (hardware, reviewer)

`docs/qa-ledger-smoke.md`:

```
Manual smoke (requires Ledger Nano S/X with Tron app installed)

Pre-req: importwalletbyledger via REPL, set local password P, note address A.

1. Normal sign:
   echo "P" | wallet-cli --password-stdin --output json \
     --wallet ledger-alpha send-coin --to <addr> --amount 1
   → confirm on device → expect {"success": true, "data": {...}}
   → stderr contains "Please confirm transaction on Ledger device for A"

2. User rejects:
   same command → press REJECT on device
   → expect exit 1, JSON: {"success": false, "error": "ledger_user_rejected"}

3. Device disconnected:
   unplug Ledger, run same command
   → expect exit 1, error: "ledger_not_connected"

4. Tron app not open:
   plug device, leave at home screen (don't open Tron app)
   → expect exit 1, error: "ledger_app_not_open"

5. REPL regression (independent of standard CLI):
   ./gradlew run → login as ledger wallet → SendCoin one transaction
   → confirm on device → success message identical to pre-PR output
```

5 minutes total with a connected device.

### 8.4 What is **not** automatically tested

- Real APDU exchange timing
- Real disconnect-mid-sign behavior
- Real 60s timeout wall clock
- Signature cryptographic validity

Covered by manual runbook.

## 9. Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `LedgerEventListener` singleton state leaks between two sequential signs in same JVM | Low | Medium | Bridge resets state in `finally`. Unit-tested. |
| `SystemOutSuppressor` interferes with logging that uses `System.out` underneath | Medium | Low | Suppress only around HID-call section; verbose mode replays to stderr. |
| Reviewer with Ledger device unavailable | Low | High (PR cannot merge) | Confirm reviewer assignment before Phase 1. Runbook is 5 minutes. |
| `executeSignListen` blocks longer than 60s under JVM load | Low | Low | Acceptable; matches REPL behavior. |
| Disconnect mid-sign produces unanticipated state | Medium | Medium | Catch all in bridge → `SIGN_FAILED`. Manual QA step 3 verifies. |
| `wf.getName().contains("Ledger")` rule fails for renamed wallets | Low | Low | Out of scope; existing REPL has the same limitation. |
| Singleton mocking turns out harder than expected (Phase 0 finds no seam) | Low | Medium | Either add a thin testable seam (~50 LOC) or use PowerMock. Decide in Phase 0. |

## 10. REPL impact summary

The change is 95% additive + standard-CLI-isolated. **REPL paths that
exist before this PR do exactly the same thing after.**

| REPL scenario | Affected? |
|---|---|
| REPL + software wallet sign | No — code path entirely untouched |
| REPL + Ledger sign (REPL `signTransaction` overloads) | No — still calls `LedgerSignUtil` directly |
| REPL using gasfree transfer | No — `if (standardCli)` branch leaves the `else` path byte-for-byte |
| REPL invoking `LedgerEventListener` | Only sees an additive 5-line patch (one new field, one getter, one assignment) |

REPL regression scope is therefore **one** smoke test: a single REPL
Ledger sign confirms the listener patch did not perturb behavior. Step 5
of the QA runbook covers this.

## 11. Success criteria

- `gas-free-transfer` and at least one mainline sign command (e.g.
  `send-coin`) work end-to-end against a Ledger keystore via standard
  CLI, verified by reviewer-run smoke runbook.
- All eight `ledger_*` error codes are produced by at least one
  automated test.
- JSON-mode stdout contains exactly one envelope per command; no
  ledger-related noise leaks through.
- REPL Ledger flow output is visually identical to before (verified by
  step 5 of QA runbook).
- Test coverage: unit tests reach every enum value; integration tests
  reach OK + at least two error paths.
- Documentation: user manual updated, contract spec subsection added,
  QA runbook present, release notes updated.
- No new dependency on a physical device for unit/CI tests.

## 12. User-facing documentation outline

`docs/standard-cli-user-manual.md` will gain:

```
### Using Ledger

1. **Pair the device once via the REPL**:
       ./gradlew run
       > importwalletbyledger
   Choose a path, set a local password (this password unlocks the
   keystore that points at your Ledger account; it does not unlock the
   device itself).

2. **Sign from standard CLI**:
       echo "$LEDGER_KEYSTORE_PASSWORD" | wallet-cli \
           --password-stdin --output json --wallet ledger-alpha \
           send-coin --to TXxx... --amount 1000000

   - The Ledger must be connected, unlocked, with the Tron app open.
   - You will see one stderr line: "Please confirm transaction on
     Ledger device for ...".
   - Press the confirm button on the device.
   - On success, stdout contains a JSON envelope with the transaction id.

**About the password**: the keystore password protects the BIP44 path
metadata, not your funds. Your private key never leaves the device. A
Ledger keystore without the device connected cannot sign even with the
correct password.

**Error codes** (in JSON envelope `error` field): `ledger_not_connected`,
`ledger_app_not_open`, `ledger_sign_by_hash_disabled`,
`ledger_unsupported_contract`, `ledger_already_signing`,
`ledger_user_rejected`, `ledger_timeout`, `ledger_sign_failed`.
```

`docs/standard-cli-contract-spec.md` will gain an additive subsection
under Auth/Errors documenting the eight `ledger_*` codes.
