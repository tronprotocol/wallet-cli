import { describe, expect, it } from "vitest";
import { normalizeContractResponses } from "./contract-response.js";

describe("normalizeContractResponses", () => {
  it("normalizes name and ABI entry variants", () => {
    const contract = { name: "Token", abi: { entrys: [
      { type: "Function", name: "balanceOf" },
      { type: "Event", name: "Transfer" },
    ] } };
    const normalized = normalizeContractResponses(contract, undefined);
    expect(normalized.name).toBe("Token");
    expect(normalized.methods).toEqual(["balanceOf"]);
    expect(normalized.contract).toBe(contract);
  });

  it("falls back to the info response and tolerates malformed fields", () => {
    const info = { name: "Fallback", ABI: [{ type: "function", name: "owner" }] };
    expect(normalizeContractResponses({ abi: "invalid" }, info)).toMatchObject({
      name: "Fallback",
      methods: ["owner"],
    });
  });
});
