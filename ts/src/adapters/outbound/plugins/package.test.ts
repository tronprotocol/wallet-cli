import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { runBounded } from "../../../../test/plugins/run-bounded.js";
import { join } from "node:path";
import { readPackageDirectory } from "./package.js";
import { MAX_UNPACKED_BYTES } from "./tar.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "wcli-plugin-package-"));
  mkdirSync(join(dir, "dist"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const MANIFEST = JSON.stringify({ name: "x", version: "1.0.0" });

describe("readPackageDirectory", () => {
  it("reads package.json and a file inside the directory", () => {
    writeFileSync(join(dir, "package.json"), MANIFEST);
    writeFileSync(join(dir, "dist/index.mjs"), "export default {};");
    const pkg = readPackageDirectory(dir);
    expect(pkg.packageJson).toEqual({ name: "x", version: "1.0.0" });
    expect(Buffer.from(pkg.file("dist/index.mjs")!).toString()).toBe("export default {};");
    expect(pkg.file("dist/missing.mjs")).toBeUndefined();
  });

  // Sparse files: the size is checked before anything is allocated or read.
  it("refuses an oversize package.json as plugin_invalid", () => {
    writeFileSync(join(dir, "package.json"), MANIFEST);
    truncateSync(join(dir, "package.json"), 4 * 1024 * 1024 * 1024);
    expect(() => readPackageDirectory(dir)).toThrow(
      expect.objectContaining({
        code: "plugin_invalid",
        message: expect.stringContaining("package.json is too large"),
      }),
    );
  });

  it("refuses an oversize entry file as plugin_invalid", () => {
    writeFileSync(join(dir, "package.json"), MANIFEST);
    writeFileSync(join(dir, "dist/index.mjs"), "");
    truncateSync(join(dir, "dist/index.mjs"), MAX_UNPACKED_BYTES + 1);
    const pkg = readPackageDirectory(dir);
    expect(() => pkg.file("dist/index.mjs")).toThrow(
      expect.objectContaining({
        code: "plugin_invalid",
        message: expect.stringContaining("dist/index.mjs is too large"),
      }),
    );
  });

  // A FIFO with no writer would block a plain open; each case runs in a child with a time limit.
  it.skipIf(process.platform === "win32")(
    "refuses a FIFO package.json or entry file without blocking on it",
    () => {
      const reader = JSON.stringify(pathToFileURL(join(import.meta.dirname, "package.ts")).href);
      execFileSync("mkfifo", [join(dir, "package.json")]);
      const metadata = runBounded(`
        import { readPackageDirectory } from ${reader};
        try { readPackageDirectory(${JSON.stringify(dir)}); console.log("read"); }
        catch (error) { console.log(JSON.stringify({ code: error.code, message: error.message })); }
      `);
      expect(metadata.signal, metadata.stderr).toBeNull();
      expect(JSON.parse(metadata.stdout)).toEqual({
        code: "plugin_invalid",
        message: "invalid plugin package: package.json is missing",
      });

      rmSync(join(dir, "package.json"));
      writeFileSync(join(dir, "package.json"), MANIFEST);
      execFileSync("mkfifo", [join(dir, "dist/index.mjs")]);
      const entry = runBounded(`
        import { readPackageDirectory } from ${reader};
        console.log(JSON.stringify({ entry: readPackageDirectory(${JSON.stringify(dir)}).file("dist/index.mjs") ?? null }));
      `);
      expect(entry.signal, entry.stderr).toBeNull();
      expect(JSON.parse(entry.stdout)).toEqual({ entry: null });
    },
  );
});
