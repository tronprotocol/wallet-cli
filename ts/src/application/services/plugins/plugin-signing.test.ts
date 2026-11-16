import { describe, expect, it, vi } from "vitest";
import { PluginSigning } from "./plugin-signing.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

const NETWORK = { id: "tron:1", family: "tron", chainId: "1" } as NetworkDescriptor;
const scope = { activeAccount: "wlt_a" } as TransactionScope;

describe("PluginSigning", () => {
  it("resolves the signer of the active account and signs as a service payload", async () => {
    const signer = { address: "TOWNER" };
    const signers = { assertCanSign: vi.fn(), resolve: vi.fn(() => signer) };
    const signing = { sign: vi.fn(async () => ({ signature: "0x1" })) };
    const plugin = new PluginSigning(signers as never, signing as never);
    const payload = { kind: "typed-data" as const, typedData: {} as never };

    await plugin.sign(scope, { network: NETWORK, family: "tron", payload });

    expect(signers.resolve).toHaveBeenCalledWith("wlt_a", "tron");
    expect(signing.sign).toHaveBeenCalledWith(scope, {
      network: NETWORK,
      origin: "service",
      signer,
      payload,
    });
    expect(plugin.signerAddress("wlt_a", "tron")).toBe("TOWNER");
    plugin.assertCanSign("wlt_a", "tron");
    expect(signers.assertCanSign).toHaveBeenCalledWith("wlt_a", "tron");
  });
});
