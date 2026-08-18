import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("readBoundedTextFile", () => {
  it.runIf(process.platform !== "win32")("rejects a FIFO without waiting for a writer", () => {
    const root = mkdtempSync(join(tmpdir(), "wallet-cli-artifact-"));
    roots.push(root);
    const fifo = join(root, "transaction.hex");
    execFileSync("mkfifo", [fifo]);

    const script = `
        import { readBoundedTextFile } from ${JSON.stringify(new URL("./artifact.ts", import.meta.url).href)};
        try {
          readBoundedTextFile(${JSON.stringify(fifo)}, 1024, "transaction hex file");
          process.exitCode = 2;
        } catch (error) {
          process.stdout.write(JSON.stringify({ code: error.code, message: error.message }));
        }
      `;
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", script],
      { encoding: "utf8", timeout: 1_000 },
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      code: "invalid_value",
      message: "transaction hex file must be a regular file",
    });
  });
});
