import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { main } from "./runner.js";

// Wraps the real readFileSync so a test can observe (and, for fd 0 only, control) its calls —
// vitest cannot vi.spyOn an ESM module's own export at runtime, so the mock has to be declared
// here instead. Every call other than fd 0 falls straight through to the real implementation.
let stdinReply: string | undefined;
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: vi.fn((...args: Parameters<typeof actual.readFileSync>) =>
      args[0] === 0 && stdinReply !== undefined ? stdinReply : actual.readFileSync(...args),
    ),
  };
});
import { parseGlobals, hasCommand } from "./argv.js";
import { FAMILY_REGISTRY } from "./family-registry.js";
import { CHAIN_FAMILIES } from "../domain/family/index.js";
import { familyMap } from "./family-registry.js";
import { ChainGatewayRegistry } from "../adapters/outbound/chain/tron/provider.js";
import { EvmRpcClient } from "../adapters/outbound/chain/evm/evm.js";

describe("FAMILY_REGISTRY (composition manifest)", () => {
  it("registers every family for sign/rpc resolution + the user command surface", () => {
    expect(FAMILY_REGISTRY.map((d) => d.meta.family)).toEqual(["tron", "evm"]);
  });

  // familyMap() casts its Object.fromEntries result to a TOTAL Record<ChainFamily, T>, so a
  // family present in the type union but missing a plugin type-checks fine and then hands out
  // `undefined` at runtime — SoftwareSigner would fail with a bare TypeError on the strategy.
  // tsc cannot catch this; these two assertions are the only thing that can.
  it("leaves no family without a plugin", () => {
    const registered = new Set(FAMILY_REGISTRY.map((d) => d.meta.family));
    expect([...CHAIN_FAMILIES].filter((f) => !registered.has(f))).toEqual([]);
  });

  it.each(["signStrategy", "createGateway"] as const)("gives every family a %s", (capability) => {
    for (const plugin of FAMILY_REGISTRY) {
      expect(plugin[capability], `${plugin.meta.family} is missing ${capability}`).toBeDefined();
    }
  });
});

