import { afterEach, describe, expect, it } from "vitest";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SecureTransactionArtifactWriter } from "./transaction-artifact-writer.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("SecureTransactionArtifactWriter", () => {
  it("writes a newline-terminated 0600 artifact", () => {
    const dir = mkdtempSync(join(tmpdir(), "wallet-cli-tx-"));
    dirs.push(dir);
    const path = join(dir, "signed.hex");
    new SecureTransactionArtifactWriter().write(path, "abcd");
    expect(readFileSync(path, "utf8")).toBe("abcd\n");
    if (process.platform !== "win32") expect(lstatSync(path).mode & 0o777).toBe(0o600);
  });

  it("refuses an existing file with output_exists and leaves it unchanged", () => {
    const dir = mkdtempSync(join(tmpdir(), "wallet-cli-tx-"));
    dirs.push(dir);
    const path = join(dir, "signed.hex");
    writeFileSync(path, "keep", { mode: 0o600 });
    expect(() => new SecureTransactionArtifactWriter().write(path, "abcd")).toThrowError(
      expect.objectContaining({ code: "output_exists" }),
    );
    expect(readFileSync(path, "utf8")).toBe("keep");
    if (process.platform !== "win32") expect(lstatSync(path).mode & 0o777).toBe(0o600);
  });

  it("refuses to follow a symbolic link, even a dangling one", () => {
    const dir = mkdtempSync(join(tmpdir(), "wallet-cli-tx-"));
    dirs.push(dir);
    const target = join(dir, "target");
    const link = join(dir, "signed.hex");
    symlinkSync(target, link);
    expect(() => new SecureTransactionArtifactWriter().write(link, "abcd")).toThrowError(
      expect.objectContaining({ code: "output_exists" }),
    );
    expect(existsSync(target)).toBe(false);
  });

  it("reports a directory it cannot create as io_error and writes nothing", () => {
    const dir = mkdtempSync(join(tmpdir(), "wallet-cli-tx-"));
    dirs.push(dir);
    writeFileSync(join(dir, "file"), "");
    const path = join(dir, "file", "sub", "signed.hex");
    expect(() => new SecureTransactionArtifactWriter().write(path, "abcd")).toThrowError(
      expect.objectContaining({ code: "io_error" }),
    );
    expect(existsSync(path)).toBe(false);
  });
});
