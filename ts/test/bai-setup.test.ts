import { expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { DETACHED } from "./detached.js";

it("configures BAI offline without a network, wallet or password and ignores legacy binding files", () => {
  const home = mkdtempSync(join(tmpdir(), "bai-config-only-"));
  try {
    const guard = join(home, "offline.mjs");
    writeFileSync(
      guard,
      "globalThis.fetch = async () => { throw new Error('config must not call a remote API'); };",
    );
    writeFileSync(join(home, "bai-binding.json"), "legacy file is ignored");
    for (const key of ["first-test-key", "replacement-test-key"]) {
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--import",
          guard,
          "src/index.ts",
          "config",
          "baiApiKey",
          "--api-key-stdin",
          "-o",
          "json",
        ],
        {
          ...DETACHED,
          env: { ...process.env, WALLET_CLI_HOME: home },
          input: key + "\n",
          encoding: "utf8",
          timeout: 20000,
        },
      );
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(readFileSync(join(home, "config.yaml"), "utf8")).toContain(key);
      expect(result.stdout + result.stderr).not.toContain(key);
    }
    expect(existsSync(join(home, "wallets.json"))).toBe(false);
    expect(readFileSync(join(home, "bai-binding.json"), "utf8")).toBe("legacy file is ignored");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}, 60000);
