import { describe, expect, it } from "vitest";
import type { ChainFamily, NetworkDescriptor } from "../../../domain/types/index.js";
import type { ExecutionPolicy } from "../../contracts/index.js";
import { TargetResolver } from "./index.js";

const networks: Record<string, NetworkDescriptor> = {
  "tron:mainnet": { id: "tron:mainnet", family: "tron", chainId: "mainnet", aliases: ["tron"], capabilities: [] },
  // synthetic non-tron network: exercises the cross-family rejection branches even though
  // only the tron family ships today (cast through unknown since ChainFamily is tron-only).
  "evm:1": ({ id: "evm:1", family: "evm", chainId: "1", aliases: ["eth"], capabilities: [] } as unknown as NetworkDescriptor),
};

function policy(family: ChainFamily, wallet: ExecutionPolicy["wallet"] = "optional"): ExecutionPolicy {
  return {
    family,
    network: "optional",
    wallet,
  };
}

function resolver(defaultNetwork = "tron", activeSource?: { type: "watch" | "ledger"; family: ChainFamily }) {
  const networkRegistry = {
    resolve(idOrAlias: string | undefined) {
      const found = Object.values(networks).find((n) => n.id === idOrAlias || n.aliases.includes(idOrAlias ?? ""));
      if (!found) throw new Error(`unknown network ${idOrAlias}`);
      return found;
    },
    resolveDefault() {
      return this.resolve(defaultNetwork);
    },
    all() {
      return Object.values(networks);
    },
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
    const target = resolver("tron").resolve(policy("tron"), {});
    expect(target.network?.id).toBe("tron:mainnet");
  });

  it("uses explicit --network as the target", () => {
    const target = resolver("tron").resolve(policy("evm" as any), { network: "eth" });
    expect(target.network?.id).toBe("evm:1");
  });

  it("rejects a command implementation that does not support the selected network family", () => {
    expect(() =>
      resolver("tron").resolve(policy("evm" as any), {}),
    ).toThrow(/evm-only.*tron:mainnet/);
  });

  it("rejects a single-family account on a mismatched default network", () => {
    const r = resolver("tron", { type: "watch", family: "evm" as any });
    expect(() => r.resolve(policy("tron"), {})).toThrow(
      /selected account is evm-only/,
    );
  });
});
