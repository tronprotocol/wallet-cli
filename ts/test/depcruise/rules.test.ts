// Run the real dependency rules and baseline gates against isolated fixture trees.
import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  copyFileSync,
  readFileSync,
  appendFileSync,
  chmodSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const configPath = join(repo, ".dependency-cruiser.cjs");
const depcruiseBin = join(repo, "node_modules", ".bin", "depcruise");

const VIOLATIONS: Record<string, string> = {
  "src/application/ports/sdk-leak.ts": `import type { SunApiClient } from "@sun-protocol/sun-sdk-api";\nexport type Leak = SunApiClient;\n`,
  "src/adapters/outbound/sunswap/runtime-leak.ts": `import { createRuntime } from "@sun-protocol/sun-sdk-runtime";\nexport const leak = createRuntime;\n`,
};

const ALLOWED: Record<string, string> = {
  "src/adapters/outbound/sunswap/market-api.ts": `import type { SunApiClient } from "@sun-protocol/sun-sdk-api";\nexport type Client = SunApiClient;\n`,
  "src/adapters/outbound/sunswap/sdk-runtime.ts": `import { createRuntime } from "@sun-protocol/sun-sdk-runtime";\nexport const build = createRuntime;\n`,
};

function buildTree(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "wallet-cli-depcruise-"));
  symlinkSync(join(repo, "node_modules"), join(dir, "node_modules"));
  copyFileSync(join(repo, "tsconfig.json"), join(dir, "tsconfig.json"));
  for (const [rel, source] of Object.entries(files)) {
    const target = join(dir, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source);
  }
  return dir;
}

// Dependency violations produce a nonzero exit with diagnostics on stdout.
function cruise(cwd: string): string {
  try {
    return execFileSync(depcruiseBin, ["--config", configPath, "src"], {
      cwd,
      encoding: "utf8",
    });
  } catch (error) {
    return String((error as { stdout?: string }).stdout ?? "");
  }
}

