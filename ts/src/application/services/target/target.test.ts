import { describe, expect, it } from "vitest";
import type { ChainFamily, NetworkDescriptor } from "../../../domain/types/index.js";
import type { ExecutionPolicy } from "../../contracts/index.js";
import { TargetResolver } from "./index.js";

const networks: Record<string, NetworkDescriptor> = {
  "tron:728126428": {
    id: "tron:728126428",
    family: "tron",
    nativeSymbol: "TRX",
    chainId: "mainnet",
    capabilities: [],
  },
  "eip155:1": {
    id: "eip155:1",
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
  defaultNetwork = "tron:728126428",
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
    const target = resolver("tron:728126428").resolve(policy("tron"), {});
    expect(target.network?.id).toBe("tron:728126428");
  });

  it("uses explicit --network as the target", () => {
    const target = resolver("tron:728126428").resolve(policy("evm" as any), {
      network: "eip155:1",
    });
    expect(target.network?.id).toBe("eip155:1");
  });

  it("detects a direct on-chain address without resolving it from the keystore", () => {
    const target = resolver("tron:728126428").resolve(policy("tron"), {
      account: "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7",
    });
    expect(target.network?.id).toBe("tron:728126428");
  });

  it("rejects a command implementation that does not support the selected network family", () => {
    expect(() => resolver("tron:728126428").resolve(policy("evm" as any), {})).toThrow(
      /evm-only.*tron:728126428/,
    );
  });

  it("does not judge the account against the network — that belongs where an address is demanded", () => {
    const r = resolver("tron:728126428", { type: "watch", family: "evm" as any });
    expect(r.resolve(policy("tron"), {}).network?.id).toBe("tron:728126428");
  });
});
