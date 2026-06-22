import { describe, it, expect, beforeEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Keystore } from "../src/infra/keystore/index.js";
import { TokenBook } from "../src/infra/tokenbook/index.js";
import { AtomicFileStore } from "../src/core/fs/index.js";
import type { TokenEntry } from "../src/core/types/index.js";

const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");
const ENTRY = join(process.cwd(), "src", "index.ts");
const MNEMONIC = "test test test test test test test test test test test junk";
const EVM0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const DEFAULT_PW = "testpw123A";

let HOME: string;
beforeEach(() => {
  HOME = mkdtempSync(join(tmpdir(), "wcli-"));
});

// Secret model (§7.13.1): master password via stdin (--password-stdin); two-secret import is
// interactive so it can't run as a black-box subprocess — wallet setup uses seedWallet() to write
// the keystore in-process instead. No MASTER_PASSWORD env. password:null → no source (auth_required).
function run(args: string[], opts: { input?: string; password?: string | null } = {}) {
  const env: Record<string, string> = { ...process.env, WALLET_CLI_HOME: HOME } as Record<string, string>;
  delete env.MASTER_PASSWORD;
  const finalArgs = [...args];
  let stdin = opts.input;
  if (opts.password !== null) {
    finalArgs.push("--password-stdin");
    stdin = (opts.password ?? DEFAULT_PW) + "\n";
  }
  const r = spawnSync(TSX, [ENTRY, ...finalArgs], { input: stdin, encoding: "utf8", env });
  let json: any;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* not json */
  }
  return { stdout: r.stdout, stderr: r.stderr, status: r.status, json };
}

// Write the keystore directly (bypassing the now-interactive CLI import) so wallet-dependent
// tests have a funded identity; the seed is encrypted with DEFAULT_PW, matching run()'s default.
function seedWallet(label = "main") {
  const ks = new Keystore(HOME, new AtomicFileStore(), () => DEFAULT_PW);
  return ks.import({ secret: MNEMONIC, type: "seed", label }).accountId;
}

// Write a user-layer token directly (bypassing the live-RPC add-token path) so list/remove
// can be exercised deterministically — mirrors seedWallet()'s in-process keystore approach.
function seedToken(networkId: string, ref: string, entry: TokenEntry) {
  new TokenBook(HOME, new AtomicFileStore()).add(networkId, ref, entry);
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
    expect(cmd.requires).toMatchObject({ network: "required", auth: "required", wallet: "optional" });
    expect(cmd.inputSchema.properties.to).toBeDefined();
  });

  it("namespace --json-schema scopes the catalog to that namespace", () => {
    const r = run(["evm", "--json-schema"], { password: null });
    expect(r.status).toBe(0);
    expect(r.json.commands.every((c: { namespace: string }) => c.namespace === "evm")).toBe(true);
  });
});

