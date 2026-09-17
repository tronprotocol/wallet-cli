import { tronAllowancePreload } from "./tron-allowance-preload.js";
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
it.skipIf(!entry).each(["SIGINT", "SIGTERM"] as const)(
  "installed x402 serve exposes health and a Nile 402 challenge",
  async (signal) => {
    const home = mkdtempSync(join(tmpdir(), "beta-serve-"));
    const p = await port();
    const preload = join(home, "supported.mjs");
    writeFileSync(
      preload,
      `globalThis.fetch = async () => Response.json({kinds:[{x402Version:2,scheme:'exact',network:'tron:0xcd8690dc'}]});`,
    );
    const child = spawn(
      process.execPath,
      [
        "--import",
        pathToFileURL(preload).href,
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
      const stopped = new Promise<{ code: number | null; signal: string | null }>((resolve) =>
        child.once("close", (code, signal) => resolve({ code, signal })),
      );
      child.kill(signal);
      expect(await stopped).toEqual({ code: 0, signal: null });
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
        `${tronAllowancePreload}
import {appendFileSync} from 'node:fs';const realFetch=globalThis.fetch;globalThis.fetch=async(input,init)=>{
   const url=new URL(input instanceof Request?input.url:input);
   if(url.hostname==='127.0.0.1')return realFetch(input,init);
   if(url.origin!=='https://facilitator.bankofai.io')throw new Error('unexpected network');
   if(url.pathname==='/supported')return Response.json({kinds:[{x402Version:2,scheme:'exact',network:'tron:0xcd8690dc'}]});
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

it.skipIf(!entry).each(["pay", "roundtrip"])(
  "installed x402 %s returns the real SDK GasFree fee warning",
  async (command) => {
    const home = mkdtempSync(join(tmpdir(), "beta-gasfree-warning-"));
    try {
      new Keystore(home, new AtomicFileStore(), () => "test-password").import({
        secret: Wallet.createRandom().privateKey.slice(2),
        type: "privateKey",
        label: "payer",
      });
      const log = join(home, "calls.jsonl");
      const preload = join(home, "gasfree.mjs");
      writeFileSync(
        preload,
        `${tronAllowancePreload}
import {appendFileSync} from 'node:fs';
const realFetch = globalThis.fetch;
const network = 'tron:0xcd8690dc';
const payTo = 'TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ';
const requirement = {scheme:'exact_gasfree',network,amount:'10000',asset:'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',payTo,maxTimeoutSeconds:300,extra:{}};
globalThis.fetch = async(input,init) => {
 const url=new URL(input instanceof Request?input.url:input);
 if(url.hostname==='127.0.0.1') return realFetch(input,init);
 if(url.pathname.includes('/api/v1/address/')) return Response.json({code:200,data:{gasFreeAddress:payTo,active:true,nonce:0,assets:[{tokenAddress:requirement.asset,transferFee:'1300000'}]}});
 if(url.pathname.endsWith('/api/v1/config/provider/all')) return Response.json({code:200,data:{providers:[{address:payTo}]}});
 if(url.hostname==='paywall.example') {
   if(!new Headers(input instanceof Request ? input.headers : init?.headers).get('PAYMENT-SIGNATURE')) return Response.json({x402Version:2,resource:{url:url.href},accepts:[requirement]}, {status:402,headers:{'PAYMENT-REQUIRED':Buffer.from(JSON.stringify({x402Version:2,resource:{url:url.href},accepts:[requirement]})).toString('base64')}});
   const payment=JSON.parse(Buffer.from(new Headers(input instanceof Request ? input.headers : init?.headers).get('PAYMENT-SIGNATURE'),'base64').toString());
   if(!payment.payload.signature || payment.payload.gasfree.maxFee!=='1300000') throw new Error('missing SDK fee/signature');
   appendFileSync(${JSON.stringify(log)},'paid\\n');
   return Response.json({ok:true},{headers:{'PAYMENT-RESPONSE':Buffer.from(JSON.stringify({success:true,transaction:'a'.repeat(64),network})).toString('base64')}});
 }
 if(url.origin==='https://facilitator.bankofai.io') {
   if(url.pathname==='/supported')return Response.json({kinds:[{x402Version:2,scheme:'exact_gasfree',network}]});
   const data=JSON.parse(init.body); const payload=data.paymentPayload.payload;
   if(!payload.signature || payload.gasfree.maxFee!=='1300000' || payload.gasfree.value!=='10000')throw new Error('missing SDK fee/signature');
   appendFileSync(${JSON.stringify(log)},url.pathname+'\\n');
   if(url.pathname==='/verify')return Response.json({isValid:true});
   if(url.pathname==='/settle')return Response.json({success:true,transaction:'a'.repeat(64),network});
 }
 throw new Error('unexpected network request');
};`,
      );
      const args =
        command === "pay"
          ? ["https://paywall.example/pay", "--max-amount", "0.01"]
          : [
              "--pay-to",
              "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ",
              "--amount",
              "0.01",
              "--port",
              String(await port()),
            ];
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          pathToFileURL(preload).href,
          entry!,
          "x402",
          command,
          ...args,
          "--network",
          "nile",
          "--token",
          "USDT",
          "--scheme",
          "exact_gasfree",
          "--account",
          "payer",
          "--password-stdin",
          "-o",
          "json",
        ],
        {
          env: { ...process.env, WALLET_CLI_HOME: home },
          input: "test-password\n",
          encoding: "utf8",
          timeout: 20000,
        },
      );
      expect(result.status, result.stdout + result.stderr).toBe(0);
      const envelope = JSON.parse(result.stdout);
      expect(envelope.success).toBe(true);
      expect(envelope.meta.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining("13000.00%")]),
      );
      expect(command === "pay" ? envelope.data : envelope.data.pay).toMatchObject({
        settled: true,
        delivered: true,
      });
      expect(readFileSync(log, "utf8").trim().split("\n")).toEqual(
        command === "pay" ? ["paid"] : ["/verify", "/settle"],
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  },
  30000,
);

it.skipIf(!entry).each(["0", "0.000", "0.5", "9007199254740992"])(
  "installed bai rejects amount %s before requesting credentials",
  (amount) => {
    const home = mkdtempSync(join(tmpdir(), "beta-bai-invalid-"));
    try {
      const result = spawnSync(
        process.execPath,
        [entry!, "bai", "recharge", amount, "--network", "bsc", "--token", "USDT", "-o", "json"],
        {
          env: { ...process.env, WALLET_CLI_HOME: home },
          encoding: "utf8",
          timeout: 10000,
        },
      );
      expect(result.status, result.stdout + result.stderr).toBe(2);
      expect(JSON.parse(result.stdout)).toMatchObject({
        success: false,
        error: { code: "invalid_amount" },
      });
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  },
);
