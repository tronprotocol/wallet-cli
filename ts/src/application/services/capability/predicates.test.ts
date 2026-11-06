import { describe, expect, it } from "vitest";
import { capabilitySupport, type CapabilityFacts } from "./predicates.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

const facts = (defaultToken: boolean): CapabilityFacts => ({
  x402TokenRegistered: () => defaultToken,
});

const tron = (extra: Partial<NetworkDescriptor> = {}): NetworkDescriptor =>
  ({
    id: "tron:1",
    family: "tron",
    chainId: "1",
    nativeSymbol: "TRX",
    capabilities: [],
    ...extra,
  }) as NetworkDescriptor;

const evm = (id: string): NetworkDescriptor => ({
  id,
  family: "evm",
  chainId: id.split(":")[1]!,
  nativeSymbol: "ETH",
  capabilities: [],
});

describe("capabilitySupport", () => {
  it("enables service capabilities only on a TRON network with that service configured", () => {
    expect(capabilitySupport("gasfree.info", tron(), facts(true))).toBe("unsupported");
    expect(
      capabilitySupport(
        "gasfree.info",
        tron({
          gasfree: { baseUrl: "", apiPrefix: "", controllerChainId: "1", verifyingContract: "" },
        } as never),
        facts(true),
      ),
    ).toBe("supported");
    expect(capabilitySupport("sunswap.market", evm("eip155:1"), facts(true))).toBe("unsupported");
  });

  it("allows a swap through either the curve or the router", () => {
    expect(
      capabilitySupport("sunswap.swap", tron({ sunpump: { curve: true } } as never), facts(true)),
    ).toBe("supported");
    expect(
      capabilitySupport(
        "sunswap.swap",
        tron({ sunswap: { routerApiBaseUrl: "https://r" } } as never),
        facts(true),
      ),
    ).toBe("supported");
    expect(capabilitySupport("sunswap.swap", tron(), facts(true))).toBe("unsupported");
  });

  it("enables ERC-8004 only where an Identity Registry is deployed", () => {
    expect(capabilitySupport("erc8004.identity.read", evm("eip155:97"), facts(true))).toBe(
      "supported",
    );
    expect(capabilitySupport("erc8004.identity.write", evm("eip155:1"), facts(true))).toBe(
      "unsupported",
    );
  });

  it("marks x402 serve as needing inputs where no default token is registered", () => {
    expect(capabilitySupport("x402.serve", evm("eip155:1"), facts(false))).toBe("needs-inputs");
    expect(capabilitySupport("x402.serve", evm("eip155:56"), facts(true))).toBe("supported");
  });

  it("leaves a family-wide capability to the command's bindings", () => {
    expect(capabilitySupport("tx.send", evm("eip155:1"), facts(false))).toBe("supported");
  });
});
