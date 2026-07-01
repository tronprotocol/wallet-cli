import { describe, it, expect, beforeEach } from "vitest";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Keystore } from "../src/adapters/outbound/keystore/index.js";
import { AtomicFileStore } from "../src/adapters/outbound/persistence/fs/index.js";

// Regression coverage for issue #2: `contract deploy` constructor params.
//   • --constructor-sig was a dead flag (types come from the ABI); it was removed.
//   • --params must be RAW positional values ([100, "T..."]) — the {type,value} form that
//     contract call/send use is rejected by TronWeb's createSmartContract ABI encoder.
//
// The negative case fails at client-side ABI encoding *before* any node call, so it runs
// hermetically (random key, no network, no funds). The positive/broadcast cases hit real Nile
// and are gated behind explicit opt-in env flags so `npm test` stays hermetic:
//   RUN_LIVE=1            → dry-run build against Nile (no broadcast, no funds spent)
//   RUN_LIVE_BROADCAST=1  → actually deploy + confirm on Nile (spends testnet TRX)

const HERE = dirname(fileURLToPath(import.meta.url));
const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");
const ENTRY = join(process.cwd(), "src", "index.ts");
const PW = "testpw123A";

// Minimal init code whose runtime ignores appended constructor args (a known-good Nile deploy
// payload). Declaring a constructor in the ABI is what drives client-side arg encoding.
const ABI = JSON.stringify([{
  type: "constructor",
  stateMutability: "nonpayable",
  inputs: [{ name: "cap", type: "uint256" }, { name: "owner", type: "address" }],
}]);
const BYTECODE =
  "6080604052348015600f57600080fd5b50603f80601d6000396000f3fe6080604052600080fdfea2646970667358fe";
const ARG_ADDR = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
// Expected ABI encodings that must appear in the built CreateSmartContract bytecode.
const ENC_CAP = "0".repeat(62) + "64"; // uint256(100)
const ENC_OWNER = "74472e7d35395a6b5add427eecb7f4b62ad2b071"; // ARG_ADDR as a 20-byte EVM address

const RAW_PARAMS = `[100, "${ARG_ADDR}"]`;
const TYPED_PARAMS =
  `[{"type":"uint256","value":"100"},{"type":"address","value":"${ARG_ADDR}"}]`;

let HOME: string;

function seed(secret: string) {
  new Keystore(HOME, new AtomicFileStore(), () => PW)
    .import({ secret, type: "privateKey", label: "deployer" });
}

function deploy(
  params: string,
  opts: { dryRun?: boolean; wait?: boolean; timeoutMs?: number } = {},
) {
  const globals = ["--output", "json", "--network", "tron:nile"];
  if (opts.wait) globals.push("--wait"); // --wait is a global flag (before the subcommand)
  const local = [
    "contract", "deploy",
    "--abi", ABI, "--bytecode", BYTECODE, "--fee-limit", "1000000000",
    "--params", params,
  ];
  if (opts.dryRun) local.push("--dry-run");
  local.push("--password-stdin");
  const r = spawnSync(TSX, [ENTRY, ...globals, ...local], {
    input: PW + "\n",
    encoding: "utf8",
    env: { ...process.env, WALLET_CLI_HOME: HOME, NO_COLOR: "1" },
    timeout: opts.timeoutMs ?? 30_000,
  });
  return JSON.parse(r.stdout);
}

describe("contract deploy — constructor params (issue #2)", () => {
  beforeEach(() => {
    HOME = mkdtempSync(join(tmpdir(), "wcli-deploy-"));
  });

  it("rejects the {type,value} param form (raw positional values are required)", () => {
    seed(randomBytes(32).toString("hex")); // encoding fails before any node call → hermetic
    const out = deploy(TYPED_PARAMS, { dryRun: true });
    expect(out.success).toBe(false);
    expect(out.error.message).toMatch(/BigNumberish/i);
  });

  const PK = loadTestPrivateKey();
  const LIVE = process.env.RUN_LIVE === "1" || process.env.RUN_LIVE_BROADCAST === "1";

  describe.runIf(LIVE && !!PK)("on Nile (live)", () => {
    it("builds a constructor-arg deploy (dry-run) with raw positional params", () => {
      seed(PK!);
      const out = deploy(RAW_PARAMS, { dryRun: true });
      expect(out.success).toBe(true);
      expect(out.data.mode).toBe("dry-run");
      const bytecode: string =
        out.data.tx.raw_data.contract[0].parameter.value.new_contract.bytecode;
      expect(bytecode).toContain(ENC_CAP); // uint256(100) appended
      expect(bytecode.toLowerCase()).toContain(ENC_OWNER); // address arg appended
      expect(out.data.tx.contract_address).toBeTruthy();
    });

    it.runIf(process.env.RUN_LIVE_BROADCAST === "1")(
      "deploys and confirms a constructor-arg contract on-chain",
      () => {
        seed(PK!);
        const out = deploy(RAW_PARAMS, { wait: true, timeoutMs: 120_000 });
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

// Credential lookup: env override first, then the git-ignored .private fixtures.
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
      if (m) return m[1].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  return undefined;
}
