import { describe, it, expect, beforeEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Keystore } from "../src/adapters/outbound/keystore/index.js";
import { TokenBook } from "../src/adapters/outbound/tokenbook/index.js";
import { AtomicFileStore } from "../src/adapters/outbound/persistence/fs/index.js";
import type { TokenEntry } from "../src/domain/types/index.js";

const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");
const ENTRY = join(process.cwd(), "src", "index.ts");
const MNEMONIC = "test test test test test test test test test test test junk";
const TRON1 = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
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
  // 25s < the suite's 30s testTimeout: a genuinely hung subprocess errors here with a clear
  // signal instead of silently eating the whole test budget.
  const r = spawnSync(TSX, [ENTRY, ...finalArgs], { input: stdin, encoding: "utf8", env, timeout: 25_000 });
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

// Write a user-layer token directly (bypassing the live-RPC `token add` path) so list/remove
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

  it("root --help shows the TRON first-release command surface", () => {
    const r = run(["--help"], { password: null });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("wallet-cli — CLI wallet for TRON.");
    expect(r.stdout).toContain("Usage:  wallet-cli [OPTIONS] COMMAND");
    expect(r.stdout).toContain("Common Commands:");
    expect(r.stdout).toContain("Management Commands:");
    expect(r.stdout).toContain("Global Options:");
    expect(r.stdout).toContain("  current");
    expect(r.stdout).toContain("  use");
    expect(r.stdout).toContain("  import");
    expect(r.stdout).toContain("  account");
    expect(r.stdout).toContain("  tx");
    expect(r.stdout).not.toContain("Learn more:");
    expect(r.stdout).not.toMatch(/^  import watch\s/m);
    expect(r.stdout).not.toMatch(/^  account balance\s/m);
    expect(r.stdout).not.toMatch(/^  tx send\s/m);
    expect(r.stdout).not.toMatch(/^  send\s/m);
    expect(r.stdout).not.toMatch(/^  balance\s/m);
    expect(r.stdout).not.toMatch(/^  portfolio\s/m);
    expect(r.stdout).not.toContain("wallet-cli <resource>");
    expect(r.stdout).toContain("Run 'wallet-cli COMMAND --help' for more information on a command.");
  });

  it("networks omits chain (neutral), exit 0", () => {
    const r = run(["--output", "json", "networks"]);
    expect(r.status).toBe(0);
    expect(r.json.success).toBe(true);
    expect(r.json.chain).toBeUndefined();
    const ids = r.json.data.map((n: { id: string }) => n.id);
    // only the 3 TRON networks ship
    expect(ids).toEqual(expect.arrayContaining(["tron:mainnet", "tron:nile", "tron:shasta"]));
    expect(ids).toHaveLength(3);
    expect(ids.some((id: string) => id.startsWith("evm:"))).toBe(false);
  });

  it("--json-schema emits an agent schema for a command", () => {
    const r = run(["import", "watch", "--json-schema"], { password: null });
    expect(r.status).toBe(0);
    expect(r.json.properties.address).toBeDefined();
    expect(r.json.required).toContain("address");
  });

  it("root --json-schema emits a full command catalog with global flags", () => {
    const r = run(["--json-schema"], { password: null });
    expect(r.status).toBe(0);
    expect(r.json.tool).toBe("wallet-cli");
    expect(r.json.globalFlags.length).toBeGreaterThan(0);
    const globalFlags = r.json.globalFlags.map((g: { flag: string }) => g.flag);
    expect(globalFlags).not.toContain("--quiet");
    expect(globalFlags).not.toContain("--rpc-url");
    expect(globalFlags).not.toContain("--grpc-endpoint");
    expect(globalFlags).toContain("--password-stdin");
    expect(globalFlags).not.toContain("--mnemonic-stdin");
    expect(r.json.aliases).toBeUndefined();
    const cmd = r.json.commands.find((c: { id: string }) => c.id === "tx.send");
    expect(cmd.usage).toBe("wallet-cli tx send [options]");
    expect(cmd.requires).toMatchObject({ network: "optional", auth: "required", wallet: "optional" });
    expect(cmd.inputSchema.properties.to).toBeDefined();
    const importMnemonic = r.json.commands.find((c: { id: string }) => c.id === "import.mnemonic");
    // TTY-only setup op: the mnemonic is entered interactively, so there is no --*-stdin input flag.
    expect(importMnemonic.inputFlags).toBeUndefined();
    const broadcast = r.json.commands.find((c: { id: string }) => c.id === "tx.broadcast");
    expect(broadcast.inputFlags.map((g: { flag: string }) => g.flag)).toContain("--tx-stdin");
    const importWatch = r.json.commands.find((c: { id: string }) => c.id === "import.watch");
    expect(importWatch.usage).toBe("wallet-cli import watch [options]");
  });

  it("family --json-schema scopes the catalog to that chain family", () => {
    const r = run(["tron", "--json-schema"], { password: null });
    expect(r.status).toBe(0);
    expect(r.json.commands.length).toBeGreaterThan(0);
    expect(r.json.commands.every((c: { kind: string; family?: string; families?: string[] }) => c.kind === "chain" && (c.family === "tron" || (c.families?.includes("tron") ?? false)))).toBe(true);
  });

  it("config shorthand shows, reads, and writes defaultNetwork", () => {
    const all = run(["--output", "json", "config"], { password: null });
    expect(all.status).toBe(0);
    expect(all.json.data.defaultNetwork).toBe("tron:mainnet");

    const get = run(["--output", "json", "config", "defaultNetwork"], { password: null });
    expect(get.status).toBe(0);
    expect(get.json.data).toMatchObject({ key: "defaultNetwork", value: "tron:mainnet" });

    const set = run(["--output", "json", "config", "defaultNetwork", "tron:nile"], { password: null });
    expect(set.status).toBe(0);
    expect(set.json.data).toMatchObject({ key: "defaultNetwork", value: "tron:nile", input: "tron:nile" });

    const getAgain = run(["--output", "json", "config", "defaultNetwork"], { password: null });
    expect(getAgain.json.data.value).toBe("tron:nile");
  });
});

