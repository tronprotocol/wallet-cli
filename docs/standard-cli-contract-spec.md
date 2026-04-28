# Standard CLI Contract Spec

This document defines the intended contract for the standard CLI path under `org.tron.walletcli.cli.*`.
When changing parser behavior, command execution, machine-readable output, authentication, or QA coverage,
follow this spec unless the repository owner explicitly decides to revise it.

## Scope

This spec applies to:

- `GlobalOptions`
- `StandardCliRunner`
- `CommandDefinition` / `ParsedOptions`
- `OutputFormatter`
- `cli/commands/*`
- `WalletApiWrapper` behavior as exposed through the standard CLI
- `qa/` verification for the standard CLI

This spec does not require the legacy REPL path in `Client` to match the same UX or parsing behavior exactly.

## Design Goals

The standard CLI is intended to be:

- deterministic
- scriptable
- machine-readable in JSON mode
- strict about malformed input
- explicit about authentication behavior

The standard CLI should not rely on "best effort" guessing for ambiguous user input.

## Request Flow

The standard CLI request flow is:

1. Parse global options
2. Resolve the command name
3. Parse command-local options
4. Apply runner-level setup such as network and auth policy
5. Execute the command handler
6. Emit a single structured success or error outcome

## Option Layering

The standard CLI has two distinct option layers:

- global options
- command-local options

### Global Options

Global options affect the overall execution environment for the whole command run.

Examples:

- output mode
- network selection
- wallet override
- grpc endpoint override
- quiet / verbose behavior
- global help / version handling

Global options are parsed by `GlobalOptions.parse(String[] args)`. Execution modifiers may appear either before or
after the command token. Top-level mode selectors are pre-command only, except for command-help handling described
below.

### Command-Local Options

Command-local options belong to a specific command and are meaningful only after the command has been resolved.

Examples:

- `get-balance --address T...`
- `send-coin --to T... --amount 1`
- `trigger-constant-contract --contract T... --method "balanceOf(address)"`

Command-local options are parsed by `CommandDefinition.parseArgs(String[] args)`.

### Layer Boundary

- global execution modifiers configure how the CLI run is executed
- top-level mode selectors choose an alternate program mode before command execution
- command-local options configure what the chosen command does
- global parsing happens first and extracts known global options from the full argument list
- command-local parsing happens only after the command token is known
- a token must not be interpreted as both a global option and a command-local option in the same pass

## Contract 1: Global Option Parsing

`GlobalOptions.parse(String[] args)` is responsible only for parsing known options that affect the whole run.

### Parsing Model

Global option parsing is a left-to-right first-pass scan across the full argument list.

The parser consumes tokens until one of these happens:

1. it reaches the end of input
2. it encounters a malformed known global option and fails with a usage error

This pass is intentionally narrow. It extracts only known global options and must not reinterpret unknown
post-command options that belong to command-local parsing.

### Supported Syntax

Supported global options are:

- valueless flags:
  - `--interactive`
  - `--help`
  - `-h`
  - `--version`
  - `--quiet`
  - `--verbose`
- valued options:
  - `--output <text|json>`
  - `--network <main|nile|shasta|custom>`
  - `--wallet <value>`
  - `--grpc-endpoint <value>`

Long options may be provided in either of these equivalent forms when the option accepts a value:

- `--name value`
- `--name=value`

For Contract 1, this applies to valued global options only.

### Boundary Rules

- Execution modifier global options are recognized before and after the command token.
- Top-level mode selectors `--version` and `--interactive` are recognized only before the command token.
- The first token before command resolution that does not begin with `-` is the command token.
- The command token is normalized to lowercase for registry lookup.
- After the command token is found, execution modifier global options are extracted and all other tokens are passed
  through unchanged as command arguments.
- Unknown options after the command token are never reinterpreted as global options.
- Post-command `--help` and `-h` are reserved for command help and are passed through as command arguments.
- Post-command `--version` and `--interactive` are command-local tokens and are passed through as command arguments.

Examples:

