import { expect, it, vi } from "vitest";
import { facilitatorNetwork } from "./facilitator-network.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
const network = {
  id: "tron:3448148188",
  family: "tron",
  chainId: "3448148188",
} as NetworkDescriptor;
it("selects by version, scheme and chain, not another advertised capability", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({
      kinds: [
        { x402Version: 1, scheme: "exact", network: network.id },
        { x402Version: 2, scheme: "exact", network: "tron:728126428" },
        { x402Version: 2, scheme: "exact_gasfree", network: network.id },
        { x402Version: 2, scheme: "exact", network: "tron:0xcd8690dc" },
      ],
    }),
  );
  expect(
    await facilitatorNetwork(network, "exact", "https://facilitator.example", fetcher, 1000),
  ).toBe("tron:0xcd8690dc");
  expect(
    await facilitatorNetwork(
      network,
      "exact_gasfree",
      "https://facilitator.example",
      fetcher,
      1000,
    ),
  ).toBe(network.id);
  expect(fetcher.mock.calls).toHaveLength(2);
});
it.each([
  [() => Response.json({ kinds: [] }), "unsupported_network_capability"],
  [() => Response.json({}), "invalid_x402_response"],
  [() => new Response("invalid"), "invalid_x402_response"],
  [() => new Response(null, { status: 404 }), "provider_error"],
  [() => new Response(null, { status: 500 }), "provider_error"],
  [() => new Response(null, { status: 429 }), "provider_rate_limited"],
] as const)("does not guess or retry on an unusable supported response", async (reply, code) => {
  const fetcher = vi.fn(async () => reply());
  await expect(
    facilitatorNetwork(network, "exact", "https://facilitator.example", fetcher, 1000),
  ).rejects.toMatchObject({ code });
  expect(fetcher).toHaveBeenCalledOnce();
});
it("leaves EVM representation unchanged without a negotiation request", async () => {
  const fetcher = vi.fn();
  expect(
    await facilitatorNetwork(
      { id: "eip155:8453", family: "evm" } as NetworkDescriptor,
      "exact",
      "https://facilitator.example",
      fetcher,
      1000,
    ),
  ).toBe("eip155:8453");
  expect(fetcher).not.toHaveBeenCalled();
});
