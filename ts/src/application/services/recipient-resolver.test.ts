import { describe, expect, it } from "vitest";
import type { ContactRepository } from "../ports/contact-repository.js";
import { RecipientResolver } from "./recipient-resolver.js";

const VALID = "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC";
const ALICE = "TEkj3ndMVEmFLYaFrATMwMjBRZ1EAZkucT";

describe("RecipientResolver", () => {
  const repository = {
    findAnywhere: (key: string) =>
      key === "alice"
        ? { family: "tron", name: "Alice", nameKey: "alice", address: ALICE, note: null }
        : undefined,
    find: (_family: string, key: string) =>
      key === "alice"
        ? {
            family: "tron",
            nativeSymbol: "TRX",
            name: "Alice",
            nameKey: "alice",
            address: ALICE,
            note: null,
          }
        : undefined,
  } as ContactRepository;
  const resolver = new RecipientResolver(repository);

  it("uses a valid address first and otherwise resolves the canonical contact name", () => {
    expect(resolver.resolve("tron", VALID)).toEqual({ address: VALID });
    expect(resolver.resolve("tron", "ＡＬＩＣＥ")).toEqual({
      address: ALICE,
      contactName: "Alice",
    });
  });

  it("never falls back to a contact for a mistyped address-shaped value", () => {
    expect(() => resolver.resolve("tron", "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HX")).toThrow(
      /checksum/,
    );
  });

  it("returns a stable contact_not_found error for an unknown name", () => {
    try {
      resolver.resolve("tron", "unknown");
      throw new Error("expected resolver to throw");
    } catch (error) {
      expect(error).toMatchObject({ code: "contact_not_found" });
    }
  });
});

const TRON = "TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6";
const EVM = "0xe2E1a54926527Fbb4E4420DE4c6BAb82beAEE24D";

function repoWith(entries: Array<Record<string, unknown>>): ContactRepository {
  return {
    find: (family: string, key: string) =>
      entries.find((e) => e.family === family && e.nameKey === key),
    findAnywhere: (key: string) => entries.find((e) => e.nameKey === key),
  } as unknown as ContactRepository;
}

describe("RecipientResolver — EVM", () => {
  const resolver = new RecipientResolver(repoWith([]));

  it("passes a checksummed EVM address straight through", () => {
    expect(resolver.resolve("evm", EVM)).toEqual({ address: EVM });
  });

  // §1.3 takes an all-lowercase address as "no checksum was offered" and accepts it — but what
  // comes back is the canonical spelling, so the receipt shows the same address the wallet does
  // rather than a second style the reader has to compare character by character.
  it("accepts an unchecksummed EVM address and returns it in EIP-55", () => {
    expect(resolver.resolve("evm", EVM.toLowerCase())).toEqual({ address: EVM });
  });

  // The TRON guard, now for EVM: a near-miss must not fall through to a name lookup.
  it("never falls back to a contact for a mistyped EVM address", () => {
    expect(() => resolver.resolve("evm", "0xe2e1a54926527Fbb4E4420DE4c6BAb82beAEE24D")).toThrow();
  });

  // The attack this closes: a contact deliberately named like an address. contactName() now
  // refuses to create one, but an entry planted before that guard must stay unreachable.
  it("does not resolve a contact whose name mimics the mistyped address", () => {
    const impostor = "0xe2e1a54926527Fbb4E4420DE4c6BAb82beAEE24D";
    const resolverWithImpostor = new RecipientResolver(
      repoWith([
        {
          family: "evm",
          nativeSymbol: "ETH",
          name: impostor,
          nameKey: impostor.toLowerCase(),
          address: "0xdead",
        },
      ]),
    );

    expect(() => resolverWithImpostor.resolve("evm", impostor)).toThrow();
  });

  it("resolves a contact filed under evm", () => {
    const withFriend = new RecipientResolver(
      repoWith([
        { family: "evm", nativeSymbol: "ETH", name: "Friend", nameKey: "friend", address: EVM },
      ]),
    );

    expect(withFriend.resolve("evm", "friend")).toEqual({ address: EVM, contactName: "Friend" });
  });

  it("does not see a contact filed under another family", () => {
    const tronOnly = new RecipientResolver(
      repoWith([
        { family: "tron", nativeSymbol: "TRX", name: "Friend", nameKey: "friend", address: TRON },
      ]),
    );

    expect(() => tronOnly.resolve("evm", "friend")).toThrow();
  });
});

