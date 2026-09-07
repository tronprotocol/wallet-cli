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