- `wallet-cli --output json --network nile get-balance --address T...`
  - global options: `--output json`, `--network nile`
  - command: `get-balance`
  - command args: `--address T...`
- `wallet-cli --output=json --network=nile get-balance --address T...`
  - global options: `--output=json`, `--network=nile`
  - command: `get-balance`
  - command args: `--address T...`
- `wallet-cli get-balance --network nile`
  - global options: `--network nile`
  - command: `get-balance`
  - command args: none
- `wallet-cli get-balance --network=nile`
  - global options: `--network=nile`
  - command: `get-balance`
  - command args: none
- `wallet-cli get-balance --address T... --network nile`
  - global options: `--network nile`
  - command: `get-balance`
  - command args: `--address T...`
- `wallet-cli get-balance --help`
  - command: `get-balance`
  - command args: `--help`
  - `--help` is not treated as global help because it appears after the command token
- `wallet-cli get-balance --version`
  - command: `get-balance`
  - command args: `--version`
  - `--version` is not treated as global version because it appears after the command token
- `wallet-cli get-balance --interactive`
  - command: `get-balance`
  - command args: `--interactive`
  - `--interactive` is not treated as global interactive mode because it appears after the command token

### No-Command Cases

The global parser may produce no command token when the invocation is global-only, such as:

- `wallet-cli --help`
- `wallet-cli -h`
- `wallet-cli --version`
- `wallet-cli --interactive`

In those cases, the parser succeeds and leaves handling to the runner / entrypoint.

If no command is present and the invocation is not a supported global-only mode, the runner should treat that as a
usage error.

### Help Flag Semantics

`--help` and `-h` are reserved for help behavior.

Rules:

- before the command token, `--help` and `-h` request global help
- after the command token, `--help` and `-h` are passed through for command help handling
- `-h` is not available for unrelated global short-option meanings
- the global parser must not reinterpret `-h` as a command token
- standard CLI commands should treat trailing `--help` and `-h` as command-help requests, not as normal business
  options

Examples:

- `wallet-cli -h`
  - global help
- `wallet-cli --help`
  - global help
- `wallet-cli get-balance -h`
  - `get-balance` command help
- `wallet-cli get-balance --help`
  - `get-balance` command help

### Error Rules

The following are usage errors at the global parsing layer:

- unknown global option before the command token
- missing value for a valued global option
- invalid value for a constrained global option
- malformed syntax for a known global option

Specific expectations:

- `--outputt json get-balance`
  - usage error: unknown global option `--outputt`
- `--outputt=json get-balance`
  - usage error: unknown global option `--outputt`
- `--network get-balance`
  - usage error: invalid value for `--network`
- `--network=get-balance`
  - usage error: invalid value for `--network`
- `--network --output json`
  - usage error: missing value for `--network`
- `--grpc-endpoint`
  - usage error: missing value for `--grpc-endpoint`
- `--output=`
  - usage error: missing or empty value for `--output`
- `--quiet=true`
  - usage error: option `--quiet` does not take a value
- `get-balance --network beta`
  - usage error: invalid value for `--network`
- `get-balance --unknown value`
  - not a global parsing error; `--unknown value` remains command-local input

Error classification for valued global options:

- if the next token does not exist: missing value
- if the next token is another long option token such as `--output`: missing value
- if the next token exists but is not allowed for a constrained option: invalid value
- if the option is provided as `--name=` with an empty value: missing or empty value
- if a valueless flag is provided as `--flag=value`: option does not take a value

### Valued Option Rules

For valued global options:

- the value may be the next token or may be provided inline as `--name=value`
- the value must not itself be another long option token such as `--output`
- constrained options must validate their allowed values during global parsing, not later

For valueless global flags:

- the presence of the flag means `true`
- `--flag=value` is not allowed
- `--flag=` is not allowed

Examples:

- `--output=json` is valid
- `--network=nile` is valid
- `--wallet=/tmp/keystore.json` is valid
- `--output=` is invalid
- `--quiet=true` is invalid