// A well-formed address of the WRONG family used to report contact_not_found, sending the user
// hunting for a contact they never created. Pasting a 0x address onto a TRON network is a
// first-day mistake with a two-family wallet.
describe("RecipientResolver reports a wrong-family address as such", () => {
  it.each([
    ["evm", TRON],
    ["tron", EVM],
  ])("rejects a wrong-family address on %s with family_mismatch", (family, address) => {
    let code: string | undefined;
    try {
      new RecipientResolver(repoWith([])).resolve(family as never, address);
    } catch (e) {
      code = (e as { code?: string }).code;
    }
    expect(code).toBe("family_mismatch");
  });
});

// familyOf() only recognises a VALID address, so a wrong-family value with a broken checksum
// fell through to the generic branch and was described as the selected network's family — the
// message told a user pasting a mistyped 0x address onto TRON that it "resembles a tron address",
// naming the wrong chain's rules and sending them to check the wrong thing.
describe("RecipientResolver names the family the value actually looks like", () => {
  const resolver = new RecipientResolver(repoWith([]));

  it("calls a broken EVM address evm, even on a TRON network", () => {
    expect(() => resolver.resolve("tron", "0xe2e1a54926527Fbb4E4420DE4c6BAb82beAEE24D")).toThrow(
      /evm/,
    );
  });

  it("calls a broken TRON address tron, even on an EVM network", () => {
    expect(() => resolver.resolve("evm", "TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL7")).toThrow(/tron/);
  });

  it("still names the selected family when the value looks like that family", () => {
    expect(() => resolver.resolve("tron", "TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL7")).toThrow(/tron/);
  });
});

// With names unique book-wide, a name that exists but belongs to another chain is a distinct
// and diagnosable case. It used to report contact_not_found, sending the user to look for a
// contact they can see in `contact list`. The message describes the ADDRESS, not the family —
// the user never has to learn that word.
describe("RecipientResolver explains a contact from another chain", () => {
  it("reports family_mismatch rather than contact_not_found", () => {
    const resolver = new RecipientResolver(
      repoWith([{ family: "tron", name: "exchange", nameKey: "exchange", address: TRON }]),
    );

    let code: string | undefined;
    try {
      resolver.resolve("evm", "exchange");
    } catch (e) {
      code = (e as { code?: string }).code;
    }
    expect(code).toBe("family_mismatch");
  });

  it("names the contact and says the selected network cannot pay it", () => {
    const resolver = new RecipientResolver(
      repoWith([{ family: "tron", name: "exchange", nameKey: "exchange", address: TRON }]),
    );

    expect(() => resolver.resolve("evm", "exchange")).toThrow(/exchange/);
    expect(() => resolver.resolve("evm", "exchange")).toThrow(/cannot pay|another chain/i);
  });

  it("still reports contact_not_found for a name that is nowhere", () => {
    let code: string | undefined;
    try {
      new RecipientResolver(repoWith([])).resolve("evm", "nobody");
    } catch (e) {
      code = (e as { code?: string }).code;
    }
    expect(code).toBe("contact_not_found");
  });
});

/**
 * `--to` takes an address OR a contact name, so when a value is neither, the answer has to say
 * which of the two it is reporting on. `contact not found: 0xnotanaddress` told someone who had
 * mistyped an address to go looking for a contact they never made — and said the same words twice
 * (the code already says "contact not found").
 */
describe("RecipientResolver — a value that is neither", () => {
  const resolver = new RecipientResolver({
    find: () => undefined,
    findAnywhere: () => undefined,
  } as never);

  it("reports a value that opens like an address as a failed address", () => {
    const error = (() => {
      try {
        resolver.resolve("evm", "0xnotanaddress");
      } catch (e) {
        return e as { code: string; message: string };
      }
      throw new Error("expected a rejection");
    })();

    expect(error.code).toBe("invalid_address");
    // and still points at the other thing --to accepts
    expect(error.message).toMatch(/no contact is named that either/);
  });

  it("reports anything else as a failed name, mentioning addresses", () => {
    const error = (() => {
      try {
        resolver.resolve("evm", "nosuchname");
      } catch (e) {
        return e as { code: string; message: string };
      }
      throw new Error("expected a rejection");
    })();

    expect(error.code).toBe("contact_not_found");
    expect(error.message).toMatch(/not an address either/);
  });
});
