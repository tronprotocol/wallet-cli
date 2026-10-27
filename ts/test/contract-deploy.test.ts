import { describe, it, expect, beforeEach } from "vitest";
import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Keystore } from "../src/adapters/outbound/keystore/index.js";
import { AtomicFileStore } from "../src/adapters/outbound/persistence/fs/index.js";
import { DETACHED } from "./detached.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENTRY_ARGS = process.env.WALLET_CLI_TEST_ENTRY
  ? [process.env.WALLET_CLI_TEST_ENTRY]
  : ["--import", "tsx", join(process.cwd(), "src", "index.ts")];
const PW = "testpw123A";

const ABI = JSON.stringify([
  {
    type: "constructor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "cap", type: "uint256" },
      { name: "owner", type: "address" },
    ],
  },
]);
// Init code ignores the constructor arguments appended by ABI encoding.
const BYTECODE =
  "6080604052348015600f57600080fd5b50603f80601d6000396000f3fe6080604052600080fdfea2646970667358fe";
const ARG_ADDR = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const ENC_CAP = "0".repeat(62) + "64"; // uint256(100)
const ENC_OWNER = "74472e7d35395a6b5add427eecb7f4b62ad2b071"; // ARG_ADDR as a 20-byte EVM address

const RAW_PARAMS = `[100, "${ARG_ADDR}"]`;
const TYPED_PARAMS = `[{"type":"uint256","value":"100"},{"type":"address","value":"${ARG_ADDR}"}]`;

let HOME: string;

function seed(secret: string) {
  new Keystore(HOME, new AtomicFileStore(), () => PW).import({
    secret,
    type: "privateKey",
    label: "deployer",
  });
}

function deploy(
  params: string,
  opts: { dryRun?: boolean; wait?: boolean; timeoutMs?: number } = {},
) {
  const globals = ["--output", "json", "--network", "tron:3448148188"];
  if (opts.wait) globals.push("--wait");
  const local = [
    "contract",
    "deploy",
    "--abi",
    ABI,
    "--code",
    BYTECODE,
    "--fee-limit",
    "1000000000",
    "--constructor-params",
    params,
  ];
  if (opts.dryRun) local.push("--dry-run");
  local.push("--password-stdin");
  const r = spawnSync(process.execPath, [...ENTRY_ARGS, ...globals, ...local], {
    input: PW + "\n",
    encoding: "utf8",
    env: { ...process.env, WALLET_CLI_HOME: HOME, NO_COLOR: "1" },
    timeout: opts.timeoutMs ?? 18_000,
    ...DETACHED,
  } as SpawnSyncOptionsWithStringEncoding);
  return JSON.parse(r.stdout);
}

describe("contract deploy — constructor params (issue #2)", () => {
  beforeEach(() => {
    HOME = mkdtempSync(join(tmpdir(), "wcli-deploy-"));
  });

  it("rejects the bare positional form (--constructor-params takes {type,value})", () => {
    seed(randomBytes(32).toString("hex"));
    const out = deploy(RAW_PARAMS, { dryRun: true });
    expect(out.success).toBe(false);
    expect(out.error.code).toBe("invalid_value");
    expect(out.error.message).toMatch(/type/i);
  });

  const PK = loadTestPrivateKey();
  const LIVE = process.env.RUN_LIVE === "1" || process.env.RUN_LIVE_BROADCAST === "1";

  describe.runIf(LIVE && !!PK)("on Nile (live)", () => {
    it("builds a constructor-arg deploy (dry-run) with typed constructor params", () => {
      seed(PK!);
      const out = deploy(TYPED_PARAMS, { dryRun: true });
      expect(out.success).toBe(true);
      expect(out.data.mode).toBe("dry-run");
      const bytecode: string =
        out.data.tx.raw_data.contract[0].parameter.value.new_contract.bytecode;
      expect(bytecode).toContain(ENC_CAP);
      expect(bytecode.toLowerCase()).toContain(ENC_OWNER);
      expect(out.data.tx.contract_address).toBeTruthy();
    });

    it.runIf(process.env.RUN_LIVE_BROADCAST === "1")(
      "deploys and confirms a constructor-arg contract on-chain",
      () => {
        seed(PK!);
        const out = deploy(TYPED_PARAMS, { wait: true, timeoutMs: 120_000 });
        expect(out.success).toBe(true);
        expect(out.data.stage).toBe("confirmed");
        expect(out.data.confirmed).toBe(true);
        expect(out.data.result).toBe("SUCCESS");
        expect(out.data.txId).toMatch(/^[0-9a-f]{64}$/);
        expect(typeof out.data.blockNumber).toBe("number");
      },
      120_000,
    );
  });
});

function loadTestPrivateKey(): string | undefined {
  if (process.env.TEST_TRON_PRIVATE_KEY) return process.env.TEST_TRON_PRIVATE_KEY;
  const candidates = [
    join(HERE, "..", ".private", ".env.test"),
    join(HERE, "..", "..", "ts-deprecated", ".private", ".env.test"),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*TEST_TRON_PRIVATE_KEY\s*=\s*(.+?)\s*$/);
      if (m) return m[1]!.replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  return undefined;
}