describe("golden CLI — wallet lifecycle (shared identity)", () => {
  it("lists, sets active, renames", () => {
    seedWallet();
    const list = run(["--output", "json", "list"]);
    expect(list.json.data[0].label).toBe("main");
    expect(list.json.data[0].active).toBe(true);

    const rename = run(["--output", "json", "rename", "main", "--label", "primary"]);
    expect(rename.status).toBe(0);

    const current = run(["--output", "json", "current"]);
    expect(current.status).toBe(0);
    expect(current.json.command).toBe("current");
    expect(current.json.data.label).toBe("primary");
  });

  it("routes root-level message sign through the selected network family", () => {
    seedWallet();
    const r = run(["--output", "json", "message", "sign", "--network", "tron:nile", "--message", "hello world"]);
    expect(r.status).toBe(0);
    expect(r.json.command).toBe("message.sign");
    expect(r.json.chain.network).toBe("tron:nile");
  });

  it("routes root-level send and validates human amount decimals before RPC", () => {
    seedWallet();
    const r = run(["--output", "json", "tx", "send", "--network", "tron:nile", "--to", TRON1, "--amount", "0.0000000000000000001", "--dry-run"]);
    expect(r.status).toBe(2);
    expect(r.json.command).toBe("tx.send");
    expect(r.json.error.code).toBe("invalid_amount");
  });

  it("resolves TRON send --token from the address book before amount conversion", () => {
    seedWallet();
    const r = run([
      "--output", "json", "tx", "send", "--network", "tron:mainnet", "--to", "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7",
      "--token", "USDT", "--amount", "0.0000001", "--dry-run",
    ]);
    expect(r.status).toBe(2);
    expect(r.json.command).toBe("tx.send");
    expect(r.json.error.code).toBe("invalid_amount");
  });

  it("backup writes the secret to a 0600 file, never to stdout", () => {
    seedWallet();
    const out = join(HOME, "bak.json");
    const r = run(["--output", "json", "backup", "main", "--out", out]);
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
    const again = run(["--output", "json", "backup", "main", "--out", out]);
    expect(again.status).toBe(2);
    expect(again.json.error.code).toBe("output_exists");
  }, 15000); // seed encrypt + two backup decrypts run scrypt 3× → exceeds vitest's 5s default

  it("supports root-level use and backup account commands", () => {
    seedWallet();
    const use = run(["--output", "json", "use", "main"], { password: null });
    expect(use.status).toBe(0);
    expect(use.json.command).toBe("use");

    const out = join(HOME, "root-bak.json");
    const backup = run(["--output", "json", "backup", "main", "--out", out]);
    expect(backup.status).toBe(0);
    expect(backup.json.command).toBe("backup");
    expect(backup.json.data.out).toBe(out);
  });

  it("derive makes the newly derived HD account the active one (§1.7)", () => {
    const seedId = seedWallet().split(".")[0]; // "main" at index 0, active; seed id = wlt_x
    const r = run(["--output", "json", "derive", "--seed-id", seedId, "--label", "child"]);
    expect(r.status).toBe(0);
    expect(r.json.command).toBe("derive");
    expect(r.json.data.index).toBe(1);
    expect(r.json.data.active).toBe(true); // derive auto-activates, not active:false
    // and `current` now resolves to the derived child, confirming the switch persisted
    const current = run(["--output", "json", "current"], { password: null });
    expect(current.json.data.label).toBe("child");
  });
});

