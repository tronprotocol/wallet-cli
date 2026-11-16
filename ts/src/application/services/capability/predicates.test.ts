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
    expect(capabilitySupport("tx.multisig.tronlink", evm("eip155:1"), facts(true))).toBe(
      "unsupported",
    );
    expect(capabilitySupport("tx.multisig.tronlink", tron(), facts(true))).toBe("unsupported");
    expect(
      capabilitySupport(
        "tx.multisig.tronlink",
        tron({ tronlinkHttpEndpoint: "https://t" } as never),
        facts(true),
      ),
    ).toBe("supported");
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

  it("asks a registered predicate for a capability the core does not define", () => {
    const registered = new Map([["demo.read", () => "needs-inputs" as const]]);
    expect(capabilitySupport("demo.read", evm("eip155:1"), facts(true), registered)).toBe(
      "needs-inputs",
    );
    expect(
      capabilitySupport(
        "x402.serve",
        evm("eip155:56"),
        facts(true),
        new Map([["x402.serve", () => "unsupported" as const]]),
      ),
    ).toBe("supported");
  });

  it("leaves a family-wide capability to the command's bindings", () => {
    expect(capabilitySupport("tx.send", evm("eip155:1"), facts(false))).toBe("supported");
  });
});
