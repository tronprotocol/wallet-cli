import { describe, it, expect } from "vitest";
import {
  commandPathOf,
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
    for (const raw of ["abc", "-5", "1.5", "", "1e3", "0x10", " 5", "2147483648"]) {
      const { globals, invalid } = parseGlobals(["--timeout", raw]);
      expect(globals.timeoutMs).toBeUndefined();
      expect(invalid).toEqual([
        { flag: "--timeout", value: raw, reason: "must be an integer from 0 to 2147483647" },
      ]);
    }
    for (const [raw, value] of [
      ["0", 0],
      ["1", 1],
      ["2000", 2000],
      ["2147483647", 2147483647],
    ] as const) {
      const ok = parseGlobals(["--timeout", raw]);
      expect(ok.globals.timeoutMs).toBe(value);
      expect(ok.invalid).toEqual([]);
    }
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

describe("parseGlobals wait intent", () => {
  it.each([
    [[], undefined],
    [["--wait"], true],
    [["--no-wait"], false],
    [["--wait", "--wait"], true],
    [["--no-wait", "tx", "send", "--no-wait"], false],
  ])("%j → wait %s", (tokens, wait) => {
    const parsed = parseGlobals(tokens);
    expect(parsed.globals.wait).toBe(wait);
    expect(parsed.intentError).toBeUndefined();
  });

  it.each([
    ["--wait=true"],
    ["--wait=false"],
    ["--wait=0"],
    ["--wait="],
    ["--no-wait=true"],
    ["--no-wait=false"],
    ["--no-wait="],
    ["--wait", "false"],
    ["--wait", "true"],
    ["--no-wait", "false"],
    ["--no-wait", "true"],
    ["--wait", "--no-wait"],
    ["--no-wait", "--wait"],
    ["--wait", "--wait", "--no-wait"],
  ])("refuses %j as invalid_option, before or after the command", (...flags) => {
    for (const tokens of [
      [...flags, "tx", "send"],
      ["tx", "send", ...flags],
    ]) {
      expect(parseGlobals(tokens).intentError).toMatchObject({ code: "invalid_option" });
    }
  });

  it("treats --no-wait as a global flag when locating the command path", () => {
    expect(
      commandPathOf(["--no-wait", "tx", "send", "--to", "x"], (p) => p.join(" ") === "tx send"),
    ).toEqual(["tx", "send"]);
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

describe("commandPathOf", () => {
  const known = new Set(["tx", "tx.send", "x402.pay", "list"]);
  const isCommand = (path: string[]) => known.has(path.join("."));

  it("finds the longest registered path, skipping global flags and their values", () => {
    expect(
      commandPathOf(
        ["--network", "nile", "--password-stdin", "tx", "send", "--to", "T"],
        isCommand,
      ),
    ).toEqual(["tx", "send"]);
    expect(commandPathOf(["-o=json", "x402", "pay", "https://x.test"], isCommand)).toEqual([
      "x402",
      "pay",
    ]);
  });

  it("stops at the first command flag", () => {
    expect(commandPathOf(["tx", "--to", "T", "send"], isCommand)).toEqual(["tx"]);
  });

  it("is undefined when argv names no command", () => {
    expect(commandPathOf(["--password-stdin", "nope"], isCommand)).toBeUndefined();
    expect(commandPathOf([], isCommand)).toBeUndefined();
  });
});
