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
    expect(hasCommand(["--network", "nile"])).toBe(false);
    expect(hasCommand(["--verbose"])).toBe(false);
  });
  it("is true once a real command word is present", () => {
    expect(hasCommand(["list"])).toBe(true);
    expect(hasCommand(["--output", "json", "account", "balance"])).toBe(true);
    expect(hasCommand(["--network=nile", "block"])).toBe(true);
  });
});

describe("parseGlobals", () => {
  it("parses value flags, inline =, and short -o alias", () => {
    const { globals } = parseGlobals(["--network", "nile", "--output=json", "tron", "account", "balance"]);
    expect(globals.network).toBe("nile");
    expect(globals.output).toBe("json");
  });

  it("drops an invalid --timeout to undefined (falls back to config) instead of NaN", () => {
    expect(parseGlobals(["--timeout", "abc"]).globals.timeoutMs).toBeUndefined();
    expect(parseGlobals(["--timeout", "-5"]).globals.timeoutMs).toBeUndefined();
    expect(parseGlobals(["--timeout", "2000"]).globals.timeoutMs).toBe(2000);
  });

  it("leaves an invalid --output undefined (yargs choices reports it) rather than silently 'text'", () => {
    expect(parseGlobals(["--output", "xml"]).globals.output).toBeUndefined();
    expect(parseGlobals(["--output", "json"]).globals.output).toBe("json");
  });

  it("maps --<kind>-stdin to a '-' path (the only secret source)", () => {
    const { secretPaths } = parseGlobals(["import", "mnemonic", "--mnemonic-stdin"]);
    expect(secretPaths.mnemonic).toBe("-");
    expect(secretPaths.password).toBeUndefined();
    expect(secretPaths.privateKey).toBeUndefined();
  });

  it("ignores a value flag with no following token at end of argv", () => {
    expect(() => parseGlobals(["--network"])).not.toThrow();
    expect(parseGlobals(["--network"]).globals.network).toBeUndefined();
  });
});
