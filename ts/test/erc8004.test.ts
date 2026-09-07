import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Interface } from "ethers";
import { Keystore } from "../src/adapters/outbound/keystore/index.js";
import { AtomicFileStore } from "../src/adapters/outbound/persistence/fs/index.js";
import { DETACHED } from "./detached.js";

const abi = new Interface([
  "function register(string)",
  "function approve(address,uint256)",
  "function ownerOf(uint256) view returns(address)",
  "function tokenURI(uint256) view returns(string)",
  "function getApproved(uint256) view returns(address)",
  "function isApprovedForAll(address,address) view returns(bool)",
]);
const owner = "0x1111111111111111111111111111111111111111";
const homes: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0))
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});
async function fixture(family: "evm" | "tron") {
  const calls: Array<{ path: string; header: string | string[] | undefined; method: string }> = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const rpc = JSON.parse(body);
    if (family === "evm" && rpc.method !== "eth_call") {
      calls.push({ path: req.url!, header: req.headers["x-test-api-key"], method: rpc.method });
      const results: Record<string, unknown> = {
        eth_getTransactionCount: "0x7",
        eth_gasPrice: "0x3b9aca00",
        eth_maxPriorityFeePerGas: "0x1",
        eth_estimateGas: "0x186a0",
        eth_getBlockByNumber: { number: "0x1", transactions: [], gasLimit: "0x1c9c380" },
      };
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: results[rpc.method] ?? null }));
      return;
    }
    const selector =
      family === "evm" ? String(rpc.params[0].data).slice(0, 10) : rpc.function_selector;
    const fn = abi.getFunction(selector)!;
    calls.push({ path: req.url!, header: req.headers["x-test-api-key"], method: fn.name });
    const value =
      fn.name === "tokenURI"
        ? "data:application/json;base64,eyJuYW1lIjoiRXhhbXBsZSJ9"
        : fn.name === "isApprovedForAll"
          ? true
          : owner;
    const encoded = abi.encodeFunctionResult(fn, [value]);
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify(
        family === "evm"
          ? { jsonrpc: "2.0", id: rpc.id, result: encoded }
          : { result: { result: true }, constant_result: [encoded.slice(2)] },
      ),
    );
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing test listener");
  const home = mkdtempSync(join(tmpdir(), "wallet-8004-test-"));
  homes.push(home);
  const network = family === "evm" ? "eip155:97" : "tron:3448148188";
  writeFileSync(
    join(home, "config.yaml"),
    JSON.stringify({
      networks: {
        [network]: {
          httpEndpoint: `http://127.0.0.1:${address.port}`,
          apiKeyHeader: "X-Test-Api-Key",
          apiKey: "test-only-key",
        },
      },
    }),
    { mode: 0o600 },
  );
  const run = (args: string[]) =>
    new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          ...(process.env.WALLET_CLI_TEST_ENTRY
            ? [process.env.WALLET_CLI_TEST_ENTRY]
            : ["--import", "tsx", join(process.cwd(), "src/index.ts")]),
          "8004",
          ...args,
          "--network",
          network,
          "--output",
          "json",
        ],
        {
          ...DETACHED,
          env: { ...process.env, WALLET_CLI_HOME: home },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let stdout = "",
        stderr = "";
      const timer = setTimeout(() => child.kill("SIGKILL"), 25000);
      child.stdout.on("data", (b) => (stdout += b));
      child.stderr.on("data", (b) => (stderr += b));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
    });
  const watch = () =>
    new Keystore(home, new AtomicFileStore(), () => {
      throw new Error("watch needs no key");
    }).registerWatch({ family, address: owner, label: "observer" });
  return { run, calls, network, watch };
}

describe("8004 CLI with published SDK and wallet RPC transport", () => {
  for (const family of ["evm", "tron"] as const) {
    it(`${family} show preserves scoped IDs, configured RPC credentials and data metadata`, async () => {
      const f = await fixture(family);
      const r = await f.run(["show", `${f.network}:9007199254740993`]);
      expect(r.code, r.stderr || r.stdout).toBe(0);
      const result = JSON.parse(r.stdout);
      expect(result.data).toMatchObject({
        agentId: "9007199254740993",
        metadata: { name: "Example" },
      });
      expect(f.calls.map((c) => c.method).sort()).toEqual(["getApproved", "ownerOf", "tokenURI"]);
      expect(f.calls.every((c) => c.header === "test-only-key")).toBe(true);
    });
  }
  it("operator-check requires neither a wallet nor an Agent ID", async () => {
    const f = await fixture("evm");
    const r = await f.run(["operator-check", owner, owner]);
    expect(r.code, r.stderr || r.stdout).toBe(0);
    expect(JSON.parse(r.stdout).data).toMatchObject({ approved: true, owner, operator: owner });
  });
  it("rejects an Agent ID from another network without making RPC calls", async () => {
    const f = await fixture("evm");
    const r = await f.run(["show", "eip155:56:42"]);
    expect(r.code).not.toBe(0);
    expect(f.calls).toHaveLength(0);
  });
});

for (const mode of ["dry-run", "build-only"] as const) {
  it(`EVM register ${mode} constructs a transaction with a watch account and no broadcast`, async () => {
    const f = await fixture("evm");
    f.watch();
    const r = await f.run(["register", "ipfs://example", "--account", "observer", `--${mode}`]);
    expect(r.code, r.stderr || r.stdout).toBe(0);
    const result = JSON.parse(r.stdout).data;
    expect(result.mode).toBe(mode);
    expect(abi.parseTransaction({ data: result.tx.data })?.args[0]).toBe("ipfs://example");
    expect(result.tx.chainId).toBe(97);
    expect(f.calls.some((c) => c.method === "eth_sendRawTransaction")).toBe(false);
  });
}
it("EVM approve dry-run renders the Agent ID without any fungible-token read", async () => {
  const f = await fixture("evm");
  f.watch();
  const r = await f.run([
    "approve",
    "9007199254740993",
    owner,
    "--account",
    "observer",
    "--dry-run",
  ]);
  expect(r.code, r.stderr || r.stdout).toBe(0);
  expect(JSON.parse(r.stdout).data).toMatchObject({
    mode: "dry-run",
    agentId: "9007199254740993",
    operator: owner,
  });
  expect(JSON.parse(r.stdout).data).not.toHaveProperty("allowance");
  expect(
    f.calls.some((c) => ["decimals", "symbol", "eth_sendRawTransaction"].includes(c.method)),
  ).toBe(false);
});
