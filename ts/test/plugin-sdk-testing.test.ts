// The SDK's testing entry is reachable only through the test condition, and refuses to run inside a
// wallet-cli process, where the host has published its plugin API.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const TS_ROOT = resolve(import.meta.dirname, "..");
const CONDITION = "wallet-cli-testing";

// A package that depends on the SDK, as a plugin repository does.
const consumer = mkdtempSync(join(tmpdir(), "wcli-sdk-consumer-"));
// A private SDK build from the current sources; other tests read plugin-sdk/dist in parallel.
const SDK = join(consumer, "sdk");
beforeAll(() => {
  mkdirSync(SDK);
  copyFileSync(join(TS_ROOT, "plugin-sdk/package.json"), join(SDK, "package.json"));
  execFileSync(
    process.execPath,
    ["--import", "tsx", "scripts/build-plugin-sdk.mjs", join(SDK, "dist")],
    { cwd: TS_ROOT, stdio: "ignore" },
  );
  mkdirSync(join(consumer, "node_modules/@tron-walletcli"), { recursive: true });
  symlinkSync(SDK, join(consumer, "node_modules/@tron-walletcli/plugin-sdk"), "dir");
  writeFileSync(join(consumer, "package.json"), '{ "type": "module" }');
  writeFileSync(join(consumer, "entry.mjs"), 'import "@tron-walletcli/plugin-sdk/testing";\n');
}, 60_000);
afterAll(() => rmSync(consumer, { recursive: true, force: true }));

function node(args: string[], script: string, cwd = consumer) {
  return spawnSync(process.execPath, [...args, "--input-type=module", "-e", script], {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
  });
}

const bundle = (conditions?: string[]) =>
  build({
    entryPoints: [join(consumer, "entry.mjs")],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    logLevel: "silent",
    ...(conditions ? { conditions } : {}),
  });

describe("@tron-walletcli/plugin-sdk/testing", () => {
  it("is not resolved by Node without the test condition", () => {
    const script = 'await import("@tron-walletcli/plugin-sdk/testing"); console.log("loaded");';
    const plain = node([], script);
    expect(plain.status).not.toBe(0);
    expect(plain.stderr).toContain("ERR_PACKAGE_PATH_NOT_EXPORTED");
    const opted = node([`--conditions=${CONDITION}`], script);
    expect(opted.stdout + opted.stderr).toContain("loaded");
  });

  it("is not resolved by a default bundler build", async () => {
    await expect(bundle()).rejects.toThrow(/is not exported|Could not resolve/);
    const opted = await bundle([CONDITION]);
    expect(opted.errors).toEqual([]);
  });

  it("refuses to load in a process where wallet-cli published its plugin API", () => {
    const testing = JSON.stringify(pathToFileURL(join(SDK, "dist/testing.mjs")).href);
    const host = JSON.stringify(
      pathToFileURL(join(TS_ROOT, "src/bootstrap/plugins/api-object.ts")).href,
    );
    const inHost = node(
      ["--import", "tsx"],
      `const { publishPluginApi } = await import(${host});
       publishPluginApi();
       await import(${testing});
       console.log("loaded");`,
      TS_ROOT,
    );
    expect(inHost.status).not.toBe(0);
    expect(inHost.stderr).toContain(
      "@tron-walletcli/plugin-sdk/testing is for plugin tests only and cannot run inside wallet-cli",
    );
    expect(inHost.stdout).not.toContain("loaded");
    // A test process loads it, and may evaluate it again.
    const inTest = node(
      [],
      `await import(${testing});
       await import(${testing} + "?again");
       const { z } = await import(${JSON.stringify(pathToFileURL(join(SDK, "dist/cli.mjs")).href)});
       console.log(typeof z.object);`,
    );
    expect(inTest.stdout.trim(), inTest.stderr).toBe("function");
  });
});
