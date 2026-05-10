# Unified Address Book Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a unified address book to the Standard CLI so users (and AI agents) can use named aliases instead of raw TRON addresses for both **accounts** (recipients, owners, voters) and **TRC20 tokens** (`USDT`, `USDC`, ...).

**Architecture:**
A single `AliasStore` holds typed entries (`type in {ACCOUNT, TOKEN}`). The store is layered: an immutable built-in baseline (TRC20 tokens only, bundled as JSON resources per network) plus a per-network user file. **Built-in entries cannot be overridden** — `alias-add` rejects any name that exists in the built-in set, and runtime layering also keeps built-in entries authoritative if a user file is edited by hand. Resolution is bare-name fallback (Foundry/ENS style): inputs that decode as Base58 or hex are passed through unchanged; only on failure does the resolver consult the alias store, filtered by the type the calling option expects (`--contract` -> TOKEN, `--to/--from/--owner/--receiver/--address` -> ACCOUNT, except `get-contract` / `get-contract-info` whose `--address` is semantically a contract). Every alias hit is recorded and surfaced via stderr (text mode) and `meta.resolved` (JSON mode) so the resolved address is auditable before signing.

**Tech Stack:** Java 8, JCommander/Standard-CLI framework, Jackson 2.x (add to `build.gradle` if missing), JUnit 4.

**Scope:**
- All 76 `opts.getAddress(...)` call sites across `cli/commands/*.java` migrate to `getAccountAddress(...)` or `getContractAddress(...)`.
- Built-in baseline ships TRC20 tokens only (USDT/USDC/USDD/WTRX on `main`; USDT on `nile`; empty on `shasta`; empty on `custom`).
- New `alias-add / alias-remove / alias-list / alias-resolve` commands.
- Naming standard, reserved words, anti-Base58 checks enforced at registration.
- Symbol collision with built-in is rejected with an actionable error.
- JSON envelope gains optional `meta.resolved` array.

**Out of scope:**
- Decimals-aware amount conversion (`--amount 1.5 --token USDT`).
- ABI-level alias inside `--params` and `--library` strings.
- Built-in account/recipient entries (built-in contains tokens only).
- Cross-network sync, third-party token list import.
- REPL (`Client.java`) interactive command alias support — Standard CLI only.

---

## File Structure

```
src/main/java/org/tron/walletcli/cli/aliases/
  AliasType.java              # enum ACCOUNT, TOKEN
  AliasEntry.java             # name, type, address[21], decimals (token only), source
  AliasValidation.java        # name regex, reserved, anti-Base58, anti-hex
  AliasStore.java             # in-memory typed lookup
  AliasStoreLoader.java       # builtin resources + user JSON file (read/write atomic)
  ResolutionResult.java       # option, input, address, name|null, type|null, source
  AliasResolver.java          # resolve(option, input, expectedType) -> ResolutionResult
  AliasResolutionException.java

src/main/resources/aliases/
  main.json
  nile.json
  shasta.json

src/main/java/org/tron/walletcli/cli/
  ParsedOptions.java          # MODIFY: add resolver field, getAccountAddress, getContractAddress
  CommandDefinition.java      # MODIFY: parseArgs(args, resolver) overload
  CommandContext.java         # MODIFY: thread AliasResolver through
  StandardCliRunner.java      # MODIFY: build resolver per invocation, push log to formatter
  OutputFormatter.java        # MODIFY: stderr resolved lines + JSON meta.resolved

src/main/java/org/tron/walletcli/cli/commands/
  AliasCommands.java          # NEW: alias-add / alias-remove / alias-list / alias-resolve
  TransactionCommands.java    # MODIFY: 16 sites
  StakingCommands.java        # MODIFY: 14 sites
  ContractCommands.java       # MODIFY: 13 sites (12 owner/contract, 1 mixed)
  QueryCommands.java          # MODIFY: 21 sites (2 contract, rest account)
  ExchangeCommands.java       # MODIFY: 5 sites
  WitnessCommands.java        # MODIFY: 4 sites
  ProposalCommands.java       # MODIFY: 3 sites

src/main/java/org/tron/walletcli/Client.java
  # MODIFY: register AliasCommands

src/test/java/org/tron/walletcli/cli/aliases/
  AliasEntryTest.java
  AliasValidationTest.java
  AliasStoreTest.java
  AliasStoreLoaderTest.java
  AliasResolverTest.java
src/test/java/org/tron/walletcli/cli/
  ParsedOptionsAliasTest.java
  OutputFormatterResolvedTest.java

docs/standard-cli-contract-spec.md   # MODIFY
qa/commands/alias.sh                 # NEW
```

User alias file path: `Wallet/aliases/<network>.json` (alongside the keystore directory). `<network>` uses the Standard CLI values: `main`, `nile`, `shasta`, or `custom`.

---

## JSON formats

**Built-in resource & user file** share one schema:

```json
{
  "entries": [
    {"name": "USDT", "type": "TOKEN",   "address": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", "decimals": 6},
    {"name": "alice","type": "ACCOUNT", "address": "TXyzExampleRecipientAddress...........", "note": "company hot wallet"}
  ]
}
```

`decimals` only meaningful for TOKEN; ignored for ACCOUNT. `note` optional, only for ACCOUNT.

**JSON output meta enrichment** (envelope field, omitted when empty):

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "resolved": [
      {"option": "contract", "input": "USDT", "address": "TR7NHqj...", "name": "USDT", "type": "TOKEN", "source": "builtin"},
      {"option": "to",       "input": "alice","address": "TXyz...",   "name": "alice","type": "ACCOUNT","source": "user"}
    ]
  }
}
```

---

## Phase Map

| Phase | Tasks | Outcome |
|---|---|---|
| **0. Foundation** | T1–T4 | `AliasType`, `AliasEntry`, `AliasValidation`, built-in JSON resources |
| **1. Storage** | T5–T7 | `AliasStore`, `AliasStoreLoader`, layered loader |
| **2. Resolver** | T8–T9 | `ResolutionResult`, `AliasResolver`, exception |
| **3. CLI plumbing** | T10–T12 | `ParsedOptions` + `CommandContext` + `StandardCliRunner` wired |
| **4. Audit output** | T13 | `OutputFormatter` resolved lines + meta |
| **5. Token migration** | T14 | ContractCommands `--contract` + QueryCommands get-contract* |
| **6. Account migration** | T15–T20.5 | All remaining sites: Transaction, Staking, Witness, Proposal, Exchange, Query; Wallet (switch-wallet uses opts.getString manually so needs its own task T20.5) |
| **7. CLI commands** | T21 | `alias-add/remove/list/resolve` |
| **8. Docs & QA** | T22–T23 | Contract spec + parity script |

Each command-migration task in Phase 6 is a self-contained file edit + smoke build, so they can be parallelised by separate subagents if Subagent-Driven execution is chosen.

---

## Task 1: `AliasType` enum

**Files:**
- Create: `src/main/java/org/tron/walletcli/cli/aliases/AliasType.java`

- [ ] **Step 1: Implement**

```java
package org.tron.walletcli.cli.aliases;

import java.util.Locale;

public enum AliasType {
  ACCOUNT,
  TOKEN;