For now, the standard CLI contract does not require support for:

- combined short flags
- `--` as a special end-of-options sentinel

These may be added later only if the spec is updated explicitly.

### Global and Command Parser Consistency

The standard CLI should not support `--name=value` in one parsing layer but reject it in the other.

If long-option inline-value syntax is supported for global parsing, it should also be supported consistently for
command-local parsing where the command option accepts a value.

### Value-Detection Heuristic

The global parser and command parser use intentionally different heuristics to detect whether the next token is a
missing value or a legitimate option value:

- the global parser treats any token starting with `-` as a non-value token (rejects `-anything` as a value)
- the command parser treats only tokens starting with `--` as a non-value token (allows `-anything` as a value)

This difference is deliberate. Command-local options include numeric types (`LONG`) where negative values such as
`-5` are legitimate. Global valued options (`--output`, `--network`, `--wallet`, `--grpc-endpoint`) never accept
negative numbers or dash-prefixed values, so the stricter heuristic is safe and catches more user errors early.

### Repetition Rules

Repeated global options must behave deterministically.

- repeated valued global options are a usage error
  - example: `--network nile --network main` is an error
  - example: `--output json --output text` is an error
  - example: `--wallet a.json --wallet b.json` is an error
- repeated boolean flags are idempotent when they do not conflict
  - example: `--verbose --verbose` is equivalent to `--verbose`
- conflicting boolean flags are a usage error
  - example: `--quiet --verbose` is an error

### Explicit Non-Goals

- Do not silently reinterpret unknown global options as command arguments.
- Do not allow a malformed global option to fall through into downstream command execution errors.
- Do not support "guessing" whether a token was meant to be a global option or a command option.
- Do not let downstream command parsing decide whether a pre-command token was a valid global option.

## Contract 2: Command Option Parsing

`CommandDefinition.parseArgs(String[] args)` parses only command-local options using the schema declared by the
command definition.

### Scope

`CommandDefinition.parseArgs(String[] args)` is responsible only for command-local syntax parsing.

It is responsible for:

- recognizing declared command options
- extracting option values
- performing parser-level validation of token shape and option syntax
- producing `ParsedOptions`

It is not responsible for:

- global option parsing
- auth, network, or output-mode policy
- command execution
- domain validation beyond parser-level type and shape checks

### Supported Syntax

Command-local options should support:

- `--name value`
- `--name=value`
- boolean options as valueless flags, such as `--multi`
- boolean options with explicit values:
  - `--multi=true`
  - `--multi=false`
  - `--multi=1`
  - `--multi=0`
  - `--multi=yes`
  - `--multi=no`
- `-m` only for commands that explicitly declare the `multi` option

Command-local parsing does not support:

- arbitrary short-option aliases
- combined short flags
- positional arguments
- unknown short flags

### Boundary Rules

- command parsing starts only after the runner has already resolved the command token
- command parsing operates only on command arguments
- command parsing does not reinterpret tokens as global options
- command parsing does not guess whether a token was intended as a global option
- if the runner reserves `--help` or `-h` for command-help handling, those tokens should not be treated as normal
  business options by generic command parsing
- unexpected bare tokens are usage errors unless positional arguments are explicitly introduced by a future spec

### Error Rules

The following are usage errors at the command parsing layer:

- unknown command option
- non-boolean option missing value
- non-boolean option empty value
- boolean option with an invalid explicit value
- option provided in an unsupported form
- option that does not take a value being provided as `--name=value`
- empty option name such as `--`
- unexpected bare token

Specific expectations:

- a non-boolean option must never fall back to `"true"` when its value is missing
- malformed input should fail in the parser layer, not later during command execution
- `--contract --method balanceOf(address)` must fail as a parser usage error
- `--contract=` must fail as a parser usage error
- `--multi=maybe` must fail as a parser usage error

### Repetition Rules

Repeated command options must behave deterministically and strictly.

- repeated valued options are a usage error
- repeated boolean options with the same effective meaning are idempotent
- repeated boolean options with conflicting explicit values are a usage error

