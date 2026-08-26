# wallet-cli (Java) v4.13.0 — release notes

This release removes the Standard CLI. The Java implementation is now an
interactive shell and nothing else.

If you drive wallet-cli from a script, a CI job, or an agent, **this release
breaks you**. Move that work to the TypeScript CLI:

```
npm install -g @tron-walletcli/wallet-cli
```

Everything you did by hand at the `>` prompt keeps working exactly as before.

---

## Breaking changes

### 1. The Standard CLI is gone

Every non-interactive command — the whole `wallet-cli <command> [--flags]`
surface, `--output json`, `--network`, `--quiet`, `--verbose`, `--wallet`,
`--grpc-endpoint`, `--password-stdin` — has been removed, with no deprecation
period.

The shell now starts one way and one way only:

```
java -jar wallet-cli.jar
```

`--version` prints the version, `--help` prints usage. **Any other argument**
prints a single line on stderr and exits with code 2:

```
Standard CLI has been removed in v4.13.0. Use the TypeScript CLI instead: @tron-walletcli/wallet-cli
```

The exit code is deliberately 2, the same code the Standard CLI used for a
usage error, so a script's "non-zero means failure" check still holds. The
message is deliberately **not** a JSON envelope — a well-formed envelope would
suggest the contract still exists.

Non-interactive use is now the TypeScript CLI's job.

### 2. The alias feature is removed

`alias-add`, `alias-remove`, `alias-list` and `alias-resolve` are gone, along
with the bundled network alias sets. Aliases were only ever reachable from
Standard CLI commands; the interactive shell never resolved them.

### 3. `--interactive` is removed

The flag existed so that a non-interactive entry point could escape into the
REPL. With no non-interactive entry point left there is nothing to escape from.
It was never documented — `java/README.md` has always shown the bare
invocation — and that bare invocation is now the only supported one.

### 4. The `MASTER_PASSWORD` environment variable is no longer read

The Standard CLI read your keystore password from `MASTER_PASSWORD` so it could
run unattended. That channel is removed, together with the dormant branch inside
the shell's own password prompt that could have read the same variable.

Passwords now come from one place: the terminal prompt.

### 5. Non-interactive Ledger signing is removed

**The Java implementation still supports Ledger.** `ImportWalletByLedger` and
on-device signing in the interactive shell are untouched — the entire
`org.tron.ledger` package is retained.

What is removed is the *non-interactive* Ledger signing adapter: the code path
that let a script or CI job produce a Ledger signature without a human at the
terminal. If you need Ledger signing from automation, use the TypeScript CLI.

### 6. Leftover files in your wallet directory

If you used the Standard CLI, two things may be sitting under your working
directory that nothing reads any more:

- `Wallet/aliases/` — the alias store
- `Wallet/.active-wallet` — the active-wallet pointer

**This release does not delete anything under your wallet directory.** You can
remove both by hand whenever you like. Leaving them in place is also fine: the
wallet chooser now skips subdirectories, so a stray `Wallet/aliases/` no longer
shows up as a numbered entry in the wallet list. (That is a bug fix in its own
right — any subdirectory used to appear there.)

### 7. Version number

This is **v4.13.0**, in step with the TypeScript release of the same number.
It is deliberately *not* a major-version bump, so a build pinned by a semver
range or a lockfile will not be held back by the version alone. If you depend
on the Standard CLI, pin to v4.12.0 while you migrate — nothing in this release
will stop an automatic upgrade from breaking your scripts.

---

## Also in this release

- The QA harness under `java/qa/` is removed. It only ever exercised the
  Standard CLI, so it lost its subject; no interactive-shell coverage is lost
  with it, because it never had any.
