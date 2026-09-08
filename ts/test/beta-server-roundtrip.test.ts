import { it, expect } from "vitest";
import { Wallet } from "ethers";
import { createServer } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Keystore } from "../src/adapters/outbound/keystore/index.js";
import { AtomicFileStore } from "../src/adapters/outbound/persistence/fs/index.js";
const entry = process.env.WALLET_CLI_TEST_ENTRY;
async function port() {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const p = (s.address() as { port: number }).port;
  await new Promise<void>((r) => s.close(() => r()));
  return p;
}
it.skipIf(!entry)(
  "installed x402 serve exposes health and a Nile 402 challenge",
  async () => {
    const home = mkdtempSync(join(tmpdir(), "beta-serve-"));
    const p = await port();
    const child = spawn(
      process.execPath,
      [
        entry!,
        "x402",
        "serve",
        "--network",
        "nile",
        "--pay-to",
        "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ",
        "--port",
        String(p),
        "--output",
        "json",
      ],
      { env: { ...process.env, WALLET_CLI_HOME: home }, stdio: ["ignore", "pipe", "pipe"] },
    );
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("server start timeout")), 10000);
        child.stdout.once("data", () => {
          clearTimeout(timer);
          resolve();
        });
        child.once("exit", (code) => {
          clearTimeout(timer);
          reject(new Error("early exit " + code));
        });
      });
      expect((await fetch(`http://127.0.0.1:${p}/health`)).status).toBe(200);
      const r = await fetch(`http://127.0.0.1:${p}/pay`);
      expect(r.status).toBe(402);
      expect(r.headers.has("payment-required")).toBe(true);
      expect(((await r.json()) as { accepts: { network: string }[] }).accepts[0]!.network).toBe(
        "tron:0xcd8690dc",
      );
    } finally {
      child.kill("SIGTERM");
      await new Promise<void>((r) => child.once("close", () => r()));
      rmSync(home, { recursive: true, force: true });
    }
  },
  20000,
);
it.skipIf(!entry)(
  "installed x402 roundtrip signs and uses mocked facilitator settlement",
  async () => {
    const home = mkdtempSync(join(tmpdir(), "beta-roundtrip-"));
    const p = await port();
    try {
      new Keystore(home, new AtomicFileStore(), () => "test-password").import({
        secret: Wallet.createRandom().privateKey.slice(2),
        type: "privateKey",
        label: "payer",
      });
      const log = join(home, "calls.jsonl");
      const preload = join(home, "fetch.mjs");
      writeFileSync(
        preload,
        `import {appendFileSync} from 'node:fs';const realFetch=globalThis.fetch;globalThis.fetch=async(input,init)=>{
   const url=new URL(input instanceof Request?input.url:input);
   if(url.hostname==='127.0.0.1')return realFetch(input,init);
   if(url.origin!=='https://facilitator.bankofai.io')throw new Error('unexpected network');
   const data=JSON.parse(init.body);if(!data.paymentPayload.payload.signature)throw new Error('missing signature');
   appendFileSync(${JSON.stringify(log)},url.pathname+'\\n');
   if(url.pathname==='/verify')return new Response(JSON.stringify({isValid:true}));
   if(url.pathname==='/settle')return new Response(JSON.stringify({success:true,transaction:'a'.repeat(64),network:'tron:0xcd8690dc'}));
   throw new Error('unexpected facilitator call');};`,
      );
      const r = spawnSync(
        process.execPath,
        [
          "--import",
          pathToFileURL(preload).href,
          entry!,
          "x402",
          "roundtrip",
          "--network",
          "nile",
          "--pay-to",
          "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ",
          "--port",
          String(p),
          "--account",
          "payer",
          "--password-stdin",
          "--output",
          "json",
        ],
        {
          env: { ...process.env, WALLET_CLI_HOME: home },
          input: "test-password\n",
          encoding: "utf8",
          timeout: 20000,
        },
      );
      expect(r.status, r.stderr + r.stdout).toBe(0);
      expect(JSON.parse(r.stdout).data.pay.settled).toBe(true);
      expect(readFileSync(log, "utf8")).toBe("/verify\n/settle\n");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  },
  30000,
);
