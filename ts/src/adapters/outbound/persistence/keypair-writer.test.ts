import { afterEach, describe, expect, it } from "vitest";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SecureKeypairWriter } from "./keypair-writer.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function root(): string {
  const value = mkdtempSync(join(tmpdir(), "wallet-cli-keypair-"));
  roots.push(value);
  return value;
}

describe("SecureKeypairWriter", () => {
  it("creates a new durable 0600 JSON artifact", () => {
    const directory = root();
    const path = join(directory, "nested", "key.json");
    expect(new SecureKeypairWriter().write(path, { privateKey: "secret" }))
      .toBe(path);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
      privateKey: "secret",
    });
    if (process.platform !== "win32") {
      expect(lstatSync(path).mode & 0o777).toBe(0o600);
    }
  });

  it("never overwrites an existing file", () => {
    const directory = root();
    const path = join(directory, "key.json");
    writeFileSync(path, "original", { mode: 0o600 });

    expect(() =>
      new SecureKeypairWriter().write(path, { privateKey: "replacement" })
    ).toThrow(/refusing to overwrite/);
    expect(readFileSync(path, "utf8")).toBe("original");
  });

  it("never follows an existing final-path symlink", () => {
    const directory = root();
    const external = join(directory, "external.json");
    const path = join(directory, "key.json");
    writeFileSync(external, "original", { mode: 0o600 });
    symlinkSync(external, path);

    expect(() =>
      new SecureKeypairWriter().write(path, { privateKey: "replacement" })
    ).toThrow(/refusing to overwrite/);
    expect(readFileSync(external, "utf8")).toBe("original");
  });
});
