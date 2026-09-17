import { describe, expect, it, vi } from "vitest";
import { X402ProviderCatalog as Catalog } from "./provider-catalog.js";

// Never read the developer's persistent provider snapshot.
class X402ProviderCatalog extends Catalog {
  constructor(
    fetcher: typeof fetch,
    cache = "/nonexistent-wallet-r5/catalog.json",
    timeout?: number,
  ) {
    super(fetcher, cache, timeout);
  }
}
describe("X402ProviderCatalog", () => {
  it("accepts the Base alias when filtering the online catalog's canonical chain ids", async () => {
    const catalog = new X402ProviderCatalog(
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              version: 1,
              providers: [{ fqn: "demo/base", chains: ["eip155:8453"] }],
            }),
          ),
      ),
    );
    await expect(catalog.list({ limit: 20, offset: 0, network: "base" })).resolves.toMatchObject({
      count: 1,
      filters: { network: "eip155:8453" },
    });
  });
  it("lists, filters and normalizes TRON network ids", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            version: 1,
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

it("applies the configured timeout to provider requests", async () => {
  const fetcher = vi.fn(
    (_request, init) =>
      new Promise<Response>((_resolve, reject) =>
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true }),
      ),
  );
  const catalog = new X402ProviderCatalog(
    fetcher as typeof fetch,
    "/nonexistent-wallet-r4-test/catalog.json",
    10,
  );
  await expect(catalog.list({ limit: 1, offset: 0 })).rejects.toMatchObject({ code: "timeout" });
});

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

it("refreshes a complete snapshot, preserves it on invalid updates, and serves offline reads", async () => {
  const root = await mkdtemp(join(tmpdir(), "catalog-r4-"));
  const file = join(root, "catalog.json");
  let mode = "online";
  const fetcher = vi.fn(async (url) => {
    if (mode === "offline") throw new TypeError("offline");
    if (mode === "invalid") return Response.json({ version: 2, providers: [] });
    return Response.json(
      String(url).endsWith("catalog.json")
        ? {
            version: 1,
            generated_at: "2026-09-14T00:00:00Z",
            warnings: ["fixture"],
            providers: [{ fqn: "demo/base" }],
          }
        : { fqn: "demo/base", endpoints: [{ path: "/pay" }] },
    );
  });
  try {
    const catalog = new X402ProviderCatalog(fetcher, file);
    expect(await catalog.update()).toMatchObject({
      providers: 1,
      generatedAt: "2026-09-14T00:00:00Z",
      warnings: ["fixture"],
    });
    const original = await readFile(file, "utf8");
    mode = "invalid";
    await expect(catalog.update()).rejects.toMatchObject({ code: "catalog_schema_unsupported" });
    expect(await readFile(file, "utf8")).toBe(original);
    mode = "offline";
    fetcher.mockClear();
    expect(await catalog.list({ limit: 20, offset: 0 })).toMatchObject({ count: 1 });
    expect(await catalog.show("demo/base")).toMatchObject({ endpoints: [{ path: "/pay" }] });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(catalog.show("demo/missing")).rejects.toMatchObject({ code: "provider_error" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it.each([undefined, 0, 2, "1"])(
  "rejects catalog version %s before using providers",
  async (version) => {
    const catalog = new X402ProviderCatalog(async () => Response.json({ version, providers: [] }));
    await expect(catalog.list({ limit: 1, offset: 0 })).rejects.toMatchObject({
      code: "catalog_schema_unsupported",
    });
  },
);
it("classifies missing providers and filesystem failures without leaking paths", async () => {
  const missing = new X402ProviderCatalog(async () => new Response(null, { status: 404 }));
  await expect(missing.show("demo/missing")).rejects.toMatchObject({ code: "provider_not_found" });
  const root = await mkdtemp(join(tmpdir(), "catalog-errors-"));
  try {
    await writeFile(join(root, "not-directory"), "x");
    const catalog = new X402ProviderCatalog(
      async () => Response.json({ version: 1, providers: [] }),
      join(root, "not-directory", "catalog.json"),
    );
    await expect(catalog.update()).rejects.toMatchObject({
      code: "provider_error",
      message: "could not write the x402 provider cache",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("omits search internals and endpoint bodies from lists while preserving extension metadata", async () => {
  const catalog = new X402ProviderCatalog(async () =>
    Response.json({
      version: 1,
      providers: [
        {
          fqn: "demo/provider",
          query: "internal",
          score: 42,
          matched_fields: ["title"],
          endpoints: [{ path: "/pay" }],
          extra_metadata: { billing_mode: "usage" },
        },
      ],
    }),
  );
  const result = await catalog.list({ limit: 20, offset: 0 });
  expect(result.results[0]).toEqual({
    fqn: "demo/provider",
    endpointCount: 1,
    extraMetadata: { billingMode: "usage" },
  });
});