describe("dependency-cruiser layer and cycle rules", () => {
  it.each<{ rule: string; files: Record<string, string>; importers: string[] }>([
    {
      rule: "ports-are-innermost",
      importers: [
        "src/application/ports/leak.ts",
        "src/application/ports/use-case-leak.ts",
        "src/application/contracts/leak.ts",
        "src/application/contracts/use-case-leak.ts",
        "src/application/ports/root-leak.ts",
        "src/application/ports/new-dir-leak.ts",
        "src/application/contracts/root-leak.ts",
        "src/application/contracts/new-dir-leak.ts",
      ],
      files: {
        "src/application/ports/leak.ts": `import { marker } from "../services/marker.js";\nexport const leak = marker;\n`,
        "src/application/services/marker.ts": `export const marker = 1;\n`,
        "src/application/ports/use-case-leak.ts": `import { marker } from "../use-cases/example-service.js";\nexport const leak = marker;\n`,
        "src/application/use-cases/example-service.ts": `export const marker = 1;\n`,
        "src/application/contracts/leak.ts": `import { marker } from "../services/marker.js";\nexport const leak = marker;\n`,
        "src/application/contracts/use-case-leak.ts": `import { marker } from "../use-cases/example-service.js";\nexport const leak = marker;\n`,
        "src/application/helper.ts": `export type Helper = 1;\n`,
        "src/application/policy/helper.ts": `export type Helper = 1;\n`,
        "src/application/ports/root-leak.ts": `import type { Helper } from "../helper.js";\nexport type Leak = Helper;\n`,
        "src/application/ports/new-dir-leak.ts": `import type { Helper } from "../policy/helper.js";\nexport type Leak = Helper;\n`,
        "src/application/contracts/root-leak.ts": `import type { Helper } from "../helper.js";\nexport type Leak = Helper;\n`,
        "src/application/contracts/new-dir-leak.ts": `import type { Helper } from "../policy/helper.js";\nexport type Leak = Helper;\n`,
      },
    },
    {
      rule: "application-imports-no-use-case",
      importers: [
        "src/application/use-cases/caller-service.ts",
        "src/application/use-cases/helper.ts",
        "src/application/use-cases/tron/caller-service.ts",
        "src/application/services/leak.ts",
        "src/application/ports/leak.ts",
        "src/application/contracts/leak.ts",
        "src/application/policy/leak.ts",
      ],
      files: {
        "src/application/use-cases/example-service.ts": `export const marker = 1;\n`,
        "src/application/use-cases/tron/nested-service.ts": `export type Nested = 1;\n`,
        "src/application/use-cases/caller-service.ts": `import { marker } from "./example-service.js";\nexport const leak = marker;\n`,
        "src/application/use-cases/helper.ts": `import { marker } from "./example-service.js";\nexport const leak = marker;\n`,
        "src/application/use-cases/tron/caller-service.ts": `import type { Nested } from "./nested-service.js";\nexport type Leak = Nested;\n`,
        "src/application/services/leak.ts": `import type { Nested } from "../use-cases/tron/nested-service.js";\nexport type Leak = Nested;\n`,
        "src/application/ports/leak.ts": `import { marker } from "../use-cases/example-service.js";\nexport const leak = marker;\n`,
        "src/application/contracts/leak.ts": `import { marker } from "../use-cases/example-service.js";\nexport const leak = marker;\n`,
        "src/application/policy/leak.ts": `import { marker } from "../use-cases/example-service.js";\nexport const leak = marker;\n`,
      },
    },
    {
      rule: "domain-and-application-use-allowlisted-packages",
      importers: [
        "src/domain/npm-leak.ts",
        "src/domain/core-leak.ts",
        "src/domain/look-alike-leak.ts",
        "src/application/services/missing-leak.ts",
        "src/application/ports/type-leak.ts",
      ],
      files: {
        "src/domain/npm-leak.ts": `import { z } from "zod";\nexport const leak = z;\n`,
        "src/domain/core-leak.ts": `import { readFileSync } from "node:fs";\nexport const leak = readFileSync;\n`,
        "src/domain/look-alike-leak.ts": `import { leak } from "crypto-not-installed";\nexport { leak };\n`,
        "src/application/services/missing-leak.ts": `import { leak } from "not-an-installed-package";\nexport { leak };\n`,
        "src/application/ports/type-leak.ts": `import type { ZodType } from "zod";\nexport type Leak = ZodType;\n`,
      },
    },
    {
      rule: "sdks-and-http-clients-only-in-outbound",
      importers: [
        "src/adapters/inbound/tronweb-leak.ts",
        "src/adapters/inbound/ethers-leak.ts",
        "src/adapters/inbound/undici-leak.ts",
        "src/adapters/inbound/node-fetch-leak.ts",
        "src/adapters/inbound/got-leak.ts",
        "src/adapters/inbound/ky-leak.ts",
        "src/bootstrap/x402-leak.ts",
        "src/bootstrap/ledger-leak.ts",
        "src/domain/sun-leak.ts",
        "src/application/services/axios-leak.ts",
      ],
      files: {
        "src/adapters/inbound/tronweb-leak.ts": `import { TronWeb } from "tronweb";\nexport const leak = TronWeb;\n`,
        "src/adapters/inbound/ethers-leak.ts": `import { Wallet } from "ethers";\nexport const leak = Wallet;\n`,
        "src/adapters/inbound/undici-leak.ts": `import { request } from "undici";\nexport const leak = request;\n`,
        "src/adapters/inbound/node-fetch-leak.ts": `import fetch from "node-fetch";\nexport const leak = fetch;\n`,
        "src/adapters/inbound/got-leak.ts": `import got from "got";\nexport const leak = got;\n`,
        "src/adapters/inbound/ky-leak.ts": `import ky from "ky";\nexport const leak = ky;\n`,
        "src/bootstrap/x402-leak.ts": `import { setLogger } from "@bankofai/x402-core";\nexport const leak = setLogger;\n`,
        "src/bootstrap/ledger-leak.ts": `import Trx from "@ledgerhq/hw-app-trx";\nexport const leak = Trx;\n`,
        "src/domain/sun-leak.ts": `import type { SunApiClient } from "@sun-protocol/sun-sdk-api";\nexport type Leak = SunApiClient;\n`,
        "src/application/services/axios-leak.ts": `import axios from "axios";\nexport const leak = axios;\n`,
      },
    },
    {
      rule: "integrations-do-not-import-each-other",
      importers: [
        "src/adapters/outbound/ledger/index.ts",
        "src/adapters/outbound/chain/tron/family-leak.ts",
        "src/adapters/outbound/chain/evm/nested/family-leak.ts",
        "src/adapters/outbound/sunswap/nested/leak.ts",
        "src/adapters/outbound/x402/loose-leak.ts",
        "src/adapters/outbound/http/leak.ts",
        "src/adapters/outbound/persistence/fs/leak.ts",
        "src/adapters/outbound/foo.v2/leak.ts",
      ],
      files: {
        "src/adapters/outbound/fooXv2/marker.ts": `export const marker = 1;\n`,
        "src/adapters/outbound/foo.v2/leak.ts": `import { marker } from "../fooXv2/marker.js";\nexport const leak = marker;\n`,
        "src/adapters/outbound/chain/tron/marker.ts": `export const marker = 1;\n`,
        "src/adapters/outbound/chain/evm/marker.ts": `export const marker = 1;\n`,
        "src/adapters/outbound/x402/marker.ts": `export const marker = 1;\n`,
        "src/adapters/outbound/ledger/marker.ts": `export const marker = 1;\n`,
        "src/adapters/outbound/loose.ts": `export const loose = 1;\n`,
        "src/adapters/outbound/chain/loose.ts": `export const loose = 1;\n`,
        "src/adapters/outbound/ledger/index.ts": `import { marker } from "../chain/tron/marker.js";\nexport const leak = marker;\n`,
        "src/adapters/outbound/chain/tron/family-leak.ts": `import { marker } from "../evm/marker.js";\nexport const leak = marker;\n`,
        "src/adapters/outbound/chain/evm/nested/family-leak.ts": `import type { marker } from "../../tron/marker.js";\nexport type Leak = typeof marker;\n`,
        "src/adapters/outbound/sunswap/nested/leak.ts": `import { marker } from "../../x402/marker.js";\nexport const leak = marker;\n`,
        "src/adapters/outbound/x402/loose-leak.ts": `import { loose } from "../loose.js";\nimport { loose as chainLoose } from "../chain/loose.js";\nexport const leak = loose + chainLoose;\n`,
        "src/adapters/outbound/http/leak.ts": `import { marker } from "../ledger/marker.js";\nexport const leak = marker;\n`,
        "src/adapters/outbound/persistence/fs/leak.ts": `import { marker } from "../../chain/evm/marker.js";\nexport const leak = marker;\n`,
      },
    },
    {
      rule: "outbound-modules-outside-integrations-import-only-plumbing",
      importers: [
        "src/adapters/outbound/chain/shared.ts",
        "src/adapters/outbound/shared.ts",
        "src/adapters/outbound/chain/other.ts",
      ],
      files: {
        "src/adapters/outbound/chain/tron/marker.ts": `export const marker = 1;\n`,
        "src/adapters/outbound/ledger/marker.ts": `export const marker = 1;\n`,
        "src/adapters/outbound/chain/shared.ts": `import { marker } from "./tron/marker.js";\nexport const shared = marker;\n`,
        "src/adapters/outbound/shared.ts": `import type { marker } from "./ledger/marker.js";\nexport type Shared = typeof marker;\n`,
        "src/adapters/outbound/chain/other.ts": `import type { Shared } from "../shared.js";\nexport type Other = Shared;\n`,
      },
    },
    {
      rule: "sdks-only-inside-integrations",
      importers: [
        "src/adapters/outbound/shared.ts",
        "src/adapters/outbound/chain/shared.ts",
        "src/adapters/outbound/http/client.ts",
        "src/adapters/outbound/persistence/fs/store.ts",
        "src/adapters/outbound/persistence/sun.ts",
      ],
      files: {
        "src/adapters/outbound/shared.ts": `import { Wallet } from "ethers";\nexport const shared = Wallet;\n`,
        "src/adapters/outbound/chain/shared.ts": `import { TronWeb } from "tronweb";\nexport const shared = TronWeb;\n`,
        "src/adapters/outbound/http/client.ts": `import { setLogger } from "@bankofai/x402-core";\nexport const client = setLogger;\n`,
        "src/adapters/outbound/persistence/fs/store.ts": `import type Trx from "@ledgerhq/hw-app-trx";\nexport type Store = Trx;\n`,
        "src/adapters/outbound/persistence/sun.ts": `import type { SunApiClient } from "@sun-protocol/sun-sdk-api";\nexport type Sun = SunApiClient;\n`,
      },
    },
    {
      rule: "no-circular",
      importers: ["src/domain/first.ts"],
      files: {
        "src/domain/first.ts": `import { second } from "./second.js";\nexport function first() { return second(); }\n`,
        "src/domain/second.ts": `import { first } from "./first.js";\nexport function second() { return first(); }\n`,
      },
    },
    {
      rule: "domain-is-independent",
      importers: [
        "src/domain/leak.ts",
        "src/domain/adapter-leak.ts",
        "src/domain/bootstrap-leak.ts",
      ],
      files: {
        "src/domain/leak.ts": `import { marker } from "../application/services/marker.js";\nexport const leak = marker;\n`,
        "src/application/services/marker.ts": `export const marker = 1;\n`,
        "src/domain/adapter-leak.ts": `import { marker } from "../adapters/outbound/marker.js";\nexport const leak = marker;\n`,
        "src/adapters/outbound/marker.ts": `export const marker = 1;\n`,
        "src/domain/bootstrap-leak.ts": `import { marker } from "../bootstrap/marker.js";\nexport const leak = marker;\n`,
        "src/bootstrap/marker.ts": `export const marker = 1;\n`,
      },
    },
    {
      rule: "application-owns-ports",
      importers: ["src/application/services/leak.ts", "src/application/services/bootstrap-leak.ts"],
      files: {
        "src/application/services/leak.ts": `import { marker } from "../../adapters/outbound/marker.js";\nexport const leak = marker;\n`,
        "src/adapters/outbound/marker.ts": `export const marker = 1;\n`,
        "src/application/services/bootstrap-leak.ts": `import { marker } from "../../bootstrap/marker.js";\nexport const leak = marker;\n`,
        "src/bootstrap/marker.ts": `export const marker = 1;\n`,
      },
    },
    {
      rule: "inbound-does-not-know-outbound",
      importers: ["src/adapters/inbound/leak.ts", "src/adapters/inbound/bootstrap-leak.ts"],
      files: {
        "src/adapters/inbound/leak.ts": `import { marker } from "../outbound/marker.js";\nexport const leak = marker;\n`,
        "src/adapters/outbound/marker.ts": `export const marker = 1;\n`,
        "src/adapters/inbound/bootstrap-leak.ts": `import { marker } from "../../bootstrap/marker.js";\nexport const leak = marker;\n`,
        "src/bootstrap/marker.ts": `export const marker = 1;\n`,
      },
    },
    {
      rule: "outbound-does-not-know-inbound",
      importers: ["src/adapters/outbound/leak.ts", "src/adapters/outbound/bootstrap-leak.ts"],
      files: {
        "src/adapters/outbound/leak.ts": `import { marker } from "../inbound/marker.js";\nexport const leak = marker;\n`,
        "src/adapters/inbound/marker.ts": `export const marker = 1;\n`,
        "src/adapters/outbound/bootstrap-leak.ts": `import { marker } from "../../bootstrap/marker.js";\nexport const leak = marker;\n`,
        "src/bootstrap/marker.ts": `export const marker = 1;\n`,
      },
    },
    {
      rule: "outbound-imports-no-service-or-use-case",
      importers: ["src/adapters/outbound/leak.ts", "src/adapters/outbound/use-case-leak.ts"],
      files: {
        "src/adapters/outbound/leak.ts": `import { marker } from "../../application/services/marker.js";\nexport const leak = marker;\n`,
        "src/application/services/marker.ts": `export const marker = 1;\n`,
        "src/adapters/outbound/use-case-leak.ts": `import { marker } from "../../application/use-cases/example-service.js";\nexport const leak = marker;\n`,
        "src/application/use-cases/example-service.ts": `export const marker = 1;\n`,
      },
    },
    {
      rule: "ledger-apps-only-in-ledger-wrapper",
      importers: [
        "src/adapters/outbound/ledger/other.ts",
        "src/adapters/outbound/chain/evm/device.ts",
        "src/adapters/outbound/ledger/index.test.ts",
        "src/bootstrap/device.ts",
        "src/adapters/outbound/ledger/tip712.ts",
        "src/adapters/outbound/ledger/eip712.ts",
        "src/adapters/outbound/ledger/subpath.ts",
        "src/adapters/outbound/ledger/lib-path.ts",
      ],
      files: {
        "src/adapters/outbound/ledger/tip712.ts": `import { signTIP712HashedMessage } from "@ledgerhq/hw-app-trx/TIP712/index";\nexport const sign = signTIP712HashedMessage;\n`,
        "src/adapters/outbound/ledger/eip712.ts": `import { signEIP712Message } from "@ledgerhq/hw-app-eth/modules/EIP712/index";\nexport const sign = signEIP712Message;\n`,
        "src/adapters/outbound/ledger/subpath.ts": `import Eth from "@ledgerhq/hw-app-eth/Eth";\nexport const app = Eth;\n`,
        "src/adapters/outbound/ledger/lib-path.ts": `import { signTIP712HashedMessage } from "@ledgerhq/hw-app-trx/lib/TIP712/index.js";\nexport const sign = signTIP712HashedMessage;\n`,
        "src/adapters/outbound/ledger/other.ts": `export const load = () => import("@ledgerhq/hw-app-trx");\n`,
        "src/adapters/outbound/chain/evm/device.ts": `import Eth from "@ledgerhq/hw-app-eth";\nexport const device = Eth;\n`,
        "src/adapters/outbound/ledger/index.test.ts": `import type Trx from "@ledgerhq/hw-app-trx";\nexport type Probe = Trx;\n`,
        "src/bootstrap/device.ts": `import Trx from "@ledgerhq/hw-app-trx";\nexport const device = Trx;\n`,
      },
    },
    {
      rule: "erc8004-sdk-only-in-registry-wrapper",
      importers: [
        "src/adapters/outbound/erc8004/other.ts",
        "src/adapters/outbound/erc8004/sdk-registry.test.ts",
        "src/adapters/outbound/erc8004/reexport.ts",
      ],
      files: {
        "src/adapters/outbound/erc8004/other.ts": `import { SDK } from "@bankofai/8004-sdk";\nexport const sdk = SDK;\n`,
        "src/adapters/outbound/erc8004/sdk-registry.test.ts": `import { SDK } from "@bankofai/8004-sdk";\nexport const probe = SDK;\n`,
        "src/adapters/outbound/erc8004/reexport.ts": `export { SDK } from "@bankofai/8004-sdk";\n`,
      },
    },
    {
      rule: "x402-payment-modules-only-in-payment-client",
      importers: [
        "src/adapters/outbound/x402/server.ts",
        "src/adapters/outbound/x402/gasfree-errors.test.ts",
        "src/adapters/outbound/x402/gasfree-client.test.ts",
        "src/adapters/outbound/x402/evm.ts",
        "src/adapters/outbound/x402/core-client.ts",
        "src/adapters/outbound/x402/core-facilitator.ts",
        "src/adapters/outbound/x402/batch.ts",
        "src/adapters/outbound/x402/types.ts",
        "src/adapters/outbound/x402/agent-wallet.ts",
        "src/adapters/outbound/x402/agent-wallet-dist.ts",
        "src/adapters/outbound/x402/exact.ts",
        "src/adapters/outbound/x402/upto.ts",
        "src/adapters/outbound/x402/gasfree-facilitator.ts",
        "src/adapters/outbound/x402/batch-server.ts",
        "src/adapters/outbound/x402/exact-dist.ts",
      ],
      files: {
        "src/adapters/outbound/x402/server.ts": `import { ExactTronScheme } from "@bankofai/x402-tron/exact/facilitator";\nexport const server = ExactTronScheme;\n`,
        "src/adapters/outbound/x402/gasfree-errors.test.ts": `import { wrapFetchWithPayment } from "@bankofai/x402-fetch";\nexport const probe = wrapFetchWithPayment;\n`,
        "src/adapters/outbound/x402/gasfree-client.test.ts": `import { ExactGasFreeTronScheme } from "@bankofai/x402-tron/gasfree/client";\nexport const probe = ExactGasFreeTronScheme;\n`,
        "src/adapters/outbound/x402/evm.ts": `import { registerExactEvmScheme } from "@bankofai/x402-evm/exact/v1/client";\nexport const evm = registerExactEvmScheme;\n`,
        "src/adapters/outbound/x402/core-client.ts": `import { x402Client } from "@bankofai/x402-core/client";\nexport const client = x402Client;\n`,
        "src/adapters/outbound/x402/core-facilitator.ts": `import { x402Facilitator } from "@bankofai/x402-core/facilitator";\nexport const facilitator = x402Facilitator;\n`,
        "src/adapters/outbound/x402/batch.ts": `import { BatchSettlementEvmScheme } from "@bankofai/x402-evm/batch-settlement/client";\nexport const batch = BatchSettlementEvmScheme;\n`,
        "src/adapters/outbound/x402/agent-wallet.ts": `import { createFacilitatorEvmSigner } from "@bankofai/x402-evm/adapters/agent-wallet";\nexport const signer = createFacilitatorEvmSigner;\n`,
        "src/adapters/outbound/x402/agent-wallet-dist.ts": `import { createClientEvmSigner } from "@bankofai/x402-evm/dist/esm/adapters/agent-wallet.mjs";\nexport const signer = createClientEvmSigner;\n`,
        "src/adapters/outbound/x402/exact.ts": `import { ExactTronScheme } from "@bankofai/x402-tron/exact";\nexport const scheme = ExactTronScheme;\n`,
        "src/adapters/outbound/x402/upto.ts": `import { UptoTronScheme, createUptoPermit2Payload } from "@bankofai/x402-tron/upto";\nexport const scheme = [UptoTronScheme, createUptoPermit2Payload];\n`,
        "src/adapters/outbound/x402/gasfree-facilitator.ts": `import { ExactGasFreeTronScheme } from "@bankofai/x402-tron/gasfree/facilitator";\nexport const scheme = ExactGasFreeTronScheme;\n`,
        "src/adapters/outbound/x402/batch-server.ts": `import { BatchSettlementChannelManager } from "@bankofai/x402-tron/batch-settlement/server";\nexport const manager = BatchSettlementChannelManager;\n`,
        "src/adapters/outbound/x402/exact-dist.ts": `import { ExactTronScheme } from "@bankofai/x402-tron/dist/cjs/exact/index.js";\nexport const scheme = ExactTronScheme;\n`,
        "src/adapters/outbound/x402/types.ts": `import type { ExactTronScheme } from "@bankofai/x402-tron/exact/client";\nexport type Scheme = ExactTronScheme;\n`,
      },
    },
  ])("reports $rule", ({ rule, files, importers }) => {
    const dir = buildTree(files);
    try {
      const output = cruise(dir);
      for (const importer of importers) {
        expect(output).toContain(`${rule}: ${importer} →`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows ports and contracts to import domain and each other, and their tests to import anything", () => {
    const dir = buildTree({
      "src/domain/marker.ts": `export const marker = 1;\n`,
      "src/application/contracts/contract.ts": `import { marker } from "../../domain/marker.js";\nexport const contract = marker;\n`,
      "src/application/ports/port.ts": `import { marker } from "../../domain/marker.js";\nimport { contract } from "../contracts/contract.js";\nexport const port = marker + contract;\n`,
      "src/application/contracts/other.ts": `import { port } from "../ports/port.js";\nexport const other = port;\n`,
      "src/application/services/marker.ts": `export const marker = 1;\n`,
      "src/application/use-cases/example-service.ts": `export const marker = 1;\n`,
      "src/application/ports/port.test.ts": `import { marker } from "../services/marker.js";\nimport { marker as useCase } from "../use-cases/example-service.js";\nexport const probe = marker + useCase;\n`,
      "src/application/contracts/contract.test.ts": `import { marker } from "../services/marker.js";\nimport { marker as useCase } from "../use-cases/example-service.js";\nexport const probe = marker + useCase;\n`,
    });
    try {
      expect(cruise(dir)).toContain("no dependency violations found");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows use cases and services to import use-case helpers, and tests and inbound to import use cases", () => {
    const dir = buildTree({
      "src/application/services/signer-service.ts": `export const signer = 1;\n`,
      "src/application/use-cases/helper.ts": `export const helper = 1;\n`,
      "src/application/services/helper-reader.ts": `import { helper } from "../use-cases/helper.js";\nexport const reader = helper;\n`,
      "src/application/use-cases/example-service.ts": `import { helper } from "./helper.js";\nimport { signer } from "../services/signer-service.js";\nexport const marker = helper + signer;\n`,
      "src/application/use-cases/tron/helper.ts": `export const helper = 1;\n`,
      "src/application/use-cases/tron/nested-service.ts": `import { helper } from "./helper.js";\nexport const nested = helper;\n`,
      "src/application/use-cases/caller-service.test.ts": `import { marker } from "./example-service.js";\nexport const probe = marker;\n`,
      "src/application/services/signer-service.test.ts": `import { nested } from "../use-cases/tron/nested-service.js";\nexport const probe = nested;\n`,
      "src/adapters/inbound/command.ts": `import { marker } from "../../application/use-cases/example-service.js";\nexport const command = marker;\n`,
    });
    try {
      expect(cruise(dir)).toContain("no dependency violations found");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows domain and application the allowlisted packages, their tests any package, and inbound general-purpose packages", () => {
    const dir = buildTree({
      "src/domain/hash.ts": `import { sha256 } from "@noble/hashes/sha2.js";\nimport { base58 } from "@scure/base";\nimport { randomUUID } from "node:crypto";\nexport const hash = [sha256, base58, randomUUID];\n`,
      "src/domain/unresolved-scope.ts": `import { a } from "@noble/not-installed";\nimport { b } from "@scure/not-installed";\nexport const scoped = [a, b];\n`,
      "src/application/services/curve.ts": `import { secp256k1 } from "@noble/curves/secp256k1.js";\nimport { hash } from "../../domain/hash.js";\nexport const curve = [secp256k1, hash];\n`,
      "src/domain/hash.test.ts": `import { describe } from "vitest";\nimport { readFileSync } from "node:fs";\nimport { Wallet } from "ethers";\nexport const probe = [describe, readFileSync, Wallet];\n`,
      "src/application/services/curve.test.ts": `import { z } from "zod";\nimport axios from "axios";\nexport const probe = [z, axios];\n`,
      "src/adapters/inbound/schema.ts": `import { z } from "zod";\nimport { readFileSync } from "node:fs";\nexport const schema = [z, readFileSync];\n`,
    });
    try {
      expect(cruise(dir)).toContain("no dependency violations found");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows SDKs and HTTP clients in outbound and in tests, and names that only resemble them", () => {
    const dir = buildTree({
      "src/adapters/outbound/chain/tron/chain.ts": `import { TronWeb } from "tronweb";\nimport { Wallet } from "ethers";\nimport axios from "axios";\nexport const chain = [TronWeb, Wallet, axios];\n`,
      "src/adapters/outbound/x402/x402.ts": `import { setLogger } from "@bankofai/x402-core";\nimport Hid from "@ledgerhq/hw-transport-node-hid-noevents";\nexport const x402 = [setLogger, Hid];\n`,
      "src/adapters/inbound/command.test.ts": `import { Wallet } from "ethers";\nimport axios from "axios";\nexport const probe = [Wallet, axios];\n`,
      "src/bootstrap/composition.test.ts": `import { setLogger } from "@bankofai/x402-core";\nexport const probe = setLogger;\n`,
      "src/adapters/inbound/look-alike.ts": `import { kyber } from "kyber-crypto";\nimport { gotcha } from "gotcha";\nimport { wallet } from "@acme/ethers";\nexport const lookAlike = [kyber, gotcha, wallet];\n`,
    });
    try {
      expect(cruise(dir)).toContain("no dependency violations found");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows an integration its own modules, shared plumbing, and inner layers, and tests any integration", () => {
    const dir = buildTree({
      "src/domain/marker.ts": `export const marker = 1;\n`,
      "src/application/ports/port.ts": `export type Port = 1;\n`,
      "src/adapters/outbound/http/client.ts": `import { store } from "../persistence/store.js";\nexport const client = store;\n`,
      "src/adapters/outbound/persistence/store.ts": `import { file } from "./fs/file.js";\nexport const store = file;\n`,
      "src/adapters/outbound/persistence/fs/file.ts": `export const file = 1;\n`,
      "src/adapters/outbound/ledger/hid.ts": `export const hid = 1;\n`,
      "src/adapters/outbound/ledger/transport/node-hid.ts": `import { hid } from "../hid.js";\nexport const transport = hid;\n`,
      "src/adapters/outbound/ledger/index.ts": `import { hid } from "./hid.js";\nimport { client } from "../http/client.js";\nimport { store } from "../persistence/store.js";\nimport { marker } from "../../../domain/marker.js";\nimport type { Port } from "../../../application/ports/port.js";\nexport const ledger: Port | number = hid + client + store + marker;\n`,
      "src/adapters/outbound/chain/tron/codec.ts": `export const codec = 1;\n`,
      "src/adapters/outbound/chain/tron/nested/reader.ts": `import { codec } from "../codec.js";\nimport { client } from "../../../http/client.js";\nexport const reader = codec + client;\n`,
      "src/adapters/outbound/chain/tron/gateway.ts": `import { reader } from "./nested/reader.js";\nexport const gateway = reader;\n`,
      "src/adapters/outbound/chain/shared.ts": `import { client } from "../http/client.js";\nimport { store } from "../persistence/store.js";\nexport const shared = client + store;\n`,
      "src/adapters/outbound/x402/payment.test.ts": `import { gateway } from "../chain/tron/gateway.js";\nimport { ledger } from "../ledger/index.js";\nexport const probe = gateway + ledger;\n`,
      "src/adapters/outbound/chain/coverage.test.ts": `import { gateway } from "./tron/gateway.js";\nexport const probe = gateway;\n`,
      "src/adapters/outbound/http/wiring.test.ts": `import { gateway } from "../chain/tron/gateway.js";\nexport const probe = gateway;\n`,
      "src/adapters/outbound/foo.v2/marker.ts": `export const marker = 1;\n`,
      "src/adapters/outbound/foo.v2/nested/reader.ts": `import { marker } from "../marker.js";\nexport const reader = marker;\n`,
    });
    try {
      expect(cruise(dir)).toContain("no dependency violations found");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows SDKs inside integrations and in tests, and HTTP clients in shared plumbing", () => {
    const dir = buildTree({
      "src/adapters/outbound/chain/tron/gateway.ts": `import { TronWeb } from "tronweb";\nexport const gateway = TronWeb;\n`,
      "src/adapters/outbound/ledger/index.ts": `import Trx from "@ledgerhq/hw-app-trx";\nexport const ledger = Trx;\n`,
      "src/adapters/outbound/x402/client.ts": `import { setLogger } from "@bankofai/x402-core";\nexport const client = setLogger;\n`,
      "src/adapters/outbound/http/client.ts": `import axios from "axios";\nimport { request } from "undici";\nexport const client = [axios, request];\n`,
      "src/adapters/outbound/http/client.test.ts": `import { Wallet } from "ethers";\nexport const probe = Wallet;\n`,
      "src/adapters/outbound/persistence/store.test.ts": `import { TronWeb } from "tronweb";\nexport const probe = TronWeb;\n`,
      "src/adapters/outbound/chain/coverage.test.ts": `import { Wallet } from "ethers";\nexport const probe = Wallet;\n`,
    });
    try {
      expect(cruise(dir)).toContain("no dependency violations found");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports SDK signing and payment roots by their bare specifier when they do not resolve", () => {
    const dir = buildTree({
      "src/adapters/outbound/chain/tron/device.ts": `import Trx from "@ledgerhq/hw-app-trx";\nexport const device = Trx;\n`,
      "src/adapters/outbound/http/pay.ts": `import { wrapFetchWithPayment } from "@bankofai/x402-fetch";\nexport const pay = wrapFetchWithPayment;\n`,
      "src/adapters/outbound/chain/evm/registry.ts": `import { SDK } from "@bankofai/8004-sdk";\nexport const sdk = SDK;\n`,
    });
    try {
      unlinkSync(join(dir, "node_modules"));
      const output = cruise(dir);
      expect(output).toContain(
        "ledger-apps-only-in-ledger-wrapper: src/adapters/outbound/chain/tron/device.ts → @ledgerhq/hw-app-trx\n",
      );
      expect(output).toContain(
        "x402-payment-modules-only-in-payment-client: src/adapters/outbound/http/pay.ts → @bankofai/x402-fetch\n",
      );
      expect(output).toContain(
        "erc8004-sdk-only-in-registry-wrapper: src/adapters/outbound/chain/evm/registry.ts → @bankofai/8004-sdk\n",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows SDK signing and payment modules in their wrappers, type imports of the ERC-8004 SDK, and other SDK modules", () => {
    const dir = buildTree({
      "src/adapters/outbound/ledger/index.ts": `export const apps = () => [import("@ledgerhq/hw-app-trx"), import("@ledgerhq/hw-app-eth")];\n`,
      "src/adapters/outbound/ledger/hid.ts": `import Hid from "@ledgerhq/hw-transport-node-hid-noevents";\nexport const hid = Hid;\n`,
      "src/adapters/outbound/ledger/hid.test.ts": `import Hid from "@ledgerhq/hw-transport-node-hid-noevents";\nexport const probe = Hid;\n`,
      "src/adapters/outbound/ledger/path.ts": `import { splitPath } from "@ledgerhq/hw-app-trx/utils";\nimport { splitPath as libSplitPath } from "@ledgerhq/hw-app-trx/lib/utils.js";\nimport { EIP712_TYPE_PROPERTIES } from "@ledgerhq/hw-app-eth/modules/EIP712/utils";\nimport type { LedgerEthTransactionResolution } from "@ledgerhq/hw-app-eth/services/types";\nexport const path = [splitPath, libSplitPath, EIP712_TYPE_PROPERTIES];\nexport type Resolution = LedgerEthTransactionResolution;\n`,
      "src/adapters/outbound/erc8004/sdk-registry.ts": `import { SDK } from "@bankofai/8004-sdk";\nexport const sdk = SDK;\n`,
      "src/adapters/outbound/erc8004/types.ts": `import type { SDK } from "@bankofai/8004-sdk";\nexport type Sdk = SDK;\n`,
      "src/adapters/outbound/erc8004/sdk-registry.test.ts": `export type Probe = typeof import("@bankofai/8004-sdk");\n`,
      "src/adapters/outbound/x402/payment-client.ts": `import { wrapFetchWithPayment } from "@bankofai/x402-fetch";\nimport { registerExactTronScheme } from "@bankofai/x402-tron/exact/client";\nimport { registerExactGasFreeTronScheme } from "@bankofai/x402-tron/gasfree/client";\nimport { ExactTronScheme } from "@bankofai/x402-tron/exact/facilitator";\nimport { registerExactEvmScheme } from "@bankofai/x402-evm/exact/client";\nimport { x402Client } from "@bankofai/x402-core/client";\nimport { createClientEvmSigner } from "@bankofai/x402-evm/adapters/agent-wallet";\nimport { UptoTronScheme } from "@bankofai/x402-tron/upto";\nexport const client = [wrapFetchWithPayment, registerExactTronScheme, registerExactGasFreeTronScheme, ExactTronScheme, registerExactEvmScheme, x402Client, createClientEvmSigner, UptoTronScheme];\n`,
      "src/adapters/outbound/x402/gasfree-relay.ts": `import { GasFreeAPIClient } from "@bankofai/x402-tron/gasfree";\nexport const relay = GasFreeAPIClient;\n`,
      "src/adapters/outbound/x402/server.ts": `import { encodePaymentRequiredHeader } from "@bankofai/x402-core/http";\nimport { scheme } from "@bankofai/x402-tron/exact/server";\nimport type { Network } from "@bankofai/x402-core/types";\nexport const server = [encodePaymentRequiredHeader, scheme];\nexport type Net = Network;\n`,
      "src/adapters/outbound/x402/tokens.ts": `import { registerToken } from "@bankofai/x402-tron";\nimport { fetcher } from "@bankofai/x402-fetcher";\nimport { clients } from "@bankofai/x402-tron/clients";\nimport { exactly } from "@bankofai/x402-tron/exactly";\nexport const tokens = [registerToken, fetcher, clients, exactly];\n`,
      "src/adapters/outbound/x402/storage.ts": `import { FileClientChannelStorage } from "@bankofai/x402-evm/batch-settlement/client/file-storage";\nimport { FileClientChannelStorage as DistStorage } from "@bankofai/x402-evm/dist/esm/batch-settlement/client/file-storage.mjs";\nimport { RedisChannelStorage } from "@bankofai/x402-evm/batch-settlement/server/redis-storage";\nimport type { ClientWallet } from "@bankofai/x402-core/wallets";\nexport const storage = [FileClientChannelStorage, DistStorage, RedisChannelStorage];\nexport type Wallet = ClientWallet;\n`,
    });
    try {
      expect(cruise(dir)).toContain("no dependency violations found");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("dependency-cruiser integration discovery", () => {
  function cruiseResult(cwd: string) {
    return spawnSync(depcruiseBin, ["--config", configPath, "src"], { cwd, encoding: "utf8" });
  }

  it("treats a missing outbound or chain directory as having no integrations", () => {
    const noOutbound = buildTree({ "src/domain/marker.ts": `export const marker = 1;\n` });
    const noChain = buildTree({
      "src/adapters/outbound/x402/marker.ts": `export const marker = 1;\n`,
      "src/adapters/outbound/ledger/leak.ts": `import { marker } from "../x402/marker.js";\nexport const leak = marker;\n`,
    });
    try {
      expect(cruiseResult(noOutbound).stdout).toContain("no dependency violations found");
      expect(cruiseResult(noChain).stdout).toContain(
        "integrations-do-not-import-each-other: src/adapters/outbound/ledger/leak.ts →",
      );
    } finally {
      rmSync(noOutbound, { recursive: true, force: true });
      rmSync(noChain, { recursive: true, force: true });
    }
  });

  it("fails instead of generating no rules when chain is not a directory", () => {
    const dir = buildTree({
      "src/adapters/outbound/chain": `not a directory\n`,
      "src/adapters/outbound/ledger/index.ts": `export const ledger = 1;\n`,
    });
    try {
      const result = cruiseResult(dir);
      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain("ENOTDIR");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Root ignores directory permissions, so the denied read cannot be reproduced there.
  it.skipIf(process.getuid?.() === 0)(
    "fails instead of generating no rules when outbound cannot be read",
    () => {
      const dir = buildTree({
        "src/adapters/outbound/ledger/index.ts": `export const ledger = 1;\n`,
      });
      const outbound = join(dir, "src/adapters/outbound");
      chmodSync(outbound, 0o000);
      try {
        const result = cruiseResult(dir);
        expect(result.status).not.toBe(0);
        expect(result.stdout + result.stderr).toContain("EACCES");
      } finally {
        chmodSync(outbound, 0o755);
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});

describe("dependency-cruiser SunSwap boundary rules", () => {
  let violatingOutput = "";
  let allowedOutput = "";
  const dirs: string[] = [];

  beforeAll(() => {
    const bad = buildTree(VIOLATIONS);
    const good = buildTree(ALLOWED);
    dirs.push(bad, good);
    violatingOutput = cruise(bad);
    allowedOutput = cruise(good);
  });

  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  it.each(["sdk-adapters-only", "no-runtime-import"])("reports %s", (rule) => {
    expect(violatingOutput).toContain(rule);
  });

  it("allows the SDK inside the adapters that own it", () => {
    expect(allowedOutput).not.toContain("sdk-adapters-only");
    expect(allowedOutput).not.toContain("no-runtime-import");
    expect(allowedOutput).toContain("no dependency violations found");
  });
});

describe("dependency-cruiser baseline gate", () => {
  let dir: string;
  let baselinePath: string;

  function run(script: string) {
    return spawnSync("npm", ["run", script], { cwd: dir, encoding: "utf8" });
  }

  beforeEach(() => {
    dir = buildTree({
      "src/domain/leak.ts": `import { marker } from "../application/services/marker.js";\nexport const leak = marker;\n`,
      "src/application/services/marker.ts": `export const marker = 1;\n`,
    });
    baselinePath = join(dir, ".dependency-cruiser-known-violations.json");
    copyFileSync(configPath, join(dir, ".dependency-cruiser.cjs"));
    copyFileSync(join(repo, "package.json"), join(dir, "package.json"));
    mkdirSync(join(dir, "scripts"));
    copyFileSync(
      join(repo, "scripts/check-depcruise-baseline.mjs"),
      join(dir, "scripts/check-depcruise-baseline.mjs"),
    );
    expect(run("depcruise:baseline").status).toBe(0);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("allows a known violation without changing the baseline", () => {
    const baseline = readFileSync(baselinePath, "utf8");
    expect(JSON.parse(baseline)).toEqual([
      {
        type: "dependency",
        from: "src/domain/leak.ts",
        to: "src/application/services/marker.ts",
        dependencyTypes: ["local", "import"],
        unresolvedTo: "../application/services/marker.js",
        rule: { name: "domain-is-independent", severity: "error" },
      },
    ]);
    const result = run("depcruise");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("1 known violations ignored");
    expect(readFileSync(baselinePath, "utf8")).toBe(baseline);
  });

  it("allows a baselined cycle with reordered members and different endpoints", () => {
    writeFileSync(
      join(dir, "src/domain/leak.ts"),
      `import { second } from "./second.js";\nexport function first() { return second(); }\n`,
    );
    writeFileSync(
      join(dir, "src/domain/second.ts"),
      `import { first } from "./leak.js";\nexport function second() { return first(); }\n`,
    );
    expect(run("depcruise:baseline").status).toBe(0);
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
    expect(baseline).toEqual([
      expect.objectContaining({ type: "cycle", rule: { name: "no-circular", severity: "error" } }),
    ]);
    const [cycle] = baseline;
    writeFileSync(
      baselinePath,
      JSON.stringify([
        { ...cycle, from: cycle.to, to: cycle.from, cycle: cycle.cycle.toReversed() },
      ]),
    );
    const result = run("depcruise");
    expect(result.status, result.stderr).toBe(0);
  });

  it.each(["importer", "target"])("rejects a new %s for the same rule", (change) => {
    const baseline = readFileSync(baselinePath, "utf8");
    if (change === "importer") {
      copyFileSync(join(dir, "src/domain/leak.ts"), join(dir, "src/domain/new-leak.ts"));
    } else {
      copyFileSync(
        join(dir, "src/application/services/marker.ts"),
        join(dir, "src/application/services/other.ts"),
      );
      appendFileSync(
        join(dir, "src/domain/leak.ts"),
        `import { marker as other } from "../application/services/other.js";\nexport const second = other;\n`,
      );
    }
    const result = run("depcruise");
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("error domain-is-independent:");
    expect(readFileSync(baselinePath, "utf8")).toBe(baseline);
  });

  it("rejects a new rule violation on a known edge", () => {
    appendFileSync(
      join(dir, ".dependency-cruiser.cjs"),
      `module.exports.forbidden.push({
        name: "additional-boundary",
        severity: "error",
        from: { path: "^src/domain/" },
        to: { path: "^src/application/" },
      });\n`,
    );
    const result = run("depcruise");
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("error additional-boundary:");
  });

  it("allows a known edge that becomes type-only", () => {
    const baseline = readFileSync(baselinePath, "utf8");
    writeFileSync(
      join(dir, "src/domain/leak.ts"),
      `import type { marker } from "../application/services/marker.js";\nexport type Marker = typeof marker;\n`,
    );
    const result = run("depcruise");
    expect(result.stdout).toContain("1 known violations ignored");
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(baselinePath, "utf8")).toBe(baseline);
  });

  it("allows a known edge whose import specifier changes", () => {
    const baseline = readFileSync(baselinePath, "utf8");
    writeFileSync(
      join(dir, "src/domain/leak.ts"),
      `import { marker } from "../application/services/marker";\nexport const leak = marker;\n`,
    );
    const result = run("depcruise");
    expect(result.stdout).toContain("1 known violations ignored");
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(baselinePath, "utf8")).toBe(baseline);
  });

  it("rejects a fixed entry until regeneration removes it", () => {
    const baseline = readFileSync(baselinePath, "utf8");
    writeFileSync(join(dir, "src/domain/leak.ts"), "export const marker = 1;\n");
    const result = run("depcruise");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Stale or duplicate entries");
    expect(result.stderr).toContain("src/domain/leak.ts");
    expect(readFileSync(baselinePath, "utf8")).toBe(baseline);
    expect(run("depcruise:baseline").status).toBe(0);
    expect(JSON.parse(readFileSync(baselinePath, "utf8"))).toEqual([]);
    expect(run("depcruise").status).toBe(0);
  });

  it.each(["identical", "different metadata"])(
    "rejects a duplicate baseline entry (%s)",
    (kind) => {
      const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
      const duplicate = { ...baseline[0] };
      if (kind === "different metadata") duplicate.unresolvedTo = "../application/services/marker";
      writeFileSync(baselinePath, JSON.stringify([...baseline, duplicate]));
      const result = run("depcruise");
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Stale or duplicate entries");
    },
  );

  it.each(["missing", "malformed"])("rejects a %s baseline", (state) => {
    if (state === "missing") rmSync(baselinePath);
    else writeFileSync(baselinePath, "invalid JSON");
    const result = run("depcruise");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(".dependency-cruiser-known-violations.json");
  });
});