Examples:

- `--amount 1 --amount 2`
  - usage error
- `--multi --multi`
  - valid, equivalent to `--multi`
- `--multi=true --multi=false`
  - usage error

### Parser vs Semantic Validation

Parser-level validation and semantic validation are distinct.

Parser-level validation is responsible for:

- whether an option name exists
- whether an option requires a value
- whether a token is in a supported parser form
- whether a boolean literal is valid
- whether the basic shape of the argument list is valid

Semantic validation is responsible for:

- address validity
- numeric range checks
- command-specific business rules
- relationships between multiple options that depend on command semantics

Examples:

- `--contract --method balanceOf(address)`
  - parser error
- `--contract=`
  - parser error
- `--address abc`
  - semantic validation error unless a stricter command-specific parser rule is added
- malformed vote counts or domain-specific numeric constraints
  - semantic or command-specific pre-execution validation

Command-specific validation that runs immediately after parsing may still surface as `usage_error` when the problem
is malformed user input rather than runtime execution failure.

### Rationale

This contract prevents malformed input such as `--contract --method balanceOf(address)` from being treated as
`contract=true` and then failing later with a misleading execution error.

## Contract 3: Authentication Policy

`StandardCliRunner` controls whether automatic authentication is attempted for a command.

### Rules

- Auto-auth is a runner policy decision, not a side effect of arbitrary wrapper calls.
- Commands that do not require a logged-in wallet must not fail purely because wallet auto-auth setup is absent.
- Commands that require a wallet should authenticate deterministically or fail with an explicit execution error.
- `--wallet` must be honored as an explicit override even if the local `Wallet/` directory is absent or empty.
- Authentication skip conditions should be surfaced as text-mode info messages when appropriate.

### Policy Shape

Each command should have one clear auth policy:

- never auto-auth
- require auto-auth
- conditional auto-auth based on specific options

Avoid ad hoc checks spread across handlers.

### Decision Point

Auth policy is resolved only after:

1. global options have been parsed
2. the command has been resolved
3. command-local options have been parsed

The runner then decides whether the command instance for this invocation is:

- `NEVER`
- `REQUIRE`

If a command has conditional auth behavior, that condition must be evaluated from parsed command options and must
resolve deterministically to either `NEVER` or `REQUIRE` before handler execution begins.

### Policy Semantics

`NEVER` means:

- the runner must not attempt wallet discovery
- the runner must not read active-wallet state for authentication
- the runner must not load or decrypt a keystore for authentication
- the runner must not require `MASTER_PASSWORD`
- the command must be allowed to execute even if wallet auth setup is absent or broken

`REQUIRE` means:

- the runner must resolve an authentication target before handler execution
- the runner must successfully complete keystore loading and password verification before handler execution
- if authentication cannot be completed, the handler must not run
- failure to authenticate is an execution error, not a silent skip

### Resolution Order

When auth policy resolves to `REQUIRE`, the runner must resolve the target wallet in this order:

1. explicit `--wallet` override
2. active wallet selection

`--wallet` is authoritative for that invocation and takes precedence over active-wallet state.

### `--wallet` Override Rules

When `--wallet` is present, the runner must try to resolve it as:

1. an explicit filesystem path
2. a file entry under local `Wallet/`
3. a wallet name

Specific rules:

- an explicit filesystem path must be honored even if the local `Wallet/` directory does not exist
- `--wallet` must not be ignored merely because the current working directory has no keystore directory
- if `--wallet` is ambiguous or does not resolve to a keystore, the command must fail with an explicit execution error

### Active Wallet Rules

If `--wallet` is absent and auth policy resolves to `REQUIRE`, active-wallet resolution is authoritative.

Rules:

- unreadable or malformed active-wallet state must not be silently treated as "unset"
- an active wallet pointing to a missing keystore must not silently fall back to another wallet
- wallet-required commands must fail explicitly when the selected active wallet cannot be used

For commands whose auth policy resolves to `NEVER`, active-wallet problems must not block execution.