describe("hasCommand (bare invocation → root help)", () => {
  it("is false for no tokens and for global-flags-only invocations", () => {
    expect(hasCommand([])).toBe(false);
    expect(hasCommand(["--output", "json"])).toBe(false); // value flag consumes 'json'
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
      // 0ms = instant-abort, not a usable bound
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

  // BUG-V413-019: stdin (fd 0) can serve only one secret per run. `stdinFlags` names every
  // distinct `--*-stdin` flag seen so the caller (runner.ts) can reject a combination BEFORE
  // any secret is read, rather than discovering it later as secret_source_error.
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

// BUG-V413-019: two `--*-stdin` flags used to surface only when the second secret read found
// stdin already consumed by the first (secret_source_error, exit 1) — a read failure, reported
// after work had already started. It is really a FLAG COMBINATION mistake, catchable from argv
// alone, so it must be invalid_option/exit 2 and caught before any secret is read.
describe("main() rejects more than one --*-stdin flag (BUG-V413-019)", () => {
  async function runIsolated(tokens: string[], stdinData?: string) {
    const root = mkdtempSync(join(tmpdir(), "wcli-stdin-"));
    const previous = process.env.WALLET_CLI_HOME;
    process.env.WALLET_CLI_HOME = root;
    const stdout: string[] = [];
    const outSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    stdinReply = stdinData;
    vi.mocked(readFileSync).mockClear();
    try {
      const code = await main(["node", "wallet-cli", ...tokens]);
      const stdinReads = vi.mocked(readFileSync).mock.calls.filter((args) => args[0] === 0);
      return { code, stdout: stdout.join(""), stdinReads };
    } finally {
      outSpy.mockRestore();
      errSpy.mockRestore();
      stdinReply = undefined;
      if (previous === undefined) delete process.env.WALLET_CLI_HOME;
      else process.env.WALLET_CLI_HOME = previous;
    }
  }

  it("two --*-stdin flags: invalid_option, exit 2, and stdin is never read", async () => {
    const { code, stdout, stdinReads } = await runIsolated([
      "message",
      "sign",
      "--message-stdin",
      "--password-stdin",
      "-o",
      "json",
    ]);
    expect(code).toBe(2);
    expect(JSON.parse(stdout)).toMatchObject({
      success: false,
      error: { code: "invalid_option" },
    });
    expect(stdinReads).toEqual([]);
  });

  it("a single --*-stdin flag is unaffected: it reaches command logic normally", async () => {
    const { code, stdout } = await runIsolated(
      ["message", "sign", "--message-stdin", "-o", "json"],
      "hello world",
    );
    // No account exists in this fresh, isolated wallet dir — a later, unrelated failure that
    // proves the run was NOT stopped by the two-flag check above (which would have reported
    // invalid_option instead, before command logic runs at all).
    expect(JSON.parse(stdout)).toMatchObject({
      success: false,
      error: { code: "missing_wallet_address" },
    });
    expect(code).toBe(1);
  });
});

// composeCliRuntime runs before the formatter exists, so a broken config.yaml used to escape main()
// entirely and land on the last-resort `fatal:` guard in index.ts — no envelope, exit 1 for what is
// a UsageError. A malformed document is the trigger here because, unlike the 0600 check, it is not
// skipped on Windows.
describe("bootstrap error boundary", () => {
  async function runWithConfig(yaml: string, tokens: string[]) {
    const root = mkdtempSync(join(tmpdir(), "wcli-boot-"));
    writeFileSync(join(root, "config.yaml"), yaml);
    const previous = process.env.WALLET_CLI_HOME;
    process.env.WALLET_CLI_HOME = root;
    const stdout: string[] = [];
    const stderr: string[] = [];
    const outSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });
    try {
      const code = await main(["node", "wallet-cli", ...tokens]);
      return { code, stdout: stdout.join(""), stderr: stderr.join("") };
    } finally {
      outSpy.mockRestore();
      errSpy.mockRestore();
      if (previous === undefined) delete process.env.WALLET_CLI_HOME;
      else process.env.WALLET_CLI_HOME = previous;
    }
  }

  const BROKEN = [
    'gasfreeApiSecret: "SUPERSECRET123"',
    'defaultNetwork: "unterminated',
    "  bad: [1,2",
    "",
  ].join("\n");

  it("emits a v1 error envelope and the UsageError exit code, even for --help", async () => {
    const { code, stdout } = await runWithConfig(BROKEN, ["-o", "json", "--help"]);

    expect(code).toBe(2);
    expect(JSON.parse(stdout)).toMatchObject({
      schema: "wallet-cli.result.v1",
      success: false,
      error: { code: "invalid_config" },
    });
  });

  it("never leaks the offending file content into either stream", async () => {
    const { stdout, stderr } = await runWithConfig(BROKEN, ["-o", "json", "account", "balance"]);

    expect(stdout + stderr).not.toContain("SUPERSECRET123");
    expect(stdout + stderr).not.toContain("bad: [1,2");
  });

  it("falls back to text when no explicit -o was given (the config default is unreadable)", async () => {
    const { code, stderr } = await runWithConfig(BROKEN, ["account", "balance"]);

    expect(code).toBe(2);
    expect(stderr).toMatch(/invalid_config/);
  });
});

// The registry guard above proves a factory EXISTS; this proves the factory, the descriptor and
// the gateway registry actually line up — that `--network sepolia` would reach a live client.
describe("composition resolves a gateway per family", () => {
  const gateways = () =>
    new ChainGatewayRegistry(
      familyMap((p) => p.createGateway),
      5_000,
    );
  const sepolia = {
    id: "eip155:11155111",
    family: "evm" as const,
    nativeSymbol: "ETH",
    chainId: "11155111",
    httpEndpoint: "https://sepolia.example",
    capabilities: [],
  };

  it("builds an EVM JSON-RPC client for an evm network", () => {
    expect(gateways().get(sepolia, "evm")).toBeInstanceOf(EvmRpcClient);
  });

  it("refuses to hand an evm network out as a tron gateway", () => {
    expect(() => gateways().get(sepolia, "tron")).toThrow(/family mismatch/);
  });
});
