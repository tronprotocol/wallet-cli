# Spike: Ledger support in Standard CLI — offline source-code findings

## Purpose

Resolve the open assumptions in `docs/plan-standard-cli-ledger.md` so the
implementation plan can be promoted from "pragmatic / hand-wavy" to
"ready-to-implement" without requiring a physical Ledger device.

This spike is **source-code only**. It does not run anything against a real
device. Items that genuinely require hardware are isolated in §"Items that
still need hardware verification" at the bottom.

## Method

Read the existing REPL Ledger sign path end-to-end and document its
behavior. Where REPL already encodes a behavior, treat that as authoritative
(it has been shipped against real devices for a long time).

Files inspected:

- `org.tron.ledger.LedgerSignUtil`
- `org.tron.ledger.listener.LedgerEventListener`
- `org.tron.ledger.listener.BaseListener`
- `org.tron.ledger.listener.TransactionSignManager`
- `org.tron.ledger.LedgerSignResult` (referenced; behavior inferred from call sites)
- `org.tron.ledger.wrapper.HidServicesWrapper` (referenced)
- `org.tron.walletserver.WalletApi` — sign sites and `signTransactionForCli`
- `org.tron.walletcli.WalletApiWrapper` — gasfree sign site
- `org.tron.walletcli.cli.StandardCliRunner` — auth path

## Findings

### F1: Standard CLI uses exactly **two** Ledger sign sites, not four

Standard CLI's process pipeline only touches two of the four sign sites that
the original plan listed:

| Site | File / line | Triggered by |
|------|-------------|--------------|
| `signTransactionForCli(...)` Ledger branch | `WalletApi.java:1064-1093` | All standard-CLI sign commands (transfer, vote, freeze, …) via `processTransactionExtentionForCli` and `processTransactionForCli` |
| GasFree sign branch | `WalletApiWrapper.java:3268-3286` | Standard-CLI `gas-free-transfer` only |

The other two sites (`signTransaction(Chain.Transaction)` at line 904 and
`signTransaction(Chain.Transaction, boolean multi)` at line 956) are
**REPL-exclusive**. They are reached via `processTransactionExtention` /
`processTransaction`, which standard CLI does not call.

This shrinks the standard-CLI risk surface to two sites.

### F2: REPL's "60-second timeout" is a polling loop with cooperative early exit, not a blocking wait

`LedgerEventListener.executeSignListen` (`LedgerEventListener.java:78`) calls
`waitAndShutdownWithInput()` (line 45), which:

1. Spawns a background thread that runs `sleepNoInterruption(60)`.
2. `BaseListener.sleepNoInterruption` (BaseListener.java:23) sleeps in 100ms
   chunks, checking `LedgerEventListener.getInstance().getLedgerSignEnd()` on
   each wake-up. If the flag is set, it exits early.
3. Main thread `join()`s on this background thread.

When the user presses confirm or reject, `hidDataReceived` (line 150) calls
`doLedgerSignEnd()` (line 213), which sets `ledgerSignEnd = true`. The
sleeping thread sees this within 100ms and returns.

**Implication**: cancellation is already cooperative. We do **not** need
`Future.cancel(true)` to work on the underlying HID call. To enforce a
shorter timeout from outside, we set the same flag (or its replacement) and
the existing loop exits.

The constant `TRANSACTION_SIGN_TIMEOUT = 60` is hard-coded at
`LedgerEventListener.java:27`.

### F3: APDU error codes are already pattern-matched in REPL — they just print, they do not return

`LedgerEventListener.handleTransSign` (line 104-148) hard-codes two APDU
status words:

| APDU | Constant in source | Existing REPL behavior |
|------|--------------------|------------------------|
| `0x6a8c` | `SIGN_BY_HASH` | Print "Please first set 'Sign By Hash' to 'Allowed' in Ledger TRON Settings" |
| `0x6511` | `APP_IS_OPEN` | Print "Please ensure The Tron app is open in your Ledger device" |
| Other non-empty response | (unhandled) | (no message) |
| `null`/empty response | (success path) | Submitted; wait for button |

The function returns the raw response bytes. Callers currently only check
`response == null` (= submitted, wait). We can map the same bytes to typed
error codes without changing the underlying APDU exchange logic.

### F4: Confirm vs reject vs timeout outcomes are recorded in two static stores

After `executeSignListen` returns, the outcome is determined by inspecting:

