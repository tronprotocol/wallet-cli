import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { main } from "./runner.js";

const TRON_ADDR = "TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6";

async function runIn(walletsDoc: unknown, tokens: string[]) {
  const root = mkdtempSync(join(tmpdir(), "wcli-mig-"));
  const walletsPath = join(root, "wallets.json");
  writeFileSync(walletsPath, JSON.stringify(walletsDoc));
  const previous = process.env.WALLET_CLI_HOME;
  process.env.WALLET_CLI_HOME = root;
  const stdout: string[] = [];
  const outSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout.push(String(chunk));
    return true;
  });
  const errSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    const code = await main(["node", "wallet-cli", ...tokens]);
    return { code, stdout: stdout.join(""), walletsPath };
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
    if (previous === undefined) delete process.env.WALLET_CLI_HOME;
    else process.env.WALLET_CLI_HOME = previous;
  }
}

const v1SeedDoc = {
  version: 1,
  activeAccount: "wlt_s.0",
  labels: {},
  wallets: [
    {
      id: "wlt_s",
      source: { type: "seed", vaultId: "vlt_1", addresses: { "0": { tron: TRON_ADDR } } },
    },
  ],
};

const v1PrivateKeyDoc = {
  version: 1,
  activeAccount: "wlt_k",
  labels: {},
  wallets: [
    { id: "wlt_k", source: { type: "privateKey", keyId: "key_1", addresses: { tron: TRON_ADDR } } },
  ],
};

/**
 * Ledger is the case that matters most here: a real, signing-capable account that holds no local
 * secret. Such a user may never have set a master password at all — `import ledger` / `import
 * watch` do not ask for one, and a keystore file is never written — so a gate that demanded one
 * would leave them with nothing to type and no way in. The upgrade must be silent, not merely
 * quiet.
 */
const v1LedgerDoc = {
  version: 1,
  activeAccount: "wlt_l",
  labels: { wlt_l: "nano" },
  wallets: [
    {
      id: "wlt_l",
      source: { type: "ledger", family: "tron", path: "m/44'/195'/0'/0/0", address: TRON_ADDR },
    },
  ],
};

// watch and ledger hold no secret anywhere, so this keystore migrates with no prompt at all.
const v1WatchDoc = {
  version: 1,
  activeAccount: "wlt_w",
  labels: { wlt_w: "team-vault" },
  wallets: [{ id: "wlt_w", source: { type: "watch", family: "tron", address: TRON_ADDR } }],
};

describe("the startup migration gate is wired into main()", () => {
  it("refuses a seed keystore with migration_required when no password can be obtained", async () => {
    const { code, stdout, walletsPath } = await runIn(v1SeedDoc, ["-o", "json", "list"]);

    expect(JSON.parse(stdout).error.code).toBe("migration_required");
    expect(code).toBe(2);
    expect(JSON.parse(readFileSync(walletsPath, "utf8")).version).toBe(1);
  });

  // A privateKey wallet is re-derived from its decrypted key, exactly as a seed wallet is, so
  // it needs the password too. Only sources with NO local secret migrate free.
  it("refuses a privateKey keystore with migration_required when no password can be obtained", async () => {
    const { code, stdout } = await runIn(v1PrivateKeyDoc, ["-o", "json", "list"]);

    expect(JSON.parse(stdout).error.code).toBe("migration_required");
    expect(code).toBe(2);
  });

  it("migrates a secret-free keystore silently and runs the command", async () => {
    const { code, walletsPath } = await runIn(v1WatchDoc, ["-o", "json", "list"]);

    expect(code).toBe(0);
    expect(JSON.parse(readFileSync(walletsPath, "utf8")).version).toBe(2);
  });

  it("preserves everything it was not asked to change", async () => {
    const { walletsPath } = await runIn(v1WatchDoc, ["-o", "json", "list"]);
    const doc = JSON.parse(readFileSync(walletsPath, "utf8"));

    expect(doc.activeAccount).toBe(v1WatchDoc.activeAccount);
    expect(doc.labels).toEqual(v1WatchDoc.labels);
    expect(doc.wallets[0].source).toEqual(v1WatchDoc.wallets[0]!.source);
  });

  it("keeps the pre-migration copy", async () => {
    const { walletsPath } = await runIn(v1WatchDoc, ["-o", "json", "list"]);

    expect(JSON.parse(readFileSync(`${walletsPath}.v1.bak`, "utf8"))).toEqual(v1WatchDoc);
  });

  it("migrates a Ledger-only keystore silently and runs the command", async () => {
    const { code, walletsPath } = await runIn(v1LedgerDoc, ["-o", "json", "list"]);

    expect(code).toBe(0);
    expect(JSON.parse(readFileSync(walletsPath, "utf8")).version).toBe(2);
  });

  it("needs the password once ANY wallet in the file holds a secret", async () => {
    // needsPassword is per FILE, not per wallet: one seed alongside a Ledger account still means
    // the file cannot be rewritten without decrypting something.
    const mixed = {
      ...v1LedgerDoc,
      wallets: [...v1LedgerDoc.wallets, ...v1SeedDoc.wallets],
    };
    const { code, stdout } = await runIn(mixed, ["-o", "json", "list"]);

    expect(JSON.parse(stdout).error.code).toBe("migration_required");
    expect(code).toBe(2);
  });

  it("leaves --help reachable on a stale keystore", async () => {
    const { code } = await runIn(v1SeedDoc, ["--help"]);
    expect(code).toBe(0);
  });
});