describe("golden CLI — command help contracts", () => {
  it("import ledger --help documents the device precondition (B5)", () => {
    const r = run(["import", "ledger", "--help"], { password: null });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Requires:");
    expect(r.stdout).toMatch(/connected, unlocked Ledger/);
  });

  it("tx send --help summary leads with 'Send' and human --amount (E2)", () => {
    const r = run(["tx", "send", "--help"], { password: null });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Send native TRX or TRC20/TRC10 tokens with human --amount");
  });

  it("block --help documents the height as a positional arg, not a --number flag (H4)", () => {
    const r = run(["block", "--help"], { password: null });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("wallet-cli block [<number>]");
    expect(r.stdout).toMatch(/Args:\s*\n\s*number\s/);
    expect(r.stdout).not.toContain("--number"); // positional-only surface, flag dropped from help
  });

  it("account-positional commands document <account> under Args, not as a --account flag", () => {
    const r = run(["rename", "--help"], { password: null });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("wallet-cli rename <account>");
    expect(r.stdout).toMatch(/Args:\s*\n\s*account\s/);
    expect(r.stdout).not.toContain("--account"); // unified positional mechanism hides the flag
    expect(r.stdout).toContain("--label"); // sibling flags still listed
  });
});

describe("golden CLI — watch wallet (import, no signer)", () => {
  it("imports a watch account, auto-detecting the family from the address, exit 0", () => {
    const r = run(["--output", "json", "import", "watch", "--address", TRON1, "--label", "obs"]);
    expect(r.status).toBe(0);
    expect(r.json.data.addresses.tron).toBe(TRON1);
    const list = run(["--output", "json", "list"]);
    expect(list.json.data[0].type).toBe("watch");
    expect(list.json.data[0].active).toBe(true);
  });

  it("imports a watch account through the import source command", () => {
    const r = run(["--output", "json", "import", "watch", "--address", TRON1, "--label", "obs"]);
    expect(r.status).toBe(0);
    expect(r.json.command).toBe("import.watch");
    expect(r.json.data.addresses.tron).toBe(TRON1);
  });

  it("rejects an unrecognised watch address → invalid_value, exit 2 (§7.14.2)", () => {
    const r = run(["--output", "json", "import", "watch", "--address", "not-an-address"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
  });

  it("deletes an account through the root positional delete command", () => {
    seedWallet();
    const r = run(["--output", "json", "delete", "main", "--yes"], { password: null });
    expect(r.status).toBe(0);
    expect(r.json.command).toBe("delete");
    expect(r.json.data.newActive).toBeNull();
  });

  it("refuses to sign with a watch-only active account → watch_only_no_signer, exit 1", () => {
    run(["--output", "json", "import", "watch", "--address", TRON1, "--label", "obs"]);
    const r = run(["--output", "json", "message", "sign", "--network", "tron:nile", "--message", "hi"]);
    expect(r.status).toBe(1);
    expect(r.json.error.code).toBe("watch_only_no_signer");
  });
});

describe("golden CLI — error contract (exit codes)", () => {
  it("unknown command → exit 2", () => {
    const r = run(["--output", "json", "tron", "bogus", "action", "--network", "tron:nile"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("unknown_command");
  });

  it("unknown top-level namespace → unknown_command, exit 2 (no silent exit 0)", () => {
    const r = run(["--output", "json", "foobar", "list"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("unknown_command");
  });

  it("omitted network on a chain-mutating command uses defaultNetwork before input validation", () => {
    const r = run(["--output", "json", "tx", "send"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("missing_option");
    expect(r.json.chain.network).toBe("tron:mainnet");
  });

  it("invalid address value → exit 2", () => {
    const r = run(["--output", "json", "token", "balance", "--network", "tron:nile", "--contract", "0xnope"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
  });

  it("stake delegate --lock-period without --lock → invalid_value, exit 2", () => {
    const r = run(["--output", "json", "stake", "delegate", "--network", "tron:nile",
      "--amount-sun", "1000000", "--receiver", "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7", "--lock-period", "100"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
  });

  it("tx send --amount 0 → invalid_value, exit 2 (a zero transfer is meaningless)", () => {
    const r = run(["--output", "json", "tx", "send", "--network", "tron:nile",
      "--to", "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7", "--amount", "0"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
  });

  it("stake freeze --amount-sun 0 → invalid_value, exit 2", () => {
    const r = run(["--output", "json", "stake", "freeze", "--network", "tron:nile",
      "--amount-sun", "0", "--resource", "ENERGY"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
  });

  it("contract call --params with non-{type,value} entries → invalid_value, exit 2", () => {
    const r = run(["--output", "json", "contract", "call", "--network", "tron:nile",
      "--contract", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", "--method", "balanceOf(address)",
      "--params", '["0x1"]']);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
  });

  it("wrong master password → auth_failed, exit 1", () => {
    seedWallet();
    const r = run(["--output", "json", "message", "sign", "--network", "tron:nile", "--message", "hi"], { password: "WRONGpw999" });
    expect(r.status).toBe(1);
    expect(r.json.error.code).toBe("auth_failed");
  });

  it("auth-required command with no password source → auth_required up front, exit 1", () => {
    seedWallet();
    const r = run(["--output", "json", "message", "sign", "--network", "tron:nile", "--message", "hi"], { password: null });
    expect(r.status).toBe(1);
    expect(r.json.error.code).toBe("auth_required");
  });

  it("vote cast collects a repeated --for into an array (same SR twice → duplicate, exit 2)", () => {
    seedWallet();
    // Proves the CLI collects a repeated flag into an array. If --for were last-wins, only one
    // entry would reach the service and there'd be no duplicate; the duplicate error confirms both
    // repeated flags arrived. `parseVoteInputs` runs before any RPC, so this needs no network.
    const r = run(["--output", "json", "vote", "cast", "--network", "tron:nile",
      "--for", `${TRON1}=5`, "--for", `${TRON1}=5`, "--dry-run"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
    expect(r.json.error.message).toMatch(/duplicate/i);
  });

  it("vote cast delivers a SINGLE --for as a one-element array, not a split string", () => {
    seedWallet();
    // A lone `--for foo` (no '='): as a one-element array the whole "foo" is one bad entry; as a
    // bare string the service would iterate its characters and complain about 'f'. An error naming
    // the whole 'foo' proves yargs `array: true` delivered [ "foo" ]. No RPC (parse fails first).
    const r = run(["--output", "json", "vote", "cast", "--network", "tron:nile", "--for", "foo", "--dry-run"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
    expect(r.json.error.message).toContain("'foo'");
  });

  // Leaf/group help must carry the doc's user-value semantics, not a compressed one-liner: overwrite
  // semantics + TP math (vote cast), the 30-entry cap on --for, the 24h withdraw cap (reward
  // withdraw), the 0% reward-ratio warning (vote status), and the reward pointer (vote group).
  it("vote --help keeps the reward pointer (group 2nd line)", () => {
    const r = run(["vote", "--help"], { password: null });
    expect(r.stdout).toContain("Vote for super representatives (SR).");
    expect(r.stdout).toContain("Voting accrues rewards — query and claim them with 'wallet-cli reward'.");
  });

  it("vote cast --help spells out overwrite semantics, the 30-entry cap, and TP math", () => {
    const r = run(["vote", "cast", "--help"], { password: null });
    expect(r.stdout).toContain("any previous SR not listed is set to zero");
    expect(r.stdout).toContain("1 vote = 1 Tron Power (TP) = 1 staked TRX");
    expect(r.stdout).toContain("at least 1, at most 30 entries");
  });

  it("vote status --help warns about the 0% reward-ratio case", () => {
    const r = run(["vote", "status", "--help"], { password: null });
    expect(r.stdout).toContain("0% reward ratio");
  });

  it("reward withdraw --help states the 24h withdrawal cap", () => {
    const r = run(["reward", "withdraw", "--help"], { password: null });
    expect(r.stdout).toContain("at most once every 24 hours");
  });

  // stake-query / chain / interactive-import leaf help must also carry the doc's fuller description,
  // not the compressed one-line summary (same fix as vote/reward above).
  it("stake info --help lists the overview fields", () => {
    const r = run(["stake", "info", "--help"], { password: null });
    expect(r.stdout).toContain("pending unstakes, currently withdrawable TRX, and available unfreeze slots");
  });

  it("stake delegated --help explains outbound/inbound lock semantics", () => {
    const r = run(["stake", "delegated", "--help"], { password: null });
    expect(r.stdout).toContain('Outbound shows "Locked until"');
    expect(r.stdout).toContain('inbound shows');
    expect(r.stdout).toContain('"Guaranteed until"');
  });

  it("chain params --help mentions --key for a single value", () => {
    const r = run(["chain", "params", "--help"], { password: null });
    expect(r.stdout).toContain("Use --key for one value");
  });

  it("chain prices --help states the SUN unit basis", () => {
    const r = run(["chain", "prices", "--help"], { password: null });
    expect(r.stdout).toContain("in SUN; 1 TRX = 1,000,000 SUN");
  });

  it("chain node --help explains the sync-vs-tx diagnostic use", () => {
    const r = run(["chain", "node", "--help"], { password: null });
    expect(r.stdout).toContain('node out of sync');
  });

  it("change-password --help notes Ledger/watch are unaffected and TTY-only secrets", () => {
    const r = run(["change-password", "--help"], { password: null });
    expect(r.stdout).toContain("Ledger / watch-only accounts are unaffected");
    expect(r.stdout).toContain("they never touch argv or stdin");
  });

  it("import mnemonic --help documents hidden TTY-only entry", () => {
    const r = run(["import", "mnemonic", "--help"], { password: null });
    expect(r.stdout).toContain("The recovery phrase and master password are read");
    expect(r.stdout).toContain("they never touch argv or stdin");
  });

  it("import private-key --help documents hidden TTY-only entry", () => {
    const r = run(["import", "private-key", "--help"], { password: null });
    expect(r.stdout).toContain("The private key and master password are read");
    expect(r.stdout).toContain("they never touch argv or stdin");
  });
});

describe("golden CLI — token address-book (local, no RPC)", () => {
  // a real valid base58check address (the CLI validates --contract); not actually a token contract.
  const CUSTOM: TokenEntry = { kind: "trc20", id: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb", symbol: "CUS", decimals: 8, name: "Custom" };

  it("token list shows the official layer on mainnet (default network), tagged official", () => {
    seedWallet();
    const r = run(["--output", "json", "token", "list"]);
    expect(r.status).toBe(0);
    expect(r.json.data.network).toBe("tron:mainnet");
    expect(r.json.data.tokens.map((t: { symbol: string }) => t.symbol)).toEqual(["USDT", "USDC"]);
    expect(r.json.data.tokens.every((t: { source: string }) => t.source === "official")).toBe(true);
  });

  it("routes root-level token commands through defaultNetwork", () => {
    seedWallet();
    const r = run(["--output", "json", "token", "list"]);
    expect(r.status).toBe(0);
    expect(r.json.command).toBe("token.list");
    expect(r.json.chain.network).toBe("tron:mainnet");
  });

  it("token list shows a user-added token tagged user (nile, empty official layer)", () => {
    const ref = seedWallet();
    seedToken("tron:nile", ref, CUSTOM);
    const r = run(["--output", "json", "token", "list", "--network", "tron:nile"]);
    expect(r.status).toBe(0);
    expect(r.json.data.tokens).toHaveLength(1);
    expect(r.json.data.tokens[0]).toMatchObject({ symbol: "CUS", source: "user" });
  });

  it("token remove of an official token → token_is_official, exit 2", () => {
    seedWallet();
    const r = run(["--output", "json", "token", "remove", "--contract", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("token_is_official");
  });

  it("token remove of a user token succeeds; removing an absent one → token_not_in_book, exit 2", () => {
    const ref = seedWallet();
    seedToken("tron:nile", ref, CUSTOM);
    const ok = run(["--output", "json", "token", "remove", "--network", "tron:nile", "--contract", CUSTOM.id]);
    expect(ok.status).toBe(0);
    expect(ok.json.data.removed.symbol).toBe("CUS");
    const again = run(["--output", "json", "token", "remove", "--network", "tron:nile", "--contract", CUSTOM.id]);
    expect(again.status).toBe(2);
    expect(again.json.error.code).toBe("token_not_in_book");
  });

  it("token add/remove require exactly one of --contract / --asset-id → exit 2", () => {
    seedWallet();
    const r = run(["--output", "json", "token", "remove", "--network", "tron:nile"]);
    expect(r.status).toBe(2);
  });
});

describe("golden CLI — fixes regression", () => {
  it("-o json short alias selects JSON output", () => {
    const r = run(["-o", "json", "networks"]);
    expect(r.status).toBe(0);
    expect(r.json.success).toBe(true);
  });

  it("a value flag resolves via zod arity (raw-amount reaches the schema)", () => {
    seedWallet();
    // invalid (non-numeric) amount must be a zod invalid_value, proving the value reached the schema
    const r = run(["--output", "json", "tx", "send", "--network", "tron:nile", "--to",
      TRON1, "--raw-amount", "notanumber", "--dry-run"]);
    expect(r.status).toBe(2);
    expect(r.json.error.code).toBe("invalid_value");
  });
});