1. **`TransactionSignManager` (singleton)** — `getTransaction()` and
   `getTransactionSignList()`/`getGasfreeSignature()`. If a signature is
   present here, the user pressed confirm.
2. **`LedgerSignResult` (file-backed state)** —
   `getLastTransactionState(devicePath)` returns a string enum:
   - `SIGN_RESULT_SIGNING` (still in progress)
   - `SIGN_RESULT_SUCCESS` (user confirmed)
   - `SIGN_RESULT_REJECTED` (user rejected) — set via `updateAllSigningToReject` in the cancel branch (line 166 / 178)
   - `SIGN_RESULT_CANCEL` (timed out after device responded) — set when `isTimeOutShutdown` is true at the moment of HID response (line 205)

REPL's existing `executeSignListen` collapses all four into a single
`boolean ret = true`, which is why surface-level it looks like REPL "loses
information." It does not — the information is in the two stores; REPL just
does not consult them at the call site.

A non-interactive bridge can poll both stores after `executeSignListen`
returns and emit a precise outcome.

### F5: The pre-sign HID device discovery is already non-interactive

`LedgerSignUtil.requestLedgerSignLogic` (`LedgerSignUtil.java:21`) reaches
the device via `HidServicesWrapper.getInstance().getHidDevice(address, path)`
(line 37). That call:

- Returns the unique device whose Tron-app-derived address at `path` matches
  the requested `address`.
- Returns `null` if no match is found.
- Throws `IllegalStateException` on transport-layer failures (the existing
  call site catches this and treats it as `null`).

There is no `selectDevice()` prompt, no menu, no `lineReader`. The
discovery code is reusable as-is for standard CLI.

### F6: REPL's interactive noise on the sign path is concentrated in `LedgerSignUtil` and the listener

The pollution sources (in standard-CLI terms) on the sign path are:

| Where | What |
|-------|------|
| `LedgerSignUtil` | 8 × `System.out.println`, 4 × ANSI color escape, on every reachable branch |
| `LedgerEventListener.handleTransSign` | 2 × `System.out.println` for APDU error codes, 1 × ANSI |
| `LedgerEventListener.waitAndShutdownWithInput` | 2 × `System.out.printf` (timeout banner) |
| `LedgerEventListener.hidDataReceived` | 4 × `System.out.println` on confirm / cancel |
| `LedgerEventListener.executeSignListen` | 1 × `System.out.println` ("Transaction sign request is sent to Ledger") |

None of these go through any abstracted output channel. They are all direct
`System.out` writes. The standard-CLI bridge must:

1. Replace the `LedgerSignUtil` wrapper entirely (it is the highest-volume
   noise source and provides nothing standard CLI needs).
2. Either (a) refactor the listener's prints into a callback / sink, or (b)
   leave them in place and rely on the existing standard-CLI stream
   suppressor. **Recommendation: (b) for MVP**, because `LedgerEventListener`
   is a singleton shared with REPL and refactoring its output channel ripples
   into REPL output. Suppressing during the bridge call is sufficient.

### F7: `HidServicesWrapper.getHidDevice` is silent on stdout

By inspection of the call shape and how REPL uses it (no surrounding
"discovering devices…" banner around the call), this function does not
print. The standard-CLI bridge can call it without suppressors. (Confirmed
from REPL behavior: pre-sign device lookup happens silently.)

### F8: Singleton state lifecycles

| Singleton | Lifetime | Risk for standard CLI |
|-----------|----------|------------------------|
| `LedgerEventListener.INSTANCE` | Process | Holds `isTimeOutShutdown` and `ledgerSignEnd` `AtomicBoolean`s; both are reset on each `executeSignListen` call (lines 85, 73). One-shot CLI invocations are safe. Within a single process, two consecutive sign operations are also safe because each call resets. |
| `TransactionSignManager.INSTANCE` | Process | Holds the in-flight transaction and signature. REPL clears `setTransaction(null)` after consumption. The bridge must do the same on every exit path (success, reject, timeout, exception). |
| `LedgerSignResult` (file-backed) | Disk | Records last state per device path. Bridge must check this **after** `executeSignListen` to derive outcome. The file accumulates entries; existing REPL code does not prune it. Not a correctness concern. |

For standard CLI's typical "one process per command" usage, the singleton
risk is minimal. The defensive pattern is: reset `TransactionSignManager`
state in a `finally` block.

### F9: Standard CLI's Ledger detection rule is `wf.getName().contains("Ledger")`

