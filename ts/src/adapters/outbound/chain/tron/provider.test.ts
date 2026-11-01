import { describe, it, expect, vi } from "vitest";
import {
  CommandDeadline,
  requestDispatchCheck,
} from "../../../../application/services/command-deadline.js";
import { ChainGatewayRegistry } from "./provider.js";
import { TronRpcClient } from "./tron.js";
import { activeDispatch } from "../../http/dispatch-context.js";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import type { AnyChainGateway } from "../../../../application/ports/chain/gateway-provider.js";

const NO_CHECK = requestDispatchCheck(new CommandDeadline(0));

const net = (family: "tron"): NetworkDescriptor =>
  ({
    id: `${family}-net`,
    family,
    httpEndpoint: "http://x",
    aliases: [],
    chainId: "1",
    capabilities: [],
  }) as any;

describe("ChainGatewayRegistry injected factories", () => {
  it("dispatches the tron factory and builds one client per net id", () => {
    const tron = vi.fn((n: NetworkDescriptor) => new TronRpcClient(n.httpEndpoint ?? ""));
    const p = new ChainGatewayRegistry({
      tron,
      evm: () => {
        throw new Error("evm gateway not wired");
      },
    });
    expect(p.get(net("tron"), "tron", NO_CHECK)).toBeInstanceOf(TronRpcClient);
    p.client(net("tron"), NO_CHECK);
    expect(tron).toHaveBeenCalledOnce();
  });

  it("runs each view's calls under the check it was obtained with", async () => {
    const seen: unknown[] = [];
    const shared = {
      getNowBlock: async () => {
        await Promise.resolve();
        seen.push(activeDispatch()?.check);
        return {};
      },
    } as unknown as AnyChainGateway;
    const p = new ChainGatewayRegistry({ tron: () => shared, evm: () => shared });
    const first = requestDispatchCheck(new CommandDeadline(0));
    const second = requestDispatchCheck(new CommandDeadline(0));
    await Promise.all([
      (p.get(net("tron"), "tron", first) as any).getNowBlock(),
      (p.get(net("tron"), "tron", second) as any).getNowBlock(),
    ]);
    expect(seen).toEqual([first, second]);
  });
});