Commands whose purpose is wallet inspection or recovery may intentionally use a more lenient read of active-wallet
state, but that behavior must be explicit in command design rather than an accidental side effect of runner auth.

### Skip vs Fail

For invocations whose resolved auth policy is `NEVER`:

- auth may be skipped without error
- text-mode info messages may explain why auth was skipped
- JSON mode does not need to surface skip info as a top-level result
- the runner may still pass through the already-parsed global `--wallet` value as an explicit target selector for
  command-specific business logic, as long as that does not trigger runner-managed authentication semantics

For invocations whose resolved auth policy is `REQUIRE`:

- missing wallet directory is an execution error unless an explicit `--wallet` path resolves successfully
- missing keystore is an execution error
- missing `MASTER_PASSWORD` is an execution error
- invalid password is an execution error
- unreadable wallet metadata or keystore content is an execution error
- the standard CLI must not fall back to interactive password prompts, wallet-selection prompts, permission prompts,
  confirmation prompts, or other interactive auth flows
- "skip auto-login and let the handler fail later" is not allowed

### Handler Boundary

- handlers must not re-decide runner auth policy ad hoc
- handlers may still perform command-specific checks about whether a logged-in wallet is acceptable for the requested
  operation
- handlers must be able to rely on the runner guarantee that `REQUIRE` commands either start authenticated or do not
  start at all
- when a `NEVER` command intentionally uses global `--wallet` as a business-level target selector, that behavior
  must be explicit in command design and must not implicitly fall back into runner-style auth or `MASTER_PASSWORD`
  requirements

### Standard CLI vs REPL

This contract applies only to the standard CLI path.

Rules:

- changes made to satisfy this auth contract must not silently change legacy REPL auth behavior
- REPL prompt flow, password prompting, and legacy interactive recovery behavior remain separate compatibility concerns
- if standard CLI needs stricter auth handling than the REPL, isolate that behavior in `StandardCliRunner` or other
  standard-CLI-only code paths rather than changing shared legacy behavior by accident

## Contract 4: Result and Error Model

The standard CLI must have one clear source of truth for success, failure, and exit code behavior.

### Rules

- Usage mistakes map to a usage error and exit code `2`.
- Execution failures map to an execution error and exit code `1`.
- Success maps to exit code `0`.
- A command must not report success if the underlying operation merely printed a warning and returned early.
- The standard CLI path must not depend on legacy direct `System.out.println(...)` calls to signal success or failure.

### Recommended Responsibility Split

- Command handlers decide the public CLI outcome.
- `WalletApiWrapper` should return structured results or throw explicit exceptions for failure cases.
- `OutputFormatter` is the only place that should emit standard CLI envelopes and terminal-facing error formatting.

### Outcome Ownership

For the standard CLI path, the public outcome of a command is determined by the standard CLI layer, not by legacy
printing side effects.

Rules:

- a command invocation must end in exactly one public outcome:
  - success
  - usage error
  - execution error
- a handler must not rely on legacy stdout/stderr text to imply success
- a handler must not report success merely because no exception was thrown
- if an underlying operation returns early, reports failure, or leaves the command without a real result, the handler
  must map that to a non-success outcome

### Usage Error vs Execution Error

`usage_error` covers malformed CLI input, including:

- invalid option syntax
- missing required arguments
- parser-level invalid values
- command-specific malformed user input detected before execution

`execution_error` covers failures after the invocation is otherwise well-formed, including:

- authentication failure
- keystore resolution or loading failure
- RPC or network failure
- chain rejection
- wrapper-level operational failure
- command execution that cannot produce the promised result

The standard CLI must prefer early `usage_error` classification for malformed input rather than letting parser problems
leak into downstream execution failures.

### Single-Outcome Rule

The standard CLI invocation model is single-outcome.

Rules:

- one invocation must not emit multiple competing terminal outcomes
- once a command has emitted a terminal success or error outcome, no later layer should reinterpret that invocation
- handlers must not emit success and then continue into a later failure path
- if a handler returns without establishing a valid outcome for the requested operation, that is a standard CLI
  contract violation and should surface as an execution error rather than silent success

