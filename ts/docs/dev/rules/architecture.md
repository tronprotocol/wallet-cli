# Architecture rules (`ts/`)

These rules define the target architecture of `ts/`. Code that breaks them is refactored to follow them. A rule
changes only by a design decision recorded in this directory: a better design, or a constraint the code encodes
that the rule missed. `CLAUDE.md` and `AGENTS.md` point here; do not restate the rules elsewhere. Paths are
relative to `ts/src/`.

The published contract in `ts/docs/machine-interface.md` (envelope, error codes, retry classes, exit codes,
stdout and stderr) is an input to these rules. Changing it is a separate product decision.

Each rule names how it is enforced:

- **depcruise**: a rule in `ts/.dependency-cruiser.cjs`.
- **lint**: an ESLint rule.
- **type**: the compiler rejects the violation.
- **test**: a test fails on the violation.
- **review**: no automation; listed in [Review-only rules](#review-only-rules).

An automated check is on as soon as it is written. Known violations go into its baseline: a new violation fails
at once, and the refactor removes the known ones.

## 1. Layers and dependency direction

Section 1 constrains production modules only. A `*.test.ts` file may import whatever it needs to test its
subject, including test frameworks, fixtures, and SDKs as reference implementations. A test lives next to its
subject. Production modules never import test files or test helpers. Sections 2 to 8 apply to tests as written.

| Layer | Owns | May depend on |
|---|---|---|
| `domain` | Business values and invariants: validation, calculation, identity, normalization, units, business constants, the error code registry, pure cryptographic computation | Nothing outside `domain` (see 1.5) |
| `application` | Workflow and policy: use cases, services, ports, contracts, time limits, the signing entry | `domain` |
| `adapters/inbound` | What drives the app: parse argv, prompt, render output, the envelope | `application`, `domain` |
| `adapters/outbound` | What the app calls: implement ports, translate external data into port types, I/O, locks, encryption at rest | `application/ports`, `application/contracts`, `domain` |
| `bootstrap` | Composition root and process lifecycle; assembly only, no decisions | everything |

1.1 Dependencies point inward, as the table shows. **depcruise**.

1.2 Outbound adapters do not import `application/services` or `application/use-cases`. **depcruise**.

1.3 Ports and contracts are the innermost part of `application`: they import only `domain` and other ports or
contracts. **depcruise**.

1.4 A use case is a `*-service.ts` module under `application/use-cases/`. Nothing in `application` imports a
use case. Logic that use cases share goes into a helper module in the same directory, a service, or `domain`.
**depcruise**.

1.5 Outside packages (Node and npm) follow an allowlist; 1.1 covers the project's own modules.
- `domain` and `application` import only pure computation libraries (`@noble/*`, `@scure/*`) and `node:crypto`:
  no I/O module and no SDK.
- Chain, device, and protocol SDKs (such as `tronweb` or `@ledgerhq/*`) and HTTP clients are imported only in
  `adapters/outbound`. The full package lists are in `ts/.dependency-cruiser.cjs`.

**depcruise**.

1.6 No circular dependencies. **depcruise**.

1.7 Every depcruise rule has a firing test in `ts/test/depcruise/rules.test.ts` that builds a violating tree and
asserts the rule reports it. **test**.

1.8 An outbound integration is a directory under `adapters/outbound/`, such as `chain/tron` or `ledger`. A chain
node integration lives in `chain/<family>/`; a protocol or service integration has its own directory, whatever
families it serves.
- SDKs are imported only inside integrations.
- Integrations do not import each other. One that needs another's capability receives it through a port wired
  in `bootstrap`.
- Shared plumbing (`adapters/outbound/http/`, `adapters/outbound/persistence/`) may be imported by any
  integration and imports no integration.

**depcruise**.

1.9 Everything outside the process is reached through an adapter:
- `adapters/outbound` for what the app calls: chain nodes, Ledger, HTTP services, and the files the app owns
  (keystore, config, books, written artifacts).
- `adapters/inbound` for what drives the app: argv, stdin, TTY, stdout and stderr, input files the user names,
  and servers that accept requests. Inbound reads a named input file into a value before it calls the use case,
  so ports carry no input paths (3.4).

Libraries that only compute or format (such as `zod`) are not integrations; 1.5 still limits which of them
`domain` and `application` import. **lint** for servers, **review**.

## 2. Rule ownership

2.1 Every business rule has exactly one owner. The owner defines the rule; other layers apply it by calling the
owner and never write its content themselves. The owner is:
- `domain` for business values and invariants that do not depend on a workflow: address and amount validity,
  units, normalization, password policy, permission limits, and business constants such as the default fee
  limit, default slippage, and transaction expiration.
- `application` for workflow policy and defaults that depend on context: when to sign, broadcast, confirm, or
  refuse; which networks offer a capability; the default token of a network; which account a command acts on;
  time limits.
- `adapters/outbound` for how external data maps to domain values, and which error code a transport failure
  gets.
- `adapters/inbound` for the CLI shape only: flag names, exclusive groups, turning argument text into values
  (splitting a list, reading a decimal string), the prompt flow, and the layout.

A command may call a `domain` or `application` function to fail early. Its Zod schema may declare `.default(X)`
when `X` is the owner's constant, so help and `--json-schema` still show the default. A command does not contain
the content of a business rule, a default value, a unit conversion policy, or an account selection policy.
**review**.

2.2 Every path that brings a business value in applies the owner's validity rules before the value is used or
stored. This includes configuration loads, persisted records, and non-CLI callers of a use case, such as
plugins. An early check in inbound is a convenience, not the enforcement point. Loading a value and writing the
same value never disagree on whether it is valid. **test**, **review**.

Exception: records that earlier releases stored under a looser rule load as they are, so users keep access to
their files; a write checks only the records it adds or changes, and nothing rewrites, truncates, or drops the
old ones. The tolerated cases are:
- two contacts with the same address (a contact name stays unique on load);
- a wallet label longer than 64 characters (every other label rule holds on load).

A new tolerated case is added here by a design decision. **test**: each case loads, and a write that adds the
same case is refused.

2.3 Each command has one Zod schema. It drives validation, positional arity, help text, and `--json-schema`; no
second definition of a command's arguments exists. **test**: every registered command has exactly one schema.

## 3. Ports

3.1 Port types are closed. No `unknown`, no `any`, and no alias that resolves to one of them (such as
`Record<string, unknown>`) crosses a port toward the inside. This covers `application/ports`,
`application/contracts`, and `domain/types`.
- A JSON-shaped type with concrete values (strings, numbers, booleans, null, and arrays or objects of them) may
  carry data passed through for display. Inner layers do not read its fields to derive a fact (3.2).
- Values that inner layers send outward, such as contract call arguments or a document to write, are outside
  3.1. A payload sent to be signed is closed by the sign request of 6.4.

**lint** for `unknown`, `any`, and aliases to them; **review** for reads of pass-through data.

3.2 Outbound adapters normalize external facts into port types, once. Inner layers do not read raw node, SDK, or
wire fields to derive a fact. This covers at least: transaction execution result, decoded token and account
text, staking totals, resources, head block, EVM quantities, and contract revert reasons. Data passed through
verbatim for display (for example `block get`) has a named raw type, and inner layers do not branch on it.
**type** for raw fields absent from port types, **test** for each adapter's normalization, **review** for
re-decoding a normalized value.

3.3 Amounts that cross a port or a use-case boundary carry their unit in the type (for example a branded
base-unit string, or `{ raw: bigint, decimals }`). `number` is used only for values the adapter has proven to be
safe integers. A display-only float (such as a USD value) is named as such. **type**.

3.4 Ports use operation-specific types, not argv structures or flag names. Raw text, such as HTTP header lines,
is parsed before the port call. A storage port may accept the destination path the user chose; the adapter owns
path resolution, file layout, permissions, and the no-overwrite rule. **review**.

3.5 Repositories:
- A logical change is validated and published under one lock, through one call (`update(change)`), not a
  sequence of calls.
- Policy over stored data is a pure `domain` function that the adapter applies inside the lock.
- Create data files before publishing a reference to them; remove the reference before deleting the files. A
  committed index never references missing data.
- Each multi-file operation defines its commit point. A failure before it, including the process being killed,
  leaves the previous state; cleanup after it is reported truthfully. Write ordering alone is not rollback: full
  rollback needs a recovery design with fault tests.
- Inbound reaches stored state only through application use cases, never through a repository port.
- A lock is taken over only when the process that holds it is dead, never because of its age. A lock that cannot
  be acquired reports its path, so the user can remove it when no command is running.

**test**, **review**.

3.6 An adapter does not drive application flow: it does not build signers or decide when to sign. It receives
what it needs through the port call. **depcruise** for the import direction (1.2), **review** and **test** for
the flow.

3.7 Time limits that `application` sets reach a port call as an `AbortSignal`. An adapter's own transport
timeout is internal to the adapter. It may reach through an SDK by any mechanism, as long as a request whose
time has run out is never sent. **type**, **test**.

The command deadline reaches outbound as a `DispatchCheck` (`application/contracts/deadline.ts`). The check is
bound to the port at `gateways.get`, or passed in the call. The adapter calls `assertDispatchable()` immediately
before it sends each request, after any queue, pacing, or retry. A submit gets `submitDispatchCheck`, so the
admission rule of `application` runs again at that point; outbound does not restate it. **test**.

## 4. Output

4.1 Use cases return typed results. JSON and text output are projections of the same result; they differ only
where `ts/docs/machine-interface.md` says so. **type** for result types, **test** for the projections.

4.2 Renderers format; they do not compute facts or make judgments. A fact the user needs (unit, warning, risk)
is a field of the result or an entry in `meta.warnings`. **review**.

4.3 The `--json-schema` output and the envelope are snapshot-tested; changing them is a recorded contract
decision. **test**.

## 5. Families and capabilities

5.1 Chain facts are defined once, in `domain`: address format, address encoding conversion, transaction hash
format, units, and the zero address. No module writes them by hand.
- Other code gets them through `domain/family`. Code in a `tron/` or `evm/` directory, or in a protocol's
  directory, may use its own family's codec (for example `domain/address`) directly.
- Addresses are compared and stored in the canonical form that `domain/family` defines.
- A `tron/` or `evm/` directory holds only that chain's own protocol. Code for a protocol built on a chain is
  not placed there.

**review**.

5.2 When a feature behaves differently per family (for example x402 schemes, or which use case a command runs),
the feature module holds one table from family to behavior. It does not branch on the family in several places.
**review**.

5.3 `application` owns one capability predicate per capability. The predicate decides over the network, the
configuration, and the inputs the capability needs. Discovery (help, `--json-schema`) separates "supported on
this network" from "needs these inputs here". A missing default asset does not mean the whole capability is
unavailable. **test**: for each builtin network, the predicate and the execution gate agree on supported,
unsupported, and conditional-input cases.

## 6. Safety invariants

6.1 Every path that submits a transaction or moves funds checks the dry-run guard before the side effect. A
test lists every such port method and checks that it refuses during dry-run. **test**.

6.2 `application` owns the TRON transaction lifecycle and selects its steps by execution mode and transaction
origin. Call sites do not skip a step that applies to their mode.
- Dry-run and build-only never sign or submit. Sign-only never submits.
- Broadcasting an imported signed transaction never resolves a local signer or rewrites the signed body.
- Confirmation follows the documented `--wait` policy; a contract call requires its execution result.
- A write signed by a service (for example `sunpump launch`) follows its documented lifecycle with the same
  side-effect guarantees.

**type** for the mode-specific API, **test** for expiry, signer gates, early exits, and confirmation.

6.3 Errors keep the codes and retry classes of the published contract.
- A failed read, or a request known not to have acted, gets the matching retryable code.
- A write that may have been committed follows its documented outcome-unknown policy, and its error carries
  `error.details.outcome: "unknown"`. A chain submit of a signed transaction whose outcome is unknown reports
  the id of that transaction in `error.details.txId`.
- A call that the deadline stops before its request is sent fails with `DeadlineExpiredError` (`timeout`,
  nothing sent, no txId). A call stopped after its request was sent fails with a `TransportError` or
  `ChainError` (`timeout`, outcome unknown); a submit adds the txId.
- "Not supported" comes only from a capability decision or a recognized unsupported response, never from an
  unclassified exception.

**test** for the transaction id on submit failures, **review**.

6.4 Signing has one entry: an `application` service that takes a closed sign request naming its network, its
origin, and its payload.
- It refuses a payload whose embedded chain identity (EVM `chainId`, EIP-712 `domain.chainId`) disagrees with
  the named network. It refuses a TRON transaction when the named network's node does not hold its reference
  block.
- Submitting happens only through the guarded paths of 6.1.
- An integration whose SDK can sign or send wraps the SDK so those functions are unreachable elsewhere, and
  builds no signer of its own.

**depcruise** for SDK entry points that sign or send, **test** for chain identity mismatches, **review**.

6.5 Secrets (private keys, mnemonics, BIP39 passphrases, passwords) are encrypted at rest and never read from
argv or environment variables, only from the dedicated stdin channel or a hidden TTY prompt. **lint**:
`process.env` is read only in `bootstrap` and an allowlist; **test**: no command schema has a secret option.

Exception: native `backup` and `address generate` may write their secret in plaintext to a file
created with mode 0600 that never overwrites or follows an existing path. A secret is printed to
stdout only when the user passes the command's explicit option (`address generate --print-secret`).
**test**.

6.6 Credentials that `config` stores for external services are not 6.5 secrets. They are read only from stdin,
never from argv or environment variables, are stored in a file with mode 0600, and are masked in every output.
**test**.

## 7. Language boundary

7.1 `application`, `domain`, and `adapters/outbound` do not name CLI flags or commands. Errors and warnings name
inputs and next steps through structured references and fields; inbound decides how to describe them to the user.
**review**.

7.2 `domain` owns the error code registry: each code's meaning, retry class, and exit class, as published in the
contract. `adapters/inbound` owns the envelope shape and the fallback for unknown and `either` codes. **test** for
the registry against the contract.

## 8. Documentation

8.1 Comments follow [comments.md](comments.md).

8.2 Design decisions that must survive are recorded in this directory, not in code comments.

## Review-only rules

Check these in every review until they are automated: 2.1, 3.4, 4.2, 5.1, 5.2, 7.1, and the review parts of
1.9, 2.2, 3.1, 3.2, 3.5, 3.6, 6.3, and 6.4.
