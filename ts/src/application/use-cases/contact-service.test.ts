import { describe, it, expect } from "vitest";
import { ContactService } from "./contact-service.js";
import type { ContactRepository } from "../ports/contact-repository.js";
import type { ContactEntry } from "../../domain/types/index.js";

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

// §3.11: an entry persists its family, and the family is inferred from the address — asking the
// user to restate what the address already says is a chance to get it wrong.
describe("ContactService infers the family from the address", () => {
  it.each([
    ["tron", TRON],
    ["evm", EVM],
  ])("files a %s address under that family", (family, address) => {
    const { port, entries } = repo();
    // the view carries no family — but the entry is still bucketed by one internally
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

    // family is internal now; the address is what identifies the chain to a reader
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

// Externally the book is a flat map: one name, one address, both unique. Family is how the JSON
// buckets entries and how `--to` routes them — never something the user has to think about.
// Per-family uniqueness was never a decision; it was inherited from the storage shape, and it is
// what made `remove <name>` ambiguous and forced a --family flag into the design.
describe("ContactService keeps names and addresses unique across the whole book", () => {
  it("refuses a name already used on another chain", () => {
    const { port } = repo();
    const svc = new ContactService(port);
    svc.add("exchange", TRON);

    expect(() => svc.add("exchange", EVM)).toThrow();
  });

  it("names the clash rather than reporting a generic failure", () => {
    const { port } = repo();
    const svc = new ContactService(port);
    svc.add("exchange", TRON);

    let code: string | undefined;
    try {
      svc.add("exchange", EVM);
    } catch (e) {
      code = (e as { code?: string }).code;
    }
    expect(code).toBe("already_exists");
  });

  // Two names for one address makes `contact list` show the same recipient twice and leaves no
  // answer to "what is this address called".
  it("refuses an address already stored under another name", () => {
    const { port } = repo();
    const svc = new ContactService(port);
    svc.add("exchange", EVM);

    expect(() => svc.add("exchange-2", EVM)).toThrow(/already_exists|already stored/);
  });

  it("still accepts a genuinely new name and address", () => {
    const { port } = repo();
    const svc = new ContactService(port);
    svc.add("exchange-tron", TRON);

    expect(svc.add("exchange-evm", EVM)).toMatchObject({ name: "exchange-evm" });
  });

  // With names unique, removal is never ambiguous — no --family, no --network, no second
  // positional. The disambiguation flag the spec called for stops being needed at all.
  it("removes by name with nothing to disambiguate", () => {
    const { port, entries } = repo();
    const svc = new ContactService(port);
    svc.add("exchange", EVM);

    expect(svc.remove("exchange")).toMatchObject({ name: "exchange" });
    expect(entries).toHaveLength(0);
  });
});
