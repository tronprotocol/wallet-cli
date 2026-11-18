// The qaprobe fixture, installed into an empty home and run through the built CLI.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { HDNodeWallet } from "ethers";
import { TronWeb } from "tronweb";
import { DEFAULT_PW, MNEMONIC, run, seedWallet, testHome, TRON1 } from "./golden-harness.js";
import { buildQaprobe, packDirectory, type QaprobeVariant } from "./plugins/qaprobe.js";

const work = mkdtempSync(join(tmpdir(), "wcli-qaprobe-"));
const archives = new Map<QaprobeVariant, string>();
beforeAll(async () => {
  for (const variant of [
    "ok",
    "import-failure",
    "register-failure",
    "credential-core-key",
  ] as const) {
    const dir = await buildQaprobe(join(work, variant), variant);
    archives.set(variant, packDirectory(dir, join(work, `${variant}.tgz`)));
  }
}, 60_000);
afterAll(() => rmSync(work, { recursive: true, force: true }));

// Commands that unlock the wallet pass `{ password: undefined }` to send the default password.
const json = (args: string[], opts: { password?: string | null } = { password: null }) =>
  run(["--output", "json", ...args], opts);

function install(variant: QaprobeVariant = "ok") {
  const r = json(["plugin", "install", archives.get(variant)!]);
  expect(r.json?.success, r.stdout + r.stderr).toBe(true);
}

// How often the installed entry file has been imported, as the fixture records it.
function imports(): number {
  const active = JSON.parse(readFileSync(join(testHome, "plugins/qaprobe/active.json"), "utf8"));
  const url = pathToFileURL(join(testHome, "plugins/qaprobe", active.entry)).href;
  const counter = join(
    tmpdir(),
    `qaprobe-imports-${createHash("sha256").update(url).digest("hex").slice(0, 16)}`,
  );
  return existsSync(counter) ? Number(readFileSync(counter, "utf8")) : 0;
}

describe("an installed plugin", () => {
  it("serves its commands with meta.plugin, and keeps its own error code and exit", () => {
    seedWallet();
    install();
    const ok = json(["qaprobe", "read", "--value", "hello"]);
    expect(ok.status).toBe(0);
    expect(ok.json).toMatchObject({
      success: true,
      command: "qaprobe.read",
      data: { value: "hello" },
      meta: { plugin: { name: "qaprobe", version: "1.0.0" } },
    });
    expect(JSON.stringify(ok.json)).not.toContain('"view"');
    const missing = json(["qaprobe", "read"]);
    expect(missing.status).toBe(2);
    expect(missing.json.error.code).toBe("missing_option");
    const failed = json(["qaprobe", "read", "--value", "failure"]);
    expect(failed.status).toBe(1);
    expect(failed.json).toMatchObject({
      success: false,
      error: {
        code: "qaprobe_refused",
        message: "the probe refuses this value; try qaprobe read --value ok",
      },
      meta: { plugin: { name: "qaprobe", version: "1.0.0" } },
    });
    const core = json(["networks"]);
    expect(core.json.meta.plugin).toBeUndefined();
  });

  it("is described by --json-schema, with its error codes", () => {
    install();
    const r = run(["--json-schema"], { password: null });
    const catalog = JSON.parse(r.stdout);
    const ids = catalog.commands.map((c: { id: string }) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "qaprobe.read",
        "qaprobe.sign",
        "qaprobe.transfer",
        "qaprobe.inspect",
      ]),
    );
    expect(catalog.errorCodes.qaprobe_refused).toEqual({
      exit: 1,
      retry: "never",
      meaning: "the QA probe refused the value",
    });
  });

  it("is not imported by core commands or root help, which lists its group from the manifest", () => {
    seedWallet();
    install();
    const before = imports();
    expect(json(["networks"]).status).toBe(0);
    expect(json(["list"]).status).toBe(0);
    const help = run(["--help"], { password: null });
    expect(help.stdout).toMatch(/^ {2}qaprobe +QA probe commands/m);
    expect(imports()).toBe(before);
    expect(json(["qaprobe", "inspect"]).json.data.imports).toBe(before + 1);
  });

  it("signs a message exactly as message sign does", () => {
    seedWallet();
    install();
    const own = json(["message", "sign", "--message", "qaprobe", "--network", "nile"], {});
    const probe = json(["qaprobe", "sign", "--message", "qaprobe", "--network", "nile"], {});
    expect(probe.json?.success, probe.stdout + probe.stderr).toBe(true);
    expect(probe.json.data.signature).toBe(own.json.data.signature);
    expect(probe.json.data.address).toBe(own.json.data.address);
  });

  it("is stopped by the command deadline", () => {
    seedWallet();
    install();
    const r = json(["qaprobe", "read", "--value", "slow", "--timeout", "300"]);
    expect(r.status).toBe(1);
    expect(r.json.error.code).toBe("timeout");
  });

  it("sees only the documented context, services and host members", () => {
    seedWallet();
    install();
    expect(json(["qaprobe", "inspect"]).json.data).toMatchObject({
      context: [
        "activeAccount",
        "deadline",
        "emit",
        "log",
        "output",
        "readStdinBytes",
        "resolveAddress",
        "wait",
        "warn",
      ],
      services: [
        "accounts",
        "broadcastGuard",
        "clock",
        "config",
        "contracts",
        "gateways",
        "lifetime",
        "networks",
        "recipients",
        "signing",
        "tokens",
        "tronCalls",
      ],
      signing: ["assertCanSign", "prepare", "sign", "signerAddress"],
      host: [
        "apiVersion",
        "capabilities",
        "chainCommand",
        "command",
        "errorCodes",
        "followUps",
        "services",
      ],
    });
  });
});

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const privateKey = (path: string) =>
  HDNodeWallet.fromPhrase(MNEMONIC, undefined, path).privateKey.slice(2);

