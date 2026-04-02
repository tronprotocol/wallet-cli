# Standard CLI Support & QA Verification System

**Date:** 2026-04-01  
**Status:** Approved  
**Network:** Nile testnet  
**Test Key:** via environment variable `TRON_TEST_APIKEY`

---

## 0. QA — Project Constitution

> **See [`2026-04-01-qa-spec.md`](2026-04-01-qa-spec.md) for the full QA specification.**
>
> Every code change MUST pass `./qa/run.sh verify`. No exceptions.
> Every command must be fully verified (help + text + JSON + parity). No help-only commands.
> Current baseline: 270 tests, 248 passed, 14 failed (JSON format), 8 skipped.
> Target: ~738 tests (see qa spec for full breakdown).

---

## 1. Goals

1. Add standard (non-interactive) CLI support to the existing wallet-cli, primarily for AI Agent invocation
2. Preserve 100% backward compatibility with the existing interactive console CLI
3. Support `--help` globally and per-command
4. Master password via `MASTER_PASSWORD` environment variable
5. Minimal code changes, high extensibility
6. All existing interactive commands available in standard CLI
7. QA system to verify full behavioral parity across all modes and versions

---

## 2. Entry Point & Mode Detection

```
wallet-cli                          → shows help/usage
wallet-cli --interactive            → launches interactive REPL (current behavior)
wallet-cli --help                   → shows global help
wallet-cli --version                → shows version
wallet-cli send-coin --to T...  → standard CLI mode
wallet-cli sendcoin --to T...   → alias, same as above
wallet-cli send-coin --help         → command-specific help
```

### main() Router Logic

1. No args or `--help` → print global help, exit 0
2. `--interactive` → launch existing REPL (`run()`)
3. `--version` → print version, exit 0
4. First non-flag arg matches known command → standard CLI dispatch
5. Unknown command → print error + suggestion + help, exit 2

---

## 3. Command Naming Convention

- Primary names: lowercase with hyphens (`send-coin`, `get-balance`, `freeze-balance-v2`)
- Aliases: original interactive names also accepted (`sendcoin`, `getbalance`, `freezebalancev2`)
- Case-insensitive matching (consistent with interactive mode)

---

## 4. Global Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--interactive` | false | Launch interactive REPL |
| `--output <text\|json>` | text | Output format |
| `--network <main\|nile\|shasta\|custom>` | from config.conf | Network selection |
| `--wallet <name\|path>` | none | Select keystore file |
| `--grpc-endpoint <host:port>` | none | Custom node endpoint |
| `--quiet` | false | Suppress non-essential output |
| `--verbose` | false | Debug logging |
| `--help` | false | Show help (global or per-command) |
| `--version` | false | Show version |

Environment variables:
- `MASTER_PASSWORD` — wallet password, bypasses interactive prompt
- `TRON_TEST_APIKEY` — Nile testnet private key for qa testing (qa prompts if not set)
- `TRON_TEST_MNEMONIC` — BIP39 mnemonic phrase for qa mnemonic-based testing (qa prompts if not set). May correspond to a different account than `TRON_TEST_APIKEY`; the qa supports both same-account and different-account configurations.

---

## 5. Command Option Design

### Named Options Pattern

Every command converts from positional args to named options:

```bash
# Interactive (positional):
SendCoin TReceiverAddr 1000000
SendCoin TOwnerAddr TReceiverAddr 1000000

# Standard CLI (named):
wallet-cli send-coin --to TReceiverAddr --amount 1000000
wallet-cli send-coin --owner TOwnerAddr --to TReceiverAddr --amount 1000000
```

Common options across commands:
- `--owner <address>` — optional owner address (defaults to logged-in wallet)
- `--multi` or `-m` — multi-signature mode
- Boolean flags: `--visible true/false`

Complex command example (`deploy-contract`):
```bash
wallet-cli deploy-contract \
  --name MyToken \
  --abi '{"entrys":[...]}' \
  --bytecode 608060... \
  --constructor "constructor(uint256,string)" \
  --params "1000000,\"MyToken\"" \
  --fee-limit 1000000000 \
  --consume-user-resource-percent 0 \
  --origin-energy-limit 10000000 \
  --value 0 \
  --token-value 0 \
  --token-id "#"
```

---

## 6. Output System

### Output Modes

- `--output text` (default): Human-readable, same style as interactive CLI
- `--output json`: **Strictly JSON only** — stdout contains exactly one JSON object, no other text. All non-JSON output (info messages, library prints, ANSI codes) is suppressed. This guarantees `json.loads(stdout)` always succeeds.

### Stream Separation

- **stdout** — command results only (text mode: human-readable; JSON mode: single JSON object)
- **stderr** — text mode only: errors, warnings, progress messages. JSON mode: suppressed entirely.

### Exit Codes

- `0` — success
- `1` — general failure (transaction failed, network error, etc.)
- `2` — usage error (bad arguments, unknown command)

### Error Output

Text mode errors go to stderr as plain text. JSON mode errors go to stderr as JSON:

