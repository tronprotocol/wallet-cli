# TRC20 Token Alias Implementation Plan

> **STATUS: SUPERSEDED by `2026-05-08-unified-address-book.md`.** Scope expanded from TRC20-only to full address book (account aliases for `--to/--from/--owner/--receiver/--address` plus token aliases for `--contract`). Do not execute this plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Standard CLI users (and AI agents) pass a TRC20 symbol such as `USDT` wherever `--contract <address>` is currently required, while keeping the existing Base58/hex address path unchanged.

**Architecture:**
Resolution is bare-name fallback (Foundry/ENS style): every value passed to a contract option is first parsed as Base58Check / hex; only on failure does the CLI consult a layered token table (user override → built-in resources). Resolution lives in a single `TokenResolver` service constructed once per `StandardCliRunner` invocation, injected into `ParsedOptions` so that command handlers call a new `getContractAddress(key)` accessor without each command knowing about aliases. Successful alias resolutions are recorded and surfaced both on stderr (text mode) and inside the JSON envelope's `meta.resolved` array (JSON mode) so the caller can audit what address was used.

**Tech Stack:** Java 8, JCommander/Standard-CLI framework, Jackson (already on classpath via Trident), JUnit 4 (existing test infra under `src/test/java`).

**Scope (intentionally narrow):**
- Only `--contract` in `ContractCommands` consults the token table.
- TRC10 / asset-name / `--token-id` / `--first-token` etc. are out of scope.
- No automatic decimals handling (`--amount 1.5 --token USDT`) — follow-up.
- Address-book for wallet-style aliases (`--to`, `--owner`, …) — out of scope.

---

## File Structure

```
src/main/java/org/tron/walletcli/cli/tokens/
  TokenEntry.java          # immutable record: symbol, address (byte[]), source, decimals
  TokenStore.java          # in-memory map keyed by upper-case symbol, query-only
  TokenStoreLoader.java    # builds layered store from resources + user file
  TokenResolver.java       # resolve(input) -> ResolutionResult; collects log
  ResolutionResult.java    # (byte[] address, String symbol|null, String source)
  TokenValidation.java     # symbol/address syntactic checks shared by store + cli

src/main/resources/tokens/
  mainnet.json             # built-in token list, mainnet
  nile.json                # built-in token list, nile testnet
  shasta.json              # built-in token list, shasta testnet (may be empty {})

src/main/java/org/tron/walletcli/cli/commands/
  TokenCommands.java       # NEW: token-list / token-add / token-remove / token-resolve

src/main/java/org/tron/walletcli/cli/
  ParsedOptions.java       # MODIFY: inject resolver, add getContractAddress(key)
  StandardCliRunner.java   # MODIFY: build resolver from GlobalOptions.network
  CommandDefinition.java   # MODIFY: thread resolver into ParsedOptions
  OutputFormatter.java     # MODIFY: accept resolved entries, render in stderr/JSON

src/main/java/org/tron/walletcli/cli/commands/
  ContractCommands.java    # MODIFY: replace getAddress("contract") with getContractAddress("contract")

src/main/java/org/tron/walletcli/Client.java
  # MODIFY: register TokenCommands; keep REPL behavior unchanged

src/test/java/org/tron/walletcli/cli/tokens/
  TokenStoreLoaderTest.java
  TokenResolverTest.java
  TokenValidationTest.java
src/test/java/org/tron/walletcli/cli/
  ParsedOptionsContractTest.java     # NEW

docs/standard-cli-contract-spec.md   # MODIFY: token alias contract section
qa/commands/token_alias.sh           # NEW: parity test
```

User token files live at `Wallet/tokens/<network>.json` (next to existing keystore directory). One file per network. Missing files are treated as empty.

---

## JSON formats

**Built-in resource & user file** share the same schema:

```json
{
  "tokens": [
    {"symbol": "USDT", "address": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", "decimals": 6},
    {"symbol": "USDC", "address": "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8", "decimals": 6}
  ]
}
```

`decimals` is parsed but unused in this version; storing it now means follow-up amount conversion needs no schema change.

**JSON output meta enrichment** (added envelope field):

```json
{
  "success": true,
  "data": { ... existing payload ... },
  "meta": {
    "resolved": [
      {"option": "contract", "input": "USDT", "address": "TR7NHqj...", "symbol": "USDT", "source": "builtin"}
    ]
  }
}
```

`meta` is omitted when no aliases were resolved.

---

## Task 1: Built-in token list resources

**Files:**
- Create: `src/main/resources/tokens/mainnet.json`
- Create: `src/main/resources/tokens/nile.json`
- Create: `src/main/resources/tokens/shasta.json`

- [ ] **Step 1: Write `mainnet.json`**

```json
{
  "tokens": [
    {"symbol": "USDT", "address": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", "decimals": 6},
    {"symbol": "USDC", "address": "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8", "decimals": 6},
    {"symbol": "USDD", "address": "TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn", "decimals": 18},
    {"symbol": "WTRX", "address": "TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR", "decimals": 6}
  ]
}
```

- [ ] **Step 2: Write `nile.json`**

```json
{
  "tokens": [
    {"symbol": "USDT", "address": "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj", "decimals": 6}
  ]
}
```

(Nile only has a sparse set of canonical TRC20s; users will add more locally.)

- [ ] **Step 3: Write `shasta.json`**

```json
{ "tokens": [] }
```

- [ ] **Step 4: Commit**

```bash
git add src/main/resources/tokens/
git commit -m "feat(tokens): add built-in TRC20 token lists per network"
```

---

## Task 2: `TokenEntry` value type

**Files:**
- Create: `src/main/java/org/tron/walletcli/cli/tokens/TokenEntry.java`
- Test: `src/test/java/org/tron/walletcli/cli/tokens/TokenEntryTest.java`

- [ ] **Step 1: Write the failing test**

```java
package org.tron.walletcli.cli.tokens;

import org.junit.Test;
import static org.junit.Assert.*;

public class TokenEntryTest {

  @Test
  public void symbolIsUpperCasedAndTrimmed() {
    TokenEntry e = new TokenEntry(" usdt ", new byte[21], 6, "builtin");
    assertEquals("USDT", e.getSymbol());
  }

  @Test
  public void addressIsCopiedDefensively() {
    byte[] addr = new byte[21];
    addr[0] = 0x41;
    TokenEntry e = new TokenEntry("USDT", addr, 6, "builtin");
    addr[0] = 0x00;
    assertEquals(0x41, e.getAddress()[0]);
  }

  @Test(expected = IllegalArgumentException.class)
  public void rejectsNullSymbol() {
    new TokenEntry(null, new byte[21], 6, "builtin");
  }

  @Test(expected = IllegalArgumentException.class)
  public void rejectsBlankSymbol() {
    new TokenEntry("   ", new byte[21], 6, "builtin");
  }

  @Test(expected = IllegalArgumentException.class)
  public void rejectsNullAddress() {
    new TokenEntry("USDT", null, 6, "builtin");
  }

  @Test(expected = IllegalArgumentException.class)
  public void rejectsWrongAddressLength() {
    new TokenEntry("USDT", new byte[20], 6, "builtin");
  }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `./gradlew test --tests "org.tron.walletcli.cli.tokens.TokenEntryTest"`
Expected: FAIL — class missing.

- [ ] **Step 3: Implement `TokenEntry`**

```java
package org.tron.walletcli.cli.tokens;

import java.util.Locale;

public final class TokenEntry {
  private final String symbol;
  private final byte[] address;
  private final int decimals;
  private final String source;

  public TokenEntry(String symbol, byte[] address, int decimals, String source) {
    if (symbol == null) throw new IllegalArgumentException("symbol must not be null");
    String normalized = symbol.trim().toUpperCase(Locale.ROOT);
    if (normalized.isEmpty()) throw new IllegalArgumentException("symbol must not be blank");
    if (address == null) throw new IllegalArgumentException("address must not be null");
    if (address.length != 21) {
      throw new IllegalArgumentException(
          "address must be 21 bytes (raw TRON address), got " + address.length);
    }
    if (source == null || source.trim().isEmpty()) {
      throw new IllegalArgumentException("source must not be blank");
    }
    this.symbol = normalized;
    this.address = address.clone();
    this.decimals = decimals;
    this.source = source;
  }