// Runs `body` with the plugin's test controls in the CLI's environment.
function withEnv(env: Record<string, string>, body: () => void): void {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  Object.assign(process.env, env);
  try {
    body();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe("an installed plugin on both families", () => {
  it("reads with the selected network and account on TRON and EVM", () => {
    seedWallet();
    install();
    const evmAddress = HDNodeWallet.fromPhrase(MNEMONIC, undefined, "m/44'/60'/0'/0/0").address;
    const tronAddress = TronWeb.address.fromPrivateKey(privateKey("m/44'/195'/0'/0/0"));
    const tron = json(["qaprobe", "read", "--value", "hello", "--network", "nile"]);
    expect(tron.json, tron.stdout + tron.stderr).toMatchObject({
      success: true,
      data: { value: "hello", network: "tron:3448148188", address: tronAddress },
      chain: { network: "tron:3448148188" },
    });
    const text = run(["qaprobe", "read", "--value", "hello", "--network", "nile", "-o", "text"], {
      password: null,
    });
    expect(text.stdout).toContain(`address: ${tronAddress}`);
    const evm = json(["qaprobe", "read", "--value", "hello", "--network", "sepolia"]);
    expect(evm.json, evm.stdout + evm.stderr).toMatchObject({
      success: true,
      data: { network: "eip155:11155111", address: evmAddress },
    });
  });

  it("signs a message on EVM exactly as message sign does", () => {
    seedWallet();
    install();
    const args = ["--message", "QA", "--network", "sepolia"];
    const own = json(["message", "sign", ...args], {});
    const probe = json(["qaprobe", "sign", ...args], {});
    expect(probe.json?.success, probe.stdout + probe.stderr).toBe(true);
    expect(probe.json.data.signature).toBe(own.json.data.signature);
    expect(probe.json.data.address).toBe(own.json.data.address);
  });

  it("reaches none of the wallet's secrets, with or without an authorized signature", () => {
    seedWallet();
    install();
    // The raw keys stay in this process; the plugin receives only their digests.
    const keys = [privateKey("m/44'/195'/0'/0/0"), privateKey("m/44'/60'/0'/0/0")];
    const canaries = {
      privateKey: keys.map(sha256),
      mnemonic: [sha256(MNEMONIC)],
      password: [sha256(DEFAULT_PW)],
    };
    const none = { privateKey: false, mnemonic: false, password: false };
    withEnv({ QAPROBE_CANARIES: JSON.stringify(canaries) }, () => {
      const plain = json(["qaprobe", "inspect", "--network", "nile"]);
      expect(plain.json?.data?.secretsReachable, plain.stdout + plain.stderr).toEqual(none);
      const signed = json(["qaprobe", "inspect", "--sign", "--network", "nile"], {});
      expect(signed.json?.success, signed.stdout + signed.stderr).toBe(true);
      expect(signed.json.data.signature).toMatch(/^0x[0-9a-f]{130}$/);
      expect(signed.json.data.secretsReachable).toEqual(none);
      const output = [plain, signed].map((r) => r.stdout + r.stderr).join("\n");
      for (const secret of [DEFAULT_PW, MNEMONIC]) expect(output).not.toContain(secret);
      for (const key of keys) {
        expect(output.toLowerCase()).not.toContain(key);
        expect(output.toLowerCase()).not.toContain(`0x${key}`);
      }
    });
    // The walk does find a value the plugin can reach: the selected network's id.
    withEnv({ QAPROBE_CANARIES: JSON.stringify({ mnemonic: [sha256("tron:3448148188")] }) }, () => {
      const control = json(["qaprobe", "inspect", "--network", "nile"]);
      expect(control.json.data.secretsReachable.mnemonic).toBe(true);
    });
  });
});

const NODE_STUB = pathToFileURL(join(import.meta.dirname, "plugins/tron-node-stub.mjs")).href;
const TOKEN = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
const transfer = ["qaprobe", "transfer", "--contract", TOKEN, "--to", TRON1, "--amount", "1"];

// The transfer runs the host's TRON lifecycle against a controlled node in the CLI process.
describe("an installed plugin's transaction against a controlled node", () => {
  let observations: string;
  beforeEach(() => {
    seedWallet();
    install();
    observations = join(testHome, "observations.jsonl");
  });

  function send(mode: string, args: string[], password: boolean) {
    let result!: ReturnType<typeof json>;
    let seen!: { signatures: number; submissions: number };
    withEnv(
      {
        NODE_OPTIONS: `--import ${NODE_STUB}`,
        QAPROBE_NODE: mode,
        QAPROBE_OBSERVATIONS: observations,
      },
      () => {
        result = json([...transfer, "--network", "nile", ...args], password ? {} : undefined);
        seen = json(["qaprobe", "inspect", "--network", "nile"]).json.data.observed;
      },
    );
    return { result, seen };
  }

  it.each([
    ["--dry-run", false, "dry-run"],
    ["--build-only", false, "build-only"],
  ])("signs and submits nothing with %s", (flag, password, mode) => {
    const { result, seen } = send("ok", [flag], password);
    expect(result.json, result.stdout + result.stderr).toMatchObject({
      success: true,
      data: { mode },
      meta: { plugin: { name: "qaprobe" } },
    });
    expect(seen).toEqual({ signatures: 0, submissions: 0 });
  });

  it("signs once and submits nothing with --sign-only", () => {
    const { result, seen } = send("ok", ["--sign-only"], true);
    expect(result.json, result.stdout + result.stderr).toMatchObject({
      success: true,
      data: { mode: "sign-only", signed: { signature: [expect.any(String)] } },
    });
    expect(seen).toEqual({ signatures: 1, submissions: 0 });
  });

  it("refuses conflicting modes before signing or submitting", () => {
    for (const flags of [
      ["--dry-run", "--sign-only"],
      ["--dry-run", "--wait"],
    ]) {
      const { result, seen } = send("ok", flags, false);
      expect(result.status).toBe(2);
      expect(result.json.error.code).toBe("invalid_option");
      expect(seen).toEqual({ signatures: 0, submissions: 0 });
    }
  });

  it.each([
    ["by default", "ok", [], "confirmed"],
    ["with --wait", "ok", ["--wait"], "confirmed"],
    ["with --no-wait", "ok", ["--no-wait"], "submitted"],
    ["with a reverted receipt", "revert", [], "failed"],
  ])("submits once and reports the receipt %s", (_label, mode, args, stage) => {
    const { result, seen } = send(mode, args, true);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.json).toMatchObject({
      success: true,
      data: { stage, txId: expect.stringMatching(/^[0-9a-f]{64}$/) },
    });
    expect(seen).toEqual({ signatures: 1, submissions: 1 });
  });

  it("reports a lost submit reply as outcome unknown with the transaction id", () => {
    const { result, seen } = send("lost", [], true);
    expect(result.status).toBe(1);
    expect(result.json).toMatchObject({
      success: false,
      error: {
        details: { outcome: "unknown", txId: expect.stringMatching(/^[0-9a-f]{64}$/) },
      },
      meta: { plugin: { name: "qaprobe" } },
    });
    expect(seen).toEqual({ signatures: 1, submissions: 1 });
  });
});

describe("a plugin that cannot be loaded", () => {
  it.each([
    ["import-failure", "failed to load (qaprobe failed while it was imported)"],
    ["register-failure", "registration failed"],
  ] as const)("is reported as broken after %s, and core commands still work", (variant, reason) => {
    install(variant);
    const r = json(["qaprobe", "read", "--value", "ok"]);
    expect(r.status).toBe(1);
    expect(r.json).toMatchObject({
      error: { code: "plugin_load_failed", message: expect.stringContaining(reason) },
      meta: { plugin: { name: "qaprobe", version: "1.0.0" } },
    });
    const list = json(["plugin", "list"]);
    expect(list.status).toBe(0);
    expect(list.json.data.find((p: { name: string }) => p.name === "qaprobe")).toMatchObject({
      state: "broken",
      reason: expect.stringContaining(reason),
    });
    expect(json(["networks"]).status).toBe(0);
    const schema = run(["--json-schema"], { password: null });
    expect(schema.status).toBe(0);
    expect(schema.stderr).toContain("plugin qaprobe is broken");
    expect(
      JSON.parse(schema.stdout).commands.some((c: { id: string }) => c.id.startsWith("qaprobe.")),
    ).toBe(false);
  });

  it("is reported as incompatible when its manifest needs a newer wallet-cli", () => {
    install();
    const path = join(testHome, "plugins/qaprobe/active.json");
    const active = JSON.parse(readFileSync(path, "utf8"));
    writeFileSync(path, JSON.stringify({ ...active, apiRevision: active.apiRevision + 1 }));
    const r = json(["qaprobe", "read", "--value", "ok"]);
    expect(r.status).toBe(1);
    expect(r.json.error).toMatchObject({
      code: "plugin_incompatible",
      details: { plugin: "qaprobe", update: "wallet-cli" },
    });
    expect(
      json(["plugin", "list"]).json.data.find((p: { name: string }) => p.name === "qaprobe"),
    ).toMatchObject({ state: "incompatible" });
  });
});

describe("a plugin's credential", () => {
  const KEY = "qaprobe-fixture-key-0001";
  const config = () => join(testHome, "config.yaml");
  const writeKey = () =>
    run(["--output", "json", "config", "qaprobeApiKey", "--api-key-stdin"], {
      input: `${KEY}\n`,
      password: null,
    });

  it("is unknown to config while no plugin declares it", () => {
    const listing = json(["config"]);
    expect(listing.status).toBe(0);
    expect(Object.keys(listing.json.data)).not.toContain("qaprobeApiKey");
    const write = writeKey();
    expect(write.status).toBe(2);
    expect(write.json.error).toMatchObject({
      code: "invalid_value",
      message: "unknown config key: qaprobeApiKey",
    });
    expect(json(["config", "qaprobeApiKey"]).status).toBe(2);
    expect(existsSync(config())).toBe(false);
  });

  it("is listed, written from stdin only, read and used masked once the plugin is installed", () => {
    install();
    const help = run(["config", "--help"], { password: null });
    expect(help.stdout).toContain("qaprobeApiKey: API key of the QA probe service");

    const written = writeKey();
    expect(written.status, written.stdout + written.stderr).toBe(0);
    expect(written.json.data).toEqual({
      key: "qaprobeApiKey",
      value: "********",
      input: "********",
    });
    expect(readFileSync(config(), "utf8")).toContain(`qaprobeApiKey: ${KEY}`);
    expect(statSync(config()).mode & 0o777).toBe(0o600);
    expect(json(["config", "qaprobeApiKey"]).json.data).toEqual({
      key: "qaprobeApiKey",
      value: "********",
    });
    expect(json(["config"]).json.data.qaprobeApiKey).toBe("********");

    const argv = json(["config", "qaprobeApiKey", "k1"]);
    expect(argv.status).toBe(2);
    expect(argv.json.error.code).toBe("invalid_option");

    expect(json(["qaprobe", "credential"]).json.data).toEqual({
      key: "qaprobeApiKey",
      configured: true,
    });
    for (const output of ["json", "text"]) {
      const echo = run(["--output", output, "qaprobe", "credential", "--echo"], {
        password: null,
      });
      expect(echo.status, echo.stdout + echo.stderr).toBe(0);
      expect(echo.stdout + echo.stderr).not.toContain(KEY);
      expect(echo.stdout).toContain("********");
      expect(echo.stderr).toContain("qaprobe received ********");
    }
  });

  it("is subject to the mode check of a core credential", () => {
    install();
    expect(writeKey().status).toBe(0);
    chmodSync(config(), 0o640);
    const probe = json(["qaprobe", "credential"]);
    expect(probe.status).toBe(2);
    expect(probe.json.error.code).toBe("insecure_config");
  });

  it("stays in the file after the plugin is removed, and is found again on reinstall", () => {
    install();
    expect(writeKey().status).toBe(0);
    expect(json(["plugin", "remove", "qaprobe"]).status).toBe(0);
    expect(Object.keys(json(["config"]).json.data)).not.toContain("qaprobeApiKey");
    expect(json(["config", "qaprobeApiKey"]).status).toBe(2);
    expect(json(["list"]).status).toBe(0);
    expect(readFileSync(config(), "utf8")).toContain(`qaprobeApiKey: ${KEY}`);
    install();
    expect(json(["qaprobe", "credential"]).json.data).toEqual({
      key: "qaprobeApiKey",
      configured: true,
    });
  });

  it("refuses to install a plugin that declares a core configuration key", () => {
    const r = json(["plugin", "install", archives.get("credential-core-key")!]);
    expect(r.status).toBe(1);
    expect(r.json.error.code).toBe("plugin_invalid");
    expect(existsSync(join(testHome, "plugins/qaprobe/active.json"))).toBe(false);
  });
});
