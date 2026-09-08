import { expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { DETACHED } from "./detached.js";
import { Keystore } from "../src/adapters/outbound/keystore/index.js";
import { AtomicFileStore } from "../src/adapters/outbound/persistence/fs/index.js";

it.each([
  ["base", "eip155:8453", "USDC", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"],
  ["bsc", "eip155:56", "USDT", "0x55d398326f99059fF775485246999027B3197955"],
  ["tron", "tron:0x2b6653dc", "USDT", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"],
  ["nile", "tron:0xcd8690dc", "USDT", "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"],
])(
  "inspects an online-provider-shaped challenge on %s with a watch-only wallet",
  (alias, network, token, asset) => {
    const home = mkdtempSync(join(tmpdir(), "x402-provider-cli-"));
    try {
      new Keystore(home, new AtomicFileStore(), () => {
        throw new Error("dry-run must not request a password");
      }).registerWatch({
        family: alias === "tron" || alias === "nile" ? "tron" : "evm",
        address:
          alias === "tron" || alias === "nile"
            ? "TSNEPtuCagKEgF2EU4pAKWLzXLz1bekfTE"
            : "0x1111111111111111111111111111111111111111",
        label: "inspection-only",
      });
      const preload = join(home, "fetch.mjs");
      const challenge = {
        x402Version: 2,
        resource: { url: "https://example.com/data" },
        accepts: [
          {
            scheme: "exact",
            network,
            asset,
            amount: "1",
            payTo:
              alias === "tron" || alias === "nile"
                ? "TSNEPtuCagKEgF2EU4pAKWLzXLz1bekfTE"
                : "0x1111111111111111111111111111111111111111",
            maxTimeoutSeconds: 300,
          },
        ],
      };
      writeFileSync(
        preload,
        `globalThis.fetch=async()=>new Response(${JSON.stringify(JSON.stringify(challenge))},{status:402,headers:{"content-type":"application/json"}});`,
      );
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--import",
          pathToFileURL(preload).href,
          "src/index.ts",
          "x402",
          "pay",
          "https://example.com/data",
          "--network",
          alias,
          "--account",
          "inspection-only",
          "--token",
          token,
          "--dry-run",
          "--output",
          "json",
        ],
        {
          ...DETACHED,
          env: { ...process.env, WALLET_CLI_HOME: home },
          encoding: "utf8",
          timeout: 20000,
        },
      );
      expect(result.status, result.stderr || result.stdout).toBe(0);
      expect(JSON.parse(result.stdout).data).toMatchObject({
        dryRun: true,
        paymentRequired: true,
        settled: false,
      });
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  },
  30000,
);