describe("golden CLI — wallet lifecycle (shared identity)", () => {
  // TODO:interactive — import-mnemonic now reads mnemonic + master password via interactive hidden
  // input (spec §6 / plan §7.13.1); it can't run as a black-box subprocess. Re-enable once the
  // prompt layer lands. Identity derivation itself is covered by seedWallet() + export-address below.
  it.skip("imports a seed and derives the same identity for both chains (pending interactive)", () => {
    const ref = seedWallet();
    const exp = run(["--output", "json", "wallet", "export-address"], {});
    expect(exp.json.data.addresses.evm).toBe(EVM0);
    expect(typeof ref).toBe("string");
  });

  it("lists, sets active, renames, exports addresses", () => {
    seedWallet();
    const list = run(["--output", "json", "wallet", "list"]);
    expect(list.json.data[0].label).toBe("main");
    expect(list.json.data[0].active).toBe(true);

    const rename = run(["--output", "json", "wallet", "rename", "--account", "main", "--label", "primary"]);
    expect(rename.status).toBe(0);

    const exp = run(["--output", "json", "wallet", "export-address", "--network", "base"]);
    expect(exp.json.data.addresses.evm).toBe(EVM0);
    expect(exp.json.data.addresses.tron).toBeUndefined();
  });

  it("signs a message deterministically with the active EVM account", () => {
    seedWallet();
    const r = run(["--output", "json", "evm", "message", "sign", "--message", "hello world"]);
    expect(r.status).toBe(0);
    // canonical anvil signature for "hello world" with account #0
    expect(r.json.data.signature).toBe(
      "0xa461f509887bd19e312c0c58467ce8ff8e300d3c1a90b608a760c5b80318eaf15fe57c96f9175d6cd4daad4663763baa7e78836e067d0163e9a2ccf2ff753f5b1b",
    );
  });

  it("backup writes the secret to a 0600 file, never to stdout", () => {
    seedWallet();
    const out = join(HOME, "bak.json");
    const r = run(["--output", "json", "wallet", "backup", "--account", "main", "--out", out]);
    expect(r.status).toBe(0);
    // stdout carries metadata + path only — no secret in the envelope
    expect(r.json.data.out).toBe(out);
    expect(JSON.stringify(r.json)).not.toContain("junk"); // mnemonic word must not leak to stdout
    // the file holds the plaintext secret, at 0600
    const file = JSON.parse(readFileSync(out, "utf8"));
    expect(file.secretType).toBe("mnemonic");
    expect(file.mnemonic).toBe(MNEMONIC);
    expect(statSync(out).mode & 0o777).toBe(0o600);
    // refuses to clobber an existing file → exit 2
    const again = run(["--output", "json", "wallet", "backup", "--account", "main", "--out", out]);
    expect(again.status).toBe(2);
    expect(again.json.error.code).toBe("output_exists");
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

  it("unknown top-level namespace → unknown_command, exit 2 (no silent exit 0)", () => {
    const r = run(["--output", "json", "foobar", "list"]);
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
    const r = run(["--output", "json", "tron", "token", "balance", "--network", "nile", "--contract", "0xnope"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
  });

  it("resource delegate --lock-period without --lock → invalid_value, exit 2", () => {
    const r = run(["--output", "json", "tron", "resource", "delegate", "--network", "nile",
      "--amount-sun", "1000000", "--receiver", "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7", "--lock-period", "100"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
  });

  it("wrong master password → auth_failed, exit 1", () => {
    seedWallet();
    const r = run(["--output", "json", "evm", "message", "sign", "--message", "hi"], { password: "WRONGpw999" });
    expect(r.status).toBe(1);
    expect(r.json.error.code).toBe("auth_failed");
  });

  it("auth-required command with no password source → auth_required up front, exit 1", () => {
    seedWallet();
    const r = run(["--output", "json", "evm", "message", "sign", "--message", "hi"], { password: null });
    expect(r.status).toBe(1);
    expect(r.json.error.code).toBe("auth_required");
  });
});

describe("golden CLI — token address-book (local, no RPC)", () => {
  // a real valid base58check address (the CLI validates --contract); not actually a token contract.
  const CUSTOM: TokenEntry = { kind: "trc20", id: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb", symbol: "CUS", decimals: 8, name: "Custom" };

  it("list-tokens shows the official layer on mainnet (default network), tagged official", () => {
    seedWallet();
    const r = run(["--output", "json", "tron", "account", "list-tokens"]);
    expect(r.status).toBe(0);
    expect(r.json.data.network).toBe("tron:mainnet");
    expect(r.json.data.tokens.map((t: { symbol: string }) => t.symbol)).toEqual(["USDT", "USDC"]);
    expect(r.json.data.tokens.every((t: { source: string }) => t.source === "official")).toBe(true);
  });

  it("list-tokens shows a user-added token tagged user (nile, empty official layer)", () => {
    const ref = seedWallet();
    seedToken("tron:nile", ref, CUSTOM);
    const r = run(["--output", "json", "tron", "account", "list-tokens", "--network", "nile"]);
    expect(r.status).toBe(0);
    expect(r.json.data.tokens).toHaveLength(1);
    expect(r.json.data.tokens[0]).toMatchObject({ symbol: "CUS", source: "user" });
  });

  it("remove-token of an official token → token_is_official, exit 2", () => {
    seedWallet();
    const r = run(["--output", "json", "tron", "account", "remove-token", "--contract", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("token_is_official");
  });

  it("remove-token of a user token succeeds; removing an absent one → token_not_in_book, exit 2", () => {
    const ref = seedWallet();
    seedToken("tron:nile", ref, CUSTOM);
    const ok = run(["--output", "json", "tron", "account", "remove-token", "--network", "nile", "--contract", CUSTOM.id]);
    expect(ok.status).toBe(0);
    expect(ok.json.data.removed.symbol).toBe("CUS");
    const again = run(["--output", "json", "tron", "account", "remove-token", "--network", "nile", "--contract", CUSTOM.id]);
    expect(again.status).toBe(2);
    expect(again.json.error.code).toBe("token_not_in_book");
  });

  it("add/remove-token require exactly one of --contract / --asset-id → exit 2", () => {
    seedWallet();
    const r = run(["--output", "json", "tron", "account", "remove-token", "--network", "nile"]);
    expect(r.status).toBe(2);
  });
});

describe("golden CLI — fixes regression", () => {
  it("-o json short alias selects JSON output", () => {
    const r = run(["-o", "json", "chains", "list"]);
    expect(r.status).toBe(0);
    expect(r.json.success).toBe(true);
  });

  it("a value flag for a newly-added command resolves via zod arity (amount-wei reaches the schema)", () => {
    seedWallet();
    // invalid (non-numeric) amount must be a zod invalid_value, proving the value reached the schema
    const r = run(["--output", "json", "evm", "tx", "send-native", "--network", "base", "--to",
      "0x0000000000000000000000000000000000000001", "--amount-wei", "notanumber", "--dry-run"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
  });
});
