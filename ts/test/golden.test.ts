import { describe, it, expect, beforeEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
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

// Secret model (§7.13.1): master password via a file (--password-file), other secrets via stdin.
// No MASTER_PASSWORD env. password:null → no source at all (auth_required path).
function run(args: string[], opts: { input?: string; password?: string | null } = {}) {
  const env: Record<string, string> = { ...process.env, WALLET_CLI_HOME: HOME } as Record<string, string>;
  delete env.MASTER_PASSWORD;
  const finalArgs = [...args];
  if (opts.password !== null) {
    const pwFile = join(HOME, "pw.txt");
    writeFileSync(pwFile, opts.password ?? "testpw123A");
    finalArgs.push("--password-file", pwFile);
  }
  const r = spawnSync(TSX, [ENTRY, ...finalArgs], { input: opts.input, encoding: "utf8", env });
  let json: any;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* not json */
  }
  return { stdout: r.stdout, stderr: r.stderr, status: r.status, json };
}

function importSeed() {
  return run(["--output", "json", "wallet", "import-mnemonic", "--mnemonic-stdin", "--label", "main"], {
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
    // builtin networks: 3 TRON (mainnet/nile/shasta) + 6 EVM (eth/bsc/sepolia/base/optimism/arbitrum)
    expect(r.json.data).toHaveLength(9);
    const ids = r.json.data.map((n: { id: string }) => n.id);
    expect(ids).toContain("evm:42161"); // arbitrum
  });

  it("capabilities includes chain (network-bound) and key+summary descriptors, exit 0", () => {
    const r = run(["--output", "json", "capabilities", "--network", "nile"]);
    expect(r.status).toBe(0);
    expect(r.json.chain.networkId).toBe("tron:nile");
    const keys = r.json.data.capabilities.map((c: { key: string }) => c.key);
    expect(keys).toContain("tx.native.transfer");
    // each descriptor carries a human summary (single source: the chain module)
    expect(r.json.data.capabilities.every((c: { summary?: string }) => typeof c.summary === "string")).toBe(true);
    // reconciled: no capability is advertised without a backing command
    expect(keys).not.toContain("governance.vote");
    expect(keys).not.toContain("staking.delegate");
  });

  it("--json-schema emits an agent schema for a command", () => {
    const r = run(["evm", "tx", "send-native", "--json-schema"], { password: null });
    expect(r.status).toBe(0);
    expect(r.json.properties.to).toBeDefined();
    expect(r.json.required).toContain("amountWei");
  });

  it("root --json-schema emits a full command catalog with global flags", () => {
    const r = run(["--json-schema"], { password: null });
    expect(r.status).toBe(0);
    expect(r.json.tool).toBe("wallet-cli");
    expect(r.json.globalFlags.length).toBeGreaterThan(0);
    const cmd = r.json.commands.find((c: { id: string }) => c.id === "tron.tx.send-native");
    expect(cmd.usage).toBe("wallet-cli tron tx send-native [flags]");
    expect(cmd.requires).toMatchObject({ network: "required", auth: "required", wallet: "required" });
    expect(cmd.inputSchema.properties.to).toBeDefined();
  });

  it("namespace --json-schema scopes the catalog to that namespace", () => {
    const r = run(["evm", "--json-schema"], { password: null });
    expect(r.status).toBe(0);
    expect(r.json.commands.every((c: { namespace: string }) => c.namespace === "evm")).toBe(true);
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

describe("golden CLI — watch wallet (import, no signer)", () => {
  it("imports a watch account, auto-detecting the family from the address, exit 0", () => {
    const r = run(["--output", "json", "wallet", "import-watch", "--address", EVM0, "--label", "obs"]);
    expect(r.status).toBe(0);
    expect(r.json.data.addresses.evm).toBe(EVM0);
    const list = run(["--output", "json", "wallet", "list"]);
    expect(list.json.data[0].type).toBe("watch");
    expect(list.json.data[0].active).toBe(true);
  });

  it("rejects an unrecognised watch address → invalid_option, exit 2 (§7.14.2)", () => {
    const r = run(["--output", "json", "wallet", "import-watch", "--address", "not-an-address"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_option");
  });

  it("refuses to sign with a watch-only active account → watch_only_no_signer, exit 1", () => {
    run(["--output", "json", "wallet", "import-watch", "--address", EVM0, "--label", "obs"]);
    const r = run(["--output", "json", "evm", "message", "sign", "--message", "hi"]);
    expect(r.status).toBe(1);
    expect(r.json.error.code).toBe("watch_only_no_signer");
  });
});

describe("golden CLI — error contract (exit codes)", () => {
  it("unknown command → exit 2", () => {
    const r = run(["--output", "json", "tron", "bogus", "action", "--network", "nile"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("unknown_command");
  });

  it("missing network on a chain-mutating (net=required) command → exit 2", () => {
    // account balance is now net=optional; use a signing command which stays net=required.
    const r = run(["--output", "json", "tron", "tx", "send-native"]);
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
