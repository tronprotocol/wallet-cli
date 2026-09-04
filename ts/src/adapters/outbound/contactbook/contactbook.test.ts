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
    expect(() => book.add(createContact("tron", "ＡＬＩＣＥ", OTHER))).toThrow(/already exists/);
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
      writeFileSync(external, JSON.stringify({ version: 1, entries: {} }), { mode: 0o600 });
      symlinkSync(external, join(directory, "contacts.json"));

      expect(() => new ContactBook(directory, new AtomicFileStore()).list("tron")).toThrow(
        /symbolic link/,
      );
    },
  );

  it("rejects tampered normalization fields instead of accepting aliases", () => {
    const directory = root();
    writeFileSync(
      join(directory, "contacts.json"),
      JSON.stringify({
        version: 1,
        entries: {
          tron: [
            {
              family: "tron",
              nativeSymbol: "TRX",
              name: "Alice",
              nameKey: "bob",
              address: ADDRESS,
              note: null,
            },
          ],
        },
      }),
      { mode: 0o600 },
    );

    expect(() => new ContactBook(directory, new AtomicFileStore()).list("tron")).toThrow(
      /invalid schema/,
    );
  });
});

describe("ContactBook holds every family", () => {
  const TRON = "TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6";
  const EVM = "0xe2E1a54926527Fbb4E4420DE4c6BAb82beAEE24D";

  // The on-disk shape was ALREADY family-keyed (`entries` is Partial<Record<ChainFamily, …>> and
  // every entry carries its own `family`), so nothing here is a migration — the loader simply
  // stopped refusing anything that was not tron.
  it("round-trips contacts from both families", () => {
    const book = new ContactBook(root(), new AtomicFileStore());
    book.add(createContact("tron", "tron-friend", TRON));
    book.add(createContact("evm", "evm-friend", EVM));

    expect(book.list("tron").map((c) => c.address)).toEqual([TRON]);
    expect(book.list("evm").map((c) => c.address)).toEqual([EVM]);
  });

  it("keeps the two families' name spaces separate", () => {
    const book = new ContactBook(root(), new AtomicFileStore());
    book.add(createContact("tron", "friend", TRON));
    book.add(createContact("evm", "friend", EVM));

    expect(book.find("tron", "friend")?.address).toBe(TRON);
    expect(book.find("evm", "friend")?.address).toBe(EVM);
  });

  it("rejects a file whose entry sits under the wrong family key", () => {
    const dir = root();
    const book = new ContactBook(dir, new AtomicFileStore());
    book.add(createContact("evm", "evm-friend", EVM));
    const path = join(dir, "contacts.json");
    const doc = JSON.parse(readFileSync(path, "utf8"));
    doc.entries.tron = doc.entries.evm; // an EVM address filed under tron
    delete doc.entries.evm;
    writeFileSync(path, JSON.stringify(doc));

    expect(() => new ContactBook(dir, new AtomicFileStore()).list("tron")).toThrow();
  });

  it("rejects an unknown family key", () => {
    const dir = root();
    writeFileSync(
      join(dir, "contacts.json"),
      JSON.stringify({ version: 1, entries: { solana: [] } }),
      { mode: 0o600 },
    );

    expect(() => new ContactBook(dir, new AtomicFileStore()).list("tron")).toThrow();
  });
});
