import { describe, it, expect } from "vitest";
import { parseGlobals, hasCommand } from "./argv.js";
import { FAMILY_REGISTRY } from "./family-registry.js";

describe("FAMILY_REGISTRY (composition manifest)", () => {
  it("registers the tron family for sign/rpc resolution + the user command surface", () => {
    expect(FAMILY_REGISTRY.map((d) => d.meta.family)).toEqual(["tron"]);
  });
});

describe("hasCommand (bare invocation → root help)", () => {
  it("is false for no tokens and for global-flags-only invocations", () => {
    expect(hasCommand([])).toBe(false);
    expect(hasCommand(["--output", "json"])).toBe(false); // value flag consumes 'json'
    expect(hasCommand(["-o", "json"])).toBe(false);
    expect(hasCommand(["--network", "tron:nile"])).toBe(false);
    expect(hasCommand(["--verbose"])).toBe(false);
  });
  it("is true once a real command word is present", () => {
    expect(hasCommand(["list"])).toBe(true);
    expect(hasCommand(["--output", "json", "account", "balance"])).toBe(true);
    expect(hasCommand(["--network=tron:nile", "block"])).toBe(true);
  });
});

describe("parseGlobals", () => {
  it("parses value flags, inline =, and short -o alias", () => {
    const { globals } = parseGlobals(["--network", "tron:nile", "--output=json", "tron", "account", "balance"]);
    expect(globals.network).toBe("tron:nile");
    expect(globals.output).toBe("json");
  });

  it("rejects an invalid --timeout as invalid (never falls back to the default)", () => {
    for (const raw of ["abc", "-5", "0"]) { // 0ms = instant-abort, not a usable bound
      const { globals, invalid } = parseGlobals(["--timeout", raw]);
      expect(globals.timeoutMs).toBeUndefined();
      expect(invalid).toEqual([{ flag: "--timeout", value: raw, reason: "must be a number >= 1" }]);
    }
    const ok = parseGlobals(["--timeout", "2000"]);
    expect(ok.globals.timeoutMs).toBe(2000);
    expect(ok.invalid).toEqual([]);
  });

  it("accepts --wait-timeout 0 (poll cap of 0 = give up after one poll)", () => {
    const { globals, invalid } = parseGlobals(["--wait-timeout", "0"]);
    expect(globals.waitTimeoutMs).toBe(0);
    expect(invalid).toEqual([]);
  });

  it("rejects an invalid --output instead of silently defaulting to 'text'", () => {
    const bad = parseGlobals(["--output", "xml"]);
    expect(bad.globals.output).toBeUndefined();
    expect(bad.invalid).toEqual([{ flag: "--output", value: "xml", reason: "must be one of: text, json" }]);
    expect(parseGlobals(["--output", "json"]).globals.output).toBe("json");
  });

  it("maps --<kind>-stdin to a '-' path (the only secret source)", () => {
    const { secretPaths } = parseGlobals(["tx", "broadcast", "--tx-stdin"]);
    expect(secretPaths.tx).toBe("-");
    expect(secretPaths.password).toBeUndefined();
  });

  it("ignores a value flag with no following token at end of argv", () => {
    expect(() => parseGlobals(["--network"])).not.toThrow();
    expect(parseGlobals(["--network"]).globals.network).toBeUndefined();
  });
});