  public static AliasType parse(String s) {
    if (s == null) throw new IllegalArgumentException("type must not be null");
    String upper = s.trim().toUpperCase(Locale.ROOT);
    try {
      return AliasType.valueOf(upper);
    } catch (IllegalArgumentException e) {
      throw new IllegalArgumentException(
          "type must be ACCOUNT or TOKEN, got: " + s);
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/java/org/tron/walletcli/cli/aliases/AliasType.java
git commit -m "feat(aliases): add AliasType enum"
```

---

## Task 2: `AliasEntry` value type

**Files:**
- Create: `src/main/java/org/tron/walletcli/cli/aliases/AliasEntry.java`
- Test: `src/test/java/org/tron/walletcli/cli/aliases/AliasEntryTest.java`

- [ ] **Step 1: Write the failing test**

```java
package org.tron.walletcli.cli.aliases;

import org.junit.Test;
import static org.junit.Assert.*;

public class AliasEntryTest {

  private byte[] addr() {
    byte[] a = new byte[21];
    a[0] = 0x41;
    return a;
  }

  @Test public void nameIsUpperCasedAndTrimmed() {
    AliasEntry e = AliasEntry.token(" usdt ", addr(), 6, "builtin");
    assertEquals("USDT", e.getName());
  }

  @Test public void accountKeepsCaseFolded() {
    AliasEntry e = AliasEntry.account(" Alice ", addr(), "user", "hot wallet");
    assertEquals("ALICE", e.getName());
    assertEquals("hot wallet", e.getNote());
  }

  @Test public void addressIsCopiedDefensively() {
    byte[] a = addr();
    AliasEntry e = AliasEntry.token("USDT", a, 6, "builtin");
    a[0] = 0x00;
    assertEquals(0x41, e.getAddress()[0]);
  }

  @Test(expected = IllegalArgumentException.class)
  public void rejectsWrongAddressLength() {
    AliasEntry.token("USDT", new byte[20], 6, "builtin");
  }

  @Test(expected = IllegalArgumentException.class)
  public void rejectsBlankSource() {
    AliasEntry.token("USDT", addr(), 6, "  ");
  }

  @Test(expected = IllegalArgumentException.class)
  public void rejectsBlankName() {
    AliasEntry.token("  ", addr(), 6, "builtin");
  }

  @Test public void tokenHasTokenType() {
    assertEquals(AliasType.TOKEN, AliasEntry.token("USDT", addr(), 6, "builtin").getType());
  }

  @Test public void accountHasAccountType() {
    assertEquals(AliasType.ACCOUNT, AliasEntry.account("alice", addr(), "user", null).getType());
  }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `./gradlew test --tests "org.tron.walletcli.cli.aliases.AliasEntryTest"`
Expected: FAIL — class missing.

- [ ] **Step 3: Implement**

```java
package org.tron.walletcli.cli.aliases;

import java.util.Locale;

public final class AliasEntry {

  private final String name;
  private final AliasType type;
  private final byte[] address;
  private final int decimals;     // meaningful for TOKEN; 0 for ACCOUNT
  private final String source;    // "builtin" | "user"
  private final String note;      // optional ACCOUNT note

  private AliasEntry(String name, AliasType type, byte[] address,
                     int decimals, String source, String note) {
    if (name == null) throw new IllegalArgumentException("name must not be null");
    String n = name.trim().toUpperCase(Locale.ROOT);
    if (n.isEmpty()) throw new IllegalArgumentException("name must not be blank");
    if (type == null) throw new IllegalArgumentException("type must not be null");
    if (address == null) throw new IllegalArgumentException("address must not be null");
    if (address.length != 21) {
      throw new IllegalArgumentException(
          "address must be 21 bytes, got " + address.length);
    }
    if (source == null || source.trim().isEmpty()) {
      throw new IllegalArgumentException("source must not be blank");
    }
    this.name = n;
    this.type = type;
    this.address = address.clone();
    this.decimals = decimals;
    this.source = source;
    this.note = note;
  }

  public static AliasEntry token(String name, byte[] address, int decimals, String source) {
    return new AliasEntry(name, AliasType.TOKEN, address, decimals, source, null);
  }

  public static AliasEntry account(String name, byte[] address, String source, String note) {
    return new AliasEntry(name, AliasType.ACCOUNT, address, 0, source, note);
  }

  public String getName() { return name; }
  public AliasType getType() { return type; }
  public byte[] getAddress() { return address.clone(); }
  public int getDecimals() { return decimals; }
  public String getSource() { return source; }
  public String getNote() { return note; }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `./gradlew test --tests "org.tron.walletcli.cli.aliases.AliasEntryTest"`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/org/tron/walletcli/cli/aliases/AliasEntry.java \
        src/test/java/org/tron/walletcli/cli/aliases/AliasEntryTest.java
git commit -m "feat(aliases): add typed AliasEntry value type"
```

---

## Task 3: `AliasValidation` syntactic guards

**Files:**
- Create: `src/main/java/org/tron/walletcli/cli/aliases/AliasValidation.java`
- Test: `src/test/java/org/tron/walletcli/cli/aliases/AliasValidationTest.java`

Naming rules (rejected):
- Decodable as Base58Check TRON address.
- Matches hex-address shape: `^(0x|41)[0-9a-fA-F]{40}$`.
- Reserved (case-insensitive): `me`, `self`, `main`, `mainnet`, `nile`, `shasta`, `custom`, `trx`, `default`.
- Anything not matching `^[A-Za-z][A-Za-z0-9_.-]{0,31}$`.

- [ ] **Step 1: Write the failing test**

```java
package org.tron.walletcli.cli.aliases;

import org.junit.Test;
import static org.junit.Assert.*;

public class AliasValidationTest {

  @Test public void acceptsTypicalNames() {
    AliasValidation.requireValidName("USDT");
    AliasValidation.requireValidName("alice");
    AliasValidation.requireValidName("hot-wallet");
    AliasValidation.requireValidName("v2.usdt");
    AliasValidation.requireValidName("Pkg_Beta");
  }

  @Test(expected = IllegalArgumentException.class)
  public void rejectsBase58() {
    AliasValidation.requireValidName("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
  }

  @Test(expected = IllegalArgumentException.class)
  public void rejectsHex() {
    AliasValidation.requireValidName("41a614f803b6fd780986a42c78ec9c7f77e6ded13c");
  }

  @Test(expected = IllegalArgumentException.class)
  public void rejects0xHex() {
    AliasValidation.requireValidName("0xa614f803b6fd780986a42c78ec9c7f77e6ded13c");
  }

  @Test(expected = IllegalArgumentException.class)
  public void rejectsReserved() { AliasValidation.requireValidName("me"); }

  @Test(expected = IllegalArgumentException.class)
  public void rejectsLeadingDigit() { AliasValidation.requireValidName("1inch"); }

  @Test(expected = IllegalArgumentException.class)
  public void rejectsTooLong() {
    StringBuilder sb = new StringBuilder("A");
    for (int i = 0; i < 32; i++) sb.append('a');
    AliasValidation.requireValidName(sb.toString());
  }

  @Test(expected = IllegalArgumentException.class)
  public void rejectsNull() { AliasValidation.requireValidName(null); }

  @Test public void looksLikeAddressDetectsBase58() {
    assertTrue(AliasValidation.looksLikeAddress("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"));
  }

  @Test public void looksLikeAddressDetectsHex() {
    assertTrue(AliasValidation.looksLikeAddress(
        "41a614f803b6fd780986a42c78ec9c7f77e6ded13c"));
  }

  @Test public void looksLikeAddressRejectsName() {
    assertFalse(AliasValidation.looksLikeAddress("USDT"));
    assertFalse(AliasValidation.looksLikeAddress("alice"));
  }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `./gradlew test --tests "org.tron.walletcli.cli.aliases.AliasValidationTest"`
Expected: FAIL.

- [ ] **Step 3: Implement**

```java
package org.tron.walletcli.cli.aliases;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import org.tron.walletserver.WalletApi;

public final class AliasValidation {
  private AliasValidation() {}

  private static final Pattern NAME = Pattern.compile("^[A-Za-z][A-Za-z0-9_.-]{0,31}$");
  private static final Pattern HEX = Pattern.compile("^(0x|41)[0-9a-fA-F]{40}$");
  private static final Set<String> RESERVED = new HashSet<String>(Arrays.asList(
      "me", "self", "main", "mainnet", "nile", "shasta", "custom", "trx", "default"));

  public static boolean looksLikeAddress(String input) {
    if (input == null) return false;
    String t = input.trim();
    if (t.isEmpty()) return false;
    if (HEX.matcher(t).matches()) return true;
    return WalletApi.decodeFromBase58Check(t) != null;
  }

  public static void requireValidName(String name) {
    if (name == null) throw new IllegalArgumentException("alias name must not be null");
    String t = name.trim();
    if (!NAME.matcher(t).matches()) {
      throw new IllegalArgumentException(
          "invalid alias name: " + name
              + " (must match ^[A-Za-z][A-Za-z0-9_.-]{0,31}$)");
    }
    if (RESERVED.contains(t.toLowerCase(Locale.ROOT))) {
      throw new IllegalArgumentException("alias name is reserved: " + t);
    }
    if (looksLikeAddress(t)) {
      throw new IllegalArgumentException(
          "alias name must not look like a TRON address: " + t);
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `./gradlew test --tests "org.tron.walletcli.cli.aliases.AliasValidationTest"`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/org/tron/walletcli/cli/aliases/AliasValidation.java \
        src/test/java/org/tron/walletcli/cli/aliases/AliasValidationTest.java
git commit -m "feat(aliases): add naming validation guards"
```

---

## Task 4: Built-in alias resources

**Files:**
- Create: `src/main/resources/aliases/main.json`
- Create: `src/main/resources/aliases/nile.json`
- Create: `src/main/resources/aliases/shasta.json`

- [ ] **Step 1: Write `main.json`**

```json
{
  "entries": [
    {"name": "USDT", "type": "TOKEN", "address": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", "decimals": 6},
    {"name": "USDC", "type": "TOKEN", "address": "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8", "decimals": 6},
    {"name": "USDD", "type": "TOKEN", "address": "TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn", "decimals": 18},
    {"name": "WTRX", "type": "TOKEN", "address": "TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR", "decimals": 6}
  ]
}
```

- [ ] **Step 2: Write `nile.json`**

```json
{
  "entries": [
    {"name": "USDT", "type": "TOKEN", "address": "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj", "decimals": 6}
  ]
}
```

- [ ] **Step 3: Write `shasta.json`**

```json
{ "entries": [] }
```

- [ ] **Step 4: Commit**

```bash
git add src/main/resources/aliases/
git commit -m "feat(aliases): bundle built-in TRC20 token list per network"
```

---

## Task 5: `AliasStore` typed lookup

**Files:**
- Create: `src/main/java/org/tron/walletcli/cli/aliases/AliasStore.java`
- Test: `src/test/java/org/tron/walletcli/cli/aliases/AliasStoreTest.java`

Behaviour:
- `find(name, type)` returns the entry whose name (case-insensitive) matches AND whose `type` equals the argument (or any type when argument is `null`).
- `containsName(name)` is case-insensitive across types — used by `alias-add` to detect collisions.
- `listAll()` and `listByType(type)` are stable iteration helpers.
- Layering: `layered(builtin, user)` returns a store where built-in entries are authoritative. Any user entry whose name collides with a built-in name (case-insensitive, across types) is ignored at runtime. This is required because users can hand-edit `Wallet/aliases/<network>.json`; `alias-add` rejection alone is not a security boundary.

- [ ] **Step 1: Write the failing test**

```java
package org.tron.walletcli.cli.aliases;

import java.util.Arrays;
import java.util.Collections;
import org.junit.Test;
import static org.junit.Assert.*;

public class AliasStoreTest {

  private byte[] addr(int marker) {
    byte[] a = new byte[21];
    a[0] = 0x41; a[20] = (byte) marker;
    return a;
  }

  @Test public void emptyStoreLooksUpToNull() {
    AliasStore s = AliasStore.of(Collections.<AliasEntry>emptyList());
    assertNull(s.find("USDT", AliasType.TOKEN));
    assertFalse(s.containsName("USDT"));
  }

  @Test public void findIsCaseInsensitiveAndTypeFiltered() {
    AliasStore s = AliasStore.of(Arrays.asList(
        AliasEntry.token("USDT", addr(1), 6, "builtin"),
        AliasEntry.account("alice", addr(2), "user", null)));
    assertNotNull(s.find("usdt", AliasType.TOKEN));
    assertNull(s.find("usdt", AliasType.ACCOUNT));
    assertNotNull(s.find("ALICE", AliasType.ACCOUNT));
    assertNull(s.find("alice", AliasType.TOKEN));
  }

  @Test public void findWithNullTypeMatchesAcrossTypes() {
    AliasStore s = AliasStore.of(Arrays.asList(
        AliasEntry.token("USDT", addr(1), 6, "builtin")));
    assertNotNull(s.find("USDT", null));
  }

  @Test public void containsNameIgnoresType() {
    AliasStore s = AliasStore.of(Arrays.asList(
        AliasEntry.token("USDT", addr(1), 6, "builtin")));
    assertTrue(s.containsName("usdt"));
    assertTrue(s.containsName("USDT"));
  }

  @Test public void layeredBuiltinWinsOnSameTypeAndName() {
    AliasStore builtin = AliasStore.of(Arrays.asList(
        AliasEntry.token("USDT", addr(1), 6, "builtin")));
    AliasStore user = AliasStore.of(Arrays.asList(
        AliasEntry.token("USDT", addr(2), 6, "user")));
    AliasStore layered = AliasStore.layered(builtin, user);
    assertEquals("builtin", layered.find("USDT", AliasType.TOKEN).getSource());
    assertEquals(1, layered.find("USDT", AliasType.TOKEN).getAddress()[20] & 0xFF);
  }

  @Test public void layeredRejectsBuiltinNameAcrossTypes() {
    AliasStore builtin = AliasStore.of(Arrays.asList(
        AliasEntry.token("USDT", addr(1), 6, "builtin")));
    AliasStore user = AliasStore.of(Arrays.asList(
        AliasEntry.account("usdt", addr(2), "user", null)));
    AliasStore layered = AliasStore.layered(builtin, user);
    assertEquals("builtin", layered.find("USDT", AliasType.TOKEN).getSource());
    assertNull(layered.find("USDT", AliasType.ACCOUNT));
  }

  @Test public void listByTypeFilters() {
    AliasStore s = AliasStore.of(Arrays.asList(
        AliasEntry.token("USDT", addr(1), 6, "builtin"),
        AliasEntry.account("alice", addr(2), "user", null)));
    assertEquals(1, s.listByType(AliasType.TOKEN).size());
    assertEquals(1, s.listByType(AliasType.ACCOUNT).size());
    assertEquals(2, s.listAll().size());
  }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `./gradlew test --tests "org.tron.walletcli.cli.aliases.AliasStoreTest"`
Expected: FAIL.

- [ ] **Step 3: Implement**

```java
package org.tron.walletcli.cli.aliases;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class AliasStore {

  private final Map<String, AliasEntry> byKey;     // "TYPE/UPPERNAME" -> entry
  private final Map<String, List<AliasEntry>> byNameAcrossTypes;

  private AliasStore(Map<String, AliasEntry> byKey,
                     Map<String, List<AliasEntry>> byName) {
    this.byKey = byKey;
    this.byNameAcrossTypes = byName;
  }

  private static String key(AliasType type, String name) {
    return type.name() + "/" + name.toUpperCase(Locale.ROOT);
  }

  public static AliasStore of(List<AliasEntry> entries) {
    Map<String, AliasEntry> byKey = new LinkedHashMap<String, AliasEntry>();
    Map<String, List<AliasEntry>> byName = new LinkedHashMap<String, List<AliasEntry>>();
    for (AliasEntry e : entries) {
      byKey.put(key(e.getType(), e.getName()), e);
      String upper = e.getName().toUpperCase(Locale.ROOT);
      List<AliasEntry> list = byName.get(upper);
      if (list == null) {
        list = new ArrayList<AliasEntry>();
        byName.put(upper, list);
      }
      list.add(e);
    }
    return new AliasStore(byKey, byName);
  }

  public static AliasStore layered(AliasStore builtin, AliasStore user) {
    Map<String, AliasEntry> mergedByKey = new LinkedHashMap<String, AliasEntry>(builtin.byKey);
    for (AliasEntry e : user.byKey.values()) {
      if (builtin.containsName(e.getName())) {
        continue;
      }
      mergedByKey.put(key(e.getType(), e.getName()), e);
    }
    return AliasStore.of(new ArrayList<AliasEntry>(mergedByKey.values()));
  }

  public AliasEntry find(String name, AliasType type) {
    if (name == null) return null;
    if (type == null) {
      List<AliasEntry> list = byNameAcrossTypes.get(name.trim().toUpperCase(Locale.ROOT));
      return (list == null || list.isEmpty()) ? null : list.get(0);
    }
    return byKey.get(key(type, name.trim()));
  }

  public boolean containsName(String name) {
    if (name == null) return false;
    return byNameAcrossTypes.containsKey(name.trim().toUpperCase(Locale.ROOT));
  }

  public List<AliasEntry> listAll() {
    return Collections.unmodifiableList(new ArrayList<AliasEntry>(byKey.values()));
  }

  public List<AliasEntry> listByType(AliasType type) {
    List<AliasEntry> out = new ArrayList<AliasEntry>();
    for (AliasEntry e : byKey.values()) {
      if (e.getType() == type) out.add(e);
    }
    return Collections.unmodifiableList(out);
  }
}
```

- [ ] **Step 4: Run tests**

Run: `./gradlew test --tests "org.tron.walletcli.cli.aliases.AliasStoreTest"`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/org/tron/walletcli/cli/aliases/AliasStore.java \
        src/test/java/org/tron/walletcli/cli/aliases/AliasStoreTest.java
git commit -m "feat(aliases): add typed AliasStore with layered lookup"
```

---

## Task 6: Verify Jackson is on the classpath

- [ ] **Step 1: Inspect**

Run: `./gradlew dependencies --configuration runtimeClasspath | grep -i jackson | head -3`
Expected: lines for `jackson-databind`. If absent, add to `build.gradle`:

```groovy
dependencies {
    implementation 'com.fasterxml.jackson.core:jackson-databind:2.15.4'
}
```

Then `./gradlew build -x test` to confirm it resolves.

- [ ] **Step 2: Commit (only if build.gradle changed)**

```bash
git add build.gradle
git commit -m "build: add jackson-databind for alias JSON parsing"
```

---

## Task 7: `AliasStoreLoader`

**Files:**
- Create: `src/main/java/org/tron/walletcli/cli/aliases/AliasStoreLoader.java`
- Test: `src/test/java/org/tron/walletcli/cli/aliases/AliasStoreLoaderTest.java`

Loader API:

```java
public static AliasStore loadBuiltin(String network);
public static AliasStore loadUserFile(File file);                     // missing -> empty
public static void writeUserFile(File file, List<AliasEntry> entries); // .tmp + atomic move when supported
public static AliasStore loadLayered(String network, File userFile);
```

Per-entry behaviour:
- Bad symbol / bad address / unknown type → log warn to stderr, skip entry, continue.
- Duplicate names inside one built-in resource (impossible in our resources) → still loads, last wins within that resource. User entries still cannot override built-ins at runtime because `AliasStore.layered(...)` ignores built-in name collisions.

- [ ] **Step 1: Write the failing test**

```java
package org.tron.walletcli.cli.aliases;

import java.io.File;
import java.io.PrintWriter;
import java.util.Arrays;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import static org.junit.Assert.*;

public class AliasStoreLoaderTest {

  @Rule public TemporaryFolder tmp = new TemporaryFolder();

  @Test public void builtinMainContainsUSDT() {
    AliasStore s = AliasStoreLoader.loadBuiltin("main");
    AliasEntry usdt = s.find("USDT", AliasType.TOKEN);
    assertNotNull(usdt);
    assertEquals("builtin", usdt.getSource());
    assertEquals(6, usdt.getDecimals());
  }

  @Test public void unknownNetworkReturnsEmpty() {
    AliasStore s = AliasStoreLoader.loadBuiltin("does-not-exist");
    assertTrue(s.listAll().isEmpty());
  }

  @Test public void userFileMissingReturnsEmpty() {
    File f = new File(tmp.getRoot(), "missing.json");
    AliasStore s = AliasStoreLoader.loadUserFile(f);
    assertTrue(s.listAll().isEmpty());
  }

  @Test public void userFileLoadsTokenAndAccount() throws Exception {
    File f = tmp.newFile("u.json");
    try (PrintWriter w = new PrintWriter(f)) {
      w.println("{ \"entries\": ["
        + " {\"name\":\"FOO\",\"type\":\"TOKEN\",\"address\":\"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t\",\"decimals\":4},"
        + " {\"name\":\"alice\",\"type\":\"ACCOUNT\",\"address\":\"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t\",\"note\":\"hot\"}"
        + " ] }");
    }
    AliasStore s = AliasStoreLoader.loadUserFile(f);
    assertEquals("user", s.find("FOO", AliasType.TOKEN).getSource());
    assertEquals(4, s.find("FOO", AliasType.TOKEN).getDecimals());
    assertEquals("hot", s.find("alice", AliasType.ACCOUNT).getNote());
  }

  @Test public void writeThenReadRoundTripsBothTypes() throws Exception {
    byte[] addr = org.tron.walletserver.WalletApi.decodeFromBase58Check(
        "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
    File f = new File(tmp.getRoot(), "out.json");
    AliasStoreLoader.writeUserFile(f, Arrays.asList(
        AliasEntry.token("BAR", addr, 8, "user"),
        AliasEntry.account("bob", addr, "user", "cold")));
    AliasStore s = AliasStoreLoader.loadUserFile(f);
    assertEquals(8, s.find("BAR", AliasType.TOKEN).getDecimals());
    assertEquals("cold", s.find("bob", AliasType.ACCOUNT).getNote());
  }

  @Test public void malformedEntriesAreSkipped() throws Exception {
    File f = tmp.newFile("bad.json");
    try (PrintWriter w = new PrintWriter(f)) {
      w.println("{ \"entries\": ["
        + " {\"name\":\"OK\",\"type\":\"TOKEN\",\"address\":\"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t\",\"decimals\":6},"
        + " {\"name\":\"1bad\",\"type\":\"TOKEN\",\"address\":\"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t\"},"
        + " {\"name\":\"NoType\",\"address\":\"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t\"},"
        + " {\"name\":\"BadAddr\",\"type\":\"TOKEN\",\"address\":\"not-base58\"}"
        + " ]}");
    }
    AliasStore s = AliasStoreLoader.loadUserFile(f);
    assertNotNull(s.find("OK", AliasType.TOKEN));
    assertNull(s.find("1bad", AliasType.TOKEN));
    assertNull(s.find("NoType", null));
    assertNull(s.find("BadAddr", AliasType.TOKEN));
  }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `./gradlew test --tests "org.tron.walletcli.cli.aliases.AliasStoreLoaderTest"`
Expected: FAIL.

- [ ] **Step 3: Implement**

```java
package org.tron.walletcli.cli.aliases;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import org.tron.walletserver.WalletApi;

public final class AliasStoreLoader {

  private static final ObjectMapper MAPPER = new ObjectMapper()
      .enable(SerializationFeature.INDENT_OUTPUT);

  private AliasStoreLoader() {}

  public static AliasStore loadBuiltin(String network) {
    if (network == null) return AliasStore.of(Collections.<AliasEntry>emptyList());
    String resource = "/aliases/" + network.toLowerCase(Locale.ROOT) + ".json";
    try (InputStream in = AliasStoreLoader.class.getResourceAsStream(resource)) {
      if (in == null) return AliasStore.of(Collections.<AliasEntry>emptyList());
      return AliasStore.of(parseEntries(MAPPER.readTree(in), "builtin"));
    } catch (IOException e) {
      System.err.println("warn: failed to load builtin alias list "
          + resource + ": " + e.getMessage());
      return AliasStore.of(Collections.<AliasEntry>emptyList());
    }
  }

  public static AliasStore loadUserFile(File file) {
    if (file == null || !file.isFile()) {
      return AliasStore.of(Collections.<AliasEntry>emptyList());
    }
    try {
      return AliasStore.of(parseEntries(MAPPER.readTree(file), "user"));
    } catch (IOException e) {
      System.err.println("warn: failed to read user alias file "
          + file + ": " + e.getMessage());
      return AliasStore.of(Collections.<AliasEntry>emptyList());
    }
  }

  public static AliasStore loadLayered(String network, File userFile) {
    return AliasStore.layered(loadBuiltin(network), loadUserFile(userFile));
  }

  public static void writeUserFile(File file, List<AliasEntry> entries) {
    ObjectNode root = MAPPER.createObjectNode();
    ArrayNode arr = root.putArray("entries");
    for (AliasEntry e : entries) {
      ObjectNode n = arr.addObject();
      n.put("name", e.getName());
      n.put("type", e.getType().name());
      n.put("address", WalletApi.encode58Check(e.getAddress()));
      if (e.getType() == AliasType.TOKEN) {
        n.put("decimals", e.getDecimals());
      }
      if (e.getNote() != null) {
        n.put("note", e.getNote());
      }
    }
    File parent = file.getParentFile();
    if (parent != null && !parent.exists() && !parent.mkdirs()) {
      throw new IllegalStateException("cannot create directory: " + parent);
    }
    File tmp = new File(file.getAbsolutePath() + ".tmp");
    try {
      MAPPER.writerWithDefaultPrettyPrinter().writeValue(tmp, root);
      try {
        Files.move(tmp.toPath(), file.toPath(),
            StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
      } catch (AtomicMoveNotSupportedException e) {
        Files.move(tmp.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING);
      }
    } catch (IOException e) {
      throw new IllegalStateException("failed to write " + file + ": " + e.getMessage(), e);
    }
  }

  private static List<AliasEntry> parseEntries(JsonNode root, String source) {
    List<AliasEntry> out = new ArrayList<AliasEntry>();
    if (root == null || !root.has("entries") || !root.get("entries").isArray()) {
      return out;
    }
    for (JsonNode node : root.get("entries")) {
      String name = node.path("name").asText(null);
      String typeStr = node.path("type").asText(null);
      String address = node.path("address").asText(null);
      if (name == null || typeStr == null || address == null) {
        System.err.println("warn: skipping alias entry missing name/type/address");
        continue;
      }
      AliasType type;
      try { type = AliasType.parse(typeStr); }
      catch (IllegalArgumentException e) {
        System.err.println("warn: skipping alias " + name + " - " + e.getMessage());
        continue;
      }
      try { AliasValidation.requireValidName(name); }
      catch (IllegalArgumentException e) {
        System.err.println("warn: skipping alias entry: " + e.getMessage());
        continue;
      }
      byte[] addr = WalletApi.decodeFromBase58Check(address);
      if (addr == null) {
        System.err.println("warn: skipping alias " + name + " - invalid address: " + address);
        continue;
      }
      if (type == AliasType.TOKEN) {
        int decimals = node.path("decimals").asInt(0);
        out.add(AliasEntry.token(name, addr, decimals, source));
      } else {
        String note = node.has("note") ? node.path("note").asText(null) : null;
        out.add(AliasEntry.account(name, addr, source, note));
      }
    }
    return out;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `./gradlew test --tests "org.tron.walletcli.cli.aliases.AliasStoreLoaderTest"`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/org/tron/walletcli/cli/aliases/AliasStoreLoader.java \
        src/test/java/org/tron/walletcli/cli/aliases/AliasStoreLoaderTest.java
git commit -m "feat(aliases): add AliasStoreLoader (builtin resources + user JSON)"
```

---

## Task 8: `ResolutionResult` + `AliasResolutionException`

**Files:**
- Create: `src/main/java/org/tron/walletcli/cli/aliases/ResolutionResult.java`
- Create: `src/main/java/org/tron/walletcli/cli/aliases/AliasResolutionException.java`

- [ ] **Step 1: Implement `ResolutionResult`**

```java
package org.tron.walletcli.cli.aliases;

public final class ResolutionResult {
  private final String option;
  private final String input;
  private final byte[] address;
  private final String name;     // null when input was raw address/hex
  private final AliasType type;  // null when input was raw address/hex
  private final String source;   // "address" | "hex" | "user" | "builtin"

  public ResolutionResult(String option, String input, byte[] address,
                          String name, AliasType type, String source) {
    this.option = option;
    this.input = input;
    this.address = address.clone();
    this.name = name;
    this.type = type;
    this.source = source;
  }

  public String getOption() { return option; }
  public String getInput() { return input; }
  public byte[] getAddress() { return address.clone(); }
  public String getName() { return name; }
  public AliasType getType() { return type; }
  public String getSource() { return source; }

  public boolean isAlias() {
    return "user".equals(source) || "builtin".equals(source);
  }
}
```

- [ ] **Step 2: Implement exception**

```java
package org.tron.walletcli.cli.aliases;

public class AliasResolutionException extends IllegalArgumentException {
  public AliasResolutionException(String message) { super(message); }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/main/java/org/tron/walletcli/cli/aliases/ResolutionResult.java \
        src/main/java/org/tron/walletcli/cli/aliases/AliasResolutionException.java
git commit -m "feat(aliases): add ResolutionResult and exception type"
```

---

## Task 9: `AliasResolver`

**Files:**
- Create: `src/main/java/org/tron/walletcli/cli/aliases/AliasResolver.java`
- Test: `src/test/java/org/tron/walletcli/cli/aliases/AliasResolverTest.java`

Resolution sequence per call `resolve(option, input, expectedType)`:
1. Base58Check decode succeeds → return with `source="address"`, `name=null`, `type=null`.
2. Hex matches `^(0x|41)[0-9a-fA-F]{40}$` → return with `source="hex"`.
3. `store.find(input, expectedType)` → return alias hit.
4. If `store.containsName(input)` succeeds for a *different* type → throw with a useful message:
   `--contract value "alice" is registered as ACCOUNT, not TOKEN`.
5. Else → throw `AliasResolutionException`: `--<option> value "<v>" is neither a valid TRON address nor a known <expectedType.toLowerCase()> alias`.

- [ ] **Step 1: Write the failing test**

```java
package org.tron.walletcli.cli.aliases;

import java.util.Arrays;
import org.junit.Test;
import static org.junit.Assert.*;

public class AliasResolverTest {

  private final byte[] addr = org.tron.walletserver.WalletApi.decodeFromBase58Check(
      "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");

  private AliasResolver build() {
    return new AliasResolver(AliasStore.of(Arrays.asList(
        AliasEntry.token("USDT", addr, 6, "builtin"),
        AliasEntry.account("alice", addr, "user", null))));
  }

  @Test public void base58Passthrough() {
    ResolutionResult r = build().resolve("contract",
        "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", AliasType.TOKEN);
    assertEquals("address", r.getSource());
    assertNull(r.getName());
  }

  @Test public void hexPassthrough() {
    StringBuilder hex = new StringBuilder("41");
    for (int i = 1; i < 21; i++) hex.append(String.format("%02x", addr[i]));
    ResolutionResult r = build().resolve("contract", hex.toString(), AliasType.TOKEN);
    assertEquals("hex", r.getSource());
  }

  @Test public void tokenAliasResolves() {
    ResolutionResult r = build().resolve("contract", "usdt", AliasType.TOKEN);
    assertEquals("USDT", r.getName());
    assertEquals(AliasType.TOKEN, r.getType());
    assertEquals("builtin", r.getSource());
  }

  @Test public void accountAliasResolves() {
    ResolutionResult r = build().resolve("to", "alice", AliasType.ACCOUNT);
    assertEquals("ALICE", r.getName());
    assertEquals(AliasType.ACCOUNT, r.getType());
    assertEquals("user", r.getSource());
  }

  @Test public void wrongTypeGivesTypedError() {
    try {
      build().resolve("contract", "alice", AliasType.TOKEN);
      fail("expected exception");
    } catch (AliasResolutionException e) {
      String m = e.getMessage();
      assertTrue(m, m.contains("registered as ACCOUNT"));
      assertTrue(m, m.contains("not TOKEN"));
    }
  }

  @Test(expected = AliasResolutionException.class)
  public void unknownInputThrows() {
    build().resolve("to", "DOES_NOT_EXIST", AliasType.ACCOUNT);
  }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `./gradlew test --tests "org.tron.walletcli.cli.aliases.AliasResolverTest"`
Expected: FAIL.

- [ ] **Step 3: Implement**

```java
package org.tron.walletcli.cli.aliases;

import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.tron.walletserver.WalletApi;

public class AliasResolver {

  private static final Pattern HEX = Pattern.compile("^(0x|41)([0-9a-fA-F]{40})$");

  private final AliasStore store;

  public AliasResolver(AliasStore store) { this.store = store; }

  public AliasStore getStore() { return store; }

  public ResolutionResult resolve(String option, String input, AliasType expectedType) {
    if (input == null || input.trim().isEmpty()) {
      throw new AliasResolutionException("--" + option + " is empty");
    }
    String raw = input.trim();

    byte[] base58 = WalletApi.decodeFromBase58Check(raw);
    if (base58 != null) {
      return new ResolutionResult(option, raw, base58, null, null, "address");
    }

    Matcher m = HEX.matcher(raw);
    if (m.matches()) {
      byte[] full = new byte[21];
      full[0] = 0x41;
      String hex = m.group(2);
      for (int i = 0; i < 20; i++) {
        full[i + 1] = (byte) Integer.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
      }
      return new ResolutionResult(option, raw, full, null, null, "hex");
    }

    AliasEntry hit = store.find(raw, expectedType);
    if (hit != null) {
      return new ResolutionResult(option, raw, hit.getAddress(),
          hit.getName(), hit.getType(), hit.getSource());
    }

    AliasEntry wrongType = store.find(raw, null);
    if (wrongType != null) {
      throw new AliasResolutionException(
          "--" + option + " value \"" + raw + "\" is registered as "
              + wrongType.getType().name() + ", not " + expectedType.name());
    }

    throw new AliasResolutionException(
        "--" + option + " value \"" + raw
            + "\" is neither a valid TRON address nor a known "
            + expectedType.name().toLowerCase() + " alias");
  }
}
```

- [ ] **Step 4: Run tests**

Run: `./gradlew test --tests "org.tron.walletcli.cli.aliases.AliasResolverTest"`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/org/tron/walletcli/cli/aliases/AliasResolver.java \
        src/test/java/org/tron/walletcli/cli/aliases/AliasResolverTest.java
git commit -m "feat(aliases): add type-aware AliasResolver"
```

---

## Task 10: Extend `ParsedOptions` with typed accessors

**Files:**
- Modify: `src/main/java/org/tron/walletcli/cli/ParsedOptions.java`
- Test: `src/test/java/org/tron/walletcli/cli/ParsedOptionsAliasTest.java`

API additions:
- New constructor `ParsedOptions(Map<String,String> values, AliasResolver resolver)`. Existing single-arg constructor delegates with `null` resolver.
- New method `getAccountAddress(String key)` — `expectedType=ACCOUNT`.
- New method `getContractAddress(String key)` — `expectedType=TOKEN`.
- New method `getResolutionLog()` — unmodifiable list of alias hits (raw addresses are not logged).
- Existing `getAddress(String key)` is unchanged (still does Base58-only) and is callable from any code that doesn't want alias semantics.

- [ ] **Step 1: Inspect call sites of `new ParsedOptions(...)`**

Run: `grep -rn "new ParsedOptions(" src/main/java src/test/java`
Note all sites — they must keep compiling because the no-resolver constructor stays.

- [ ] **Step 2: Write the failing test**

```java
package org.tron.walletcli.cli;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.Test;
import org.tron.walletcli.cli.aliases.*;
import static org.junit.Assert.*;

public class ParsedOptionsAliasTest {

  private final byte[] addr = org.tron.walletserver.WalletApi.decodeFromBase58Check(
      "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");

  private AliasResolver resolver() {
    return new AliasResolver(AliasStore.of(Arrays.asList(
        AliasEntry.token("USDT", addr, 6, "builtin"),
        AliasEntry.account("alice", addr, "user", null))));
  }

  private ParsedOptions opts(Map<String,String> values) {
    return new ParsedOptions(values, resolver());
  }

  @Test public void contractTokenAliasResolves() {
    Map<String,String> v = new LinkedHashMap<String,String>();
    v.put("contract", "USDT");
    ParsedOptions o = opts(v);
    assertArrayEquals(addr, o.getContractAddress("contract"));
    assertEquals(1, o.getResolutionLog().size());
  }

  @Test public void contractAcceptsBase58() {
    Map<String,String> v = new LinkedHashMap<String,String>();
    v.put("contract", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
    ParsedOptions o = opts(v);
    assertArrayEquals(addr, o.getContractAddress("contract"));
    assertTrue(o.getResolutionLog().isEmpty());
  }

  @Test public void accountAccountAliasResolves() {
    Map<String,String> v = new LinkedHashMap<String,String>();
    v.put("to", "alice");
    ParsedOptions o = opts(v);
    assertArrayEquals(addr, o.getAccountAddress("to"));
    assertEquals(1, o.getResolutionLog().size());
  }

  @Test(expected = IllegalArgumentException.class)
  public void contractRejectsAccountAlias() {
    Map<String,String> v = new LinkedHashMap<String,String>();
    v.put("contract", "alice");
    opts(v).getContractAddress("contract");
  }

  @Test(expected = IllegalArgumentException.class)
  public void accountRejectsTokenAlias() {
    Map<String,String> v = new LinkedHashMap<String,String>();
    v.put("to", "USDT");
    opts(v).getAccountAddress("to");
  }

  @Test(expected = IllegalArgumentException.class)
  public void missingKeyThrows() {
    opts(new LinkedHashMap<String,String>()).getContractAddress("contract");
  }

  @Test public void legacyConstructorStillWorks() {
    Map<String,String> v = new LinkedHashMap<String,String>();
    v.put("address", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
    ParsedOptions o = new ParsedOptions(v);
    assertArrayEquals(addr, o.getAddress("address"));
  }

  @Test public void noResolverFallsBackToLegacyForAccountAndContract() {
    Map<String,String> v = new LinkedHashMap<String,String>();
    v.put("to", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
    ParsedOptions o = new ParsedOptions(v);
    assertArrayEquals(addr, o.getAccountAddress("to"));
    assertArrayEquals(addr, o.getContractAddress("to"));
  }
}
```

- [ ] **Step 3: Run to verify failure**

Run: `./gradlew test --tests "org.tron.walletcli.cli.ParsedOptionsAliasTest"`
Expected: FAIL.

- [ ] **Step 4: Modify `ParsedOptions.java`**

Add field, second constructor, accessors, log:

```java
// add imports
import java.util.ArrayList;
import java.util.List;
import org.tron.walletcli.cli.aliases.AliasResolver;
import org.tron.walletcli.cli.aliases.AliasType;
import org.tron.walletcli.cli.aliases.ResolutionResult;
```

```java
// add fields after existing values map
private final AliasResolver resolver;
private final List<ResolutionResult> resolutionLog;
```

Replace existing constructor block with:

```java
public ParsedOptions(Map<String, String> values) {
    this(values, null);
}

public ParsedOptions(Map<String, String> values, AliasResolver resolver) {
    this.values = values == null
            ? Collections.<String, String>emptyMap()
            : new LinkedHashMap<String, String>(values);
    this.resolver = resolver;
    this.resolutionLog = new ArrayList<ResolutionResult>();
}
```

Add new methods (place after the existing `getAddress`):

```java
public byte[] getAccountAddress(String key) {
    return resolveTyped(key, AliasType.ACCOUNT);
}

public byte[] getContractAddress(String key) {
    return resolveTyped(key, AliasType.TOKEN);
}

public java.util.List<ResolutionResult> getResolutionLog() {
    return java.util.Collections.unmodifiableList(resolutionLog);
}

private byte[] resolveTyped(String key, AliasType expected) {
    String raw = values.get(key);
    if (raw == null) {
        throw new IllegalArgumentException("Missing required option: --" + key);
    }
    if (resolver == null) {
        // backwards-compatible: behave like getAddress
        byte[] decoded = org.tron.walletserver.WalletApi.decodeFromBase58Check(raw);
        if (decoded == null) {
            throw new IllegalArgumentException(
                "Invalid TRON address for --" + key + ": " + raw);
        }
        return decoded;
    }
    ResolutionResult r = resolver.resolve(key, raw, expected);
    if (r.isAlias()) resolutionLog.add(r);
    return r.getAddress();
}
```

- [ ] **Step 5: Run tests**

Run: `./gradlew test --tests "org.tron.walletcli.cli.ParsedOptionsAliasTest"`
Expected: PASS, 8 tests.

Run: `./gradlew test`
Expected: full suite still green.

- [ ] **Step 6: Commit**

```bash
git add src/main/java/org/tron/walletcli/cli/ParsedOptions.java \
        src/test/java/org/tron/walletcli/cli/ParsedOptionsAliasTest.java
git commit -m "feat(cli): ParsedOptions.getAccountAddress / getContractAddress with resolver"
```

---

## Task 11: Thread `AliasResolver` through `CommandContext` and `CommandDefinition`

**Files:**
- Modify: `src/main/java/org/tron/walletcli/cli/CommandContext.java`
- Modify: `src/main/java/org/tron/walletcli/cli/CommandDefinition.java`

- [ ] **Step 1: Read `CommandDefinition.java` in full and capture the parser surface**

Run:
```bash
wc -l src/main/java/org/tron/walletcli/cli/CommandDefinition.java
grep -n "parseArgs\|new ParsedOptions" src/main/java/org/tron/walletcli/cli/CommandDefinition.java
```

Then `Read` the entire file. Before writing any change, write down here in the task notes:
1. The exact current signature of `parseArgs` (return type, parameters, throws).
2. Whether the parser body is inline in `parseArgs` or already extracted into a private helper.
3. Every site in the rest of the codebase that calls `parseArgs` (`grep -rn "\.parseArgs(" src/main src/test`) so the new overload doesn't break callers.

Only after capturing those facts proceed to Step 2 — the diff in Step 3 assumes the parser is callable as `doParse(args)` and you may need to extract it first.

- [ ] **Step 2: Modify `CommandContext`**

Add field + constructor + accessor + with-method, mirroring the existing pattern for `masterPasswordProvider`:

```java
import org.tron.walletcli.cli.aliases.AliasResolver;
```

```java
private final AliasResolver aliasResolver;

public CommandContext(String walletOverride, File resolvedAuthWalletFile,
                      StandardCliRunner.MasterPasswordProvider masterPasswordProvider,
                      AliasResolver aliasResolver) {
    this.walletOverride = walletOverride;
    this.resolvedAuthWalletFile = resolvedAuthWalletFile;
    this.masterPasswordProvider = masterPasswordProvider;
    this.aliasResolver = aliasResolver;
}

public AliasResolver getAliasResolver() { return aliasResolver; }

public CommandContext withAliasResolver(AliasResolver r) {
    return new CommandContext(walletOverride, resolvedAuthWalletFile,
        masterPasswordProvider, r);
}
```

Update existing constructors to delegate with `null` aliasResolver. Update
`withResolvedAuthWalletFile` to preserve the current `aliasResolver`. Keep
`fromGlobalOptions` constructing the normal context; Task 12 attaches the
resolver later with `ctx = ctx.withAliasResolver(aliasResolver)` after the
network namespace is known.

- [ ] **Step 3: Modify `CommandDefinition.parseArgs`**

Add an overload (do not break existing signature):

```java
import org.tron.walletcli.cli.aliases.AliasResolver;
```

```java
public ParsedOptions parseArgs(String[] args) {
    return parseArgs(args, null);
}

public ParsedOptions parseArgs(String[] args, AliasResolver resolver) {
    Map<String, String> values = doParse(args); // existing parser body, refactor if needed
    return new ParsedOptions(values, resolver);
}
```

If the existing method *is* the parser body, rename it to `doParse` and have the no-arg overload delegate. The exact refactor depends on the current implementation — keep the parser logic byte-identical, only restructure the entry point.

- [ ] **Step 4: Build to confirm no regressions**

Run: `./gradlew build -x test`
Expected: BUILD SUCCESSFUL.

Run: `./gradlew test`
Expected: full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/org/tron/walletcli/cli/CommandContext.java \
        src/main/java/org/tron/walletcli/cli/CommandDefinition.java
git commit -m "feat(cli): thread AliasResolver through CommandContext + parseArgs"
```

---

## Task 12: Build resolver in `StandardCliRunner`

**Files:**
- Modify: `src/main/java/org/tron/walletcli/cli/StandardCliRunner.java`

- [ ] **Step 1: Add imports**

```java
import org.tron.walletcli.cli.aliases.AliasResolver;
import org.tron.walletcli.cli.aliases.AliasStoreLoader;
import java.io.File;
import java.util.Locale;
import org.tron.common.enums.NetType;
```

- [ ] **Step 2: Build the resolver near where the command is dispatched**

Around the existing `cmd.parseArgs(commandArgs)` call (search for it; line numbers may differ):

```java
String network = globalOpts.getNetwork();
boolean hasCustomEndpoint = globalOpts.getGrpcEndpoint() != null
    && !globalOpts.getGrpcEndpoint().trim().isEmpty();

String normalizedNetwork;
if (network != null && !network.trim().isEmpty()) {
    normalizedNetwork = network.toLowerCase(Locale.ROOT);
} else if (hasCustomEndpoint) {
    NetType detected = detectNetworkFromEndpoint(globalOpts.getGrpcEndpoint());
    if (detected == NetType.MAIN) {
        normalizedNetwork = "main";
    } else if (detected == NetType.NILE) {
        normalizedNetwork = "nile";
    } else if (detected == NetType.SHASTA) {
        normalizedNetwork = "shasta";
    } else {
        // Custom gRPC endpoint without explicit --network: do NOT silently fall back
        // to main built-in (USDT etc) because the chain identity is unknown.
        normalizedNetwork = "custom";
    }
} else {
    normalizedNetwork = "main";
}

File userAliasFile = new File("Wallet/aliases/" + normalizedNetwork + ".json");
AliasResolver aliasResolver = new AliasResolver(
    AliasStoreLoader.loadLayered(normalizedNetwork, userAliasFile));

// publish the network so AliasCommands (Task 21) can locate the user file
System.setProperty("tron.cli.network", normalizedNetwork);

ParsedOptions opts = cmd.parseArgs(commandArgs, aliasResolver);
```

If the runner constructs a `CommandContext`, attach the resolver: `ctx = ctx.withAliasResolver(aliasResolver);`.

**Why endpoint detection before `custom`:** if a user runs an official main/nile/shasta endpoint via `--grpc-endpoint` without `--network`, aliases should use that detected network's built-ins. If the endpoint is unknown (for example a private chain), use the `custom` namespace so main's `USDT` built-in alias does not silently resolve on the wrong chain. `loadBuiltin("custom")` returns an empty store because no `/aliases/custom.json` resource exists.

- [ ] **Step 3: Build + smoke test**

Run: `./gradlew build`
Expected: BUILD SUCCESSFUL.

Run: `./gradlew shadowJar && java -jar build/libs/wallet-cli.jar --network nile help`
Expected: help renders, no stack trace.

- [ ] **Step 4: Commit**

```bash
git add src/main/java/org/tron/walletcli/cli/StandardCliRunner.java
git commit -m "feat(cli): wire AliasResolver into StandardCliRunner per invocation"
```

---

## Task 13: `OutputFormatter` audit trail

**Files:**
- Modify: `src/main/java/org/tron/walletcli/cli/OutputFormatter.java`
- Modify: `src/main/java/org/tron/walletcli/cli/StandardCliRunner.java` (push log post-parse)
- Test: `src/test/java/org/tron/walletcli/cli/OutputFormatterResolvedTest.java`

- [ ] **Step 1: Read `OutputFormatter.java` in full and capture variable names**

Run:
```bash
wc -l src/main/java/org/tron/walletcli/cli/OutputFormatter.java
grep -n "envelope\|emitJson\|err\.println\|recordSuccess\|out\.println\|private\s\+\(final\s\+\)\?\(boolean\|OutputMode\|PrintStream\)" src/main/java/org/tron/walletcli/cli/OutputFormatter.java
```

Then `Read` the file in full. Before writing any change, capture in the task notes:
1. The exact field names for output-mode flag, quiet flag, stdout stream, stderr stream (the code blocks in steps 3–5 use `mode`, `quiet`, `out`, `err` — substitute the real names if they differ).
2. Whether there is already a `flush()` or equivalent finaliser. The test in Step 6 calls `f.flush()`; if no such method exists, identify what triggers final emission (some formatters emit eagerly per `success(...)` call, others buffer until a sentinel).
3. Where the JSON success envelope is built (the `Map` you'll add `meta` to) AND where the JSON error envelope is built. Both need the meta injection in Step 4.

Substitute the real names back into the code blocks below before pasting.

- [ ] **Step 2: Add field and recorder**

Near the other private fields:

```java
private final java.util.List<org.tron.walletcli.cli.aliases.ResolutionResult> resolved =
    new java.util.ArrayList<org.tron.walletcli.cli.aliases.ResolutionResult>();

public void recordResolved(java.util.List<org.tron.walletcli.cli.aliases.ResolutionResult> entries) {
    if (entries == null) return;
    for (org.tron.walletcli.cli.aliases.ResolutionResult r : entries) {
        if (r.isAlias()) resolved.add(r);
    }
}
```

- [ ] **Step 3: Emit stderr lines in text mode (not quiet)**

Add a helper near the JSON metadata helper. Call it from both text success and
text error emission paths so downstream failures still show what alias resolved
before the failure:

```java
private void emitResolvedTextAudit() {
    if (mode != OutputMode.TEXT || quiet || resolved.isEmpty()) {
        return;
    }
    for (org.tron.walletcli.cli.aliases.ResolutionResult r : resolved) {
        StringBuilder line = new StringBuilder();
        line.append("Resolved --").append(r.getOption())
            .append(" \"").append(r.getInput()).append("\" -> ")
            .append(org.tron.walletserver.WalletApi.encode58Check(r.getAddress()))
            .append(" (source=").append(r.getSource());
        if (r.getName() != null) {
            line.append(", name=").append(r.getName());
        }
        if (r.getType() != null) {
            line.append(", type=").append(r.getType().name());
        }
        line.append(")");
        err.println(line.toString());
    }
}
```

Then call `emitResolvedTextAudit()` before the command's normal text output in
both branches of `flush()`:

```java
if (current.success) {
    if (mode == OutputMode.JSON) {
        emitJsonSuccess(current.jsonData);
    } else {
        emitResolvedTextAudit();
        out.println(current.textMessage);
        ...
    }
    return;
}

if (mode == OutputMode.JSON) {
    emitJsonError(current.errorCode, current.errorMessage);
} else {
    emitResolvedTextAudit();
    err.println("Error: " + current.errorMessage);
    ...
}
```

At the end of `flush()`, after emitting one envelope (success or error), clear
the audit buffer so tests or future code that reuses a formatter instance cannot
leak prior resolution records:

```java
resolved.clear();
```

In the current runner there is normally one flush per invocation, but clearing
the buffer keeps the formatter self-contained and easier to test. If the current
`flush()` has several early returns, use a small `try/finally` or clear the
buffer immediately before each return so both success and error paths are covered.

(Adapt field names — `mode` / `quiet` / `err` — to whatever the file uses.)

- [ ] **Step 4: Add `meta.resolved` to BOTH success AND error JSON envelopes**

Extract a small helper at the top of the JSON emission code (or inline at both sites — your choice, but DRY is preferred):

```java
private void injectResolvedMeta(java.util.Map<String, Object> envelope) {
    if (resolved.isEmpty()) return;
    java.util.List<java.util.Map<String, Object>> arr =
        new java.util.ArrayList<java.util.Map<String, Object>>();
    for (org.tron.walletcli.cli.aliases.ResolutionResult r : resolved) {
        java.util.Map<String, Object> m = new java.util.LinkedHashMap<String, Object>();
        m.put("option", r.getOption());
        m.put("input", r.getInput());
        m.put("address", org.tron.walletserver.WalletApi.encode58Check(r.getAddress()));
        if (r.getName() != null) m.put("name", r.getName());
        if (r.getType() != null) m.put("type", r.getType().name());
        m.put("source", r.getSource());
        arr.add(m);
    }
    java.util.Map<String, Object> meta = new java.util.LinkedHashMap<String, Object>();
    meta.put("resolved", arr);
    envelope.put("meta", meta);
}
```

Call `injectResolvedMeta(envelope)` at:
1. **Success path** — after the `data` field is set on the envelope (typically `emitJsonSuccess` or equivalent).
2. **Error path** - after the `error` / `message` fields are set on the error envelope. The audit trail is **most useful on failure** - the user needs to see "I attempted to send to alice -> TXyz..." even when the transaction failed downstream.

If your error-emission code currently doesn't return a `Map` envelope (some formatters write directly to PrintStream), refactor to build a Map then serialise — this is required for the meta field to render.

- [ ] **Step 5: Push the log from `StandardCliRunner` AFTER the handler returns or throws**

> **Critical timing.** Aliases are resolved inside the handler when `opts.getAccountAddress(...)` / `opts.getContractAddress(...)` are called — NOT during `parseArgs`. If you call `recordResolved` immediately after `parseArgs` the log is empty. The log must be pulled in a `finally` so it captures whatever was resolved before the handler returned (success) or threw (failure path → error envelope).

Locate the existing handler-dispatch site in `StandardCliRunner` (search for `cmd.handler` / `.handler.execute(` / equivalent):

```java
ParsedOptions opts = cmd.parseArgs(commandArgs, aliasResolver);
try {
    // existing handler invocation, e.g.:
    cmd.getHandler().execute(ctx, opts, wrapper, formatter);
} finally {
    // Always record what was resolved so far — partial progress before a
    // handler exception still produces a useful audit trail in error envelopes.
    formatter.recordResolved(opts.getResolutionLog());
}
```

If the runner already wraps the handler call in a try/catch that converts exceptions to `formatter.error(...)`, put the `recordResolved` call **inside** the same `finally` so it runs before the formatter emits the envelope. Order of operations within the runner must be:

1. parseArgs (no aliases resolved yet — values map populated)
2. handler runs (calls typed getters → log populated)
3. **finally:** `formatter.recordResolved(opts.getResolutionLog())`
4. formatter emits envelope (success or error) — meta is now populated

- [ ] **Step 6: Add focused test**

```java
package org.tron.walletcli.cli;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.util.Collections;
import org.junit.Test;
import org.tron.walletcli.cli.aliases.AliasType;
import org.tron.walletcli.cli.aliases.ResolutionResult;
import static org.junit.Assert.*;

public class OutputFormatterResolvedTest {

  private final byte[] addr = org.tron.walletserver.WalletApi.decodeFromBase58Check(
      "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");

  @Test public void textModeEmitsResolvedLine() {
    ByteArrayOutputStream errBytes = new ByteArrayOutputStream();
    OutputFormatter f = new OutputFormatter(
        OutputFormatter.OutputMode.TEXT,
        false,
        new PrintStream(new ByteArrayOutputStream()),
        new PrintStream(errBytes));
    f.recordResolved(Collections.singletonList(
        new ResolutionResult("contract", "USDT", addr, "USDT", AliasType.TOKEN, "builtin")));
    f.success("ok", null);
    f.flush();
    String stderr = errBytes.toString();
    assertTrue(stderr, stderr.contains("Resolved --contract \"USDT\""));
    assertTrue(stderr, stderr.contains("type=TOKEN"));
    assertTrue(stderr, stderr.contains("source=builtin"));
  }

  @Test public void quietSuppressesStderr() {
    ByteArrayOutputStream errBytes = new ByteArrayOutputStream();
    OutputFormatter f = new OutputFormatter(
        OutputFormatter.OutputMode.TEXT,
        true,
        new PrintStream(new ByteArrayOutputStream()),
        new PrintStream(errBytes));
    f.recordResolved(Collections.singletonList(
        new ResolutionResult("contract", "USDT", addr, "USDT", AliasType.TOKEN, "builtin")));
    f.success("ok", null);
    f.flush();
    assertFalse(errBytes.toString().contains("Resolved"));
  }

  @Test public void textErrorEmitsResolvedLineBeforeError() {
    ByteArrayOutputStream errBytes = new ByteArrayOutputStream();
    OutputFormatter f = new OutputFormatter(
        OutputFormatter.OutputMode.TEXT,
        false,
        new PrintStream(new ByteArrayOutputStream()),
        new PrintStream(errBytes));
    f.recordResolved(Collections.singletonList(
        new ResolutionResult("to", "alice", addr, "ALICE", AliasType.ACCOUNT, "user")));
    try {
      f.error("execution_error", "transaction failed");
      fail("expected abort");
    } catch (CliAbortException expected) {
      // formatter.error records the outcome and signals the caller to abort.
    }
    f.flush();
    String stderr = errBytes.toString();
    assertTrue(stderr, stderr.contains("Resolved --to \"alice\""));
    assertTrue(stderr, stderr.indexOf("Resolved --to \"alice\"") < stderr.indexOf("Error:"));
  }

  @Test public void jsonErrorIncludesMetaResolved() {
    ByteArrayOutputStream outBytes = new ByteArrayOutputStream();
    OutputFormatter f = new OutputFormatter(
        OutputFormatter.OutputMode.JSON,
        false,
        new PrintStream(outBytes),
        new PrintStream(new ByteArrayOutputStream()));
    f.recordResolved(Collections.singletonList(
        new ResolutionResult("to", "alice", addr, "ALICE", AliasType.ACCOUNT, "user")));
    try {
      f.error("execution_error", "transaction failed: insufficient funds");
      fail("expected abort");
    } catch (CliAbortException expected) {
      // formatter.error records the outcome and signals the caller to abort.
    }
    f.flush();
    String json = outBytes.toString();
    assertTrue(json, json.contains("\"success\": false"));
    assertTrue(json, json.contains("\"meta\""));
    assertTrue(json, json.contains("\"name\": \"ALICE\""));
    assertTrue(json, json.contains("\"option\": \"to\""));
  }

  @Test public void jsonSuccessIncludesMetaResolved() {
    ByteArrayOutputStream outBytes = new ByteArrayOutputStream();
    OutputFormatter f = new OutputFormatter(
        OutputFormatter.OutputMode.JSON,
        false,
        new PrintStream(outBytes),
        new PrintStream(new ByteArrayOutputStream()));
    f.recordResolved(Collections.singletonList(
        new ResolutionResult("contract", "USDT", addr, "USDT", AliasType.TOKEN, "builtin")));
    f.success("ok", null);
    f.flush();
    String json = outBytes.toString();
    assertTrue(json, json.contains("\"meta\""));
    assertTrue(json, json.contains("\"type\": \"TOKEN\""));
  }
}
```

> Adapt `OutputFormatter` constructor arguments to match the actual signature read in Step 1.

- [ ] **Step 7: Run tests**

Run: `./gradlew test --tests "org.tron.walletcli.cli.OutputFormatterResolvedTest"`
Expected: PASS, 5 tests.

- [ ] **Step 8: Commit**

```bash
git add src/main/java/org/tron/walletcli/cli/OutputFormatter.java \
        src/main/java/org/tron/walletcli/cli/StandardCliRunner.java \
        src/test/java/org/tron/walletcli/cli/OutputFormatterResolvedTest.java
git commit -m "feat(cli): surface alias resolution in stderr + JSON meta.resolved"
```

---

## Task 14: Migrate `ContractCommands.java` + contract-typed `--address` in `QueryCommands`

**Files:**
- Modify: `src/main/java/org/tron/walletcli/cli/commands/ContractCommands.java`
- Modify: `src/main/java/org/tron/walletcli/cli/commands/QueryCommands.java` (lines 542 and 559 only)

ContractCommands has 13 `getAddress(...)` sites:
- 6 are `getAddress("contract")` → become `getContractAddress("contract")`.
- The rest are `getAddress("owner")` → become `getAccountAddress("owner")`.

QueryCommands lines 542 and 559 use `getAddress("address")` to call `WalletApi.getContract` / `getContractInfo` — these are *contract* addresses despite the option name; convert to `getContractAddress("address")`. (The other 19 `--address` sites in this file stay until Task 19.)

- [ ] **Step 1: ContractCommands — replace contract sites**

```bash
sed -i.bak 's/getAddress("contract")/getContractAddress("contract")/g' \
  src/main/java/org/tron/walletcli/cli/commands/ContractCommands.java
sed -i.bak 's/getAddress("owner")/getAccountAddress("owner")/g' \
  src/main/java/org/tron/walletcli/cli/commands/ContractCommands.java
rm src/main/java/org/tron/walletcli/cli/commands/ContractCommands.java.bak
```

- [ ] **Step 2: QueryCommands — only the two contract-meta call sites**

Open `QueryCommands.java`. At lines 542 and 559 (verify with `grep -n 'getAddress("address")' src/main/java/org/tron/walletcli/cli/commands/QueryCommands.java`), replace `getAddress("address")` with `getContractAddress("address")` only inside the `get-contract` and `get-contract-info` handler bodies.

Use a precise edit (a single multi-line `Edit` call per occurrence) so unrelated `--address` sites in this file stay untouched.

- [ ] **Step 3: Verify counts**

Run: `grep -c 'getContractAddress' src/main/java/org/tron/walletcli/cli/commands/ContractCommands.java`
Expected: 6.

Run: `grep -c 'getAccountAddress' src/main/java/org/tron/walletcli/cli/commands/ContractCommands.java`
Expected: 7.

Run: `grep -c 'getAddress(' src/main/java/org/tron/walletcli/cli/commands/ContractCommands.java`
Expected: 0.

Run: `grep -c 'getContractAddress("address")' src/main/java/org/tron/walletcli/cli/commands/QueryCommands.java`
Expected: 2.

- [ ] **Step 4: Build**

Run: `./gradlew build`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/org/tron/walletcli/cli/commands/ContractCommands.java \
        src/main/java/org/tron/walletcli/cli/commands/QueryCommands.java
git commit -m "feat(commands): accept aliases for --contract and contract-typed --address"
```

---

## Task 15: Migrate `TransactionCommands.java` (16 sites — all ACCOUNT)

**Files:**
- Modify: `src/main/java/org/tron/walletcli/cli/commands/TransactionCommands.java`

All `getAddress(...)` calls in this file resolve to wallet addresses (`to`, `owner`, `address` for create-account, etc.). Bulk replacement is safe.

- [ ] **Step 1: Replace**

```bash
sed -i.bak 's/opts\.getAddress(/opts.getAccountAddress(/g' \
  src/main/java/org/tron/walletcli/cli/commands/TransactionCommands.java
rm src/main/java/org/tron/walletcli/cli/commands/TransactionCommands.java.bak
```

- [ ] **Step 2: Verify**

Run: `grep -c 'opts.getAccountAddress(' src/main/java/org/tron/walletcli/cli/commands/TransactionCommands.java`
Expected: 16.

Run: `grep -c 'opts.getAddress(' src/main/java/org/tron/walletcli/cli/commands/TransactionCommands.java`
Expected: 0.

- [ ] **Step 3: Build + behavioural smoke**

```bash
./gradlew shadowJar
# Add a throwaway alias and confirm it resolves through send-trx parse
java -jar build/libs/wallet-cli.jar --network nile alias-add --name smoketest \
    --type ACCOUNT --address TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t || true
# Validate parse-time alias resolution. We expect either a clean failure beyond
# parsing (e.g. signing/auth/balance) — what we DO NOT want is "Invalid TRON
# address" which would mean the alias path isn't being hit.
java -jar build/libs/wallet-cli.jar --output json --network nile send-trx \
    --to smoketest --amount 1 2>&1 | tee /tmp/send-trx-smoke.json
grep -q '"meta"' /tmp/send-trx-smoke.json \
  || { echo "FAIL: send-trx did not record alias meta"; exit 1; }
java -jar build/libs/wallet-cli.jar --network nile alias-remove --name smoketest || true
```

> If the build hasn't reached Task 21 yet (alias-add doesn't exist), substitute by hand-writing
> `Wallet/aliases/nile.json` with an `entries` array containing one ACCOUNT entry, then `rm` it after.

- [ ] **Step 4: Commit**

```bash
git add src/main/java/org/tron/walletcli/cli/commands/TransactionCommands.java
git commit -m "feat(transaction): accept account aliases for --to/--owner/--address"
```

---

## Task 16: Migrate `StakingCommands.java` (14 sites — all ACCOUNT)

- [ ] **Step 1: Replace**

```bash
sed -i.bak 's/opts\.getAddress(/opts.getAccountAddress(/g' \
  src/main/java/org/tron/walletcli/cli/commands/StakingCommands.java
rm src/main/java/org/tron/walletcli/cli/commands/StakingCommands.java.bak
```

- [ ] **Step 2: Verify**

Run: `grep -c 'opts.getAccountAddress(' src/main/java/org/tron/walletcli/cli/commands/StakingCommands.java`
Expected: 14.

- [ ] **Step 3: Build + commit**

```bash
./gradlew build -x test
git add src/main/java/org/tron/walletcli/cli/commands/StakingCommands.java
git commit -m "feat(staking): accept account aliases for --owner/--receiver"
```

---

## Task 17: Migrate `WitnessCommands.java` (4 sites — all ACCOUNT)

- [ ] **Step 1: Replace**

```bash
sed -i.bak 's/opts\.getAddress(/opts.getAccountAddress(/g' \
  src/main/java/org/tron/walletcli/cli/commands/WitnessCommands.java
rm src/main/java/org/tron/walletcli/cli/commands/WitnessCommands.java.bak
```

- [ ] **Step 2: Verify**

Run: `grep -c 'opts.getAccountAddress(' src/main/java/org/tron/walletcli/cli/commands/WitnessCommands.java`
Expected: 4.

- [ ] **Step 3: Note about `--votes`**

The `vote-witness --votes "addr count addr count"` parameter parses addresses inside the string itself, not via `opts.getAddress(...)`. Keep this out of scope (raw addresses still work, aliases inside the votes string do not). Document this limitation in the spec update (Task 22).

- [ ] **Step 4: Build + commit**

```bash
./gradlew build -x test
git add src/main/java/org/tron/walletcli/cli/commands/WitnessCommands.java
git commit -m "feat(witness): accept account aliases for --owner and witness query"
```

---

## Task 18: Migrate `ProposalCommands.java` (3 sites — all ACCOUNT)

- [ ] **Step 1: Replace**

```bash
sed -i.bak 's/opts\.getAddress(/opts.getAccountAddress(/g' \
  src/main/java/org/tron/walletcli/cli/commands/ProposalCommands.java
rm src/main/java/org/tron/walletcli/cli/commands/ProposalCommands.java.bak
```

- [ ] **Step 2: Verify**

Run: `grep -c 'opts.getAccountAddress(' src/main/java/org/tron/walletcli/cli/commands/ProposalCommands.java`
Expected: 3.

- [ ] **Step 3: Build + commit**

```bash
./gradlew build -x test
git add src/main/java/org/tron/walletcli/cli/commands/ProposalCommands.java
git commit -m "feat(proposal): accept account aliases for --owner"
```

---

## Task 19: Migrate `ExchangeCommands.java` (5 sites — all ACCOUNT)

- [ ] **Step 1: Replace**

```bash
sed -i.bak 's/opts\.getAddress(/opts.getAccountAddress(/g' \
  src/main/java/org/tron/walletcli/cli/commands/ExchangeCommands.java
rm src/main/java/org/tron/walletcli/cli/commands/ExchangeCommands.java.bak
```

- [ ] **Step 2: Verify**

Run: `grep -c 'opts.getAccountAddress(' src/main/java/org/tron/walletcli/cli/commands/ExchangeCommands.java`
Expected: 5.

- [ ] **Step 3: Build + commit**

```bash
./gradlew build -x test
git add src/main/java/org/tron/walletcli/cli/commands/ExchangeCommands.java
git commit -m "feat(exchange): accept account aliases for --owner"
```

---

## Task 20: Migrate remaining 19 ACCOUNT sites in `QueryCommands.java`

**Files:**
- Modify: `src/main/java/org/tron/walletcli/cli/commands/QueryCommands.java`

After Task 14 the file still has 19 `getAddress(...)` calls — all account-typed (`from`, `to`, `owner`, `address` for account queries).

- [ ] **Step 1: Replace remaining**

The two contract sites have already become `getContractAddress`. A bulk replace of the remainder is safe:

```bash
sed -i.bak 's/opts\.getAddress(/opts.getAccountAddress(/g' \
  src/main/java/org/tron/walletcli/cli/commands/QueryCommands.java
rm src/main/java/org/tron/walletcli/cli/commands/QueryCommands.java.bak
```

- [ ] **Step 2: Verify**

Run: `grep -c 'opts.getAccountAddress(' src/main/java/org/tron/walletcli/cli/commands/QueryCommands.java`
Expected: 19.

Run: `grep -c 'opts.getContractAddress(' src/main/java/org/tron/walletcli/cli/commands/QueryCommands.java`
Expected: 2.

Run: `grep -c 'opts.getAddress(' src/main/java/org/tron/walletcli/cli/commands/QueryCommands.java`
Expected: 0.

- [ ] **Step 3: Build + full test run**

Run: `./gradlew build`
Expected: BUILD SUCCESSFUL with all existing tests passing.

- [ ] **Step 4: Phase 6 cross-file smoke (covers T15–T20)**

After T15 already demonstrated the pattern with `send-trx`, sanity-check each remaining migrated file by running one read-only command per file with an alias input. Pre-seed a throwaway alias (or hand-write `Wallet/aliases/nile.json`) before, remove after. For each command, the success case is "JSON envelope contains `meta` with the expected `option` and `type=ACCOUNT`":

```bash
SEED='TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
java -jar build/libs/wallet-cli.jar --network nile alias-add --name phase6 \
    --type ACCOUNT --address "$SEED"

check() {
  local label="$1"; shift
  local option="$1"; shift
  local out
  out=$("$@" 2>&1) || true
  echo "$out" | grep -q '"meta"' \
    && echo "$out" | grep -Eq '"option"[[:space:]]*:[[:space:]]*"'"$option"'"' \
    || { echo "FAIL: $label did not record alias meta"; exit 1; }
}

# StakingCommands (T16): get-can-withdraw-unfreeze-amount expects --address
check staking address \
  java -jar build/libs/wallet-cli.jar --output json --network nile \
       get-can-withdraw-unfreeze-amount --address phase6 --timestamp 0

# WitnessCommands (T17): list-witness-vote-history expects --address
check witness address \
  java -jar build/libs/wallet-cli.jar --output json --network nile \
       list-witness-vote-history --address phase6

# ProposalCommands (T18): provide required --parameters so parsing completes
# and the handler reaches opts.getAccountAddress("owner").
check proposal owner \
  java -jar build/libs/wallet-cli.jar --output json --network nile \
       create-proposal --owner phase6 --parameters "0 1"

# ExchangeCommands (T19): provide all required options so parsing completes
# and the handler reaches opts.getAccountAddress("owner").
check exchange owner \
  java -jar build/libs/wallet-cli.jar --output json --network nile \
       exchange-create --owner phase6 --first-token _ --first-balance 1 \
       --second-token 1000001 --second-balance 1

# QueryCommands (T20): get-balance --address
check query address \
  java -jar build/libs/wallet-cli.jar --output json --network nile \
       get-balance --address phase6

java -jar build/libs/wallet-cli.jar --network nile alias-remove --name phase6
echo "Phase 6 smoke OK"
```

If any line prints `FAIL:` the corresponding migration task missed a site or the meta plumbing isn't engaging — go back and fix before committing.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/org/tron/walletcli/cli/commands/QueryCommands.java
git commit -m "feat(query): accept account aliases for --address/--from/--to/--owner"
```

---

## Task 20.5: Migrate `WalletCommands.switch-wallet --address`

**Files:**
- Modify: `src/main/java/org/tron/walletcli/cli/commands/WalletCommands.java`

`switch-wallet --address X` does **not** go through `opts.getAddress(...)`. The handler reads `opts.getString("address")` (~L169) then manually `WalletApi.decodeFromBase58Check`. None of the bulk `sed` replacements in T15–T20 touched this site, so without an explicit migration `switch-wallet` won't accept account aliases.

- [ ] **Step 1: Read the current handler**

Run:
```bash
sed -n '145,205p' src/main/java/org/tron/walletcli/cli/commands/WalletCommands.java
```

Identify the lines that:
1. Read `opts.getString("address")` into a local (call it `addr`).
2. Call `WalletApi.decodeFromBase58Check(addr)` and emit `usageError` on null.

Keep the surrounding logic (`hasAddress` / mutually-exclusive `--name`) intact.

- [ ] **Step 2: Replace the manual decode with `getAccountAddress`**

The replacement (paste the exact lines you found in Step 1 into `old_string` and substitute):

```java
// before:
String addr = opts.getString("address");
byte[] decoded = WalletApi.decodeFromBase58Check(addr);
if (decoded == null) {
    out.usageError("Invalid TRON address for --address: " + addr, null);
    return;
}

// after:
byte[] decoded;
try {
    decoded = opts.getAccountAddress("address");
} catch (IllegalArgumentException e) {
    out.usageError(e.getMessage(), null);
    return;
}
String addr = WalletApi.encode58Check(decoded);
```

The downstream `addr` string variable is preserved so the rest of the handler (the wallet-list lookup that compares string addresses) keeps working unchanged. The audit trail for the alias hit is recorded inside `getAccountAddress`, so `meta.resolved` will appear in JSON output and the stderr `Resolved` line will fire in text mode.

- [ ] **Step 3: Build + smoke**

```bash
./gradlew shadowJar
SEED='TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
java -jar build/libs/wallet-cli.jar --network nile alias-add --name walletalias \
    --type ACCOUNT --address "$SEED"
out=$(java -jar build/libs/wallet-cli.jar --output json --network nile \
        switch-wallet --address walletalias 2>&1 || true)
echo "$out" | grep -q '"meta"' \
  || { echo "FAIL: switch-wallet did not record alias meta"; exit 1; }
java -jar build/libs/wallet-cli.jar --network nile alias-remove --name walletalias
```

Expected: the alias resolves; whether the switch itself succeeds depends on whether a keystore for `$SEED` exists in `Wallet/`, but the meta line must appear regardless.

- [ ] **Step 4: Commit**

```bash
git add src/main/java/org/tron/walletcli/cli/commands/WalletCommands.java
git commit -m "feat(wallet): accept account alias for switch-wallet --address"
```

---

## Task 21: `alias` subcommand family

**Files:**
- Create: `src/main/java/org/tron/walletcli/cli/commands/AliasCommands.java`
- Modify: `src/main/java/org/tron/walletcli/Client.java` (register)

Subcommands:

| Name | Required options | Optional | Behaviour |
|---|---|---|---|
| `alias-list` | – | `--type ACCOUNT\|TOKEN`, `--source builtin\|user\|all` | List entries (default all/all) |
| `alias-add` | `--name`, `--type`, `--address` | `--decimals` (token), `--note` (account) | Validate name (rejects collision with built-in and existing user names across types), persist to user file |
| `alias-remove` | `--name` | `--type` (optional precision; required only if a hand-edited user file contains both types under same name) | Remove from user file; refuse if name only exists in built-in |
| `alias-resolve` | `--input` | `--type` | Resolve and print address |

- [ ] **Step 1: Read an existing register pattern**

Run: `head -80 src/main/java/org/tron/walletcli/cli/commands/WalletCommands.java`
Note the current repo shape: `CommandDefinition.builder().name("...").handler(...).build()`,
`registry.add(...)`, and handler arity `(ctx, opts, wrapper, out)`.

- [ ] **Step 2: Implement `AliasCommands.java`**

```java
package org.tron.walletcli.cli.commands;

import java.io.File;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.tron.walletcli.cli.CommandDefinition;
import org.tron.walletcli.cli.CommandRegistry;
import org.tron.walletcli.cli.OptionDef;
import org.tron.walletcli.cli.aliases.AliasEntry;
import org.tron.walletcli.cli.aliases.AliasResolver;
import org.tron.walletcli.cli.aliases.AliasStore;
import org.tron.walletcli.cli.aliases.AliasStoreLoader;
import org.tron.walletcli.cli.aliases.AliasType;
import org.tron.walletcli.cli.aliases.AliasValidation;
import org.tron.walletcli.cli.aliases.ResolutionResult;
import org.tron.walletserver.WalletApi;

public final class AliasCommands {

  private AliasCommands() {}

  public static void register(CommandRegistry registry) {
    registry.add(buildList());
    registry.add(buildAdd());
    registry.add(buildRemove());
    registry.add(buildResolve());
  }

  private static String currentNetwork() {
    String n = System.getProperty("tron.cli.network");
    return n == null ? "main" : n.toLowerCase(Locale.ROOT);
  }

  private static File userFile(String network) {
    return new File("Wallet/aliases/" + network + ".json");
  }

  private static AliasType parseTypeOpt(org.tron.walletcli.cli.ParsedOptions opts, String key) {
    if (!opts.has(key)) return null;
    return AliasType.parse(opts.getString(key));
  }

  private static CommandDefinition buildList() {
    return CommandDefinition.builder()
        .name("alias-list")
        .authPolicy(CommandDefinition.AuthPolicy.NEVER)
        .description("List built-in and user-defined aliases (accounts and tokens)")
        .option("type", "Filter type: ACCOUNT | TOKEN (default: all)", false)
        .option("source", "Filter source: builtin | user | all (default: all)", false)
        .handler((ctx, opts, wrapper, formatter) -> {
          String network = currentNetwork();
          String src = opts.has("source") ? opts.getString("source").toLowerCase(Locale.ROOT) : "all";
          AliasStore store;
          if ("builtin".equals(src)) store = AliasStoreLoader.loadBuiltin(network);
          else if ("user".equals(src)) store = AliasStoreLoader.loadUserFile(userFile(network));
          else if ("all".equals(src)) store = AliasStoreLoader.loadLayered(network, userFile(network));
          else {
            formatter.usageError("Invalid --source: " + src
                + " (expected builtin, user, or all)", null);
            return;
          }

          AliasType filter = parseTypeOpt(opts, "type");
          List<AliasEntry> entries = filter == null ? store.listAll() : store.listByType(filter);

          List<Map<String, Object>> json = new ArrayList<>();
          StringBuilder text = new StringBuilder();
          for (AliasEntry e : entries) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("name", e.getName());
            m.put("type", e.getType().name());
            m.put("address", WalletApi.encode58Check(e.getAddress()));
            if (e.getType() == AliasType.TOKEN) m.put("decimals", e.getDecimals());
            if (e.getNote() != null) m.put("note", e.getNote());
            m.put("source", e.getSource());
            json.add(m);
            text.append(String.format("%-16s %-8s %s  [%s]%n",
                e.getName(), e.getType().name(),
                WalletApi.encode58Check(e.getAddress()), e.getSource()));
          }
          Map<String, Object> data = new LinkedHashMap<>();
          data.put("network", network);
          data.put("aliases", json);
          formatter.success(text.toString(), data);
        })
        .build();
  }

  private static CommandDefinition buildAdd() {
    return CommandDefinition.builder()
        .name("alias-add")
        .authPolicy(CommandDefinition.AuthPolicy.NEVER)
        .description("Add an alias to the user alias list (does not override built-in)")
        .option("name", "Alias name", true)
        .option("type", "ACCOUNT or TOKEN", true)
        .option("address", "TRON address (Base58Check)", true)
        .option("decimals", "Decimals (TOKEN only, default: 0)", false, OptionDef.Type.LONG)
        .option("note", "Free-text note (ACCOUNT only)", false)
        .handler((ctx, opts, wrapper, formatter) -> {
          String name = opts.getString("name");
          AliasType type = AliasType.parse(opts.getString("type"));
          AliasValidation.requireValidName(name);
          byte[] addr = opts.getAddress("address"); // raw Base58, alias-add never recurses

          // Reject option/type mismatches loudly instead of silently dropping.
          if (type == AliasType.TOKEN && opts.has("note")) {
              formatter.error("invalid_option",
                  "--note is only valid for ACCOUNT aliases (got --type TOKEN)");
              return;
          }
          if (type == AliasType.ACCOUNT && opts.has("decimals")) {
              formatter.error("invalid_option",
                  "--decimals is only valid for TOKEN aliases (got --type ACCOUNT)");
              return;
          }

          String network = currentNetwork();
          AliasStore builtin = AliasStoreLoader.loadBuiltin(network);
          if (builtin.containsName(name)) {
            formatter.error("name_collision",
                "name \"" + name.toUpperCase(Locale.ROOT)
                    + "\" is reserved by built-in alias list. Pick a different name.");
            return;
          }

          File f = userFile(network);
          List<AliasEntry> existing = new ArrayList<>(
              AliasStoreLoader.loadUserFile(f).listAll());
          for (AliasEntry e : existing) {
            if (e.getName().equalsIgnoreCase(name) && e.getType() != type) {
              formatter.error("name_collision",
                  "name \"" + name.toUpperCase(Locale.ROOT)
                      + "\" already exists as " + e.getType().name()
                      + ". Pick a different name.");
              return;
            }
          }
          existing.removeIf(e -> e.getName().equalsIgnoreCase(name) && e.getType() == type);
          AliasEntry entry = (type == AliasType.TOKEN)
              ? AliasEntry.token(name, addr,
                    opts.has("decimals") ? opts.getInt("decimals") : 0, "user")
              : AliasEntry.account(name, addr, "user",
                    opts.has("note") ? opts.getString("note") : null);
          existing.add(entry);
          AliasStoreLoader.writeUserFile(f, existing);

          Map<String, Object> data = new LinkedHashMap<>();
          data.put("name", name.toUpperCase(Locale.ROOT));
          data.put("type", type.name());
          data.put("address", WalletApi.encode58Check(addr));
          data.put("network", network);
          formatter.success("Added " + type.name() + " alias "
              + name.toUpperCase(Locale.ROOT), data);
        })
        .build();
  }

  private static CommandDefinition buildRemove() {
    return CommandDefinition.builder()
        .name("alias-remove")
        .authPolicy(CommandDefinition.AuthPolicy.NEVER)
        .description("Remove an alias from the user alias list")
        .option("name", "Alias name", true)
        .option("type", "ACCOUNT or TOKEN (required if both exist)", false)
        .handler((ctx, opts, wrapper, formatter) -> {
          String name = opts.getString("name");
          AliasType filter = parseTypeOpt(opts, "type");
          String network = currentNetwork();
          File f = userFile(network);
          List<AliasEntry> existing = new ArrayList<>(
              AliasStoreLoader.loadUserFile(f).listAll());

          List<AliasEntry> matches = new ArrayList<>();
          for (AliasEntry e : existing) {
            if (!e.getName().equalsIgnoreCase(name)) continue;
            if (filter != null && e.getType() != filter) continue;
            matches.add(e);
          }
          if (matches.isEmpty()) {
            AliasStore builtin = AliasStoreLoader.loadBuiltin(network);
            if (builtin.containsName(name)) {
              formatter.error("builtin_alias",
                  "cannot remove built-in alias: " + name.toUpperCase(Locale.ROOT));
              return;
            }
            formatter.error("not_found",
                "no user-defined alias with name: " + name);
            return;
          }
          if (matches.size() > 1) {
            formatter.error("ambiguous",
                "name \"" + name + "\" exists for both ACCOUNT and TOKEN; "
                    + "specify --type to disambiguate.");
            return;
          }
          AliasEntry victim = matches.get(0);
          existing.removeIf(e -> e.getName().equalsIgnoreCase(name)
              && e.getType() == victim.getType());
          AliasStoreLoader.writeUserFile(f, existing);

          Map<String, Object> data = new LinkedHashMap<>();
          data.put("name", victim.getName());
          data.put("type", victim.getType().name());
          data.put("network", network);
          formatter.success("Removed " + victim.getType().name() + " alias "
              + victim.getName(), data);
        })
        .build();
  }

  private static CommandDefinition buildResolve() {
    return CommandDefinition.builder()
        .name("alias-resolve")
        .authPolicy(CommandDefinition.AuthPolicy.NEVER)
        .description("Resolve an input string to a TRON address")
        .option("input", "Symbol or address to resolve", true)
        .option("type", "Force expected type: ACCOUNT or TOKEN (default: any)", false)
        .handler((ctx, opts, wrapper, formatter) -> {
          String network = currentNetwork();
          AliasResolver resolver = new AliasResolver(
              AliasStoreLoader.loadLayered(network, userFile(network)));
          AliasType expected = parseTypeOpt(opts, "type");

          ResolutionResult r;
          if (expected != null) {
            r = resolver.resolve("input", opts.getString("input"), expected);
          } else {
            // try TOKEN first then ACCOUNT; both fall through to literal address
            try {
              r = resolver.resolve("input", opts.getString("input"), AliasType.TOKEN);
            } catch (RuntimeException tokenFail) {
              r = resolver.resolve("input", opts.getString("input"), AliasType.ACCOUNT);
            }
          }

          Map<String, Object> data = new LinkedHashMap<>();
          data.put("input", r.getInput());
          data.put("address", WalletApi.encode58Check(r.getAddress()));
          if (r.getName() != null) data.put("name", r.getName());
          if (r.getType() != null) data.put("type", r.getType().name());
          data.put("source", r.getSource());
          data.put("network", network);
          formatter.success(WalletApi.encode58Check(r.getAddress()), data);
        })
        .build();
  }
}
```

- [ ] **Step 3: Register in `Client.java`**

After the existing block of `register(registry)` calls (around line 4824):

```java
org.tron.walletcli.cli.commands.AliasCommands.register(registry);
```

- [ ] **Step 4: Smoke test with the fat jar**

```bash
./gradlew shadowJar
java -jar build/libs/wallet-cli.jar --network nile alias-list
java -jar build/libs/wallet-cli.jar --network nile alias-add --name alice --type ACCOUNT --address TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --note "test"
java -jar build/libs/wallet-cli.jar --network nile alias-list --source user
java -jar build/libs/wallet-cli.jar --output json --network nile alias-resolve --input alice
java -jar build/libs/wallet-cli.jar --network nile alias-add --name USDT --type TOKEN --address TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --decimals 6 # expect name_collision
java -jar build/libs/wallet-cli.jar --network nile alias-remove --name alice
```

Expected:
- alias-list shows builtin USDT for nile
- alias-add alice succeeds; alias-list --source user shows alice
- alias-resolve --input alice JSON contains `"name": "ALICE"`, `"type": "ACCOUNT"`, `"source": "user"` (pretty-printed JSON includes spaces)
- alias-add USDT errors with `name_collision`
- alias-remove alice succeeds

- [ ] **Step 5: Commit**

```bash
git add src/main/java/org/tron/walletcli/cli/commands/AliasCommands.java \
        src/main/java/org/tron/walletcli/Client.java
git commit -m "feat(cli): add alias-list/add/remove/resolve commands"
```

---

## Task 22: Update standard-cli contract spec

**Files:**
- Modify: `docs/standard-cli-contract-spec.md`

- [ ] **Step 1: Append section**

Append at the end (before any "Future work" section):

```markdown
## Address Book / Alias Resolution

The standard CLI accepts named aliases anywhere a TRON address is expected.
Aliases come in two types:

- **ACCOUNT** — wallet addresses (recipients, owners, voters, etc.).
- **TOKEN** — TRC20 contract addresses (e.g. USDT, USDC).

### Storage

- **Built-in baseline** (read-only, bundled with the CLI): well-known TRC20 tokens
  per network. Located at classpath resource `/aliases/<network>.json`.
- **User file** (read-write): `Wallet/aliases/<network>.json`. Contains both
  ACCOUNT and TOKEN entries. Schema is the same as the built-in resource.

### Resolution rules

For every option that accepts a TRON address, the CLI tries in order:
1. Decode value as Base58Check.
2. Decode value as hex (`0x` or `41` prefix, 40 hex chars).
3. Build the effective alias store for the current network: built-in entries are
   loaded first and any hand-edited user entry whose name collides with a
   built-in name is ignored.
4. Look up the effective user entries for a name equal to the value
   (case-insensitive) AND whose type matches what the option expects.
5. Look up the built-in entries the same way.
6. If a name matches but with the *wrong* type, fail with a typed error.
7. Otherwise fail with `--<option> value "<v>" is neither a valid TRON address
   nor a known <expected-type> alias`.

### Type expectations per option

| Option | Expected type | Notes |
|---|---|---|
| `--contract` | TOKEN | Only on `ContractCommands` |
| `--address` (`get-contract`, `get-contract-info`) | TOKEN | `--address` is overloaded; these two query commands target contracts |
| `--address` (all other commands) | ACCOUNT | Account / wallet queries |
| `--to` / `--from` / `--owner` / `--receiver` | ACCOUNT | All transaction / staking commands |

### Built-in entries cannot be overridden

`alias-add` rejects any name that exists in the built-in list (any type, same network)
and tells the user to pick a non-colliding name (e.g. `USDT_TEST`). Runtime
layering also ignores hand-edited user entries whose names collide with built-ins.
This makes the built-in list an immutable trust anchor that user files (or
compromised user files) cannot replace.

User-defined aliases also cannot share a name across types. For example, a user
file should not contain both `{"name":"FOO","type":"TOKEN"}` and
`{"name":"FOO","type":"ACCOUNT"}`. `alias-add` rejects that collision to avoid
ambiguous bare-name resolution. If a hand-edited file contains both anyway,
typed command options still resolve by expected type, and `alias-remove --type`
can disambiguate cleanup.

### Naming standard

Alias names must match `^[A-Za-z][A-Za-z0-9_.-]{0,31}$` and must not be:
- a value that decodes as a TRON address (Base58Check or hex);
- a reserved word: `me`, `self`, `main`, `mainnet`, `nile`, `shasta`, `custom`, `trx`, `default`.

Names are stored upper-cased and matched case-insensitively.

### Audit output

When an alias resolves the CLI emits an audit record:
- **Text mode (not quiet):** one stderr line per alias:
  `Resolved --to "alice" -> TXyz... (source=user, name=ALICE, type=ACCOUNT)`.
- **JSON mode:** success and error envelopes gain a `meta.resolved` array
  containing one entry per alias hit. Raw addresses are not logged. The `data`
  field is unchanged.

### Out of scope (current version)

- Decimals-aware amount conversion (`--amount 1.5 --token USDT`).
- Aliases inside the `vote-witness --votes "addr count addr count"` string;
  inside `--params` ABI args; inside the `--library libName:address` argument.
  These continue to require raw addresses.
- REPL (interactive Client) does not consult the alias store. Existing interactive
  `AddressBook` continues to use `wallet_data/address_book.txt`; this feature is
  a Standard CLI alias store at `Wallet/aliases/<network>.json`.

### Management commands

`alias-list`, `alias-add`, `alias-remove`, `alias-resolve`. See `--help <command>`
for option details.
```

- [ ] **Step 2: Commit**

```bash
git add docs/standard-cli-contract-spec.md
git commit -m "docs(spec): document unified address book contract"
```

---

## Task 23: QA parity script

**Files:**
- Create: `qa/commands/alias.sh`
- Modify: `qa/run.sh` / QA manifest as appropriate for the current harness.

- [ ] **Step 1: Inspect QA harness**

Run: `find qa -maxdepth 2 -type f | sort | sed -n '1,80p'`
and `head -40 qa/run.sh`.
Note conventions (`WALLET_JAR`/`JAR`, `NETWORK`, `MASTER_PASSWORD` env vars)
and whether this repo already has a `qa/commands/` directory.

- [ ] **Step 2: Write `qa/commands/alias.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/../config.sh"

JAR="${JAR:-${WALLET_JAR:-build/libs/wallet-cli.jar}}"
NETWORK="${NETWORK:-nile}"

run() { java -jar "$JAR" --network "$NETWORK" "$@"; }
runj() { java -jar "$JAR" --output json --network "$NETWORK" "$@"; }
cleanup() { run alias-remove --name qauser >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "[alias] alias-list (builtin nile contains USDT)"
runj alias-list --source builtin | grep -Eq '"name"[[:space:]]*:[[:space:]]*"USDT"' \
  || { echo "FAIL: builtin USDT missing on nile"; exit 1; }

echo "[alias] alias-add account 'qauser'"
run alias-add --name qauser --type ACCOUNT \
    --address TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --note "qa" >/dev/null
runj alias-list --source user --type ACCOUNT | grep -Eq '"name"[[:space:]]*:[[:space:]]*"QAUSER"' \
  || { echo "FAIL: qauser not in user list"; exit 1; }

echo "[alias] alias-resolve qauser -> address + source=user (JSON)"
out=$(runj alias-resolve --input qauser --type ACCOUNT)
echo "$out" | grep -Eq '"name"[[:space:]]*:[[:space:]]*"QAUSER"' || { echo "FAIL: missing name"; exit 1; }
echo "$out" | grep -Eq '"type"[[:space:]]*:[[:space:]]*"ACCOUNT"' || { echo "FAIL: type!=ACCOUNT"; exit 1; }
echo "$out" | grep -Eq '"source"[[:space:]]*:[[:space:]]*"user"'  || { echo "FAIL: source!=user"; exit 1; }

echo "[alias] cannot override builtin USDT"
out=$(runj alias-add --name USDT --type TOKEN \
       --address TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --decimals 6 || true)
echo "$out" | grep -Eq '"error"[[:space:]]*:[[:space:]]*"name_collision"' \
  || { echo "FAIL: expected name_collision error"; exit 1; }

echo "[alias] type mismatch fails (resolve qauser as TOKEN)"
out=$(runj alias-resolve --input qauser --type TOKEN || true)
echo "$out" | grep -Eq '"success"[[:space:]]*:[[:space:]]*false' \
  || { echo "FAIL: type-mismatch did not error"; exit 1; }

echo "[alias] trigger-constant-contract --contract USDT emits meta.resolved (TOKEN path)"
out=$(runj trigger-constant-contract --contract USDT --method "name()" \
        --owner TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t || true)
echo "$out" | grep -q '"meta"' || { echo "FAIL: meta missing"; exit 1; }
echo "$out" | grep -Eq '"option"[[:space:]]*:[[:space:]]*"contract"' || { echo "FAIL: option missing"; exit 1; }
echo "$out" | grep -Eq '"type"[[:space:]]*:[[:space:]]*"TOKEN"' || { echo "FAIL: type missing"; exit 1; }

echo "[alias] get-account --address qauser emits meta.resolved (ACCOUNT path)"
out=$(runj get-account --address qauser || true)
echo "$out" | grep -q '"meta"'              || { echo "FAIL: account meta missing"; exit 1; }
echo "$out" | grep -Eq '"option"[[:space:]]*:[[:space:]]*"address"'   || { echo "FAIL: account option wrong"; exit 1; }
echo "$out" | grep -Eq '"type"[[:space:]]*:[[:space:]]*"ACCOUNT"'     || { echo "FAIL: account type wrong"; exit 1; }
echo "$out" | grep -Eq '"name"[[:space:]]*:[[:space:]]*"QAUSER"'      || { echo "FAIL: account name wrong"; exit 1; }

echo "[alias] error envelope also carries meta.resolved"
# Force a downstream failure (insufficient funds / unknown account) while alias
# resolves successfully — the error JSON envelope must still include meta.
out=$(runj send-trx --to qauser --amount 1 || true)
echo "$out" | grep -Eq '"success"[[:space:]]*:[[:space:]]*false' || { echo "FAIL: send-trx should have failed"; exit 1; }
echo "$out" | grep -q '"meta"'           || { echo "FAIL: meta missing on error envelope"; exit 1; }
echo "$out" | grep -Eq '"option"[[:space:]]*:[[:space:]]*"to"'    || { echo "FAIL: --to alias not in meta"; exit 1; }

echo "[alias] cleanup"
cleanup
trap - EXIT

echo "[alias] PASS"
```

- [ ] **Step 3: Wire into the QA harness**

Inspect the current QA runner before editing. This repo may not execute `qa/commands/*.sh`
directly; if the harness is manifest-driven, register the alias case in the manifest
instead of appending an unconditional shell call to `qa/run.sh`.

- [ ] **Step 4: Run locally**

```bash
./gradlew shadowJar
TRON_TEST_PRIVATE_KEY=<your-nile-key> bash qa/run.sh verify
```

Expected: full QA passes.

- [ ] **Step 5: Commit**

```bash
git add qa/commands/alias.sh qa/run.sh qa/manifest.tsv
git commit -m "qa: parity tests for unified address book"
```

If the current harness does not use one of those files, omit it from `git add`.

---

## Self-Review Notes

- **Spec coverage:**
  - Built-in + user mixed: T4 (resources) + T7 (loader) + T5 (layering).
  - Naming standard: T3.
  - User cannot override built-in: T21 step 2 rejects via `containsName`; T23 step 4 verifies via QA.
  - Wallet & token aliases unified: AliasType enum (T1) + typed entries throughout.
  - Type-aware resolution: T9 + T10.
  - All 76 `getAddress` sites migrated: T14 (15) + T15 (16) + T16 (14) + T17 (4) + T18 (3) + T19 (5) + T20 (19) = 76.
  - `switch-wallet --address` (uses manual `opts.getString` + `decodeFromBase58Check`, not caught by sed): T20.5.
  - Custom gRPC endpoint without `--network` does not silently fall back to main built-ins (T12 step 2).
  - Audit trail covers BOTH success AND error JSON envelopes (T13 step 4).
  - QA covers TOKEN path, ACCOUNT path, AND error-envelope meta (T23).
  - `--note` with TOKEN type and `--decimals` with ACCOUNT type are rejected explicitly, not silently dropped (T21).
  - `vote-witness --votes` aliases inside the votes string are explicitly out of scope per user decision (T22 spec note retained).
  - Audit trail: T13.
  - CLI surface: T21.
  - Docs + QA: T22 + T23.
- **Type consistency:** `AliasType` enum values are `ACCOUNT` and `TOKEN`, used identically in tasks 1, 2, 5, 7, 9, 10, 13, 21, 22, 23. `ResolutionResult(option, input, address, name, type, source)` constructor signature appears identically in T8, T9, T13. `getAccountAddress` / `getContractAddress` method names appear identically in T10, T14–T20.
- **Placeholder check:** every step that changes code shows the code; commit messages are written; expected counts are stated. The two adapt-to-existing-code spots (T11 step 1, T13 step 1) are scoped to "read this file first then make the change shown" and the diff content is provided.
- **Out-of-scope reminders consistent:** TRC10, decimals-aware amount, ABI param/library aliases, votes-string aliases, REPL alias support are all excluded both in the header and in T22.
