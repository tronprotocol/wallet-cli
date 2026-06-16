import { describe, it, expect } from "vitest";
import { parseGlobals } from "./index.js";

describe("parseGlobals", () => {
  it("parses value flags, inline =, and short -o alias", () => {
    const g = parseGlobals(["--network", "nile", "--output=json", "tron", "account", "balance"]);
    expect(g.network).toBe("nile");
    expect(g.output).toBe("json");
  });

  it("drops an invalid --timeout to undefined (falls back to config) instead of NaN", () => {
    expect(parseGlobals(["--timeout", "abc"]).timeout).toBeUndefined();
    expect(parseGlobals(["--timeout", "-5"]).timeout).toBeUndefined();
    expect(parseGlobals(["--timeout", "2000"]).timeout).toBe(2000);
  });

  it("leaves an invalid --output undefined (yargs choices reports it) rather than silently 'text'", () => {
    expect(parseGlobals(["--output", "xml"]).output).toBeUndefined();
    expect(parseGlobals(["--output", "json"]).output).toBe("json");
  });

  it("collects secret-bearing stdin flags", () => {
    const g = parseGlobals(["wallet", "import", "--type", "seed", "--mnemonic-stdin"]);
    expect(g.secretFlags.mnemonicStdin).toBe(true);
    expect(g.secretFlags.passwordStdin).toBeUndefined();
  });

  it("ignores a value flag with no following token at end of argv", () => {
    expect(() => parseGlobals(["--network"])).not.toThrow();
    expect(parseGlobals(["--network"]).network).toBeUndefined();
  });
});
