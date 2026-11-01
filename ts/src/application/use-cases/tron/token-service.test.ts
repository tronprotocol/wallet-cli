import { describe, expect, it, vi } from "vitest";
import { TronTokenService } from "./token-service.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { AccountScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronTokenInfo } from "../../ports/chain/tron/tron-gateway.js";
import type { TokenRepository } from "../../ports/token-repository.js";
import { CommandDeadline } from "../../services/command-deadline.js";

const net = { id: "tron:3448148188", family: "tron", nativeSymbol: "TRX" } as NetworkDescriptor;
const OWNER = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const scope = {
  deadline: new CommandDeadline(0),
  activeAccount: "wlt_test.0",
  resolveAddress: () => OWNER,
} as AccountScope;

function service(info: TronTokenInfo) {
  const gateway = {
    getTrc20Balance: async () => "100",
    getTrc10Balance: async () => "100",
    getTokenInfo: async () => info,
    getTrc10Info: async () => info,
  };
  const tokens = { add: vi.fn(() => "added") };
  const svc = new TronTokenService(
    { get: () => gateway } as unknown as ChainGatewayProvider,
    tokens as unknown as TokenRepository,
  );
  return { svc, tokens };
}

// The adapter decodes token text; a symbol that reads as hex is the token's real symbol.
describe("TronTokenService keeps decoded token text as the adapter returns it", () => {
  it("TRC20 balance shows a printable-hex symbol unchanged", async () => {
    const { svc } = service({ symbol: "6162", name: "6162", decimals: 6 });

    await expect(svc.balance(scope, net, { contract: CONTRACT })).resolves.toMatchObject({
      symbol: "6162",
      decimals: 6,
    });
  });

  it("TRC10 balance shows a printable-hex abbreviation unchanged", async () => {
    const { svc } = service({ abbr: "4142", name: "4142", precision: 2 });

    await expect(svc.balance(scope, net, { assetId: "1000001" })).resolves.toMatchObject({
      symbol: "4142",
      decimals: 2,
    });
  });

  it("TRC10 token-book entry stores a printable-hex abbreviation and name unchanged", async () => {
    const { svc, tokens } = service({ abbr: "4142", name: "4142", precision: 2 });

    await svc.add(scope, net, { assetId: "1000001" });

    expect(tokens.add).toHaveBeenCalledWith(net.id, "wlt_test.0", {
      kind: "trc10",
      id: "1000001",
      symbol: "4142",
      decimals: 2,
      name: "4142",
    });
  });

  it("TRC10 token-book entry falls back to the name when the abbreviation is empty", async () => {
    const { svc, tokens } = service({ abbr: "", name: "Token", precision: 0 });

    await svc.add(scope, net, { assetId: "1000001" });

    expect(tokens.add).toHaveBeenCalledWith(
      net.id,
      "wlt_test.0",
      expect.objectContaining({ symbol: "Token", name: "Token" }),
    );
  });
});