  public String getSymbol() { return symbol; }
  public byte[] getAddress() { return address.clone(); }
  public int getDecimals() { return decimals; }
  public String getSource() { return source; }
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `./gradlew test --tests "org.tron.walletcli.cli.tokens.TokenEntryTest"`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/org/tron/walletcli/cli/tokens/TokenEntry.java \
        src/test/java/org/tron/walletcli/cli/tokens/TokenEntryTest.java
git commit -m "feat(tokens): add TokenEntry value type"
```

---

## Task 3: `TokenValidation` syntactic guards

**Files:**
- Create: `src/main/java/org/tron/walletcli/cli/tokens/TokenValidation.java`
- Test: `src/test/java/org/tron/walletcli/cli/tokens/TokenValidationTest.java`

Symbol rules (rejected as alias name):
- Decodable as Base58Check TRON address (would shadow real address parsing).
- Reasonable hex address shape: matches `^(0x|41)[0-9a-fA-F]{40,42}$`.
- Reserved words (case-insensitive): `me`, `self`, `mainnet`, `nile`, `shasta`, `trx`.
- Anything not matching `^[A-Za-z][A-Za-z0-9_.-]{0,31}$`.

- [ ] **Step 1: Write the failing test**

```java
package org.tron.walletcli.cli.tokens;

import org.junit.Test;
import static org.junit.Assert.*;

public class TokenValidationTest {

  @Test public void acceptsTypicalSymbol() {
    TokenValidation.requireValidSymbol("USDT");
    TokenValidation.requireValidSymbol("usd-coin");
    TokenValidation.requireValidSymbol("Pkg.v2");
  }

