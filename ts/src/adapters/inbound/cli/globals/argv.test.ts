import { describe, it, expect } from "vitest";
import {
  commandTokens,
  hasCommand,
  invalidGlobalError,
  parseGlobals,
  stdinConflictError,
} from "./argv.js";

describe("hasCommand (bare invocation → root help)", () => {
  it("is false for no tokens and for global-flags-only invocations", () => {
    expect(hasCommand([])).toBe(false);
    expect(hasCommand(["--output", "json"])).toBe(false);
    expect(hasCommand(["-o", "json"])).toBe(false);
    expect(hasCommand(["--network", "tron:3448148188"])).toBe(false);
    expect(hasCommand(["--verbose"])).toBe(false);
  });
  it("is true once a real command word is present", () => {
    expect(hasCommand(["list"])).toBe(true);
    expect(hasCommand(["--output", "json", "account", "balance"])).toBe(true);
    expect(hasCommand(["--network=tron:3448148188", "block"])).toBe(true);
  });
});

describe("parseGlobals", () => {
  it("parses value flags, inline =, and short -o alias", () => {
    const { globals } = parseGlobals([
      "--network",
      "tron:3448148188",
      "--output=json",
      "tron",
      "account",
      "balance",
    ]);
    expect(globals.network).toBe("tron:3448148188");
    expect(globals.output).toBe("json");
  });

  it("rejects an invalid --timeout as invalid (never falls back to the default)", () => {
    for (const raw of ["abc", "-5", "0"]) {
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
    expect(bad.invalid).toEqual([
      { flag: "--output", value: "xml", reason: "must be one of: text, json" },
    ]);
    expect(parseGlobals(["--output", "json"]).globals.output).toBe("json");
  });

  it("maps --<kind>-stdin to a '-' path (the only secret source)", () => {
    const { secretPaths } = parseGlobals(["tx", "broadcast", "--tx-stdin"]);
    expect(secretPaths.tx).toBe("-");
    expect(secretPaths.password).toBeUndefined();
  });

  it("maps --api-key-stdin to the B.AI configuration secret channel", () => {
    const { secretPaths, stdinFlags } = parseGlobals(["config", "baiApiKey", "--api-key-stdin"]);
    expect(secretPaths.apiKey).toBe("-");
    expect(stdinFlags).toEqual(["--api-key-stdin"]);
  });

  it("collects every distinct --*-stdin flag seen, in order", () => {
    expect(
      parseGlobals(["message", "sign", "--message-stdin", "--password-stdin"]).stdinFlags,
    ).toEqual(["--message-stdin", "--password-stdin"]);
    expect(parseGlobals(["tx", "broadcast", "--tx-stdin"]).stdinFlags).toEqual(["--tx-stdin"]);
    expect(parseGlobals(["account", "balance"]).stdinFlags).toEqual([]);
  });

  it("does not double-count the same --*-stdin flag repeated", () => {
    expect(
      parseGlobals(["message", "sign", "--message-stdin", "--message-stdin"]).stdinFlags,
    ).toEqual(["--message-stdin"]);
  });

  it("ignores a value flag with no following token at end of argv", () => {
    expect(() => parseGlobals(["--network"])).not.toThrow();
    expect(parseGlobals(["--network"]).globals.network).toBeUndefined();
  });
});

describe("commandTokens", () => {
  it("drops the node binary and script path", () => {
    expect(commandTokens(["node", "wallet-cli", "list", "-o", "json"])).toEqual([
      "list",
      "-o",
      "json",
    ]);
  });
});

describe("stdinConflictError", () => {
  it("allows at most one stdin secret", () => {
    expect(stdinConflictError([])).toBeUndefined();
    expect(stdinConflictError(["--password-stdin"])).toBeUndefined();
  });

  it("names every competing stdin flag", () => {
    const error = stdinConflictError(["--message-stdin", "--password-stdin"]);
    expect(error?.code).toBe("invalid_option");
    expect(error?.message).toBe(
      "--message-stdin and --password-stdin cannot be combined: only one secret may be read from stdin per run",
    );
  });
});

describe("invalidGlobalError", () => {
  it("reports the first invalid global value", () => {
    expect(invalidGlobalError([])).toBeUndefined();
    const error = invalidGlobalError(parseGlobals(["--output", "xml", "--timeout", "0"]).invalid);
    expect(error?.code).toBe("invalid_value");
    expect(error?.message).toBe('invalid --output value "xml": must be one of: text, json');
  });
});
