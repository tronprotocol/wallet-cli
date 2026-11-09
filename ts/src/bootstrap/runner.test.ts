import { CommandDeadline, requestDispatchCheck } from "../application/services/command-deadline.js";
import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { main, runProcess } from "./runner.js";
import { CHAIN_FAMILIES } from "../domain/family/index.js";
import { FAMILY_REGISTRY, familyMap } from "./family-registry.js";
import { ChainGatewayRegistry } from "../adapters/outbound/chain/tron/provider.js";
import { EvmRpcClient } from "../adapters/outbound/chain/evm/evm.js";

const NO_CHECK = requestDispatchCheck(new CommandDeadline(0));

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
  async function runIsolated(tokens: string[], stdinData?: string | Readable) {
    const root = mkdtempSync(join(tmpdir(), "wcli-stdin-"));
    const previous = process.env.WALLET_CLI_HOME;
    process.env.WALLET_CLI_HOME = root;
    const stdout: string[] = [];
    const outSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const stdinSpy = vi
      .spyOn(process, "stdin", "get")
      .mockImplementation(
        () =>
          (stdinData instanceof Readable
            ? stdinData
            : Readable.from([Buffer.from(stdinData ?? "")])) as never,
      );
    try {
      const code = await main(["node", "wallet-cli", ...tokens]);
      return { code, stdout: stdout.join(""), stdinReads: stdinSpy.mock.calls };
    } finally {
      outSpy.mockRestore();
      errSpy.mockRestore();
      stdinSpy.mockRestore();
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

  it("names the command argv gave when the stdin read runs out of time", async () => {
    const stalled = new Readable({ read() {} });
    const { code, stdout } = await runIsolated(
      ["--timeout", "100", "message", "sign", "--message-stdin", "-o", "json"],
      stalled,
    );
    expect(JSON.parse(stdout)).toMatchObject({
      success: false,
      command: "message.sign",
      error: { code: "timeout" },
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
  const gateways = () => new ChainGatewayRegistry(familyMap((p) => p.createGateway));
  const sepolia = {
    id: "eip155:11155111",
    family: "evm" as const,
    nativeSymbol: "ETH",
    chainId: "11155111",
    httpEndpoint: "https://sepolia.example",
    capabilities: [],
  };

  it("builds an EVM JSON-RPC client for an evm network", () => {
    expect(gateways().get(sepolia, "evm", NO_CHECK)).toBeInstanceOf(EvmRpcClient);
  });

  it("refuses to hand an evm network out as a tron gateway", () => {
    expect(() => gateways().get(sepolia, "tron", NO_CHECK)).toThrow(/family mismatch/);
  });
});

describe("runProcess", () => {
  // A stream whose write callback fires only when the test releases it, like a slow pipe reader.
  function slowStream() {
    const callbacks: Array<() => void> = [];
    const listeners: string[] = [];
    return {
      callbacks,
      listeners,
      stream: {
        write: (_chunk: unknown, callback?: () => void) => {
          if (callback) callbacks.push(callback);
          return false;
        },
        on: (event: string) => listeners.push(event),
      } as unknown as NodeJS.WritableStream,
    };
  }

  it("ends the process only after stdout and stderr have taken everything written", async () => {
    const outSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stdout = slowStream();
    const stderr = slowStream();
    const exit = vi.fn();
    try {
      const done = runProcess(["node", "wallet-cli", "--version"], {
        stdout: stdout.stream,
        stderr: stderr.stream,
        exit,
      });
      await vi.waitFor(() => expect(stdout.callbacks).toHaveLength(1));
      expect(stdout.listeners).toContain("error");
      expect(exit).not.toHaveBeenCalled();
      stdout.callbacks[0]!();
      stderr.callbacks[0]!();
      await done;
      expect(exit).toHaveBeenCalledWith(0);
    } finally {
      outSpy.mockRestore();
    }
  });

  it("delivers a 2 MiB result through a real pipe before the process ends", async () => {
    const directory = mkdtempSync(join(tmpdir(), "wcli-pipe-"));
    const child = join(directory, "child.mts");
    const runner = fileURLToPath(new URL("./runner.ts", import.meta.url));
    // The result is written before runProcess, so only its stdout barrier keeps exit from cutting it.
    writeFileSync(
      child,
      `import { runProcess } from ${JSON.stringify(runner)};
process.stdout.write(JSON.stringify({ success: true, data: "x".repeat(2 * 1024 * 1024) }) + "\\n");
await runProcess(["node", "wallet-cli", "--version"]);
`,
    );
    const proc = spawn(process.execPath, ["--import", "tsx", child], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    const chunks: Buffer[] = [];
    proc.stdout.pause();
    // Read late, so the child exits while most of the result still waits in the pipe.
    setTimeout(() => proc.stdout.resume(), 300);
    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    const code = await new Promise<number | null>((resolve) => proc.on("close", resolve));
    const [result] = Buffer.concat(chunks).toString("utf8").split("\n");
    expect(code).toBe(0);
    expect(JSON.parse(result!).data).toHaveLength(2 * 1024 * 1024);
  }, 20_000);
});
