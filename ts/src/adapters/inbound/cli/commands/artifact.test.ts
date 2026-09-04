import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readBoundedTextFile } from "./artifact.js";

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

  // BUG-040: an editor/`echo`/`jq -r` always leaves a trailing newline, and that newline used to
  // travel straight into the transaction hex, breaking the offline-sign → broadcast handoff.
  it("trims a trailing newline like an editor or `echo` would leave", () => {
    const root = mkdtempSync(join(tmpdir(), "wallet-cli-artifact-"));
    roots.push(root);
    const path = join(root, "transaction.hex");
    writeFileSync(path, "0xdeadbeef\n");

    expect(readBoundedTextFile(path, 1024, "transaction hex file")).toBe("0xdeadbeef");
  });

  it("trims leading/trailing whitespace but leaves internal whitespace alone", () => {
    const root = mkdtempSync(join(tmpdir(), "wallet-cli-artifact-"));
    roots.push(root);
    const path = join(root, "transaction.hex");
    // Two tokens separated by a blank line: a naive "strip all whitespace" fix would silently
    // concatenate them into one hex string instead of leaving the malformed content to fail
    // downstream parsing.
    writeFileSync(path, "  0xdead beef  \n");

    expect(readBoundedTextFile(path, 1024, "transaction hex file")).toBe("0xdead beef");
  });
});
