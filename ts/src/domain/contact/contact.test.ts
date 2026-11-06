import { describe, expect, it } from "vitest";
import {
  contactName,
  contactNameKey,
  contactNote,
  createContact,
  MAX_CONTACTS,
  resemblesAddress,
  withContact,
  withoutContact,
} from "./index.js";

const ADDRESS = "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC";

describe("contact validation", () => {
  it("normalizes compatibility-equivalent names into one lookup key", () => {
    expect(contactNameKey(" ＡＬＩＣＥ ")).toBe("alice");
  });

  it("rejects address-shaped aliases and control characters", () => {
    expect(() => contactNameKey(ADDRESS)).toThrow(/must not resemble/);
    expect(() => contactNameKey("alice\u202e")).toThrow(/safe characters/);
  });

  it("enforces character limits while preserving valid Unicode", () => {
    expect(contactNote("账".repeat(128))).toBe("账".repeat(128));
    expect(() => contactNote("账".repeat(129))).toThrow(/128/);
    expect(createContact("tron", "财务", ADDRESS)).toMatchObject({
      name: "财务",
      address: ADDRESS,
      family: "tron",
    });
  });

  it("rejects an invalid Base58Check address", () => {
    expect(() => createContact("tron", "alice", "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HX")).toThrow(
      /valid tron address/,
    );
  });
});

const TRON = "TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6";
const EVM = "0xe2E1a54926527Fbb4E4420DE4c6BAb82beAEE24D";

describe("createContact validates the address against its own family", () => {
  it.each([
    ["tron", TRON],
    ["evm", EVM],
  ])("accepts a %s address", (family, address) => {
    expect(createContact(family as never, "friend", address)).toMatchObject({ family, address });
  });

  it.each([
    ["tron", EVM],
    ["evm", TRON],
  ])("rejects an address belonging to another family (%s)", (family, address) => {
    expect(() => createContact(family as never, "friend", address)).toThrow();
  });

  it("rejects an EVM address whose checksum does not hold", () => {
    expect(() =>
      createContact("evm" as never, "friend", "0xe2e1a54926527Fbb4E4420DE4c6BAb82beAEE24D"),
    ).toThrow();
  });
});

describe("contact names may not impersonate an address of any family", () => {
  it.each([
    ["an EVM address", EVM],
    ["a lowercase EVM address", EVM.toLowerCase()],
    ["an uppercase EVM address", `0x${EVM.slice(2).toUpperCase()}`],
  ])("rejects %s as a name", (_label, name) => {
    expect(() => contactName(name)).toThrow(/must not resemble/);
  });

  it("still accepts ordinary names that merely start with 0x", () => {
    expect(contactName("0x-not-an-address")).toBe("0x-not-an-address");
  });
});

describe("resemblesAddress spots a near-miss of any family", () => {
  it.each([
    ["tron", TRON],
    ["tron with a broken checksum", "TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL7"],
    ["evm", EVM],
    ["evm with a broken checksum", "0xe2e1a54926527Fbb4E4420DE4c6BAb82beAEE24D"],
  ])("is true for %s", (_label, value) => {
    expect(resemblesAddress(value)).toBe(true);
  });

  it("is false for an ordinary name", () => {
    expect(resemblesAddress("team-vault")).toBe(false);
  });
});

describe("createContact — canonical address", () => {
  const CHECKSUMMED = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";

  it("stores an all-lowercase EVM address in EIP-55", () => {
    expect(createContact("evm", "alice", CHECKSUMMED.toLowerCase()).address).toBe(CHECKSUMMED);
  });

  it("names the argument that was wrong when the address is not one", () => {
    expect(() => createContact("evm", "alice", "0xnope")).toThrowError(
      expect.objectContaining({ code: "invalid_address" }),
    );
  });
});

describe("withContact", () => {
  const alice = createContact("tron", "alice", ADDRESS);
  const bob = createContact("tron", "Bob", "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7");

  it("returns the family's contacts in name order", () => {
    expect(withContact([bob], [bob], alice)).toEqual([alice, bob]);
  });

  it("refuses a name or address any family already holds", () => {
    const evmAlice = createContact("evm", "ALICE", "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    expect(() => withContact([evmAlice], [], alice)).toThrowError(
      expect.objectContaining({ code: "already_exists" }),
    );
  });

  it("refuses a family that is full", () => {
    const full = Array.from({ length: MAX_CONTACTS }, () => bob);
    expect(() => withContact([], full, alice)).toThrowError(
      expect.objectContaining({
        code: "limit_exceeded",
        message: `contact book cannot exceed ${MAX_CONTACTS} entries`,
      }),
    );
  });
});

describe("withoutContact", () => {
  const alice = createContact("tron", "alice", ADDRESS);

  it("removes the contact and returns it", () => {
    expect(withoutContact([alice], "alice")).toEqual({ entries: [], removed: alice });
  });

  it("reports a missing contact", () => {
    expect(() => withoutContact([alice], "bob")).toThrowError(
      expect.objectContaining({ code: "contact_not_found", message: "contact not found: bob" }),
    );
  });
});
