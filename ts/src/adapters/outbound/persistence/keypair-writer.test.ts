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
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SecureKeypairWriter } from "./keypair-writer.js";
import type { UsageError } from "../../../domain/errors/index.js";
import { exitCodeOf } from "../../inbound/cli/output/errors.js";

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
  it("reports a directory it cannot create as io_error and writes nothing", () => {
    const directory = root();
    const blocker = join(directory, "file");
    writeFileSync(blocker, "");
    const path = join(blocker, "sub", "key.json");
    let caught: unknown;
    try {
      new SecureKeypairWriter(directory).write({ out: path }, { privateKey: "secret" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "io_error" });
    expect(exitCodeOf(caught as UsageError)).toBe(1);
    expect(existsSync(path)).toBe(false);
  });

  it("creates a new durable 0600 JSON artifact", () => {
    const directory = root();
    const path = join(directory, "nested", "key.json");
    expect(new SecureKeypairWriter(directory).write({ out: path }, { privateKey: "secret" })).toBe(
      path,
    );
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
      privateKey: "secret",
    });
    if (process.platform !== "win32") {
      expect(lstatSync(path).mode & 0o777).toBe(0o600);
    }
  });

  it("derives the default location from the wallet root and the name", () => {
    const directory = root();
    const address = "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC";

    const written = new SecureKeypairWriter(directory).write(
      { name: address },
      { privateKey: "secret" },
    );

    expect(written).toBe(join(directory, "generated", `keypair-${address}`));
    expect(JSON.parse(readFileSync(written, "utf8"))).toEqual({ privateKey: "secret" });
  });

  it("never overwrites an existing file", () => {
    const directory = root();
    const path = join(directory, "key.json");
    writeFileSync(path, "original", { mode: 0o600 });

    expect(() =>
      new SecureKeypairWriter(directory).write({ out: path }, { privateKey: "replacement" }),
    ).toThrow(/refusing to overwrite/);
    expect(readFileSync(path, "utf8")).toBe("original");
  });

  it("removes its own unfinished file so the same path can be retried", () => {
    const directory = root();
    const path = join(directory, "key.json");
    const writer = new SecureKeypairWriter(directory);

    // BigInt serialization fails after the file is created.
    expect(() => writer.write({ out: path }, { privateKey: 1n })).toThrow(
      /could not write keypair file/,
    );
    expect(existsSync(path)).toBe(false);

    expect(writer.write({ out: path }, { privateKey: "secret" })).toBe(path);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ privateKey: "secret" });
  });

  it("cleans up only files it created, never a pre-existing target", () => {
    const directory = root();
    const path = join(directory, "key.json");
    writeFileSync(path, "original", { mode: 0o600 });

    expect(() =>
      new SecureKeypairWriter(directory).write({ out: path }, { privateKey: 1n }),
    ).toThrow(/refusing to overwrite/);
    expect(readFileSync(path, "utf8")).toBe("original");
  });

  it("reports an existing target with the shared output-conflict contract", () => {
    const directory = root();
    const path = join(directory, "key.json");
    writeFileSync(path, "original", { mode: 0o600 });

    try {
      new SecureKeypairWriter(directory).write({ out: path }, { privateKey: "replacement" });
      expect.unreachable("expected the write to be refused");
    } catch (error) {
      expect(error).toMatchObject({ code: "output_exists", kind: "usage" });
      expect(exitCodeOf(error as UsageError)).toBe(2);
    }
  });

  it("never follows an existing final-path symlink", () => {
    const directory = root();
    const external = join(directory, "external.json");
    const path = join(directory, "key.json");
    writeFileSync(external, "original", { mode: 0o600 });
    symlinkSync(external, path);

    expect(() =>
      new SecureKeypairWriter(directory).write({ out: path }, { privateKey: "replacement" }),
    ).toThrow(/refusing to overwrite/);
    expect(readFileSync(external, "utf8")).toBe("original");
  });
});
