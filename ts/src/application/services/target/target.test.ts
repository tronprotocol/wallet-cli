import { describe, expect, it } from "vitest";
import type { ChainFamily, NetworkDescriptor } from "../../../domain/types/index.js";
import type { ExecutionPolicy } from "../../contracts/index.js";
import { TargetResolver } from "./index.js";

const networks: Record<string, NetworkDescriptor> = {
  "tron:mainnet": {
    id: "tron:mainnet",
    family: "tron",
    nativeSymbol: "TRX",
    chainId: "mainnet",
    capabilities: [],
  },
  // synthetic non-tron network: exercises the cross-family rejection branches even though
  // only the tron family ships today (cast through unknown since ChainFamily is tron-only).
  "evm:1": {
    id: "evm:1",
    family: "evm",
    nativeSymbol: "ETH",
    chainId: "1",
    capabilities: [],
  } as unknown as NetworkDescriptor,
};

function policy(
  family: ChainFamily,
  wallet: ExecutionPolicy["wallet"] = "optional",
): ExecutionPolicy {
  return {
    family,
    network: "optional",
    wallet,
  };
}

function resolver(
  defaultNetwork = "tron:mainnet",
  activeSource?: { type: "watch" | "ledger"; family: ChainFamily },
) {
  const networkRegistry = {
    resolve(id: string | undefined) {
      const found = Object.values(networks).find((n) => n.id === id);
      if (!found) throw new Error(`unknown network ${id}`);
      return found;
    },
    resolveDefault() {
      return this.resolve(defaultNetwork);
    },
    all() {
      return Object.values(networks);
    },
    aliasOf: () => undefined,
  };
  return new TargetResolver({
    networkRegistry,
    keystore: {
      activeAccount: () => (activeSource ? "wlt_single" : null),
      resolveAccount: () => ({ wallet: { source: activeSource } }),
    } as any,
  });
}

describe("TargetResolver", () => {
  it("uses the single default network when --network is omitted", () => {
    const target = resolver("tron:mainnet").resolve(policy("tron"), {});
    expect(target.network?.id).toBe("tron:mainnet");
  });

  it("uses explicit --network as the target", () => {
    const target = resolver("tron:mainnet").resolve(policy("evm" as any), { network: "evm:1" });
    expect(target.network?.id).toBe("evm:1");
  });

  it("detects a direct on-chain address without resolving it from the keystore", () => {
    const target = resolver("tron:mainnet").resolve(policy("tron"), {
      account: "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7",
    });
    expect(target.network?.id).toBe("tron:mainnet");
  });

  it("rejects a command implementation that does not support the selected network family", () => {
    expect(() => resolver("tron:mainnet").resolve(policy("evm" as any), {})).toThrow(
      /evm-only.*tron:mainnet/,
    );
  });

  // Previously "rejects a single-family account on a mismatched default network". That check
  // prevented nothing — without it, any command that actually needs the address fails at
  // resolveAddress, still before any RPC — and it fired at the wrong moment: on RESOLVING a
  // network rather than on DEMANDING an address. `current` resolves a network (to pick which
  // family's QR to draw) but never demands one family's address, so it was refused for a
  // condition that did not apply to it. The guard now lives where the address is demanded.
  it("does not judge the account against the network — that belongs where an address is demanded", () => {
    const r = resolver("tron:mainnet", { type: "watch", family: "evm" as any });
    expect(r.resolve(policy("tron"), {}).network?.id).toBe("tron:mainnet");
  });
});