describe("TRON-only commands on an EVM network", () => {
  // Reachable for the first time now that EVM networks are builtin: dispatch looks up the
  // command's family binding and finds none, so it must refuse before touching any RPC.
  it.each([
    ["gasfree", "info"],
    ["stake", "info"],
    ["permission", "show"],
  ])("refuses `%s %s` on evm:1", async (group, verb) => {
    const { code, stdout } = await runIn(
      { version: 2, activeAccount: null, labels: {}, wallets: [] },
      ["-o", "json", group, verb, "--network", "evm:1"],
    );

    expect(JSON.parse(stdout).error.code).toBe("family_mismatch");
    expect(code).toBe(2);
  });
});

describe("aliases resolve at selection and nowhere else", () => {
  const emptyKeystore = { version: 2, activeAccount: null, labels: {}, wallets: [] };

  it("accepts an alias on --network and reports the CANONICAL id downstream", async () => {
    const { stdout } = await runIn(emptyKeystore, [
      "-o",
      "json",
      "stake",
      "info",
      "--network",
      "sepolia",
    ]);

    const { error } = JSON.parse(stdout);
    // resolved (not "unknown network"), and everything past resolution speaks canonical ids
    expect(error.message).toContain("evm:11155111");
    expect(error.message).not.toContain("sepolia");
  });

  it("accepts the canonical id just as well", async () => {
    const { stdout } = await runIn(emptyKeystore, [
      "-o",
      "json",
      "stake",
      "info",
      "--network",
      "evm:11155111",
    ]);
    expect(JSON.parse(stdout).error.message).toContain("evm:11155111");
  });
});

describe("networks lists both families with their endpoints", () => {
  const emptyKeystore = { version: 2, activeAccount: null, labels: {}, wallets: [] };

  it("reports each network's alias and endpoint host", async () => {
    const { stdout } = await runIn(emptyKeystore, ["-o", "json", "networks"]);
    const rows: Array<Record<string, string>> = JSON.parse(stdout).data;
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

    expect(byId["evm:11155111"]).toMatchObject({
      family: "evm",
      chainId: "11155111",
      feeModel: "evm-gas",
      alias: "sepolia",
    });
    // §2.3 shows the HOST, not the full URL with any embedded key
    expect(byId["evm:11155111"]!.endpoint).toBe("ethereum-sepolia-rpc.publicnode.com");
    expect(byId["tron:nile"]!.endpoint).toBe("nile.trongrid.io");
  });

  it("renders the endpoint column in text mode", async () => {
    const { stdout } = await runIn(emptyKeystore, ["networks"]);
    expect(stdout).toContain("Endpoint");
    expect(stdout).toContain("nile.trongrid.io");
  });
});

describe("config addresses networks by nested key", () => {
  const emptyKeystore = { version: 2, activeAccount: null, labels: {}, wallets: [] };

  it("sets an endpoint by alias and stores it under the canonical id", async () => {
    const { code, stdout } = await runIn(emptyKeystore, [
      "-o",
      "json",
      "config",
      "networks.sepolia.httpEndpoint",
      "https://my-node.example/key",
    ]);

    expect(code).toBe(0);
    expect(JSON.parse(stdout).data).toMatchObject({
      key: "networks.evm:11155111.httpEndpoint",
    });
  });

  it("shows each network's endpoint host so a change can be confirmed", async () => {
    const { stdout } = await runIn(emptyKeystore, ["-o", "json", "config", "networks"]);
    expect(JSON.parse(stdout).data.value).toMatchObject({
      "tron:nile": "nile.trongrid.io",
      "evm:11155111": "ethereum-sepolia-rpc.publicnode.com",
    });
  });

  it("shows the alias book so a short name can be traced to its network", async () => {
    const { stdout } = await runIn(emptyKeystore, ["-o", "json", "config", "aliases"]);
    expect(JSON.parse(stdout).data.value).toMatchObject({
      nile: "tron:nile",
      sepolia: "evm:11155111",
      "bsc-testnet": "evm:97",
    });
  });

  it("rejects an unknown config key rather than silently ignoring it", async () => {
    const { code, stdout } = await runIn(emptyKeystore, ["-o", "json", "config", "nonsense", "x"]);
    expect(code).toBe(2);
    expect(JSON.parse(stdout).error.code).toBeDefined();
  });
});
