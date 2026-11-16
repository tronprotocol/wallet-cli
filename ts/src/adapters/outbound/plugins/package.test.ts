import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
});
