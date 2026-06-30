import { describe, it, expect } from "vitest";
import { FAMILIES } from "./index.js";

describe("domain family facts + ledger meta", () => {
  it("tron carries the expected coin facts and is ledger-wired", () => {
    expect(FAMILIES.tron.nativeUnit).toBe("sun");
    expect(FAMILIES.tron.coinType).toBe(195);
    expect(FAMILIES.tron.ledger).toEqual({ app: "tron" });
  });
});
