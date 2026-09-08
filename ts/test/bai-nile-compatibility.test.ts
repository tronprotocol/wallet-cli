import { expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { DETACHED } from "./detached.js";
import { Keystore } from "../src/adapters/outbound/keystore/index.js";
import { AtomicFileStore } from "../src/adapters/outbound/persistence/fs/index.js";

it("keeps BAI summary available but rejects recharge on Nile before any account API or payment", () => {
  const home = mkdtempSync(join(tmpdir(), "wallet-bai-nile-"));
  try {
    new Keystore(home, new AtomicFileStore(), () => {
      throw new Error("must not sign");
    }).registerWatch({
      family: "tron",
      address: "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ",
      label: "nile-payer",
    });
    writeFileSync(join(home, "config.yaml"), "baiApiKey: test-key\n", { mode: 0o600 });
    const log = join(home, "calls.jsonl");
    writeFileSync(log, "");
    const preload = join(home, "fetch.mjs");
    writeFileSync(
      preload,
      `import {appendFileSync} from 'node:fs';
      globalThis.fetch = async (url, init) => {
        const path = new URL(url).pathname;
        appendFileSync(${JSON.stringify(log)}, path+'\\n');
        if (path !== '/trpc/lambda/usage.summary') throw new Error('unexpected call');
        return new Response(JSON.stringify({points_balance:100,monthly_spent:5,monthly_chart:[{month:'2026-09',points:5}]}));
      };`,
    );
    const run = (args: string[]) =>
      spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--import",
          pathToFileURL(preload).href,
          "src/index.ts",
          "bai",
          ...args,
          "--network",
          "nile",
          "--account",
          "nile-payer",
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
    const recharge = run(["recharge", "1"]);
    expect(JSON.parse(recharge.stdout).error.code, recharge.stderr).toBe(
      "unsupported_network_capability",
    );
    expect(readFileSync(log, "utf8")).toBe("");
    const usage = run(["usage"]);
    expect(usage.status, usage.stderr || usage.stdout).toBe(0);
    expect(JSON.parse(usage.stdout).data).toMatchObject({
      credits: "100",
      thisMonth: { credits: "5" },
    });
    expect(readFileSync(log, "utf8").trim()).toBe("/trpc/lambda/usage.summary");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
