import { expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileBaiBindingStore } from "./binding-store.js";
import { AtomicFileStore } from "../persistence/fs/index.js";
it("persists confirmation without storing the API key and scopes it to key, chain and wallet", () => {
  const root = mkdtempSync(join(tmpdir(), "bai-binding-"));
  try {
    const store = new FileBaiBindingStore(root, new AtomicFileStore());
    expect(store.isConfirmed("secret", "bnb", "payer")).toBe(false);
    store.confirm("secret", "bnb", "payer");
    const reopened = new FileBaiBindingStore(root, new AtomicFileStore());
    expect(reopened.isConfirmed("secret", "bnb", "payer")).toBe(true);
    expect(reopened.isConfirmed("different", "bnb", "payer")).toBe(false);
    expect(reopened.isConfirmed("secret", "tron", "payer")).toBe(false);
    expect(reopened.isConfirmed("secret", "bnb", "other")).toBe(false);
    const path = join(root, "bai-binding.json");
    expect(readFileSync(path, "utf8")).not.toContain("secret");
    if (process.platform !== "win32") expect(statSync(path).mode & 0o777).toBe(0o600);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
