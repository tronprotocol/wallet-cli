import { describe, it, expect } from "vitest";
import { FAMILIES, familyOf } from "./index.js";

describe("domain family facts + ledger meta", () => {
  it("tron carries the expected coin facts and is ledger-wired", () => {
    expect(FAMILIES.tron.nativeUnit).toBe("sun");
    // the coin's SYMBOL is not here — it belongs to the network (evm:1 = ETH, evm:56 = BNB),
    // and a family-level one could only ever be right for one chain of the family.
    expect("nativeSymbol" in FAMILIES.tron).toBe(false);
    expect(FAMILIES.tron.nativeDecimals).toBe(6);
    expect(FAMILIES.tron.coinType).toBe(195);
    expect(FAMILIES.tron.ledger).toEqual({ app: "tron" });
  });
});

describe("evm family facts", () => {
  it("carries ETH/wei coin facts at BIP44 coin type 60", () => {
    expect(FAMILIES.evm).toMatchObject({
      family: "evm",
      nativeUnit: "wei",
      nativeDecimals: 18,
      coinType: 60,
    });
  });

  // The field's contract is "present = hardware app wired", and it drives both assertWired() and
  // the `--app` choices `import ledger` offers. It was deliberately absent until hw-app-eth was
  // a dependency; wiring the app is what makes it correct to declare.
  it("is ledger-wired to the ethereum app", () => {
    expect(FAMILIES.evm.ledger).toEqual({ app: "ethereum" });
  });
});

describe("familyOf detects a family from an address's encoding", () => {
  it.each([
    ["TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6", "tron"],
    ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "evm"],
    ["0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266", "evm"],
  ])("maps %s to %s", (address, family) => {
    expect(familyOf(address)).toBe(family);
  });

  it("returns undefined for a checksum-broken EVM address rather than guessing", () => {
    expect(familyOf("0xf39fd6e51aad88F6F4ce6aB8827279cffFb92266")).toBeUndefined();
  });
});
