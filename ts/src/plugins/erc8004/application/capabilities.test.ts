import { describe, expect, it } from "vitest";
import type { NetworkDescriptor } from "../../../plugin-api/domain.js";
import { ERC8004_CAPABILITIES } from "./capabilities.js";

const evm = (id: string) =>
  ({ id, family: "evm", chainId: id.split(":")[1], nativeSymbol: "ETH" }) as NetworkDescriptor;

describe("ERC-8004 capabilities", () => {
  it("enables ERC-8004 only where an Identity Registry is deployed", () => {
    expect(ERC8004_CAPABILITIES["erc8004.identity.read"]!(evm("eip155:97"))).toBe("supported");
    expect(ERC8004_CAPABILITIES["erc8004.identity.write"]!(evm("eip155:1"))).toBe("unsupported");
  });
});
