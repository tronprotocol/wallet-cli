import { it, expect } from "vitest";
import { Wallet } from "ethers";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { Keystore } from "../src/adapters/outbound/keystore/index.js";
import { AtomicFileStore } from "../src/adapters/outbound/persistence/fs/index.js";

it.skipIf(!process.env.WALLET_CLI_TEST_ENTRY)(
  "installed beta signs a Nile x402 payment using an encrypted throwaway wallet",
  () => {
    const home = mkdtempSync(join(tmpdir(), "beta-signing-"));
    try {
      new Keystore(home, new AtomicFileStore(), () => "test-password").import({
        secret: Wallet.createRandom().privateKey.slice(2),
        type: "privateKey",
        label: "payer",
      });
      const challenge = {
        x402Version: 2,
        resource: { url: "https://example.test/nile" },
        accepts: [
          {
            scheme: "exact",
            network: "tron:0xcd8690dc",
            amount: "1000000",
            asset: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
            payTo: "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ",
            maxTimeoutSeconds: 300,
            extra: { assetTransferMethod: "permit2" },
          },
        ],
      };
      const preload = join(home, "fetch.mjs");
      const log = join(home, "signature.json");
      writeFileSync(
        preload,
        `import {writeFileSync} from 'node:fs';
      globalThis.fetch=async(input,init)=>{
        const request=input instanceof Request?input:new Request(input,init);
        if(request.url!=='https://example.test/nile') throw new Error('unexpected network request');
        const header=request.headers.get('payment-signature');
        if(!header) return new Response(null,{status:402,headers:{'payment-required':${JSON.stringify(Buffer.from(JSON.stringify(challenge)).toString("base64"))}}});
        writeFileSync(${JSON.stringify(log)},Buffer.from(header,'base64').toString());
        return new Response('ok');
      };`,
      );
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          pathToFileURL(preload).href,
          process.env.WALLET_CLI_TEST_ENTRY!,
          "x402",
          "pay",
          "https://example.test/nile",
          "--network",
          "nile",
          "--account",
          "payer",
          "--token",
          "USDT",
          "--max-amount",
          "1",
          "--output",
          "json",
          "--password-stdin",
        ],
        {
          env: { ...process.env, WALLET_CLI_HOME: home },
          input: "test-password\n",
          encoding: "utf8",
          timeout: 20000,
        },
      );
      expect(result.status, result.stdout + result.stderr).toBe(0);
      const signed = JSON.parse(readFileSync(log, "utf8"));
      expect(signed.accepted.network).toBe("tron:0xcd8690dc");
      expect(signed.payload.signature).toMatch(/^(0x)?[a-fA-F0-9]{130}$/);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  },
  30000,
);
