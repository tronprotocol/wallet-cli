import { describe, expect, it } from "vitest";
import type { ContactRepository } from "../ports/contact-repository.js";
import { RecipientResolver } from "./recipient-resolver.js";

const VALID = "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC";
const ALICE = "TEkj3ndMVEmFLYaFrATMwMjBRZ1EAZkucT";

describe("RecipientResolver", () => {
  const repository = {
    find: (_family: string, key: string) => key === "alice"
      ? {
          family: "tron",
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
    expect(() =>
      resolver.resolve("tron", "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HX")
    ).toThrow(/checksum/);
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
