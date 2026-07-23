import { afterEach, describe, expect, it } from "vitest";
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ContactBook } from "./index.js";
import { AtomicFileStore } from "../persistence/fs/index.js";
import { createContact } from "../../../domain/contact/index.js";

const ADDRESS = "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC";
const OTHER = "TEkj3ndMVEmFLYaFrATMwMjBRZ1EAZkucT";
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function root(): string {
  const value = mkdtempSync(join(tmpdir(), "wallet-cli-contacts-"));
  roots.push(value);
  return value;
}

describe("ContactBook", () => {
  it("stores atomically at 0600 and enforces normalized-name uniqueness", () => {
    const directory = root();
    const book = new ContactBook(directory, new AtomicFileStore());
    book.add(createContact("tron", "Alice", ADDRESS, "Treasury"));

    expect(book.find("tron", "alice")?.name).toBe("Alice");
    expect(() =>
      book.add(createContact("tron", "ＡＬＩＣＥ", OTHER))
    ).toThrow(/already exists/);
    const path = join(directory, "contacts.json");
    if (process.platform !== "win32") {
      expect(lstatSync(path).mode & 0o777).toBe(0o600);
    }
    expect(readFileSync(path, "utf8")).toContain('"nameKey": "alice"');
    expect(book.remove("tron", "alice").address).toBe(ADDRESS);
  });

  it.runIf(process.platform !== "win32")(
    "refuses a contact file with group/other permissions",
    () => {
      const directory = root();
      const book = new ContactBook(directory, new AtomicFileStore());
      book.add(createContact("tron", "Alice", ADDRESS));
      chmodSync(join(directory, "contacts.json"), 0o644);

      expect(() => book.list("tron")).toThrow(/mode 0600/);
    },
  );

  it.runIf(process.platform !== "win32")(
    "refuses a symbolic-link contact file without following it",
    () => {
      const directory = root();
      const external = join(directory, "external.json");
      writeFileSync(
        external,
        JSON.stringify({ version: 1, entries: {} }),
        { mode: 0o600 },
      );
      symlinkSync(external, join(directory, "contacts.json"));

      expect(() =>
        new ContactBook(directory, new AtomicFileStore()).list("tron")
      ).toThrow(/symbolic link/);
    },
  );

  it("rejects tampered normalization fields instead of accepting aliases", () => {
    const directory = root();
    writeFileSync(
      join(directory, "contacts.json"),
      JSON.stringify({
        version: 1,
        entries: {
          tron: [{
            family: "tron",
            name: "Alice",
            nameKey: "bob",
            address: ADDRESS,
            note: null,
          }],
        },
      }),
      { mode: 0o600 },
    );

    expect(() =>
      new ContactBook(directory, new AtomicFileStore()).list("tron")
    ).toThrow(/invalid schema/);
  });
});