```bash
# --output text (default)
# stderr: "Error: Insufficient balance"

# --output json
# stderr: {"error": "insufficient_balance", "message": "Insufficient balance"}
```

Error code naming convention: `snake_case`, descriptive (e.g., `insufficient_balance`, `invalid_address`, `command_not_found`, `network_error`, `authentication_required`, `transaction_failed`). The `message` field is human-readable and may vary; the `error` field is machine-stable and used for programmatic handling.

**The qa verifies error output in both modes.** For mutation commands that cannot be executed on-chain (e.g., `create-witness` without SR status), the qa invokes them and verifies the error response is valid text/JSON with consistent semantics.

---

## 7. Architecture — Minimal Code Changes

### Core Principle

Existing `WalletApiWrapper` and `WalletApi` stay untouched. A thin standard CLI layer is added on top.

```
Standard CLI Mode:
  main() → GlobalOptions → CommandRegistry.lookup() → CommandHandler → WalletApiWrapper → WalletApi

Interactive Mode (unchanged):
  main() → --interactive → run() → JLine REPL → switch/case → WalletApiWrapper → WalletApi
```

### New Files

```
src/main/java/org/tron/walletcli/
├── Client.java                       # Modified: new main() router
├── WalletApiWrapper.java             # Unchanged
├── cli/
│   ├── GlobalOptions.java            # Global flag parsing
│   ├── CommandRegistry.java          # Command registry + alias mapping
│   ├── CommandDefinition.java        # Command metadata, options, handler
│   ├── OutputFormatter.java          # JSON/text output formatting
│   ├── StandardCliRunner.java        # Orchestrates standard CLI execution
│   └── commands/                     # One file per command group
│       ├── WalletCommands.java       # login, register, import, export, backup...
│       ├── QueryCommands.java        # getbalance, getaccount, getblock...
│       ├── TransactionCommands.java  # sendcoin, transferasset...
│       ├── ContractCommands.java     # deploycontract, triggercontract...
│       ├── StakingCommands.java      # freezebalancev2, delegateresource...
│       ├── WitnessCommands.java      # createwitness, votewitness...
│       ├── ProposalCommands.java     # createproposal, approveproposal...
│       ├── ExchangeCommands.java     # exchangecreate, marketsellasset...
│       └── MiscCommands.java         # generateaddress, addressbook...
```

### Changes to Existing Files

1. **`Client.java`** — `main()` rewritten as router (existing `run()` method and all command methods unchanged)
2. **`Utils.java`** — `inputPassword()` checks `MASTER_PASSWORD` env var before prompting

That's it. Two existing files modified, both with small surgical changes.

### Command Registration Pattern

```java
public class TransactionCommands {
    public static void register(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
            .name("send-coin")
            .aliases("sendcoin")
            .description("Send TRX to an address")
            .option("--to", "Recipient address", true)
            .option("--amount", "Amount in SUN", true)
            .option("--owner", "Sender address (optional)", false)
            .option("--multi", "Multi-signature mode", false)
            .handler((opts, wrapper, formatter) -> {
                byte[] owner = opts.getAddress("owner");
                byte[] to = opts.getAddress("to");
                long amount = opts.getLong("amount");
                boolean multi = opts.getBoolean("multi");
                boolean result = wrapper.sendCoin(owner, to, amount, multi);
                formatter.result(result, "Send " + amount + " Sun successful",
                                         "Send " + amount + " Sun failed");
            })
            .build());
    }
}
```

### Password Integration

Single change in `Utils.inputPassword()`:

```java
public static char[] inputPassword(boolean checkStrength) {
    String envPassword = System.getenv("MASTER_PASSWORD");
    if (envPassword != null && !envPassword.isEmpty()) {
        return envPassword.toCharArray();
    }
    // ... existing console input logic unchanged ...
}
```

---

## 8. QA System

> **Full QA specification: [`2026-04-01-qa-spec.md`](2026-04-01-qa-spec.md)**
>
> The qa verifies three-way parity (interactive REPL / standard CLI text / standard CLI JSON) across all 120 commands. **Every command receives full verification** — help, text output, JSON output, and JSON/text semantic parity. No command is tested at help-level only.
>
> For mutation commands that cannot be safely executed on-chain, the qa verifies correct error output in both text and JSON modes (expected-error verification). This ensures `OutputFormatter` is exercised for every code path.

---

## 9. Summary of Code Changes

### New files (~10 files)
- `cli/GlobalOptions.java`
- `cli/CommandRegistry.java`
- `cli/CommandDefinition.java`
- `cli/OutputFormatter.java`
- `cli/StandardCliRunner.java`
- `cli/commands/` — 8 command group files

### Modified files (2 files, minimal changes)
- `Client.java` — new `main()` router, existing methods untouched
- `Utils.java` — `MASTER_PASSWORD` env var check in `inputPassword()`

### QA files (~8 files)
- Shell scripts: `run.sh`, `config.sh`, `compare.sh`, `semantic.sh`, `report.sh`
- Command definitions: 3 shell files
- Java qa: `QARunner.java`, `InteractiveSession.java`, `CommandCapture.java`, `TextSemanticParser.java`