### Legacy Integration Boundary

The standard CLI may call shared legacy layers such as `WalletApiWrapper`, but legacy behavior is not the public
result contract for the standard CLI.

Rules:

- direct prints from shared legacy code are compatibility details, not the standard CLI source of truth
- if a shared wrapper method only prints warnings or status text, the standard CLI must not treat that as sufficient
  success signaling
- if a shared wrapper method cannot express failure cleanly enough for the standard CLI contract, the standard CLI
  should adapt it explicitly rather than inheriting ambiguous behavior

### Additive Change Preference

Because `WalletApiWrapper` and related utilities are shared with the legacy REPL path, changes to shared layers should
prefer additive evolution.

Rules:

- prefer adding new structured return paths, helper methods, adapters, or standard-CLI-specific wrappers
- avoid silently changing the meaning of existing shared methods that the REPL already depends on
- do not require an immediate rewrite of legacy REPL-oriented wrapper behavior just to satisfy the standard CLI
  contract
- if a non-additive shared-layer change becomes necessary, it must be evaluated explicitly for REPL compatibility and
  called out in the spec or PR discussion

### Standard CLI vs REPL

This result contract applies to the standard CLI public surface.

Rules:

- tightening result semantics for the standard CLI must not silently change legacy REPL success/failure behavior
- if stricter standard CLI outcome handling is needed, isolate that logic in handlers, adapters, runner code, or
  formatter-controlled paths before changing shared REPL behavior

## Contract 5: Machine-Readable Output

JSON mode exists to provide a stable machine-readable contract.

### Rules

- JSON mode must emit one structured success envelope or one structured error envelope.
- Commands participating in standard CLI mode must not bypass `OutputFormatter` for their public result.
- Stray legacy stdout/stderr may be suppressed in JSON mode, but this is only a containment mechanism, not the
  primary success path.
- Command behavior in JSON mode must not rely on legacy printing side effects being visible to the caller.

### Formal Interface

For the standard CLI path, `--output json` is a formal machine-readable interface, not an incidental alternate
display format.

Rules:

- if `--output` is omitted, the standard CLI defaults to text mode
- text mode is the formal human-facing interface
- new standard CLI commands must treat JSON output as a maintained contract
- changes to existing standard CLI commands must preserve JSON-mode contract compatibility unless the spec is revised
- machine consumers that require a stable structured contract must explicitly request `--output json`
- callers must be able to determine success or failure from the JSON envelope itself without inspecting suppressed
  legacy output

### Single JSON Output Rule

Each standard CLI invocation in JSON mode must emit exactly one top-level JSON envelope to `stdout`.

Rules:

- `stdout` must contain one terminal JSON result
- JSON mode must not emit multiple competing top-level JSON outcomes
- empty `stdout` in JSON mode is never a valid success outcome
- legacy or debug output that would otherwise pollute `stdout` is a bug to contain, not part of the public contract

### Output Ownership

For the standard CLI path, `OutputFormatter` is the only valid public JSON emitter.

Rules:

- command handlers must route their public outcome through `OutputFormatter`
- shared legacy code may still print internally, but those prints are not part of the JSON contract
- suppressing stray legacy output does not convert it into valid JSON output
- if a shared legacy method cannot produce a standard-CLI-safe result directly, the standard CLI should adapt it
  explicitly
- a command that bypasses `OutputFormatter` is outside the standard CLI JSON contract until adapted

### Envelope Shape

