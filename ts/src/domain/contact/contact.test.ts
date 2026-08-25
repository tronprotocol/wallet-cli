import { describe, expect, it } from "vitest";
import {
  contactName,
  contactNameKey,
  contactNote,
  createContact,
  resemblesAddress,
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
    // The message now names the family rather than the encoding, since each family validates
    // against its own codec.
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

  // Storing a TRON address under `evm` would make `--to friend` on an EVM network resolve to an
  // address that does not exist there.
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

// A contact name that looks like an address is how a typo'd recipient becomes a silent redirect:
// the address fails validation, falls through to a name lookup, and matches the impostor. The
// TRON side has always been guarded; EVM must be too, before contacts can live in an evm bucket.
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

/**
 * The address book is a display surface as much as a lookup: `contact list` is where someone
 * checks a payee against what their exchange showed them. The loader runs this same constructor,
 * so an entry written before this rule normalises the moment it is read back.
 */
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
