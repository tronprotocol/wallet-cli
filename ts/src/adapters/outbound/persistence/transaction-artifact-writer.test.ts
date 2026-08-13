import { afterEach, describe, expect, it } from "vitest";
import { lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TransactionArtifactWriter } from "./transaction-artifact-writer.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("TransactionArtifactWriter", () => {
  it("atomically writes a newline-terminated 0644 artifact", () => {
    const dir = mkdtempSync(join(tmpdir(), "wallet-cli-tx-"));
    dirs.push(dir);
    const path = join(dir, "signed.hex");
    new TransactionArtifactWriter().write(path, "abcd");
    expect(readFileSync(path, "utf8")).toBe("abcd\n");
    if (process.platform !== "win32") expect(lstatSync(path).mode & 0o777).toBe(0o644);
  });

  it("refuses to replace a symbolic link", () => {
    const dir = mkdtempSync(join(tmpdir(), "wallet-cli-tx-"));
    dirs.push(dir);
    const target = join(dir, "target");
    const link = join(dir, "signed.hex");
    symlinkSync(target, link);
    expect(() => new TransactionArtifactWriter().write(link, "abcd")).toThrowError(/symbolic-link/);
  });
});
