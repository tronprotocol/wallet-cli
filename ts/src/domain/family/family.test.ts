import { describe, it, expect } from "vitest";
import {
  addressBodyLength,
  addressShape,
  FAMILIES,
  familyOf,
  hasAddressPrefix,
  sameAddress,
  tronHash20Hex,
} from "./index.js";

const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const USDT_HEX = "41a614f803b6fd780986a42c78ec9c7f77e6ded13c";

describe("domain family facts + ledger meta", () => {
  it("tron carries the expected coin facts and is ledger-wired", () => {
    expect(FAMILIES.tron.nativeUnit).toBe("sun");
    // Symbols vary by network within a family.
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

describe("family zero addresses", () => {
  it("are valid addresses of their own family", () => {
    expect(FAMILIES.tron.zeroAddress).toBe("T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb");
    expect(familyOf(FAMILIES.tron.zeroAddress)).toBe("tron");
    expect(tronHash20Hex(FAMILIES.tron.zeroAddress)).toBe("0".repeat(40));
    expect(FAMILIES.evm.zeroAddress).toBe(`0x${"0".repeat(40)}`);
    expect(familyOf(FAMILIES.evm.zeroAddress)).toBe("evm");
  });
});

describe("addressBodyLength", () => {
  it("measures text after the family prefix when it uses the family alphabet", () => {
    expect(addressBodyLength("tron", USDT)).toBe(33);
    expect(addressBodyLength("tron", "T0abc")).toBeUndefined();
    expect(addressBodyLength("tron", "tR7NHq")).toBeUndefined();
    expect(addressBodyLength("tron", "T")).toBeUndefined();
    expect(addressBodyLength("evm", "0xf39Fd6e5")).toBe(8);
    expect(addressBodyLength("evm", "0Xf39Fd6e5")).toBeUndefined();
    expect(addressBodyLength("evm", "0xzz")).toBeUndefined();
  });
});

describe("addressShape", () => {
  it("names each family spelling only at its exact length", () => {
    const hex = tronHash20Hex(USDT);
    expect(addressShape(USDT)).toBe("tron-base58");
    expect(addressShape(USDT.slice(0, -1))).toBeUndefined();
    expect(addressShape(`41${hex}`)).toBe("tron-hex");
    expect(addressShape(`0x41${hex}`)).toBe("tron-hex");
    expect(addressShape(`0X41${hex}`)).toBeUndefined();
    expect(addressShape(`0x${hex}`)).toBe("evm");
    expect(addressShape(`0x${hex}0`)).toBeUndefined();
    expect(addressShape(hex)).toBeUndefined();
  });
});

describe("hasAddressPrefix", () => {
  it("matches the family prefix in any letter case", () => {
    expect(hasAddressPrefix("evm", "0xabc")).toBe(true);
    expect(hasAddressPrefix("evm", "0Xabc")).toBe(true);
    expect(hasAddressPrefix("evm", "x0abc")).toBe(false);
    expect(hasAddressPrefix("tron", USDT)).toBe(true);
  });
});

describe("sameAddress", () => {
  it("compares TRON Base58Check with its 20- and 21-byte hex forms", () => {
    for (const form of [
      USDT,
      USDT_HEX,
      `0x${USDT_HEX}`,
      `0x${USDT_HEX.slice(2)}`,
      USDT_HEX.slice(2),
    ]) {
      expect(sameAddress("tron", form, USDT)).toBe(true);
    }
    expect(sameAddress("tron", USDT, FAMILIES.tron.zeroAddress)).toBe(false);
  });

  it("does not treat case-folded Base58 or malformed TRON text as equal", () => {
    expect(sameAddress("tron", USDT.toLowerCase(), USDT.toLowerCase())).toBe(false);
    expect(sameAddress("tron", "not-an-address", "not-an-address")).toBe(false);
  });

  it("compares EVM addresses in canonical form", () => {
    const checksummed = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    expect(sameAddress("evm", checksummed, checksummed.toLowerCase())).toBe(true);
    expect(sameAddress("evm", checksummed, `0x${checksummed.slice(2).toUpperCase()}`)).toBe(true);
    expect(sameAddress("evm", checksummed, FAMILIES.evm.zeroAddress)).toBe(false);
  });

  it("ignores EVM checksum casing but requires the 0x + 20-byte shape", () => {
    const broken = "0xf39fd6e51aad88F6F4ce6aB8827279cffFb92266";
    expect(sameAddress("evm", broken, broken.toLowerCase())).toBe(true);
    expect(sameAddress("evm", "payer", "payer")).toBe(false);
    expect(sameAddress("evm", broken.toUpperCase(), broken)).toBe(true);
  });
});
