import { describe, expect, it } from "vitest";
import { isDeployedContract, normalizeContractResponses } from "./contract-response.js";

const ORIGIN_HEX = "410000000000000000000000000000000000000000";
const ORIGIN_BASE58 = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";

describe("normalizeContractResponses", () => {
  it("normalizes name and ABI entry variants", () => {
    const contract = {
      name: "Token",
      abi: {
        entrys: [
          { type: "Function", name: "balanceOf" },
          { type: "Event", name: "Transfer" },
        ],
      },
    };
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

  it("normalizes origin_address for deployer authorization", () => {
    expect(
      normalizeContractResponses(
        { contract_address: ORIGIN_HEX, origin_address: ORIGIN_HEX },
        undefined,
      ),
    ).toMatchObject({ originAddress: ORIGIN_BASE58 });
  });
});

describe("isDeployedContract", () => {
  it("is false for the empty response of a non-contract address", () => {
    expect(isDeployedContract({})).toBe(false);
    expect(isDeployedContract(undefined)).toBe(false);
    expect(isDeployedContract(null)).toBe(false);
  });

  it("is true when the response carries a contract identity", () => {
    expect(isDeployedContract({ contract_address: "41abc" })).toBe(true);
    expect(isDeployedContract({ bytecode: "60806040" })).toBe(true);
  });
});
