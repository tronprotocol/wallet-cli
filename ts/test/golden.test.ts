import { describe, it, expect, beforeEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");
const ENTRY = join(process.cwd(), "src", "index.ts");
const MNEMONIC = "test test test test test test test test test test test junk";
const EVM0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

let HOME: string;
beforeEach(() => {
  HOME = mkdtempSync(join(tmpdir(), "wcli-"));
});

function run(args: string[], opts: { input?: string; password?: string | null } = {}) {
  const env: Record<string, string> = { ...process.env, WALLET_CLI_HOME: HOME } as Record<string, string>;
  if (opts.password === null) delete env.MASTER_PASSWORD;
  else env.MASTER_PASSWORD = opts.password ?? "testpw123A";
  const r = spawnSync(TSX, [ENTRY, ...args], { input: opts.input, encoding: "utf8", env });
  let json: any;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* not json */
  }
  return { stdout: r.stdout, stderr: r.stderr, status: r.status, json };
}

function importSeed() {
  return run(["--output", "json", "wallet", "import", "--type", "seed", "--mnemonic-stdin", "--label", "main"], {
    input: MNEMONIC + "\n",
  });
}

describe("golden CLI — meta & introspection", () => {
  it("--version prints the version, exit 0", () => {
    const r = run(["--version"]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("0.1.0");
  });

  it("chains list omits chain (neutral), exit 0", () => {
    const r = run(["--output", "json", "chains", "list"]);
    expect(r.status).toBe(0);
    expect(r.json.success).toBe(true);
    expect(r.json.chain).toBeUndefined();
    expect(r.json.data.length).toBeGreaterThan(4);
  });

  it("capabilities includes chain (network-bound), exit 0", () => {
    const r = run(["--output", "json", "capabilities", "--network", "nile"]);
    expect(r.status).toBe(0);
    expect(r.json.chain.networkId).toBe("tron:nile");
    expect(r.json.data.capabilities).toContain("tx.native.transfer");
  });

  it("--json-schema emits an agent schema for a command", () => {
    const r = run(["evm", "tx", "send-native", "--json-schema"]);
    expect(r.status).toBe(0);
    expect(r.json.properties.to).toBeDefined();
    expect(r.json.required).toContain("amountWei");
  });
});

describe("golden CLI — wallet lifecycle (shared identity)", () => {
  it("imports a seed and derives the same identity for both chains", () => {
    const r = importSeed();
    expect(r.status).toBe(0);
    expect(r.json.data.addresses.evm).toBe(EVM0);
    expect(r.json.data.addresses.tron.startsWith("T")).toBe(true);
  });

  it("lists, sets active, renames, exports addresses", () => {
    importSeed();
    const list = run(["--output", "json", "wallet", "list"]);
    expect(list.json.data[0].label).toBe("main");
    expect(list.json.data[0].active).toBe(true);

    const rename = run(["--output", "json", "wallet", "rename", "--account", "main", "--label", "primary"]);
    expect(rename.status).toBe(0);

    const exp = run(["--output", "json", "wallet", "export-address", "--family", "evm"]);
    expect(exp.json.data.addresses.evm).toBe(EVM0);
  });

  it("signs a message deterministically with the active EVM account", () => {
    importSeed();
    const r = run(["--output", "json", "evm", "message", "sign", "--message", "hello world"]);
    expect(r.status).toBe(0);
    // canonical anvil signature for "hello world" with account #0
    expect(r.json.data.signature).toBe(
      "0xa461f509887bd19e312c0c58467ce8ff8e300d3c1a90b608a760c5b80318eaf15fe57c96f9175d6cd4daad4663763baa7e78836e067d0163e9a2ccf2ff753f5b1b",
    );
  });
});

describe("golden CLI — error contract (exit codes)", () => {
  it("unknown command → exit 2", () => {
    const r = run(["--output", "json", "tron", "bogus", "action", "--network", "nile"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("unknown_command");
  });

  it("missing network → exit 2", () => {
    const r = run(["--output", "json", "tron", "account", "balance"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("missing_network");
  });

  it("network_family_mismatch → exit 2", () => {
    const r = run(["--output", "json", "tron", "account", "balance", "--network", "base"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("network_family_mismatch");
  });

  it("invalid address value → exit 2", () => {
    const r = run(["--output", "json", "tron", "account", "balance", "--network", "nile", "--address", "0xnope"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
  });

  it("wrong master password → auth_failed, exit 1", () => {
    importSeed();
    const r = run(["--output", "json", "evm", "message", "sign", "--message", "hi"], { password: "WRONGpw999" });
    expect(r.status).toBe(1);
    expect(r.json.error.code).toBe("auth_failed");
  });

  it("auth-required command with no password source → auth_required up front, exit 1", () => {
    importSeed();
    const r = run(["--output", "json", "evm", "message", "sign", "--message", "hi"], { password: null });
    expect(r.status).toBe(1);
    expect(r.json.error.code).toBe("auth_required");
  });
});

describe("golden CLI — fixes regression", () => {
  it("-o json short alias selects JSON output", () => {
    const r = run(["-o", "json", "chains", "list"]);
    expect(r.status).toBe(0);
    expect(r.json.success).toBe(true);
  });

  it("a value flag for a newly-added command resolves via zod arity (amount-wei reaches the schema)", () => {
    importSeed();
    // invalid (non-numeric) amount must be a zod invalid_value, proving the value reached the schema
    const r = run(["--output", "json", "evm", "tx", "send-native", "--network", "base", "--to",
      "0x0000000000000000000000000000000000000001", "--amount-wei", "notanumber", "--dry-run"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
  });
});
