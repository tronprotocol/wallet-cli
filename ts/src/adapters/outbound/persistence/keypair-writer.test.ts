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

  // The default location moved here from AddressService: a use case should not know that generated
  // keypairs live under <root>/generated, nor how the filename is built.
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

  // O_EXCL creates the file before the content is written, so a failure in between used to leave an
  // empty artifact at the final path — and then O_EXCL rejected every retry of the same command.
  it("removes its own unfinished file so the same path can be retried", () => {
    const directory = root();
    const path = join(directory, "key.json");
    const writer = new SecureKeypairWriter(directory);

    // fails inside the try, after the file exists: JSON.stringify cannot serialize a BigInt
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

  // The identical O_EXCL conflict in SecureBackupWriter reports output_exists / UsageError / exit 2.
  // A deterministic conflict must not look retryable in one command and fatal in another.
  it("reports an existing target with the shared output-conflict contract", () => {
    const directory = root();
    const path = join(directory, "key.json");
    writeFileSync(path, "original", { mode: 0o600 });

    try {
      new SecureKeypairWriter(directory).write({ out: path }, { privateKey: "replacement" });
      expect.unreachable("expected the write to be refused");
    } catch (error) {
      expect(error).toMatchObject({ code: "output_exists", kind: "usage" });
      expect((error as UsageError).exitCode()).toBe(2);
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
