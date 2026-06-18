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

  it("maps --<kind>-stdin to a '-' path and --<kind>-file to its path", () => {
    const g = parseGlobals(["wallet", "import-mnemonic", "--mnemonic-stdin", "--password-file", "/dev/fd/63"]);
    expect(g.secretPaths.mnemonic).toBe("-");
    expect(g.secretPaths.password).toBe("/dev/fd/63");
    expect(g.secretPaths.privateKey).toBeUndefined();
  });

  it("ignores a value flag with no following token at end of argv", () => {
    expect(() => parseGlobals(["--network"])).not.toThrow();
    expect(parseGlobals(["--network"]).network).toBeUndefined();
  });
});
