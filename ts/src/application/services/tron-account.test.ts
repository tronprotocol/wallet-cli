import { describe, expect, it, vi } from "vitest";
import type { ChainGatewayProvider } from "../ports/chain/gateway-provider.js";
import type { NetworkDescriptor } from "../../domain/types/index.js";
import { activeTronAccount } from "./tron-account.js";

const OWNER = "TDbWLnRxt8f7e81BBccGEKoSoDGR4pmnuJ";
const NETWORK = { id: "tron:728126428", family: "tron" } as unknown as NetworkDescriptor;

function gatewaysAnswering(account: Record<string, unknown>): ChainGatewayProvider {
  return {
    get: () => ({ getAccount: vi.fn(async () => account) }),
  } as unknown as ChainGatewayProvider;
}

describe("activeTronAccount", () => {
  it("returns the record of an activated account, balance included", async () => {
    const account = await activeTronAccount(
      gatewaysAnswering({ address: "41abc", balance: "5" }),
      NETWORK,
      OWNER,
    );
    expect(account.balance).toBe("5");
  });

  // A node answers an address it has never seen with an empty object, not an error.
  it("refuses an address the chain has no record of as account_not_active", async () => {
    await expect(activeTronAccount(gatewaysAnswering({}), NETWORK, OWNER)).rejects.toMatchObject({
      code: "account_not_active",
      message: expect.stringContaining(`${OWNER} is not activated on tron:728126428`),
    });
  });
});
