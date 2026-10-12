/**
 * Proof that the SunSwap/SunPump boundary rules in `.dependency-cruiser.cjs` actually fire.
 *
 * A dependency rule that matches nothing is indistinguishable from a rule that works: `depcruise
 * src` is green either way, so a typo in a path regex silently removes the boundary it was added
 * to defend. These cases run the REAL config against a throwaway tree whose files sit at the
 * paths the rules name, and assert each rule reports the violation put in front of it.
 *
 * The tree is built outside the repo rather than inside `src/`, so the fixtures can violate the
 * rules without turning the repo's own `depcruise`, `typecheck` and `lint` runs red.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const configPath = join(repo, ".dependency-cruiser.cjs");
const depcruiseBin = join(repo, "node_modules", ".bin", "depcruise");

/** Files placed under the throwaway tree's `src/`, each one breaking exactly one rule. */
const VIOLATIONS: Record<string, string> = {
  // an application port reaching for the vendor SDK it should only know through a port type
  "src/application/ports/sdk-leak.ts": `import type { SunApiClient } from "@sun-protocol/sun-sdk-api";\nexport type Leak = SunApiClient;\n`,
  // the broadcasting runtime imported somewhere other than the single file allowed to build it
  "src/adapters/outbound/sunswap/runtime-leak.ts": `import { createRuntime } from "@sun-protocol/sun-sdk-runtime";\nexport const leak = createRuntime;\n`,
  // the two integrations reaching into each other
  "src/adapters/outbound/sunswap/cross.ts": `import { marker } from "../sunpump/marker.js";\nexport const leak = marker;\n`,
  "src/adapters/outbound/sunpump/cross.ts": `import { marker } from "../sunswap/marker.js";\nexport const leak = marker;\n`,
  "src/adapters/outbound/sunswap/marker.ts": `export const marker = 1;\n`,
  "src/adapters/outbound/sunpump/marker.ts": `export const marker = 1;\n`,
};

/** The same SDK import from the one place that owns it — proof the rule is not simply "always". */
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

/** depcruise exits non-zero when it reports violations, so the output is read off the error. */
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