All three Ledger sign branches in `WalletApi.java` (lines 910, 973, 1064)
test `wf.getName().contains("Ledger")` rather than the
`WalletApi.isLedgerUser()` boolean. The boolean is set in the wrapper's
login paths and used in `WalletApi.removeWallet(...)` (line 3670), but **not**
on the sign path.

The naming convention is enforced by `WalletApi.java:4652-4654`, which
auto-prefixes `Ledger-` to any wallet that started with that prefix. So:

- **Source of truth on the sign path: filename prefix `Ledger-`**
- **Source of truth on the cleanup path: `isLedgerUser` boolean**

This is a latent inconsistency. For this plan we **do not** unify it (out of
scope and risky); we follow the existing sign-path convention (filename) so
behavior is identical to REPL.

### F10: GasFree path uses `gasfree=true` which short-circuits contract-type validation

`LedgerSignUtil.requestLedgerSignLogic(transaction, path, address, gasfree)`
takes a `gasfree` boolean. When `true`, line 23-26 skips the
`ContractTypeChecker.canUseLedgerSign(...)` precheck. The bridge's sign
method therefore needs the same parameter / a sibling method.

## Implications for design

### Outcome enum is fully derivable

```
NO_DEVICE        ← getHidDevice returned null
APP_NOT_OPEN     ← handleTransSign returned 0x6511
SIGN_BY_HASH_DISABLED ← handleTransSign returned 0x6a8c
SUBMIT_FAILED    ← handleTransSign returned other non-empty bytes
ALREADY_SIGNING  ← LedgerSignResult.getLastTransactionState was SIGN_RESULT_SIGNING before we started
USER_CONFIRMED   ← signature found in TransactionSignManager after wait
USER_REJECTED    ← LedgerSignResult.getLastTransactionState became SIGN_RESULT_REJECTED
TIMEOUT          ← wait returned but neither signature nor reject state
```

Every transition above is derivable from existing public state. No hardware
needed to design this.

### The bridge can polls the same state REPL writes

REPL writes `LedgerSignResult` and `TransactionSignManager` from the HID
callback thread. The bridge reads the same state on the calling thread
after `executeSignListen` returns. This is the cleanest possible coupling
that avoids forking the shared listener.

### Stdout suppression scope

The bridge wraps `LedgerSignUtil`-equivalent operations. The wrapping must
suppress stdout because:

- `LedgerEventListener.handleTransSign` will still print on APDU errors.
- `LedgerEventListener.waitAndShutdownWithInput` will still print the timeout
  banner.
- `LedgerEventListener.hidDataReceived` will still print on confirm / cancel.

These are not on our refactor target (shared with REPL). The bridge must
redirect `System.out` for the duration of the call. The runner already has
`OutputFormatter` machinery for stream suppression; the bridge reuses it.

## Items that still need hardware verification

These remain as Phase-end manual-QA gates, not blockers for design:

| Item | Manual test |
|------|-------------|
| Real timing of `0x6a8c` and `0x6511` responses (synchronous vs delayed) | Try with "Sign By Hash" disabled / Tron app closed |
| Disconnect mid-sign: does `hidDataReceived` fire with a special code, or does the timeout simply elapse? | Pull USB while waiting for confirmation |
| Does the device reset its signing state when disconnected/reconnected? | Disconnect, reconnect, retry sign |
| 60-second wall-clock accuracy of `sleepNoInterruption` under JVM contention | Run with high CPU load |

The bridge's defensive design (catch all exceptions → `SUBMIT_FAILED`,
clean `TransactionSignManager` in `finally`) covers all the above without
requiring us to know the exact answer.

## Conclusions for the plan

1. **Refactor target shrinks to two sign sites for standard CLI MVP**
   (`WalletApi.signTransactionForCli` Ledger branch + `WalletApiWrapper`
   gasfree branch). The other two sign sites stay REPL-only.

2. **The `LedgerSigner` abstraction the elegant version called for is still
   right** — but it can be applied just to the two standard-CLI sites,
   leaving REPL's two sites untouched. This is a smaller refactor than
   "introduce signer for all four sites."

3. **No `Future.cancel(true)` needed.** Cooperative cancellation via the
   existing `ledgerSignEnd` flag is sufficient.

4. **No "minimum viable error codes" compromise.** All seven outcome enum
   values are derivable from existing state; the plan can ship the full
   taxonomy from day one.

5. **Manual QA gates remain unchanged.** A reviewer with a real Ledger runs
   a runbook to verify the four hardware-verifiable items before merge.