  @Test(expected = IllegalArgumentException.class)
  public void rejectsBase58Address() {
    TokenValidation.requireValidSymbol("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
  }

  @Test(expected = IllegalArgumentException.class)
  public void rejectsHexAddress() {
    TokenValidation.requireValidSymbol("41a614f803b6fd780986a42c78ec9c7f77e6ded13c");
  }

  @Test(expected = IllegalArgumentException.class)
  public void rejects0xHexAddress() {
    TokenValidation.requireValidSymbol("0xa614f803b6fd780986a42c78ec9c7f77e6ded13c");
  }

  @Test(expected = IllegalArgumentException.class)
  public void rejectsReservedWord() {
    TokenValidation.requireValidSymbol("me");
  }

  @Test(expected = IllegalArgumentException.class)
  public void rejectsLeadingDigit() {
    TokenValidation.requireValidSymbol("1inch");
  }

  @Test(expected = IllegalArgumentException.class)
  public void rejectsTooLong() {
    StringBuilder sb = new StringBuilder("A");
    for (int i = 0; i < 32; i++) sb.append('a');
    TokenValidation.requireValidSymbol(sb.toString());
  }

  @Test
  public void looksLikeTronAddressDetectsBase58() {
    assertTrue(TokenValidation.looksLikeAddress("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"));
  }

  @Test
  public void looksLikeTronAddressDetectsHex() {
    assertTrue(TokenValidation.looksLikeAddress(
        "41a614f803b6fd780986a42c78ec9c7f77e6ded13c"));
  }

  @Test
  public void looksLikeTronAddressRejectsSymbol() {
    assertFalse(TokenValidation.looksLikeAddress("USDT"));
  }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `./gradlew test --tests "org.tron.walletcli.cli.tokens.TokenValidationTest"`
Expected: FAIL — class missing.

- [ ] **Step 3: Implement `TokenValidation`**

```java
package org.tron.walletcli.cli.tokens;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import org.tron.walletserver.WalletApi;

public final class TokenValidation {
  private TokenValidation() {}

  private static final Pattern SYMBOL = Pattern.compile("^[A-Za-z][A-Za-z0-9_.-]{0,31}$");
  private static final Pattern HEX_ADDRESS = Pattern.compile("^(0x|41)[0-9a-fA-F]{40,42}$");
  private static final Set<String> RESERVED = new HashSet<String>(Arrays.asList(
      "me", "self", "mainnet", "nile", "shasta", "trx"));

  public static boolean looksLikeAddress(String input) {
    if (input == null) return false;
    String trimmed = input.trim();
    if (trimmed.isEmpty()) return false;
    if (HEX_ADDRESS.matcher(trimmed).matches()) return true;
    return WalletApi.decodeFromBase58Check(trimmed) != null;
  }

  public static void requireValidSymbol(String symbol) {
    if (symbol == null) {
      throw new IllegalArgumentException("symbol must not be null");
    }
    String trimmed = symbol.trim();
    if (!SYMBOL.matcher(trimmed).matches()) {
      throw new IllegalArgumentException(
          "invalid token symbol: " + symbol
              + " (must match ^[A-Za-z][A-Za-z0-9_.-]{0,31}$)");
    }
    if (RESERVED.contains(trimmed.toLowerCase(Locale.ROOT))) {
      throw new IllegalArgumentException("symbol is reserved: " + trimmed);
    }
    if (looksLikeAddress(trimmed)) {
      throw new IllegalArgumentException(
          "symbol must not look like a TRON address: " + trimmed);
    }
  }
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `./gradlew test --tests "org.tron.walletcli.cli.tokens.TokenValidationTest"`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/org/tron/walletcli/cli/tokens/TokenValidation.java \
        src/test/java/org/tron/walletcli/cli/tokens/TokenValidationTest.java
git commit -m "feat(tokens): add TokenValidation guards"
```

---

## Task 4: `TokenStore` in-memory lookup

**Files:**
- Create: `src/main/java/org/tron/walletcli/cli/tokens/TokenStore.java`
- Test: `src/test/java/org/tron/walletcli/cli/tokens/TokenStoreTest.java`

- [ ] **Step 1: Write the failing test**

```java
package org.tron.walletcli.cli.tokens;

import java.util.Arrays;
import java.util.List;
import org.junit.Test;
import static org.junit.Assert.*;

public class TokenStoreTest {

  private byte[] addr(int marker) {
    byte[] a = new byte[21];
    a[0] = 0x41;
    a[20] = (byte) marker;
    return a;
  }

  @Test public void emptyStoreLooksUpToNull() {
    TokenStore store = TokenStore.of(java.util.Collections.<TokenEntry>emptyList());
    assertNull(store.find("USDT"));
  }

  @Test public void caseInsensitiveLookup() {
    TokenStore store = TokenStore.of(Arrays.asList(
        new TokenEntry("USDT", addr(1), 6, "builtin")));
    assertNotNull(store.find("usdt"));
    assertNotNull(store.find("Usdt"));
  }

  @Test public void userEntryShadowsBuiltin() {
    TokenEntry builtin = new TokenEntry("USDT", addr(1), 6, "builtin");
    TokenEntry user    = new TokenEntry("USDT", addr(2), 6, "user");
    TokenStore store = TokenStore.layered(
        TokenStore.of(Arrays.asList(builtin)),
        TokenStore.of(Arrays.asList(user)));
    assertEquals("user", store.find("USDT").getSource());
    assertEquals(2, store.find("USDT").getAddress()[20] & 0xFF);
  }

  @Test public void listAllReturnsBothLayersWithUserFirst() {
    TokenEntry builtin = new TokenEntry("USDC", addr(1), 6, "builtin");
    TokenEntry user    = new TokenEntry("USDT", addr(2), 6, "user");
    TokenStore store = TokenStore.layered(
        TokenStore.of(Arrays.asList(builtin)),
        TokenStore.of(Arrays.asList(user)));
    List<TokenEntry> all = store.listAll();
    assertEquals(2, all.size());
    assertEquals("USDT", all.get(0).getSymbol());
    assertEquals("USDC", all.get(1).getSymbol());
  }

  @Test public void layeredFindFallsThroughToBuiltin() {
    TokenEntry builtin = new TokenEntry("USDC", addr(1), 6, "builtin");
    TokenStore store = TokenStore.layered(
        TokenStore.of(Arrays.asList(builtin)),
        TokenStore.of(java.util.Collections.<TokenEntry>emptyList()));
    assertEquals("builtin", store.find("USDC").getSource());
  }
}
```

- [ ] **Step 2: Run test to verify failure**

Run: `./gradlew test --tests "org.tron.walletcli.cli.tokens.TokenStoreTest"`
Expected: FAIL — class missing.

- [ ] **Step 3: Implement `TokenStore`**

```java
package org.tron.walletcli.cli.tokens;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class TokenStore {

  private final Map<String, TokenEntry> entries; // upper-case symbol -> entry

  private TokenStore(Map<String, TokenEntry> entries) {
    this.entries = entries;
  }

  public static TokenStore of(List<TokenEntry> source) {
    Map<String, TokenEntry> map = new LinkedHashMap<String, TokenEntry>();
    for (TokenEntry e : source) {
      map.put(e.getSymbol(), e);
    }
    return new TokenStore(map);
  }

  /** Layered lookup: user overrides built-in. listAll returns user entries first. */
  public static TokenStore layered(TokenStore builtin, TokenStore user) {
    Map<String, TokenEntry> map = new LinkedHashMap<String, TokenEntry>(user.entries);
    for (Map.Entry<String, TokenEntry> e : builtin.entries.entrySet()) {
      if (!map.containsKey(e.getKey())) {
        map.put(e.getKey(), e.getValue());
      }
    }
    return new TokenStore(map);
  }

  public TokenEntry find(String symbol) {
    if (symbol == null) return null;
    return entries.get(symbol.trim().toUpperCase(Locale.ROOT));
  }

  public List<TokenEntry> listAll() {
    return Collections.unmodifiableList(new ArrayList<TokenEntry>(entries.values()));
  }
}
```

- [ ] **Step 4: Run tests**

Run: `./gradlew test --tests "org.tron.walletcli.cli.tokens.TokenStoreTest"`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/org/tron/walletcli/cli/tokens/TokenStore.java \
        src/test/java/org/tron/walletcli/cli/tokens/TokenStoreTest.java
git commit -m "feat(tokens): add TokenStore with layered lookup"
```

---

## Task 5: `TokenStoreLoader` — load resources + user file

**Files:**
- Create: `src/main/java/org/tron/walletcli/cli/tokens/TokenStoreLoader.java`
- Test: `src/test/java/org/tron/walletcli/cli/tokens/TokenStoreLoaderTest.java`

`TokenStoreLoader` exposes:

```java
public static TokenStore loadBuiltin(String network);
public static TokenStore loadUserFile(File file);                      // missing -> empty
public static void writeUserFile(File file, List<TokenEntry> entries); // pretty JSON, atomic via tmp+rename
public static TokenStore loadLayered(String network, File userFile);
```

JSON parsing uses Jackson (already a transitive dependency through Trident/protobuf; verify with `./gradlew dependencies | grep jackson`). If Jackson is not present, fall back to a minimal hand-rolled parser — but Jackson is preferred. The TokenStoreLoader integrates `TokenValidation.requireValidSymbol` on load: malformed entries are skipped with a warning to `stderr` (silenced when `quiet`), and the loader keeps loading the rest.

- [ ] **Step 1: Verify Jackson availability**

Run: `./gradlew dependencies --configuration runtimeClasspath | grep -i jackson | head -3`
Expected: lines containing `jackson-databind`. If empty, add to `build.gradle`:

```groovy
dependencies {
    implementation 'com.fasterxml.jackson.core:jackson-databind:2.15.4'
}
```

Then re-run `./gradlew build`.

- [ ] **Step 2: Write the failing test**

```java
package org.tron.walletcli.cli.tokens;

import java.io.File;
import java.io.PrintWriter;
import java.util.Arrays;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import static org.junit.Assert.*;

public class TokenStoreLoaderTest {

  @Rule public TemporaryFolder tmp = new TemporaryFolder();

  @Test public void builtinMainnetContainsUSDT() {
    TokenStore store = TokenStoreLoader.loadBuiltin("mainnet");
    TokenEntry usdt = store.find("USDT");
    assertNotNull(usdt);
    assertEquals("builtin", usdt.getSource());
    assertEquals(6, usdt.getDecimals());
  }

  @Test public void unknownNetworkReturnsEmpty() {
    TokenStore store = TokenStoreLoader.loadBuiltin("does-not-exist");
    assertTrue(store.listAll().isEmpty());
  }

  @Test public void userFileMissingReturnsEmpty() {
    File missing = new File(tmp.getRoot(), "missing.json");
    TokenStore store = TokenStoreLoader.loadUserFile(missing);
    assertTrue(store.listAll().isEmpty());
  }

  @Test public void userFileLoadsAndIsTaggedUser() throws Exception {
    File f = tmp.newFile("user.json");
    try (PrintWriter w = new PrintWriter(f)) {
      w.println("{ \"tokens\": [ {\"symbol\":\"FOO\",\"address\":\"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t\",\"decimals\":4} ] }");
    }
    TokenStore store = TokenStoreLoader.loadUserFile(f);
    assertEquals("user", store.find("FOO").getSource());
    assertEquals(4, store.find("FOO").getDecimals());
  }

  @Test public void writeThenReadRoundTrips() throws Exception {
    byte[] addr = org.tron.walletserver.WalletApi.decodeFromBase58Check(
        "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
    TokenEntry e = new TokenEntry("BAR", addr, 8, "user");
    File f = new File(tmp.getRoot(), "out.json");
    TokenStoreLoader.writeUserFile(f, Arrays.asList(e));
    TokenStore loaded = TokenStoreLoader.loadUserFile(f);
    assertEquals(8, loaded.find("BAR").getDecimals());
  }

  @Test public void malformedEntriesAreSkipped() throws Exception {
    File f = tmp.newFile("bad.json");
    try (PrintWriter w = new PrintWriter(f)) {
      w.println("{ \"tokens\": ["
          + "{\"symbol\":\"OK\",\"address\":\"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t\",\"decimals\":6},"
          + "{\"symbol\":\"1bad\",\"address\":\"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t\"},"
          + "{\"symbol\":\"NoAddr\"}"
          + "]}");
    }
    TokenStore store = TokenStoreLoader.loadUserFile(f);
    assertNotNull(store.find("OK"));
    assertNull(store.find("1bad"));
    assertNull(store.find("NoAddr"));
  }
}
```

- [ ] **Step 3: Run to verify failure**

Run: `./gradlew test --tests "org.tron.walletcli.cli.tokens.TokenStoreLoaderTest"`
Expected: FAIL.

- [ ] **Step 4: Implement `TokenStoreLoader`**

```java
package org.tron.walletcli.cli.tokens;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import org.tron.walletserver.WalletApi;

public final class TokenStoreLoader {

  private static final ObjectMapper MAPPER = new ObjectMapper()
      .enable(SerializationFeature.INDENT_OUTPUT);

  private TokenStoreLoader() {}

  public static TokenStore loadBuiltin(String network) {
    if (network == null) return TokenStore.of(Collections.<TokenEntry>emptyList());
    String resource = "/tokens/" + network.toLowerCase(Locale.ROOT) + ".json";
    try (InputStream in = TokenStoreLoader.class.getResourceAsStream(resource)) {
      if (in == null) return TokenStore.of(Collections.<TokenEntry>emptyList());
      return TokenStore.of(parseEntries(MAPPER.readTree(in), "builtin"));
    } catch (IOException e) {
      System.err.println("warn: failed to load builtin token list " + resource + ": " + e.getMessage());
      return TokenStore.of(Collections.<TokenEntry>emptyList());
    }
  }

  public static TokenStore loadUserFile(File file) {
    if (file == null || !file.isFile()) {
      return TokenStore.of(Collections.<TokenEntry>emptyList());
    }
    try {
      return TokenStore.of(parseEntries(MAPPER.readTree(file), "user"));
    } catch (IOException e) {
      System.err.println("warn: failed to read user token file " + file + ": " + e.getMessage());
      return TokenStore.of(Collections.<TokenEntry>emptyList());
    }
  }

  public static TokenStore loadLayered(String network, File userFile) {
    return TokenStore.layered(loadBuiltin(network), loadUserFile(userFile));
  }

  public static void writeUserFile(File file, List<TokenEntry> entries) {
    ObjectNode root = MAPPER.createObjectNode();
    ArrayNode arr = root.putArray("tokens");
    for (TokenEntry e : entries) {
      ObjectNode n = arr.addObject();
      n.put("symbol", e.getSymbol());
      n.put("address", WalletApi.encode58Check(e.getAddress()));
      n.put("decimals", e.getDecimals());
    }
    File parent = file.getParentFile();
    if (parent != null && !parent.exists() && !parent.mkdirs()) {
      throw new IllegalStateException("cannot create directory: " + parent);
    }
    File tmp = new File(file.getAbsolutePath() + ".tmp");
    try {
      MAPPER.writerWithDefaultPrettyPrinter().writeValue(tmp, root);
      Files.move(tmp.toPath(), file.toPath(),
          StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    } catch (IOException e) {
      throw new IllegalStateException("failed to write " + file + ": " + e.getMessage(), e);
    }
  }

  private static List<TokenEntry> parseEntries(JsonNode root, String source) {
    List<TokenEntry> out = new ArrayList<TokenEntry>();
    if (root == null || !root.has("tokens") || !root.get("tokens").isArray()) {
      return out;
    }
    for (JsonNode node : root.get("tokens")) {
      String symbol = node.path("symbol").asText(null);
      String address = node.path("address").asText(null);
      int decimals = node.path("decimals").asInt(0);
      if (symbol == null || address == null) {
        System.err.println("warn: skipping token entry missing symbol/address");
        continue;
      }
      try {
        TokenValidation.requireValidSymbol(symbol);
      } catch (IllegalArgumentException e) {
        System.err.println("warn: skipping token entry: " + e.getMessage());
        continue;
      }
      byte[] addr = WalletApi.decodeFromBase58Check(address);
      if (addr == null) {
        System.err.println("warn: skipping token " + symbol + " — invalid address: " + address);
        continue;
      }
      out.add(new TokenEntry(symbol, addr, decimals, source));
    }
    return out;
  }
}
```

- [ ] **Step 5: Run tests**

Run: `./gradlew test --tests "org.tron.walletcli.cli.tokens.TokenStoreLoaderTest"`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/main/java/org/tron/walletcli/cli/tokens/TokenStoreLoader.java \
        src/test/java/org/tron/walletcli/cli/tokens/TokenStoreLoaderTest.java \
        build.gradle
git commit -m "feat(tokens): add TokenStoreLoader for builtin + user JSON"
```

---

## Task 6: `ResolutionResult` + `TokenResolver`

**Files:**
- Create: `src/main/java/org/tron/walletcli/cli/tokens/ResolutionResult.java`
- Create: `src/main/java/org/tron/walletcli/cli/tokens/TokenResolver.java`
- Test: `src/test/java/org/tron/walletcli/cli/tokens/TokenResolverTest.java`

Resolver responsibilities:
- Try Base58Check → return result with `source = "address"`, `symbol = null`.
- Try hex (`0x...` or `41...`, length 42 incl. prefix) → result with `source = "hex"`.
- Else look up symbol in `TokenStore` → result with `source = "user" | "builtin"`, `symbol = <upper>`.
- Else throw `TokenResolutionException` with a clear message.

- [ ] **Step 1: Write the failing test**

```java
package org.tron.walletcli.cli.tokens;

import org.junit.Test;
import static org.junit.Assert.*;

public class TokenResolverTest {

  private final byte[] addr = org.tron.walletserver.WalletApi.decodeFromBase58Check(
      "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");

  private TokenResolver buildResolver() {
    TokenEntry e = new TokenEntry("USDT", addr, 6, "builtin");
    return new TokenResolver(TokenStore.of(java.util.Arrays.asList(e)));
  }

  @Test public void base58Passthrough() {
    ResolutionResult r = buildResolver()
        .resolve("contract", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
    assertNull(r.getSymbol());
    assertEquals("address", r.getSource());
    assertArrayEquals(addr, r.getAddress());
  }

  @Test public void hexPassthrough() {
    String hex = "41" + bytesToHex(addr).substring(2);
    ResolutionResult r = buildResolver().resolve("contract", hex);
    assertEquals("hex", r.getSource());
    assertArrayEquals(addr, r.getAddress());
  }

  @Test public void zeroXHexPassthrough() {
    String hex = "0x" + bytesToHex(addr).substring(2);
    ResolutionResult r = buildResolver().resolve("contract", hex);
    assertEquals("hex", r.getSource());
    assertArrayEquals(addr, r.getAddress());
  }

  @Test public void symbolResolves() {
    ResolutionResult r = buildResolver().resolve("contract", "usdt");
    assertEquals("USDT", r.getSymbol());
    assertEquals("builtin", r.getSource());
    assertEquals("contract", r.getOption());
    assertEquals("usdt", r.getInput());
  }

  @Test(expected = TokenResolutionException.class)
  public void unknownInputThrows() {
    buildResolver().resolve("contract", "DOES_NOT_EXIST");
  }

  private static String bytesToHex(byte[] in) {
    StringBuilder sb = new StringBuilder();
    for (byte b : in) sb.append(String.format("%02x", b));
    return sb.toString();
  }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `./gradlew test --tests "org.tron.walletcli.cli.tokens.TokenResolverTest"`
Expected: FAIL — classes missing.

- [ ] **Step 3: Implement `ResolutionResult`**

```java
package org.tron.walletcli.cli.tokens;

public final class ResolutionResult {
  private final String option;
  private final String input;
  private final byte[] address;
  private final String symbol;     // null when input was a literal address
  private final String source;     // "address" | "hex" | "user" | "builtin"

  public ResolutionResult(String option, String input, byte[] address,
                          String symbol, String source) {
    this.option = option;
    this.input = input;
    this.address = address.clone();
    this.symbol = symbol;
    this.source = source;
  }

  public String getOption() { return option; }
  public String getInput() { return input; }
  public byte[] getAddress() { return address.clone(); }
  public String getSymbol() { return symbol; }
  public String getSource() { return source; }

  public boolean isAlias() {
    return "user".equals(source) || "builtin".equals(source);
  }
}
```

- [ ] **Step 4: Implement `TokenResolutionException`**

Inline as a static nested class on `TokenResolver`, or its own file. Keep it as its own file for clarity:

`src/main/java/org/tron/walletcli/cli/tokens/TokenResolutionException.java`

```java
package org.tron.walletcli.cli.tokens;

public class TokenResolutionException extends IllegalArgumentException {
  public TokenResolutionException(String message) { super(message); }
}
```

- [ ] **Step 5: Implement `TokenResolver`**

```java
package org.tron.walletcli.cli.tokens;

import java.util.regex.Pattern;
import org.tron.walletserver.WalletApi;

public class TokenResolver {

  private static final Pattern HEX = Pattern.compile("^(0x|41)([0-9a-fA-F]{40})$");

  private final TokenStore store;

  public TokenResolver(TokenStore store) {
    this.store = store;
  }

  public ResolutionResult resolve(String option, String input) {
    if (input == null || input.trim().isEmpty()) {
      throw new TokenResolutionException("--" + option + " is empty");
    }
    String raw = input.trim();

    byte[] base58 = WalletApi.decodeFromBase58Check(raw);
    if (base58 != null) {
      return new ResolutionResult(option, raw, base58, null, "address");
    }

    java.util.regex.Matcher m = HEX.matcher(raw);
    if (m.matches()) {
      byte[] hexBytes = decodeHex(m.group(2));
      byte[] full = new byte[21];
      full[0] = 0x41;
      System.arraycopy(hexBytes, 0, full, 1, 20);
      return new ResolutionResult(option, raw, full, null, "hex");
    }

    TokenEntry entry = store.find(raw);
    if (entry != null) {
      return new ResolutionResult(option, raw, entry.getAddress(),
          entry.getSymbol(), entry.getSource());
    }

    throw new TokenResolutionException(
        "--" + option + " value \"" + raw
            + "\" is neither a valid TRON address nor a known token symbol");
  }

  private static byte[] decodeHex(String hex) {
    byte[] out = new byte[hex.length() / 2];
    for (int i = 0; i < out.length; i++) {
      out[i] = (byte) Integer.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return out;
  }
}
```

- [ ] **Step 6: Run tests**

Run: `./gradlew test --tests "org.tron.walletcli.cli.tokens.TokenResolverTest"`
Expected: PASS, 5 tests.

- [ ] **Step 7: Commit**

```bash
git add src/main/java/org/tron/walletcli/cli/tokens/ResolutionResult.java \
        src/main/java/org/tron/walletcli/cli/tokens/TokenResolver.java \
        src/main/java/org/tron/walletcli/cli/tokens/TokenResolutionException.java \
        src/test/java/org/tron/walletcli/cli/tokens/TokenResolverTest.java
git commit -m "feat(tokens): add TokenResolver with address-first fallback"
```

---

## Task 7: Inject resolver into `ParsedOptions` + add `getContractAddress`

**Files:**
- Modify: `src/main/java/org/tron/walletcli/cli/ParsedOptions.java`
- Modify: `src/main/java/org/tron/walletcli/cli/CommandDefinition.java` (only the path that builds `ParsedOptions` — see below)
- Test: `src/test/java/org/tron/walletcli/cli/ParsedOptionsContractTest.java`

`ParsedOptions` becomes constructible with an optional `TokenResolver` and a `List<ResolutionResult>` accumulator. Calls to `getAddress(key)` keep their existing semantics. New method `getContractAddress(key)` uses the resolver and records hits.

- [ ] **Step 1: Inspect call sites of `new ParsedOptions(...)` to plan the constructor change**

Run: `grep -rn "new ParsedOptions(" src/main/java src/test/java`
Note every site — they all must keep compiling.

- [ ] **Step 2: Write the failing test**

```java
package org.tron.walletcli.cli;

import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.Test;
import org.tron.walletcli.cli.tokens.ResolutionResult;
import org.tron.walletcli.cli.tokens.TokenEntry;
import org.tron.walletcli.cli.tokens.TokenResolver;
import org.tron.walletcli.cli.tokens.TokenStore;
import static org.junit.Assert.*;

public class ParsedOptionsContractTest {

  private final byte[] addr = org.tron.walletserver.WalletApi.decodeFromBase58Check(
      "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");

  private TokenResolver buildResolver() {
    TokenEntry e = new TokenEntry("USDT", addr, 6, "builtin");
    return new TokenResolver(TokenStore.of(java.util.Arrays.asList(e)));
  }

  @Test public void getContractAddressResolvesSymbol() {
    Map<String, String> values = new LinkedHashMap<String, String>();
    values.put("contract", "USDT");
    ParsedOptions opts = new ParsedOptions(values, buildResolver());
    assertArrayEquals(addr, opts.getContractAddress("contract"));
    assertEquals(1, opts.getResolutionLog().size());
    ResolutionResult r = opts.getResolutionLog().get(0);
    assertEquals("USDT", r.getSymbol());
  }

  @Test public void getContractAddressAcceptsBase58() {
    Map<String, String> values = new LinkedHashMap<String, String>();
    values.put("contract", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
    ParsedOptions opts = new ParsedOptions(values, buildResolver());
    assertArrayEquals(addr, opts.getContractAddress("contract"));
    assertTrue(opts.getResolutionLog().isEmpty());
  }

  @Test(expected = IllegalArgumentException.class)
  public void getContractAddressMissingKeyThrows() {
    ParsedOptions opts = new ParsedOptions(new LinkedHashMap<String, String>(), buildResolver());
    opts.getContractAddress("contract");
  }

  @Test(expected = IllegalArgumentException.class)
  public void getContractAddressUnknownSymbolThrows() {
    Map<String, String> values = new LinkedHashMap<String, String>();
    values.put("contract", "WHO");
    ParsedOptions opts = new ParsedOptions(values, buildResolver());
    opts.getContractAddress("contract");
  }

  @Test public void legacyConstructorStillCompilesAndWorks() {
    Map<String, String> values = new LinkedHashMap<String, String>();
    values.put("contract", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
    ParsedOptions opts = new ParsedOptions(values);
    assertArrayEquals(addr, opts.getAddress("contract"));
  }
}
```

- [ ] **Step 3: Run to verify failure**

Run: `./gradlew test --tests "org.tron.walletcli.cli.ParsedOptionsContractTest"`
Expected: FAIL.

- [ ] **Step 4: Modify `ParsedOptions`**

Add fields, second constructor, accessor, and resolution log. Insert immediately after the existing `getAddress` method:

```java
// at top of class
private final TokenResolver resolver;
private final List<ResolutionResult> resolutionLog;
```

Replace the existing single-arg constructor with two constructors:

```java
public ParsedOptions(Map<String, String> values) {
    this(values, null);
}

public ParsedOptions(Map<String, String> values, TokenResolver resolver) {
    this.values = values == null
            ? Collections.<String, String>emptyMap()
            : new LinkedHashMap<String, String>(values);
    this.resolver = resolver;
    this.resolutionLog = new ArrayList<ResolutionResult>();
}
```

Add the new accessor and getter:

```java
public byte[] getContractAddress(String key) {
    String raw = values.get(key);
    if (raw == null) {
        throw new IllegalArgumentException("Missing required option: --" + key);
    }
    if (resolver == null) {
        return getAddress(key);
    }
    ResolutionResult r = resolver.resolve(key, raw);
    if (r.isAlias()) {
        resolutionLog.add(r);
    }
    return r.getAddress();
}

public List<ResolutionResult> getResolutionLog() {
    return Collections.unmodifiableList(resolutionLog);
}
```

Imports to add at top of the file:

```java
import java.util.ArrayList;
import java.util.List;
import org.tron.walletcli.cli.tokens.ResolutionResult;
import org.tron.walletcli.cli.tokens.TokenResolver;
```

- [ ] **Step 5: Run tests**

Run: `./gradlew test --tests "org.tron.walletcli.cli.ParsedOptionsContractTest"`
Expected: PASS, 5 tests.

Run: `./gradlew test`
Expected: full suite still passes.

- [ ] **Step 6: Commit**

```bash
git add src/main/java/org/tron/walletcli/cli/ParsedOptions.java \
        src/test/java/org/tron/walletcli/cli/ParsedOptionsContractTest.java
git commit -m "feat(cli): ParsedOptions.getContractAddress with token resolver"
```

---

## Task 8: Build resolver in `StandardCliRunner` + thread it through `CommandDefinition.parseArgs`

**Files:**
- Modify: `src/main/java/org/tron/walletcli/cli/StandardCliRunner.java`
- Modify: `src/main/java/org/tron/walletcli/cli/CommandDefinition.java`
- Modify: `src/main/java/org/tron/walletcli/cli/CommandContext.java`

The runner already knows `globalOpts.getNetwork()`. Build the resolver once per command and pass via a context. The cleanest minimal change is:

1. Add a `TokenResolver getTokenResolver()` accessor to `CommandContext`.
2. `StandardCliRunner` constructs `TokenResolver` from `loadLayered(network, userTokenFile(network))`.
3. `CommandDefinition.parseArgs` returns `ParsedOptions` built with the resolver from the context.

User token file location: `Wallet/tokens/<network>.json` resolved relative to `WalletApi.FilePath` (which is `Wallet`).

- [ ] **Step 1: Inspect existing `CommandDefinition.parseArgs`**

Run: `grep -n "parseArgs\|new ParsedOptions" src/main/java/org/tron/walletcli/cli/CommandDefinition.java`
Note the signature so the threading is minimal (likely it builds `ParsedOptions(values)` directly).

- [ ] **Step 2: Modify `CommandContext` — add resolver field**

Add field, constructor parameter, and getter (mirroring the pattern used for `masterPasswordProvider`):

```java
private final TokenResolver tokenResolver;

public CommandContext(String walletOverride, File resolvedAuthWalletFile,
                      StandardCliRunner.MasterPasswordProvider masterPasswordProvider,
                      TokenResolver tokenResolver) {
    this.walletOverride = walletOverride;
    this.resolvedAuthWalletFile = resolvedAuthWalletFile;
    this.masterPasswordProvider = masterPasswordProvider;
    this.tokenResolver = tokenResolver;
}
```

Update existing constructors to delegate (passing `null` for the resolver), and add:

```java
public TokenResolver getTokenResolver() { return tokenResolver; }

public CommandContext withTokenResolver(TokenResolver resolver) {
    return new CommandContext(walletOverride, resolvedAuthWalletFile,
        masterPasswordProvider, resolver);
}
```

Also extend `withResolvedAuthWalletFile` to pass `tokenResolver` through.

Add import: `import org.tron.walletcli.cli.tokens.TokenResolver;`

- [ ] **Step 3: Modify `CommandDefinition.parseArgs` to thread resolver**

Update the method signature to accept `CommandContext` (or whatever it currently takes — confirm in step 1) and propagate. If the current signature is `parseArgs(String[] args)`, add an overload `parseArgs(String[] args, TokenResolver resolver)` that constructs `new ParsedOptions(values, resolver)` and have the existing one delegate with `null`.

```java
public ParsedOptions parseArgs(String[] args) {
    return parseArgs(args, null);
}

public ParsedOptions parseArgs(String[] args, TokenResolver resolver) {
    Map<String, String> values = doParse(args); // existing logic, refactored if needed
    return new ParsedOptions(values, resolver);
}
```

Add import: `import org.tron.walletcli.cli.tokens.TokenResolver;`

- [ ] **Step 4: Modify `StandardCliRunner` to build resolver and pass it**

Near the top of `run`/`execute` (where the command is dispatched), build the resolver once:

```java
String network = globalOpts.getNetwork(); // may be null -> default
File userTokenFile = new File("Wallet/tokens/"
    + (network == null ? "default" : network.toLowerCase(java.util.Locale.ROOT))
    + ".json");
TokenResolver tokenResolver = new TokenResolver(
    TokenStoreLoader.loadLayered(
        network == null ? "mainnet" : network, userTokenFile));
CommandContext ctx = CommandContext.fromGlobalOptions(globalOpts, masterPasswordProvider)
    .withTokenResolver(tokenResolver);
```

Then pass `tokenResolver` into the existing `cmd.parseArgs(...)` call:

```java
ParsedOptions opts = cmd.parseArgs(commandArgs, tokenResolver);
```

Add imports:

```java
import org.tron.walletcli.cli.tokens.TokenResolver;
import org.tron.walletcli.cli.tokens.TokenStoreLoader;
```

(If `globalOpts.getNetwork()` defaults to `null` for "mainnet", reuse whatever helper `ApiClientFactory` uses to canonicalize the name — match its lower-case form.)

- [ ] **Step 5: Build everything**

Run: `./gradlew build -x test`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 6: Run full test suite**

Run: `./gradlew test`
Expected: all tests pass (existing + new). Fix any compile breaks introduced by the constructor signature change in `CommandContext`.

- [ ] **Step 7: Commit**

```bash
git add src/main/java/org/tron/walletcli/cli/CommandContext.java \
        src/main/java/org/tron/walletcli/cli/CommandDefinition.java \
        src/main/java/org/tron/walletcli/cli/StandardCliRunner.java
git commit -m "feat(cli): wire TokenResolver through StandardCliRunner"
```

---

## Task 9: Switch `ContractCommands` to `getContractAddress`

**Files:**
- Modify: `src/main/java/org/tron/walletcli/cli/commands/ContractCommands.java`

Twelve call sites identified by `grep -nE 'getAddress\("contract"\)' ContractCommands.java`. Each must change to `getContractAddress("contract")`.

- [ ] **Step 1: List the lines**

Run: `grep -n 'getAddress("contract")' src/main/java/org/tron/walletcli/cli/commands/ContractCommands.java`
Expected: lines 150, 213, 271, 323, 346, 374 (verify before editing).

- [ ] **Step 2: Replace each occurrence**

Use `sed` carefully or a manual edit per line. Search-and-replace every `getAddress("contract")` → `getContractAddress("contract")` in this file only. Do **not** touch other commands' `--owner` / `--to` (out of scope).

```bash
sed -i.bak 's/getAddress("contract")/getContractAddress("contract")/g' \
  src/main/java/org/tron/walletcli/cli/commands/ContractCommands.java
rm src/main/java/org/tron/walletcli/cli/commands/ContractCommands.java.bak
```

- [ ] **Step 3: Verify**

Run: `grep -c 'getContractAddress("contract")' src/main/java/org/tron/walletcli/cli/commands/ContractCommands.java`
Expected: matches the count from Step 1.

Run: `grep -c 'getAddress("contract")' src/main/java/org/tron/walletcli/cli/commands/ContractCommands.java`
Expected: 0.

- [ ] **Step 4: Build + test**

Run: `./gradlew build`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/org/tron/walletcli/cli/commands/ContractCommands.java
git commit -m "feat(contracts): accept TRC20 symbol via --contract"
```

---

## Task 10: Surface resolution log in `OutputFormatter`

**Files:**
- Modify: `src/main/java/org/tron/walletcli/cli/OutputFormatter.java`
- Modify: `src/main/java/org/tron/walletcli/cli/StandardCliRunner.java` (push log after parseArgs)
- Test: extend `src/test/java/org/tron/walletcli/cli/OutputFormatterTest.java` if it exists; otherwise add `OutputFormatterResolvedTest.java`.

Behaviour:
- `OutputFormatter.recordResolved(List<ResolutionResult>)` accumulates entries.
- In **text** mode (and not quiet): emit one line per alias resolution to stderr **before** the success message — `Resolved --contract "USDT" → TR7NHqj... (source=builtin)`.
- In **JSON** mode: include `meta.resolved` array in the success envelope. Omit `meta` when empty.
- In **quiet** text mode: suppress the stderr line (still record into JSON if applicable; quiet only suppresses stderr noise, not JSON metadata).

- [ ] **Step 1: Read current `OutputFormatter.java`**

Run: `wc -l src/main/java/org/tron/walletcli/cli/OutputFormatter.java`
Run: `grep -n "envelope\|emitJson\|err\.println\|recordSuccess" src/main/java/org/tron/walletcli/cli/OutputFormatter.java`
Note where the success envelope is built and where text-mode messages are emitted.

- [ ] **Step 2: Add field + recorder**

Insert near the other private fields:

```java
private final java.util.List<org.tron.walletcli.cli.tokens.ResolutionResult> resolved =
    new java.util.ArrayList<org.tron.walletcli.cli.tokens.ResolutionResult>();

public void recordResolved(java.util.List<org.tron.walletcli.cli.tokens.ResolutionResult> entries) {
    if (entries == null) return;
    for (org.tron.walletcli.cli.tokens.ResolutionResult r : entries) {
        if (r.isAlias()) resolved.add(r);
    }
}
```

- [ ] **Step 3: Emit stderr lines for text mode**

In the text-mode emission path (`if (current.success) { ... }` branch where `out.println` is called), before the success line is printed, add:

```java
if (mode == OutputMode.TEXT && !quiet) {
    for (org.tron.walletcli.cli.tokens.ResolutionResult r : resolved) {
        err.println("Resolved --" + r.getOption() + " \"" + r.getInput()
            + "\" → " + org.tron.walletserver.WalletApi.encode58Check(r.getAddress())
            + " (source=" + r.getSource()
            + (r.getSymbol() == null ? "" : ", symbol=" + r.getSymbol()) + ")");
    }
}
```

(Adjust field names — `mode`, `quiet`, `err` — to whatever the file uses; from existing grep we know `err.println("Error: …")` already exists.)

- [ ] **Step 4: Add `meta.resolved` to JSON envelope**

In `emitJsonSuccess` (or wherever the envelope map is finalised before serialisation), after the `data` field is set:

```java
if (!resolved.isEmpty()) {
    java.util.List<java.util.Map<String, Object>> arr =
        new java.util.ArrayList<java.util.Map<String, Object>>();
    for (org.tron.walletcli.cli.tokens.ResolutionResult r : resolved) {
        java.util.Map<String, Object> m = new java.util.LinkedHashMap<String, Object>();
        m.put("option", r.getOption());
        m.put("input", r.getInput());
        m.put("address", org.tron.walletserver.WalletApi.encode58Check(r.getAddress()));
        if (r.getSymbol() != null) m.put("symbol", r.getSymbol());
        m.put("source", r.getSource());
        arr.add(m);
    }
    java.util.Map<String, Object> meta = new java.util.LinkedHashMap<String, Object>();
    meta.put("resolved", arr);
    envelope.put("meta", meta);
}
```

- [ ] **Step 5: Wire from `StandardCliRunner`**

After parsing options and **before** invoking the handler, push the log into the formatter so that even if the handler throws, partial resolution is reported:

```java
ParsedOptions opts = cmd.parseArgs(commandArgs, tokenResolver);
formatter.recordResolved(opts.getResolutionLog());
```

- [ ] **Step 6: Add a focused test**

```java
package org.tron.walletcli.cli;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.util.Collections;
import org.junit.Test;
import org.tron.walletcli.cli.tokens.ResolutionResult;
import static org.junit.Assert.*;

public class OutputFormatterResolvedTest {

  private final byte[] addr = org.tron.walletserver.WalletApi.decodeFromBase58Check(
      "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");

  @Test public void textModeEmitsResolvedLine() {
    ByteArrayOutputStream errBytes = new ByteArrayOutputStream();
    OutputFormatter f = new OutputFormatter(
        OutputFormatter.OutputMode.TEXT,
        new PrintStream(new ByteArrayOutputStream()),
        new PrintStream(errBytes),
        false /* quiet */);
    f.recordResolved(Collections.singletonList(
        new ResolutionResult("contract", "USDT", addr, "USDT", "builtin")));
    f.success("ok", null);
    f.flush();
    String stderr = errBytes.toString();
    assertTrue(stderr, stderr.contains("Resolved --contract \"USDT\""));
    assertTrue(stderr, stderr.contains("source=builtin"));
  }

  @Test public void quietModeSuppressesStderrLine() {
    ByteArrayOutputStream errBytes = new ByteArrayOutputStream();
    OutputFormatter f = new OutputFormatter(
        OutputFormatter.OutputMode.TEXT,
        new PrintStream(new ByteArrayOutputStream()),
        new PrintStream(errBytes),
        true /* quiet */);
    f.recordResolved(Collections.singletonList(
        new ResolutionResult("contract", "USDT", addr, "USDT", "builtin")));
    f.success("ok", null);
    f.flush();
    assertFalse(errBytes.toString().contains("Resolved"));
  }
}
```

> Adapt constructor arguments to match the actual `OutputFormatter` signature once read in Step 1. If `OutputFormatter` has no public `flush()` method, call whatever finaliser exists (e.g. via the existing test helper).

- [ ] **Step 7: Run tests**

Run: `./gradlew test --tests "org.tron.walletcli.cli.OutputFormatterResolvedTest"`
Expected: PASS, 2 tests.

Run: `./gradlew test`
Expected: full suite still passes.

- [ ] **Step 8: Commit**

```bash
git add src/main/java/org/tron/walletcli/cli/OutputFormatter.java \
        src/main/java/org/tron/walletcli/cli/StandardCliRunner.java \
        src/test/java/org/tron/walletcli/cli/OutputFormatterResolvedTest.java
git commit -m "feat(cli): surface token alias resolution in stderr + JSON meta"
```

---

## Task 11: `token` subcommand family

**Files:**
- Create: `src/main/java/org/tron/walletcli/cli/commands/TokenCommands.java`
- Modify: `src/main/java/org/tron/walletcli/Client.java` (register new commands)

Subcommands:

| Name | Options | Behaviour |
|---|---|---|
| `token-list` | `[--source builtin\|user\|all]` (default `all`) | Print symbol / address / decimals / source. JSON: `{tokens: [...]}` |
| `token-add` | `--symbol <name> --address <addr> [--decimals <n>]` | Validate symbol; require address resolves to Base58 (no recursion through resolver); persist to user file. |
| `token-remove` | `--symbol <name>` | Remove from user file (built-in cannot be removed; exit code != 0 if symbol is built-in only). |
| `token-resolve` | `--input <s>` | Resolve and print address / symbol / source. |

User file path: same as Task 8 (`Wallet/tokens/<network>.json`).

- [ ] **Step 1: Build the file with all four commands**

```java
package org.tron.walletcli.cli.commands;

import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.tron.walletcli.cli.CommandDefinition;
import org.tron.walletcli.cli.CommandRegistry;
import org.tron.walletcli.cli.OptionDef;
import org.tron.walletcli.cli.OutputFormatter;
import org.tron.walletcli.cli.ParsedOptions;
import org.tron.walletcli.cli.tokens.ResolutionResult;
import org.tron.walletcli.cli.tokens.TokenEntry;
import org.tron.walletcli.cli.tokens.TokenResolver;
import org.tron.walletcli.cli.tokens.TokenStore;
import org.tron.walletcli.cli.tokens.TokenStoreLoader;
import org.tron.walletcli.cli.tokens.TokenValidation;
import org.tron.walletcli.WalletApiWrapper;
import org.tron.walletserver.WalletApi;

public final class TokenCommands {

  private TokenCommands() {}

  public static void register(CommandRegistry registry) {
    registry.register(buildList());
    registry.register(buildAdd());
    registry.register(buildRemove());
    registry.register(buildResolve());
  }

  private static String currentNetwork() {
    // StandardCliRunner stores the network on a thread-local OR (simpler) we re-read
    // from System property "tron.cli.network" set in StandardCliRunner.
    String n = System.getProperty("tron.cli.network");
    return n == null ? "mainnet" : n.toLowerCase(Locale.ROOT);
  }

  private static File userFile(String network) {
    return new File("Wallet/tokens/" + network + ".json");
  }

  private static CommandDefinition buildList() {
    return CommandDefinition.builder("token-list")
        .description("List built-in and user-defined TRC20 token aliases")
        .option("source", "Filter source: builtin | user | all (default: all)", false)
        .handler((opts, wrapper, formatter) -> {
          String network = currentNetwork();
          String source = opts.has("source") ? opts.getString("source").toLowerCase(Locale.ROOT) : "all";
          TokenStore store;
          if ("builtin".equals(source)) {
            store = TokenStoreLoader.loadBuiltin(network);
          } else if ("user".equals(source)) {
            store = TokenStoreLoader.loadUserFile(userFile(network));
          } else {
            store = TokenStoreLoader.loadLayered(network, userFile(network));
          }
          List<Map<String, Object>> json = new ArrayList<>();
          StringBuilder text = new StringBuilder();
          for (TokenEntry e : store.listAll()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("symbol", e.getSymbol());
            m.put("address", WalletApi.encode58Check(e.getAddress()));
            m.put("decimals", e.getDecimals());
            m.put("source", e.getSource());
            json.add(m);
            text.append(String.format("%-12s %s  decimals=%-2d  [%s]%n",
                e.getSymbol(), WalletApi.encode58Check(e.getAddress()),
                e.getDecimals(), e.getSource()));
          }
          Map<String, Object> data = new LinkedHashMap<>();
          data.put("network", network);
          data.put("tokens", json);
          formatter.success(text.toString(), data);
        })
        .build();
  }

  private static CommandDefinition buildAdd() {
    return CommandDefinition.builder("token-add")
        .description("Add a TRC20 token alias to the user token list")
        .option("symbol", "Token symbol (e.g. USDT)", true)
        .option("address", "TRC20 contract address (Base58Check)", true)
        .option("decimals", "Token decimals (default: 0)", false, OptionDef.Type.LONG)
        .handler((opts, wrapper, formatter) -> {
          String symbol = opts.getString("symbol");
          TokenValidation.requireValidSymbol(symbol);
          byte[] addr = opts.getAddress("address");
          int decimals = opts.has("decimals") ? opts.getInt("decimals") : 0;
          String network = currentNetwork();
          File f = userFile(network);
          List<TokenEntry> existing = new ArrayList<>(
              TokenStoreLoader.loadUserFile(f).listAll());
          existing.removeIf(e -> e.getSymbol().equalsIgnoreCase(symbol));
          existing.add(new TokenEntry(symbol, addr, decimals, "user"));
          TokenStoreLoader.writeUserFile(f, existing);
          Map<String, Object> data = new LinkedHashMap<>();
          data.put("symbol", symbol.toUpperCase(Locale.ROOT));
          data.put("address", WalletApi.encode58Check(addr));
          data.put("decimals", decimals);
          data.put("network", network);
          formatter.success("Added token alias " + symbol.toUpperCase(Locale.ROOT)
              + " on network " + network, data);
        })
        .build();
  }

  private static CommandDefinition buildRemove() {
    return CommandDefinition.builder("token-remove")
        .description("Remove a TRC20 token alias from the user token list")
        .option("symbol", "Token symbol", true)
        .handler((opts, wrapper, formatter) -> {
          String symbol = opts.getString("symbol");
          String network = currentNetwork();
          File f = userFile(network);
          List<TokenEntry> existing = new ArrayList<>(
              TokenStoreLoader.loadUserFile(f).listAll());
          int before = existing.size();
          existing.removeIf(e -> e.getSymbol().equalsIgnoreCase(symbol));
          if (existing.size() == before) {
            // not in user file — but might be builtin
            TokenStore builtin = TokenStoreLoader.loadBuiltin(network);
            if (builtin.find(symbol) != null) {
              formatter.error("builtin_token",
                  "cannot remove built-in token: " + symbol.toUpperCase(Locale.ROOT));
              return;
            }
            formatter.error("not_found",
                "no user-defined token with symbol: " + symbol);
            return;
          }
          TokenStoreLoader.writeUserFile(f, existing);
          Map<String, Object> data = new LinkedHashMap<>();
          data.put("symbol", symbol.toUpperCase(Locale.ROOT));
          data.put("network", network);
          formatter.success("Removed token alias " + symbol.toUpperCase(Locale.ROOT), data);
        })
        .build();
  }

  private static CommandDefinition buildResolve() {
    return CommandDefinition.builder("token-resolve")
        .description("Resolve an input string to a TRON address")
        .option("input", "Symbol or address to resolve", true)
        .handler((opts, wrapper, formatter) -> {
          String network = currentNetwork();
          TokenResolver resolver = new TokenResolver(
              TokenStoreLoader.loadLayered(network, userFile(network)));
          ResolutionResult r = resolver.resolve("input", opts.getString("input"));
          Map<String, Object> data = new LinkedHashMap<>();
          data.put("input", r.getInput());
          data.put("address", WalletApi.encode58Check(r.getAddress()));
          if (r.getSymbol() != null) data.put("symbol", r.getSymbol());
          data.put("source", r.getSource());
          data.put("network", network);
          formatter.success(WalletApi.encode58Check(r.getAddress()), data);
        })
        .build();
  }
}
```

> The exact `CommandDefinition.builder(...).handler(...)` signature must match the existing pattern used in `WalletCommands.java` etc. Read one of those before writing this file and adjust handler parameter order if needed (`(opts, wrapper, formatter)` matches the CLAUDE.md description — verify).

- [ ] **Step 2: Set the system property `tron.cli.network` from `StandardCliRunner`**

This is how `TokenCommands` learns the network without invasive plumbing. Near where `globalOpts.getNetwork()` is read in Task 8:

```java
if (network != null) {
    System.setProperty("tron.cli.network", network.toLowerCase(java.util.Locale.ROOT));
} else {
    System.clearProperty("tron.cli.network");
}
```

(This is acceptable because `StandardCliRunner` is single-threaded per JVM invocation. If the project uses a long-lived JVM that runs multiple commands, replace with a `ThreadLocal` field on `StandardCliRunner`.)

- [ ] **Step 3: Register the new commands in `Client.java`**

After the existing registrations (around `Client.java:4824`):

```java
org.tron.walletcli.cli.commands.TokenCommands.register(registry);
```

- [ ] **Step 4: Smoke-test with the fat jar**

```bash
./gradlew shadowJar
java -jar build/libs/wallet-cli.jar --network nile token-list
java -jar build/libs/wallet-cli.jar --network nile token-add --symbol FOO --address TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --decimals 6
java -jar build/libs/wallet-cli.jar --network nile token-list --source user
java -jar build/libs/wallet-cli.jar --output json --network nile token-resolve --input FOO
java -jar build/libs/wallet-cli.jar --network nile token-remove --symbol FOO
```

Expected: each command exits 0; the JSON `token-resolve` output contains `"symbol":"FOO"` and `"source":"user"`.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/org/tron/walletcli/cli/commands/TokenCommands.java \
        src/main/java/org/tron/walletcli/Client.java \
        src/main/java/org/tron/walletcli/cli/StandardCliRunner.java
git commit -m "feat(cli): add token-list/add/remove/resolve commands"
```

---

## Task 12: End-to-end test of `trigger-constant-contract --contract USDT`

**Files:**
- Test: `src/test/java/org/tron/walletcli/cli/commands/ContractCommandsTokenAliasTest.java`

This test exercises the full parse path without calling gRPC. We construct a `ParsedOptions` with the resolver and verify that `getContractAddress("contract")` returns the built-in USDT mainnet address.

- [ ] **Step 1: Write the test**

```java
package org.tron.walletcli.cli.commands;

import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.Test;
import org.tron.walletcli.cli.ParsedOptions;
import org.tron.walletcli.cli.tokens.TokenResolver;
import org.tron.walletcli.cli.tokens.TokenStoreLoader;
import org.tron.walletserver.WalletApi;
import static org.junit.Assert.*;

public class ContractCommandsTokenAliasTest {

  @Test public void mainnetUSDTSymbolResolvesToCanonicalAddress() {
    TokenResolver resolver = new TokenResolver(
        TokenStoreLoader.loadLayered("mainnet", new java.io.File("/tmp/no-such-file.json")));
    Map<String, String> values = new LinkedHashMap<>();
    values.put("contract", "USDT");
    ParsedOptions opts = new ParsedOptions(values, resolver);
    byte[] resolved = opts.getContractAddress("contract");
    assertEquals("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
        WalletApi.encode58Check(resolved));
    assertEquals(1, opts.getResolutionLog().size());
  }
}
```

- [ ] **Step 2: Run**

Run: `./gradlew test --tests "org.tron.walletcli.cli.commands.ContractCommandsTokenAliasTest"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/test/java/org/tron/walletcli/cli/commands/ContractCommandsTokenAliasTest.java
git commit -m "test(contracts): verify USDT symbol resolves on mainnet"
```

---

## Task 13: Update standard-cli contract spec

**Files:**
- Modify: `docs/standard-cli-contract-spec.md`

- [ ] **Step 1: Append a new section**

Insert at the end of the spec (before any "Future work" section if present):

```markdown
## Token Alias Resolution

The standard CLI accepts TRC20 token symbols anywhere a `--contract` value is required.
Resolution order for `--contract <value>`:

1. Try Base58Check decode of `<value>`.
2. Try hex decode (`0x` or `41` prefix, 40 hex chars).
3. Look up `<value>` (case-insensitive) in the user token file
   `Wallet/tokens/<network>.json`.
4. Look up in the built-in token list bundled with the CLI.
5. Fail with `--contract value "<v>" is neither a valid TRON address nor a known token symbol`.

Other address-bearing options (`--to`, `--from`, `--owner`, `--receiver`, `--address`)
do **not** consult the token table in this version. They keep their existing
Base58/hex-only contract.

When an alias resolves, the CLI emits an audit record:
- **Text mode (not quiet):** one stderr line per resolution —
  `Resolved --contract "USDT" → TR7NHqj... (source=builtin, symbol=USDT)`.
- **JSON mode:** the success envelope gains a `meta.resolved` array with one entry
  per resolved alias. The `data` field is unchanged.

User-defined tokens shadow built-in entries with the same symbol. Symbols are
case-insensitive; reserved words (`me`, `self`, `mainnet`, `nile`, `shasta`, `trx`)
and any string that decodes as a TRON address cannot be registered.

Management commands: `token-list`, `token-add`, `token-remove`, `token-resolve`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/standard-cli-contract-spec.md
git commit -m "docs(spec): document token alias resolution contract"
```

---

## Task 14: QA parity script

**Files:**
- Create: `qa/commands/token_alias.sh`
- Modify: `qa/run.sh` (or whichever orchestrator file lists test scripts) — append the new script.

- [ ] **Step 1: Inspect the QA harness**

Run: `ls qa/commands/ && head -40 qa/run.sh`
Note conventions used by an existing simple script (e.g. how `JAR`, `NETWORK`, `MASTER_PASSWORD` are referenced).

- [ ] **Step 2: Write `qa/commands/token_alias.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/../config.sh"

JAR="${JAR:-build/libs/wallet-cli.jar}"
NETWORK="${NETWORK:-nile}"

run() { java -jar "$JAR" --network "$NETWORK" "$@"; }
runj() { java -jar "$JAR" --output json --network "$NETWORK" "$@"; }

echo "[token-alias] token-list (built-in nile contains nothing problematic)"
run token-list >/dev/null

echo "[token-alias] token-add then token-list --source user contains FOO"
run token-add --symbol FOO \
    --address TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --decimals 6 >/dev/null
run token-list --source user | grep -q '^FOO ' \
  || { echo "FAIL: FOO not in user list"; exit 1; }

echo "[token-alias] token-resolve FOO -> address + source=user (JSON)"
out=$(runj token-resolve --input FOO)
echo "$out" | grep -q '"symbol":"FOO"' || { echo "FAIL: missing symbol"; exit 1; }
echo "$out" | grep -q '"source":"user"' || { echo "FAIL: source!=user"; exit 1; }

echo "[token-alias] trigger-constant-contract with --contract FOO emits meta.resolved"
out=$(runj trigger-constant-contract --contract FOO --method "name()" \
        --owner TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t || true)
echo "$out" | grep -q '"meta"' || { echo "FAIL: expected meta.resolved in JSON"; exit 1; }
echo "$out" | grep -q '"option":"contract"' || { echo "FAIL: missing option=contract in meta"; exit 1; }

echo "[token-alias] cleanup"
run token-remove --symbol FOO >/dev/null

echo "[token-alias] PASS"
```

- [ ] **Step 3: Append to `qa/run.sh`**

Add the new script alongside the existing entries (mirror whatever pattern is used — typically a `bash qa/commands/<name>.sh` line in a list).

- [ ] **Step 4: Run locally**

```bash
./gradlew shadowJar
TRON_TEST_PRIVATE_KEY=<your-nile-key> bash qa/run.sh verify
```

Expected: full QA passes including the new script.

- [ ] **Step 5: Commit**

```bash
git add qa/commands/token_alias.sh qa/run.sh
git commit -m "qa: parity tests for TRC20 token alias"
```

---

## Self-Review Notes

- **Spec coverage:** built-in list (T1), data layer (T2-T6), CLI plumbing (T7-T8), command surface (T9, T11), audit output (T10), spec doc (T13), parity tests (T12, T14). Every spec promise has a task.
- **Type consistency:** `TokenEntry` constructor `(symbol, address, decimals, source)` is used identically in T2, T5, T11, T12. `ResolutionResult` `(option, input, address, symbol, source)` matches across T6, T7, T10, T11. `TokenStore.find` returns nullable `TokenEntry` consistently. `TokenStoreLoader.loadLayered(network, userFile)` signature is uniform.
- **Placeholder check:** every step that changes code shows the code; commit messages are written; expected test counts are stated. The two adapt-to-existing-code spots (T8 step 1, T10 step 1) are scoped to "read this file first then make the change shown" and the diff content is provided.
- **Out of scope reminders:** TRC10, address-book wallet aliases, decimals-aware amount, and `--params`/`--library` ABI parsing are explicitly excluded.
