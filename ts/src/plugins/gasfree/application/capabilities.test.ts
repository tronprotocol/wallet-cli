import { describe, expect, it } from "vitest";
import type { NetworkDescriptor } from "../../../plugin-api/domain.js";
import { GASFREE_CAPABILITIES } from "./capabilities.js";

const NILE = {
  id: "tron:3448148188",
  family: "tron",
  chainId: "3448148188",
  capabilities: [],
} as unknown as NetworkDescriptor;

describe("GasFree capabilities", () => {
  it("are supported where a block resolves, including a written one", () => {
    for (const predicate of Object.values(GASFREE_CAPABILITIES)) {
      expect(predicate(NILE)).toBe("supported");
      expect(predicate({ ...NILE, id: "tron:2494104990" } as NetworkDescriptor)).toBe(
        "unsupported",
      );
      expect(predicate({ ...NILE, id: "tron:2494104990", extensions: { gasfree: {} } })).toBe(
        "supported",
      );
    }
  });
});
