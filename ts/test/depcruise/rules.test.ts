// Run the real dependency rules against isolated valid and invalid import trees.
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const configPath = join(repo, ".dependency-cruiser.cjs");
const depcruiseBin = join(repo, "node_modules", ".bin", "depcruise");

const VIOLATIONS: Record<string, string> = {
  "src/application/ports/sdk-leak.ts": `import type { SunApiClient } from "@sun-protocol/sun-sdk-api";\nexport type Leak = SunApiClient;\n`,
  "src/adapters/outbound/sunswap/runtime-leak.ts": `import { createRuntime } from "@sun-protocol/sun-sdk-runtime";\nexport const leak = createRuntime;\n`,
  "src/adapters/outbound/sunswap/cross.ts": `import { marker } from "../sunpump/marker.js";\nexport const leak = marker;\n`,
  "src/adapters/outbound/sunpump/cross.ts": `import { marker } from "../sunswap/marker.js";\nexport const leak = marker;\n`,
  "src/adapters/outbound/sunswap/marker.ts": `export const marker = 1;\n`,
  "src/adapters/outbound/sunpump/marker.ts": `export const marker = 1;\n`,
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

  it.each([
    "sdk-adapters-only",
    "no-runtime-import",
    "sunswap-does-not-import-sunpump",
    "sunpump-does-not-import-sunswap",
  ])("reports %s", (rule) => {
    expect(violatingOutput).toContain(rule);
  });

  it("allows the SDK inside the adapters that own it", () => {
    expect(allowedOutput).not.toContain("sdk-adapters-only");
    expect(allowedOutput).not.toContain("no-runtime-import");
    expect(allowedOutput).toContain("no dependency violations found");
  });
});
