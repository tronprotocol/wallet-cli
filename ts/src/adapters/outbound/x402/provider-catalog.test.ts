import { describe, expect, it, vi } from "vitest";
import { X402ProviderCatalog } from "./provider-catalog.js";

describe("X402ProviderCatalog", () => {
  it("lists, filters and normalizes TRON network ids", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            providers: [
              {
                fqn: "bai/recharge",
                type: "service",
                chains: ["tron:0x2b6653dc"],
                featured_tags: ["recharge"],
              },
              { fqn: "demo/other", type: "service", chains: ["eip155:56"], featured_tags: [] },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    const catalog = new X402ProviderCatalog(fetcher as typeof fetch);
    const result = await catalog.list({ limit: 20, offset: 0, network: "tron:728126428" });
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      fqn: "bai/recharge",
      chains: ["tron:728126428"],
    });
  });

  it("rejects unsafe provider names before constructing a detail URL", async () => {
    const catalog = new X402ProviderCatalog(vi.fn() as never);
    await expect(catalog.show("../secret")).rejects.toMatchObject({ code: "invalid_value" });
  });
});
