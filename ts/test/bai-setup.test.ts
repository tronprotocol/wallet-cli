import { expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { Keystore } from "../src/adapters/outbound/keystore/index.js";
import { AtomicFileStore } from "../src/adapters/outbound/persistence/fs/index.js";
import { DETACHED } from "./detached.js";

it("configures a key once, reuses setup across processes and rejects an unconfirmed wallet", () => {
  const home = mkdtempSync(join(tmpdir(), "bai-setup-cli-"));
  try {
    const keystore = new Keystore(home, new AtomicFileStore(), () => {
      throw new Error("no decrypt");
    });
    keystore.registerWatch({
      family: "evm",
      address: "0x1111111111111111111111111111111111111111",
      label: "payer",
    });
    keystore.registerWatch({
      family: "evm",
      address: "0x2222222222222222222222222222222222222222",
      label: "other",
    });
    const loader = join(home, "test-http.mjs");
    writeFileSync(
      loader,
      `import {appendFileSync} from 'node:fs';
      globalThis.fetch = async (url, init) => {
        if (init.headers.Authorization !== 'Bearer test-key') return new Response('{}', {status: 401});
        if (String(url).includes('/wallet.isRechargeBound?')) {
          appendFileSync(process.env.WALLET_CLI_HOME + '/calls.txt', 'binding\\n');
          return new Response(JSON.stringify({result:{data:{json:true}}}));
        }
        throw new Error('Recipient API intentionally unavailable in setup test');
      };`,
    );
    const run = (args: string[], input?: string, account = "payer") =>
      spawnSync(
        process.execPath,
        [
          "--import",
          pathToFileURL(loader).href,
          "--import",
          "tsx",
          join(process.cwd(), "src/index.ts"),
          ...args,
          "--network",
          "bsc",
          "--account",
          account,
          "--output",
          "json",
        ],
        {
          ...DETACHED,
          env: { ...process.env, WALLET_CLI_HOME: home },
          input,
          encoding: "utf8",
          timeout: 20000,
        },
      );
    const first = run(["config", "baiApiKey", "--api-key-stdin"], "test-key\n");
    expect(first.status, first.stderr || first.stdout).toBe(0);
    expect(first.stdout).not.toContain("test-key");
    const again = run(["config", "baiApiKey", "--api-key-stdin"], "test-key\n");
    expect(again.status, again.stderr || again.stdout).toBe(0);
    expect(readFileSync(join(home, "calls.txt"), "utf8")).toBe("binding\n");
    // This test's target API stub rejects requests, before payment and after local setup.
    const recharge = run(["bai", "recharge", "10", "--to", "recipient@example.com"]);
    expect(recharge.status).not.toBe(0);
    expect(recharge.stdout + recharge.stderr).toContain("provider_error");
    expect(readFileSync(join(home, "calls.txt"), "utf8")).toBe("binding\n");
    const other = run(
      ["bai", "recharge", "10", "--to", "recipient@example.com"],
      undefined,
      "other",
    );
    expect(other.status).not.toBe(0);
    expect(other.stdout + other.stderr).toContain("Confirm this API key and payer wallet first");
    expect(readFileSync(join(home, "calls.txt"), "utf8")).toBe("binding\n");
    const badKey = run(["config", "baiApiKey", "--api-key-stdin"], "rejected-key\n");
    expect(badKey.status).not.toBe(0);
    expect(readFileSync(join(home, "config.yaml"), "utf8")).toContain("test-key");
    expect(readFileSync(join(home, "config.yaml"), "utf8")).not.toContain("rejected-key");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}, 60000);

it.each([
  ["bsc", "bnb", "56", false],
  ["base", "base", "8453", false],
  ["tron", "tron", "728126428", false],
  ["base", "base", "8453", true],
] as const)(
  "binds a new %s wallet through CLI (%s chain ID %s, failure=%s)",
  (network, chain, chainId, fail) => {
    const home = mkdtempSync(join(tmpdir(), "bai-first-binding-"));
    try {
      const keystore = new Keystore(home, new AtomicFileStore(), () => "testPassword123");
      keystore.import({ type: "privateKey", secret: "11".repeat(32), label: "payer" });
      writeFileSync(join(home, "config.yaml"), "baiApiKey: old-key\n", { mode: 0o600 });
      const loader = join(home, "binding.mjs");
      const promptModule = pathToFileURL(
        join(process.cwd(), "src/adapters/inbound/cli/input/prompt/index.ts"),
      ).href;
      writeFileSync(
        loader,
        `
      import {appendFileSync} from 'node:fs';
      import {verifyMessage} from ${JSON.stringify(import.meta.resolve("ethers"))};
      import {utils as tronUtils} from ${JSON.stringify(import.meta.resolve("tronweb"))};
      import {TtyBackend} from ${JSON.stringify(promptModule)};
      TtyBackend.prototype.isTTY = () => true;
      TtyBackend.prototype.question = async (_prompt, hidden) => {
        if (!hidden) throw new Error('password must be hidden');
        return 'testPassword123';
      };
      globalThis.fetch = async (url, init) => {
        if (init.headers.Authorization !== 'Bearer new-key') throw new Error('wrong credential');
        if (String(url).includes('/wallet.isRechargeBound?'))
          return Response.json({result:{data:{json:false}}});
        if (!String(url).endsWith('/wallet.bindRechargeWallet')) throw new Error('unexpected request');
        const body = JSON.parse(init.body).json;
        if (body.chain !== ${JSON.stringify(chain)} || body.version !== 2) throw new Error('wrong binding chain');
        const recovered = body.chain === 'tron'
          ? tronUtils.message.verifyMessage(body.message, body.signature)
          : verifyMessage(body.message, body.signature);
        if (recovered !== body.address) throw new Error('wrong signer');
        if (!body.message.startsWith('Welcome to BAI !\\nhttps://chat.bankofai.io wants you to confirm wallet binding for recharge:\\n' + body.address + '\\n\\nChain ID: ${chainId}\\n')) throw new Error('wrong message');
        if (!/Nonce: [a-f0-9]{32}$/.test(body.message)) throw new Error('invalid nonce');
        appendFileSync(${JSON.stringify(join(home, "bound.txt"))}, 'verified\\n');
        if (${fail}) return new Response('{}', {status: 500});
        return Response.json({result:{data:{json:{success:true,binding:{userId:'user',address:body.address,chain:body.chain === 'tron' ? 'tron' : 'eth'}}}}});
      };`,
      );
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--import",
          pathToFileURL(loader).href,
          join(process.cwd(), "src/index.ts"),
          "config",
          "baiApiKey",
          "--api-key-stdin",
          "--network",
          network,
          "--account",
          "payer",
          "-o",
          "json",
          "--verbose",
        ],
        {
          ...DETACHED,
          env: { ...process.env, WALLET_CLI_HOME: home },
          input: "new-key\n",
          encoding: "utf8",
          timeout: 20000,
        },
      );
      expect(result.status, result.stdout + result.stderr).toBe(fail ? 1 : 0);
      expect(readFileSync(join(home, "bound.txt"), "utf8"), result.stdout + result.stderr).toBe(
        "verified\n",
      );
      const config = readFileSync(join(home, "config.yaml"), "utf8");
      expect(config).toContain(fail ? "old-key" : "new-key");
      expect(result.stdout + result.stderr).not.toContain("new-key");
      expect(result.stdout + result.stderr).not.toContain("testPassword123");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  },
  30000,
);
