import { describe, expect, it } from "vitest";
import { capabilitySupport } from "./predicates.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

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
    expect(capabilitySupport("tx.multisig.tronlink", evm("eip155:1"))).toBe("unsupported");
    expect(capabilitySupport("tx.multisig.tronlink", tron())).toBe("unsupported");
    expect(
      capabilitySupport(
        "tx.multisig.tronlink",
        tron({ tronlinkHttpEndpoint: "https://t" } as never),
      ),
    ).toBe("supported");
  });

  it("asks a registered predicate for a capability the core does not define", () => {
    const registered = new Map([["demo.read", () => "needs-inputs" as const]]);
    expect(capabilitySupport("demo.read", evm("eip155:1"), registered)).toBe("needs-inputs");
    expect(
      capabilitySupport(
        "tx.multisig.tronlink",
        tron({ tronlinkHttpEndpoint: "https://t" } as never),
        new Map([["tx.multisig.tronlink", () => "unsupported" as const]]),
      ),
    ).toBe("supported");
  });

  it("leaves a family-wide capability to the command's bindings", () => {
    expect(capabilitySupport("tx.send", evm("eip155:1"))).toBe("supported");
  });
});
