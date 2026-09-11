import { expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { DETACHED } from "./detached.js";

it.each([false, true])(
  "reports an existing recharge through CLI without a wallet (recipient=%s)",
  (recipient) => {
    const home = mkdtempSync(join(tmpdir(), "bai-report-cli-"));
    const hash = "0x" + "a".repeat(64);
    try {
      writeFileSync(join(home, "config.yaml"), "baiApiKey: test-key\n", { mode: 0o600 });
      const log = join(home, "requests.jsonl");
      const preload = join(home, "backend.mjs");
      writeFileSync(
        preload,
        `import {appendFileSync} from 'node:fs';
      globalThis.fetch = async (url, init) => {
        if (new URL(url).pathname !== '/trpc/lambda/order.reportTxHash') throw new Error('unexpected API or payment');
        if (init.headers.Authorization !== 'Bearer test-key') throw new Error('missing credential');
        appendFileSync(${JSON.stringify(log)}, JSON.stringify(JSON.parse(init.body).json)+'\\n');
        return Response.json({result:{data:{json:{success:true,order:{id:1}}}}});
      };`,
      );
      const entry = process.env.WALLET_CLI_TEST_ENTRY;
      const result = spawnSync(
        process.execPath,
        [
          ...(entry ? [] : ["--import", "tsx"]),
          "--import",
          pathToFileURL(preload).href,
          entry ?? "src/index.ts",
          "bai",
          "recharge-report",
          hash,
          "--chain",
          "base",
          "--amount",
          "1",
          "--output",
          "json",
          ...(recipient ? ["--to", "recipient@example.com", "--target-id", "original-id"] : []),
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
        txHash: hash,
        creditStatus: "credited",
        retryPayment: false,
      });
      const calls = readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ chain: "base", txHash: hash, amount: 1 });
      if (recipient)
        expect(calls[0].rechargeTarget).toEqual({
          input: { type: "personal", identifier: "recipient@example.com" },
          confirmedTarget: { type: "personal", targetId: "original-id" },
        });
      else expect(calls[0]).not.toHaveProperty("rechargeTarget");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  },
);
