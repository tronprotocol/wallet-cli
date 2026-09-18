import { Wallet } from "ethers";
import { TronWeb } from "tronweb";
import { expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { Keystore } from "../src/adapters/outbound/keystore/index.js";
import { AtomicFileStore } from "../src/adapters/outbound/persistence/fs/index.js";
import { DETACHED } from "./detached.js";

it.each([
  ["tron", "tron", "tron:728126428", "USDT"],
  ["bsc", "bnb", "eip155:56", "USDT"],
  ["base", "base", "eip155:8453", "USDC"],
])(
  "runs %s self and recipient recharge through the real CLI with mocked backend and payment",
  (alias, chain, networkId, token) => {
    const home = mkdtempSync(join(tmpdir(), "bai-recharge-cli-"));
    const payer =
      chain === "tron"
        ? TronWeb.address.fromPrivateKey("11".repeat(32))
        : new Wallet("0x" + "11".repeat(32)).address;
    const hash = (chain === "tron" ? "" : "0x") + "a".repeat(64);
    try {
      const store = new AtomicFileStore();
      new Keystore(home, store, () => "testPassword123").import({
        type: "privateKey",
        secret: "11".repeat(32),
        label: "payer",
      });
      writeFileSync(join(home, "config.yaml"), "baiApiKey: test-key\n", { mode: 0o600 });
      const log = join(home, "calls.jsonl");
      const loader = join(home, "backend.mjs");
      const paymentModule = pathToFileURL(
        join(process.cwd(), "src/adapters/outbound/x402/payment-client.ts"),
      ).href;
      writeFileSync(
        loader,
        `import {appendFileSync} from 'node:fs';
      import {verifyMessage} from ${JSON.stringify(import.meta.resolve("ethers"))};
      import {utils as tronUtils} from ${JSON.stringify(import.meta.resolve("tronweb"))};
      import {X402PaymentClient} from ${JSON.stringify(paymentModule)};
      import {X402Service} from ${JSON.stringify(pathToFileURL(join(process.cwd(), "src/application/use-cases/x402-service.ts")).href)};
      const log = (value) => appendFileSync(${JSON.stringify(log)}, JSON.stringify(value)+'\\n');
      globalThis.fetch = async (url, init) => {
        if (init.headers.Authorization !== 'Bearer test-key') throw new Error('missing credential');
        const method = new URL(url).pathname.split('/').at(-1);
        const input = JSON.parse(init.body ?? new URL(url).searchParams.get('input')).json;
        log({method, input});
        if (method === 'wallet.isRechargeBound') return Response.json({result:{data:{json:false}}});
        if (method === 'wallet.bindRechargeWallet') {
          const recovered = input.chain === 'tron' ? tronUtils.message.verifyMessage(input.message,input.signature) : verifyMessage(input.message,input.signature);
          if (recovered !== input.address || input.version !== 2 || !input.message.includes('Chain ID: ${chain}\\n')) throw new Error('invalid binding signature');
          return Response.json({result:{data:{json:{success:true,binding:{userId:'user',address:input.address,chain:input.chain}}}}});
        }
        const results = {
          'order.resolveRechargeTarget': {type:'personal', targetId:'recipient-id', displayLabel:'Recipient'},
          'order.createOrder': {id:1},
          'order.reportTxHash': {success:true, order:{id:1, points:100000}}
        };
        if (!results[method]) throw new Error('unexpected API');
        return new Response(JSON.stringify({result:{data:{json:results[method]}}}));
      };
      const pay = async () => {
        log({method:'pay'});
        return {settled:true, payer:{address:${JSON.stringify(payer)}}, paymentResponse:{success:true, transaction:${JSON.stringify(hash)}, network:${JSON.stringify(networkId)}}};
      };
      X402PaymentClient.prototype.pay = pay;
      if (${JSON.stringify(chain)} === "tron") X402Service.prototype.roundtrip = async () => ({serve:{},pay:await pay()});`,
      );
      for (const [to, withPassword] of [
        [undefined, false],
        [undefined, true],
        ["recipient@example.com", true],
      ] as const) {
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
            ...(withPassword ? ["--password-stdin"] : []),
            "--output",
            "json",
            ...(to ? ["--to", to] : []),
          ],
          {
            ...DETACHED,
            env: { ...process.env, WALLET_CLI_HOME: home, WALLET_CLI_BAI_REPORT_DELAY_MS: "0" },
            encoding: "utf8",
            input: withPassword ? "testPassword123\n" : undefined,
            timeout: 20000,
          },
        );
        if (!withPassword) {
          expect(JSON.parse(result.stdout).error).toMatchObject({
            code: "auth_required",
            details: { paymentStatus: "not_sent" },
          });
          expect(JSON.parse(readFileSync(log, "utf8").trim()).method).toBe(
            "wallet.isRechargeBound",
          );
          continue;
        }
        expect(result.status, result.stdout + result.stderr).toBe(0);
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
          "wallet.isRechargeBound",
          "wallet.bindRechargeWallet",
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
