import { expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { Keystore } from "../src/adapters/outbound/keystore/index.js";
import { AtomicFileStore } from "../src/adapters/outbound/persistence/fs/index.js";
import { FileBaiBindingStore } from "../src/adapters/outbound/bai/binding-store.js";
import { DETACHED } from "./detached.js";

it.each([
  ["bsc", "bnb", "eip155:56", "USDT"],
  ["base", "base", "eip155:8453", "USDC"],
])(
  "runs %s self and recipient recharge through the real CLI with mocked backend and payment",
  (alias, chain, networkId, token) => {
    const home = mkdtempSync(join(tmpdir(), "bai-recharge-cli-"));
    const payer = "0x1111111111111111111111111111111111111111";
    const hash = "0x" + "a".repeat(64);
    try {
      const store = new AtomicFileStore();
      new Keystore(home, store, () => {
        throw new Error("no signing in this test");
      }).registerWatch({ family: "evm", address: payer, label: "payer" });
      new FileBaiBindingStore(home, store).confirm("test-key", chain, payer);
      writeFileSync(join(home, "config.yaml"), "baiApiKey: test-key\n", { mode: 0o600 });
      const log = join(home, "calls.jsonl");
      const loader = join(home, "backend.mjs");
      const paymentModule = pathToFileURL(
        join(process.cwd(), "src/adapters/outbound/x402/payment-client.ts"),
      ).href;
      writeFileSync(
        loader,
        `import {appendFileSync} from 'node:fs';
      import {X402PaymentClient} from ${JSON.stringify(paymentModule)};
      const log = (value) => appendFileSync(${JSON.stringify(log)}, JSON.stringify(value)+'\\n');
      globalThis.fetch = async (url, init) => {
        if (init.headers.Authorization !== 'Bearer test-key') throw new Error('missing credential');
        const method = new URL(url).pathname.split('/').at(-1);
        const input = JSON.parse(init.body).json;
        log({method, input});
        const results = {
          'order.resolveRechargeTarget': {type:'personal', targetId:'recipient-id', displayLabel:'Recipient'},
          'order.createOrder': {id:1},
          'order.reportTxHash': {success:true, order:{id:1, points:100000}}
        };
        if (!results[method]) throw new Error('unexpected API');
        return new Response(JSON.stringify({result:{data:{json:results[method]}}}));
      };
      X402PaymentClient.prototype.pay = async () => {
        log({method:'pay'});
        return {payer:{address:${JSON.stringify(payer)}}, response:{id:1, result:{transaction_hash:${JSON.stringify(hash)}, network:${JSON.stringify(networkId)}}}};
      };`,
      );
      for (const to of [undefined, "recipient@example.com"]) {
        writeFileSync(log, "");
        const result = spawnSync(
          process.execPath,
          [
            "--import",
            "tsx",
            "--import",
            pathToFileURL(loader).href,
            join(process.cwd(), "src/index.ts"),
            "bai",
            "recharge",
            "10",
            "--network",
            alias,
            "--account",
            "payer",
            "--output",
            "json",
            ...(to ? ["--to", to] : []),
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
        expect(calls.map((call) => call.method)).toEqual([
          ...(to ? ["order.resolveRechargeTarget"] : []),
          "order.createOrder",
          "pay",
          "order.reportTxHash",
        ]);
        const preorder = calls.find((call) => call.method === "order.createOrder").input;
        const report = calls.find((call) => call.method === "order.reportTxHash").input;
        expect(preorder.chain).toBe(chain);
        expect(preorder.tokenName).toBe(token);
        expect(report.rechargeTarget).toEqual(preorder.rechargeTarget);
        if (to) expect(report.rechargeTarget.confirmedTarget.targetId).toBe("recipient-id");
        else expect(report).not.toHaveProperty("rechargeTarget");
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  },
  60000,
);
