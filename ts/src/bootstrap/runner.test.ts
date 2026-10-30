import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { main } from "./runner.js";

// Mock the module because ESM exports cannot be spied on directly.
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
import { FAMILY_REGISTRY } from "./family-registry.js";
import { CHAIN_FAMILIES } from "../domain/family/index.js";
import { familyMap } from "./family-registry.js";
import { ChainGatewayRegistry } from "../adapters/outbound/chain/tron/provider.js";
import { EvmRpcClient } from "../adapters/outbound/chain/evm/evm.js";

describe("FAMILY_REGISTRY (composition manifest)", () => {
  it("registers every family for sign/rpc resolution + the user command surface", () => {
    expect(FAMILY_REGISTRY.map((d) => d.meta.family)).toEqual(["tron", "evm"]);
  });

  // The total Record cast cannot detect a missing plugin at compile time.
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
    expect(JSON.parse(stdout)).toMatchObject({
      success: false,
      error: { code: "missing_wallet_address" },
    });
    expect(code).toBe(1);
  });
});

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
