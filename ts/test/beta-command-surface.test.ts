import { it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const entry = process.env.WALLET_CLI_TEST_ENTRY;
const commands = [
  ...[
    "pay",
    "serve",
    "roundtrip",
    "provider-list",
    "provider-show",
    "endpoint-list",
    "update-catalog",
  ].map((v) => ["x402", v]),
  ...["recharge", "report-recharge", "usage-summary", "usage-records", "recharge-orders"].map(
    (v) => ["bai", v],
  ),
  ...[
    "show",
    "register",
    "update",
    "transfer",
    "approve",
    "add-operator",
    "remove-operator",
    "operator-check",
  ].map((v) => ["8004", v]),
];
function run(args: string[], body = "globalThis.fetch=()=>{throw new Error('network forbidden')}") {
  const home = mkdtempSync(join(tmpdir(), "beta-surface-"));
  try {
    const preload = join(home, "mock.mjs");
    writeFileSync(preload, body);
    writeFileSync(join(home, "config.yaml"), "baiApiKey: regression-placeholder\n", {
      mode: 0o600,
    });
    return spawnSync(process.execPath, ["--import", pathToFileURL(preload).href, entry!, ...args], {
      env: { ...process.env, HOME: home, WALLET_CLI_HOME: home },
      encoding: "utf8",
      timeout: 15000,
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}
it.skipIf(!entry)("root help presents new groups consistently with existing commands", () => {
  const root = run(["--help"]);
  expect(root.status, root.stderr).toBe(0);
  const short = run(["-h"]);
  expect(short.status, short.stderr).toBe(0);
  expect(short.stdout).toBe(root.stdout);
  const management = root.stdout.split("Management Commands:")[1]!.split("\nCommands:")[0]!;
  for (const group of ["account", "tx", "contract", "x402", "bai", "8004"]) {
    expect(management).toMatch(new RegExp(`^  ${group}\\s+\\S`, "m"));
  }
  expect(root.stdout).toMatch(/^  config\s+Show \/ get \/ set configuration values$/m);
  for (const group of ["x402", "bai", "8004"]) {
    const help = run([group, "--help"]);
    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain(`Usage:  wallet-cli ${group} COMMAND`);
    for (const [, verb] of commands.filter(([name]) => name === group)) {
      expect(help.stdout).toMatch(new RegExp(`^  ${verb}\\s+`, "m"));
      expect(root.stdout).not.toMatch(new RegExp(`^  ${group} ${verb}\\s`, "m"));
    }
  }
  const config = run(["config", "--help"]);
  expect(config.status, config.stderr).toBe(0);
  expect(config.stdout).toContain("baiApiKey");
  expect(config.stdout).toContain("--api-key-stdin");
});
it.skipIf(!entry).each(commands)("%s %s help and unknown-flag rejection", (group, verb) => {
  const help = run([group!, verb!, "--help"]);
  expect(help.status, help.stderr).toBe(0);
  expect(help.stdout).toContain("Usage:");
  const bad = run([group!, verb!, "--regression-unknown-flag", "--output", "json"]);
  expect(bad.status).not.toBe(0);
  expect(JSON.parse(bad.stdout).success).toBe(false);
});
const catalog = {
  version: 1,
  generated_at: "2026-09-14T00:00:00Z",
  warnings: ["catalog fixture warning"],
  providers: [
    {
      fqn: "bai/recharge",
      name: "B.AI",
      category: "ai",
      chains: ["base"],
      featuredTags: ["recharge"],
    },
  ],
};
const provider = {
  fqn: "bai/recharge",
  endpoints: [{ path: "/m/credit/recharge", method: "POST" }],
};
it.skipIf(!entry).each(["provider-list", "provider-show", "endpoint-list", "update-catalog"])(
  "x402 %s against catalog fixture",
  (verb) => {
    const mock = `globalThis.fetch=async(url)=>new Response(JSON.stringify(String(url).endsWith('catalog.json')?${JSON.stringify(catalog)}:${JSON.stringify(provider)}));`;
    const r = run(
      [
        "x402",
        verb,
        ...(["provider-show", "endpoint-list"].includes(verb) ? ["bai/recharge"] : []),
        "--output",
        "json",
      ],
      mock,
    );
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(JSON.parse(r.stdout).command).toBe(`x402.${verb}`);
    const data = JSON.parse(r.stdout).data;
    if (verb === "provider-list") expect(data.count).toBe(1);
    if (verb === "provider-show") expect(data.fqn).toBe("bai/recharge");
    if (verb === "endpoint-list") expect(data.endpoints).toHaveLength(1);
    if (verb === "update-catalog") {
      expect(data.updated).toBe(true);
      expect(data.generatedAt).toBe(catalog.generated_at);
      expect(data).not.toHaveProperty("warnings");
      expect(JSON.stringify(JSON.parse(r.stdout).meta.warnings)).toContain(
        "catalog fixture warning",
      );
    }
  },
);
it.skipIf(!entry).each(["usage-summary", "usage-records", "recharge-orders"])(
  "bai %s against authenticated fixture",
  (verb) => {
    const mock = `globalThis.fetch=async(url,init)=>{
 if(init.headers.Authorization!=='Bearer regression-placeholder')throw new Error('missing auth');
 const path=new URL(url).pathname;
 if(path.endsWith('usage.summary'))return new Response(JSON.stringify({points_balance:100,monthly_spent:5,monthly_chart:[]}));
 if(path.endsWith('usage.records'))return new Response(JSON.stringify({data:[{id:'r1'}],page:1,pageSize:20,hasMore:false}));
 if(path.endsWith('order.listOrders'))return new Response(JSON.stringify({result:{data:{json:{orders:[{id:'o1'}],page:1,pageSize:20}}}}));
 throw new Error('unexpected API');};`;
    const r = run(["bai", verb, "--output", "json"], mock);
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(JSON.parse(r.stdout).command).toBe(`bai.${verb}`);
    const data = JSON.parse(r.stdout).data;
    if (verb === "usage-summary") expect(data.credits).toBe("100");
    else expect(JSON.stringify(data)).toContain(verb === "usage-records" ? "r1" : "o1");
  },
);

it.skipIf(!entry).each([
  [["x402", "pay", "https://example.test", "--max-amount", "0"], "invalid_amount", 2],
  [
    ["x402", "pay", "https://example.test", "--max-raw-amount", (1n << 256n).toString()],
    "invalid_amount",
    2,
  ],
  [
    ["x402", "pay", "https://example.test", "--max-amount", "1", "--max-raw-amount", "1"],
    "invalid_option",
    2,
  ],
  [["x402", "serve", "--pay-to", "x", "--port", "1e3"], "invalid_value", 2],
  [["x402", "roundtrip", "--pay-to", "x", "--amount", "0"], "invalid_amount", 2],
  [["x402", "provider-list", "--limit", "201"], "invalid_value", 2],
  [["x402", "provider-list", "--limit", "1e2"], "invalid_value", 2],
  [["x402", "provider-list", "--account", "ignored"], "invalid_option", 2],
  [["x402", "provider-show", "demo/provider", "--network", "nile"], "invalid_option", 2],
  [["bai", "usage-records", "--limit", "201"], "invalid_value", 2],
  [["8004", "show", "eip155:97:123", "--network", "nile"], "chain_id_mismatch", 1],
  [
    ["8004", "register", "http://example.test/agent.json", "--network", "nile", "--dry-run"],
    "invalid_value",
    2,
  ],
])("installed CLI rejects R4 input %j as %s", (args, code, status) => {
  const result = run([...(args as string[]), "-o", "json"]);
  expect(result.status, result.stderr).toBe(status);
  expect(JSON.parse(result.stdout).error.code).toBe(code);
});