The top-level JSON envelope is stable and must not vary by command.

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "error": "usage_error|execution_error|domain_specific_code",
  "message": "human-readable explanation"
}
```

### Field Stability

The JSON contract distinguishes stable machine-readable fields from human-oriented fields.

Rules:

- `success` is the stable top-level discriminator
- `error` is a stable machine-readable error code when `success` is `false`
- `message` is human-readable explanation text and must not be the only machine contract
- command-specific machine-readable payload belongs under `data`
- future command output expansion should prefer additive changes inside `data` rather than changing the top-level
  envelope shape

### Broadcast Command Payload

On-chain broadcast commands (send-coin, transfer-asset, trigger-contract, deploy-contract,
freeze-balance, vote-witness, etc.) include transaction-specific fields under `data` when the
broadcast succeeds.

Rules:

- a successful single-sign broadcast must include `"txid"` under `data`
- a successful multi-sign submission must not include `"txid"` under `data` because multi-sign
  submits a partially-signed transaction to a coordinator, not directly to the network; no txid
  is generated at broadcast time
- deploy-contract must additionally include `"contract_address"` (base58Check) under `data`
- callers that require a txid must check that `data.txid` is present; its absence means the
  transaction was submitted for multi-sign coordination

### Text and JSON Consistency

Text mode and JSON mode are two renderings of the same command outcome.

Rules:

- text mode and JSON mode must not represent different success/failure semantics for the same invocation
- a command must not succeed in text mode but produce empty output in JSON mode
- a command must not fail in text mode while reporting JSON success for the same underlying outcome
- machine-readable payload richness may differ from text formatting, but outcome classification must remain aligned

### Command Participation

A command is considered compliant with the standard CLI JSON contract only if all of the following are true:

- it emits its public result through `OutputFormatter`
- it produces one valid JSON envelope in JSON mode
- it does not require callers to inspect suppressed legacy output to determine success or failure

If a command cannot yet satisfy these rules cleanly, it should be adapted explicitly or treated as outside the
guaranteed JSON contract until that work is completed.

Such commands being temporarily outside the guaranteed JSON contract does not relax the standard CLI JSON contract
itself. It means those commands are not yet compliant and must not be used to redefine the contract for compliant
commands.

## Contract 6: Standard CLI vs Legacy Interactive Behavior

The standard CLI is not a thin alias for the legacy REPL path.

### Rules

- Standard CLI behavior takes precedence over legacy prompt-oriented behavior when the two conflict.
- Interactive viewers, prompts, and direct prints from legacy code are compatibility hazards in the standard CLI path.
- If a legacy path cannot satisfy the standard CLI contract cleanly, either adapt it explicitly or exclude it from
  the standard CLI guarantees.
- Hidden stdin scripting, prompt auto-confirmation, or injected prompt answers are not allowed as standard CLI
  behavior.

### Interface Identity

The standard CLI and the legacy REPL are separate public interfaces with different operating models.

Rules:

- the standard CLI is a non-interactive command interface intended for deterministic terminal use, scripts, agents,
  and automation
- the legacy REPL is an interactive prompt-oriented interface intended for human-driven sessions
- shared implementation is allowed, but shared UX and behavioral contract must not be assumed automatically

### Contract Precedence

When standard CLI requirements conflict with inherited REPL behavior, the standard CLI contract wins for the standard
CLI path.

Rules:

- standard CLI parser rules are not constrained by legacy REPL parsing quirks
- standard CLI auth behavior is not defined by legacy prompt flow
- standard CLI result and exit-code behavior are not defined by legacy print side effects
- standard CLI JSON behavior is not defined by what the legacy interactive path happens to print

### Interactive Boundary

Interactive behavior is not part of the intended standard CLI contract unless explicitly designed into a future spec
revision.

Rules:

- prompts, menus, viewer UIs, and multi-step confirmations from legacy code must not be treated as standard CLI
  contract behavior
- if a command capability currently depends on interactive legacy flow, it should be adapted explicitly before being
  considered fully standard-CLI-compliant
- hidden stdin feeding, prompt auto-confirmation, prompt suppression, or interactive fallback are not valid standard
  CLI implementation techniques

### Adaptation Strategy

When standard CLI needs capabilities that currently exist only in legacy interactive form, prefer explicit adaptation
over behavioral inheritance.

Rules:

- prefer additive adapters, standard-CLI-safe wrapper methods, or dedicated handler logic
- do not force standard CLI callers to emulate REPL interactions as part of the public contract
- do not silently redefine REPL behavior just to satisfy standard CLI requirements

### Temporary Compatibility Mechanisms

Some temporary containment techniques may be necessary while migrating legacy functionality.

Rules:

- temporary shims must be understood as migration aids, not as the target design
- code comments, tests, and PR descriptions should avoid presenting temporary compatibility hacks as the intended
  long-term contract
- when a command still depends on such a shim, that command is not standard-CLI-compliant and the dependency should be
  treated as technical debt to retire

## Contract 7: QA Verification Scope

The purpose of `qa/` for the standard CLI is to validate the public CLI contract, not to preserve incidental
legacy side effects.

### Rules

- QA should primarily validate observable CLI outcomes:
  - exit code behavior
  - text-mode success/failure semantics
  - JSON envelope correctness
  - meaningful parity between text and JSON where appropriate
- QA should not claim coverage for flows that are known stale, retired, or outside the supported standard CLI path.
- If a QA path no longer represents real supported behavior, retire it instead of keeping a misleading green check.

### QA Purpose

Standard CLI QA exists to validate contract behavior at the CLI boundary.

Rules:

- QA should verify what callers can observe from the standard CLI interface
- QA should not treat incidental legacy stdout/stderr behavior as the thing being preserved
- QA should not elevate temporary migration shims into the supported contract merely because they currently exist

### Priority Coverage Areas

QA for the standard CLI should prioritize coverage for:

- global option parsing behavior
- command-local parsing behavior
- authentication policy behavior
- success/failure classification
- exit code behavior
- JSON envelope correctness
- text/JSON outcome consistency
- help and other public top-level CLI flows

### Contract-Level Bias

Contract-level verification is more valuable than reproducing isolated implementation details.

Rules:

- prefer tests that validate user-visible contract guarantees at the CLI boundary
- when a bug is fixed, add regression coverage at the contract boundary if feasible
- avoid overfitting QA to temporary implementation quirks that are not part of the intended contract

### Text and JSON Verification

Text and JSON outputs should be validated according to their roles.

Rules:

- JSON-mode QA should validate both envelope shape and command outcome semantics
- text-mode QA should validate human-facing success/failure behavior without requiring brittle formatting snapshots
- text/JSON parity should primarily mean semantic outcome parity, not exact string equality
- if text and JSON intentionally differ in presentation detail, QA should still ensure they agree on success/failure
  and core public meaning

### Coverage Integrity

QA reporting must reflect real supported coverage.

Rules:

- do not represent stale, broken, or unsupported flows as validated simply because a script still runs
- if a command is not yet fully compliant with the standard CLI contract, QA should either mark that gap clearly or
  exclude the command from compliance claims
- a passing QA check must not rely on output that actually indicates an internal failure path

### Shared Layer vs CLI Boundary

Tests at different layers serve different purposes.

Rules:

- shared-layer unit tests are useful but do not replace CLI-boundary contract tests
- standard CLI QA should not assume that a passing wrapper or utility test proves public CLI correctness
- REPL-oriented tests do not count as standard CLI contract coverage unless they explicitly exercise the standard CLI
  surface

### Maintenance Expectations

QA should evolve with the contract.

Rules:

- when behavior covered by this spec changes, QA should be updated in the same change
- new standard CLI commands should add or extend contract-relevant coverage
- if a QA path becomes misleading, retire or rewrite it rather than keeping nominal coverage

## Reviewer Expectations Captured by This Spec

Review feedback in this area has consistently pushed toward:

- early parser failures instead of downstream surprises
- explicit auth policy instead of implicit side effects
- one reliable machine-readable output path
- one reliable success/failure model
- QA that validates supported behavior instead of historical implementation details

## Change Management

When changing behavior covered by this spec:

1. Update this document first or in the same change.
2. Update tests to reflect the intended contract.
3. Prefer contract-level tests over narrowly reproducing only the latest reported bug.

If a change intentionally violates this spec, document the reason in the PR and revise this file in the same patch.
