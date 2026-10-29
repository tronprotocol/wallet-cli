import { describe, it, expect } from "vitest";
import { ContactService } from "./contact-service.js";
import type { ContactRepository } from "../ports/contact-repository.js";
import type { ContactEntry } from "../../domain/types/index.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ContactBook } from "../../adapters/outbound/contactbook/index.js";
import { AtomicFileStore } from "../../adapters/outbound/persistence/fs/index.js";

const TRON = "TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6";
const EVM = "0xe2E1a54926527Fbb4E4420DE4c6BAb82beAEE24D";

function repo() {
  const entries: ContactEntry[] = [];
  return {
    entries,
    port: {
      add: (e: ContactEntry) => {
        entries.push(e);
        return e;
      },
      list: (family: string) => entries.filter((e) => e.family === family),
      find: (family: string, key: string) =>
        entries.find((e) => e.family === family && e.nameKey === key),
      remove: (family: string, key: string) => {
        const i = entries.findIndex((e) => e.family === family && e.nameKey === key);
        if (i < 0) throw Object.assign(new Error("not found"), { code: "not_found" });
        return entries.splice(i, 1)[0]!;
      },
    } as unknown as ContactRepository,
  };
}

describe("ContactService infers the family from the address", () => {
  it.each([
    ["tron", TRON],
    ["evm", EVM],
  ])("files a %s address under that family", (family, address) => {
    const { port, entries } = repo();
    expect(new ContactService(port).add("friend", address)).toMatchObject({ address });
    expect(entries).toMatchObject([{ family }]);
  });

  it("refuses an address belonging to no known family", () => {
    const { port } = repo();
    expect(() => new ContactService(port).add("friend", "not-an-address")).toThrow();
  });
});

describe("ContactService lists every family", () => {
  it("returns contacts from both families, each carrying its own", () => {
    const { port } = repo();
    const svc = new ContactService(port);
    svc.add("tron-friend", TRON);
    svc.add("evm-friend", EVM);

    expect(svc.list().contacts.map((c) => [c.name, c.address])).toEqual([
      ["tron-friend", TRON],
      ["evm-friend", EVM],
    ]);
  });
});

describe("ContactService removes by name alone", () => {
  it("finds the entry whichever family holds it", () => {
    const { port, entries } = repo();
    const svc = new ContactService(port);
    svc.add("evm-friend", EVM);

    expect(svc.remove("evm-friend")).toMatchObject({ name: "evm-friend" });
    expect(entries).toHaveLength(0);
  });
});

describe("ContactService keeps names and addresses unique across the whole book", () => {
  // Uniqueness is enforced by the repository under its lock.
  const bookService = () =>
    new ContactService(
      new ContactBook(mkdtempSync(join(tmpdir(), "contacts-")), new AtomicFileStore()),
    );

  it("refuses a name already used on another chain", () => {
    const svc = bookService();
    svc.add("exchange", TRON);

    expect(() => svc.add("exchange", EVM)).toThrowError(
      expect.objectContaining({ code: "already_exists" }),
    );
  });

  it("refuses an address already stored under another name", () => {
    const svc = bookService();
    svc.add("exchange", EVM);

    expect(() => svc.add("exchange-2", EVM)).toThrow(/already stored/);
  });

  it("still accepts a genuinely new name and address", () => {
    const { port } = repo();
    const svc = new ContactService(port);
    svc.add("exchange-tron", TRON);

    expect(svc.add("exchange-evm", EVM)).toMatchObject({ name: "exchange-evm" });
  });

  it("removes by name with nothing to disambiguate", () => {
    const { port, entries } = repo();
    const svc = new ContactService(port);
    svc.add("exchange", EVM);

    expect(svc.remove("exchange")).toMatchObject({ name: "exchange" });
    expect(entries).toHaveLength(0);
  });
});
