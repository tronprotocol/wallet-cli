import {
  CommandDeadline,
  requestDispatchCheck,
} from "../../../application/services/command-deadline.js";
import { describe, expect, it, vi } from "vitest";
import { X402ProviderCatalog as Catalog } from "./provider-catalog.js";

// Never read the developer's persistent provider snapshot.
class X402ProviderCatalog extends Catalog {
  constructor(fetcher: typeof fetch, cache = "/nonexistent-wallet-r5/catalog.json") {
    super(fetcher, cache);
  }
}
describe("X402ProviderCatalog", () => {
  it("accepts the Base canonical ID when filtering the online catalog's canonical chain ids", async () => {
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
    await expect(
      catalog.list({ limit: 20, offset: 0, network: "eip155:8453" }, NO_CHECK),
    ).resolves.toMatchObject({
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
    const result = await catalog.list(
      { limit: 20, offset: 0, network: "tron:728126428" },
      NO_CHECK,
    );
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      fqn: "bai/recharge",
      chains: ["tron:728126428"],
    });
  });

  it("rejects unsafe provider names before constructing a detail URL", async () => {
    const catalog = new X402ProviderCatalog(vi.fn() as never);
    await expect(catalog.show("../secret", NO_CHECK)).rejects.toMatchObject({
      code: "invalid_value",
    });
  });
});

it("aborts provider requests when the command deadline expires", async () => {
  const fetcher = vi.fn(
    (_request, init) =>
      new Promise<Response>((_resolve, reject) =>
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true }),
      ),
  );
  const catalog = new X402ProviderCatalog(
    fetcher as typeof fetch,
    "/nonexistent-wallet-r4-test/catalog.json",
  );
  await expect(
    catalog.list({ limit: 1, offset: 0 }, requestDispatchCheck(new CommandDeadline(10))),
  ).rejects.toMatchObject({ code: "timeout" });
});

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const NO_DEADLINE = new CommandDeadline(0);
const NO_CHECK = requestDispatchCheck(new CommandDeadline(0));

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
    expect(await catalog.update(NO_CHECK)).toMatchObject({
      providers: 1,
      generatedAt: "2026-09-14T00:00:00Z",
      warnings: ["fixture"],
    });
    const original = await readFile(file, "utf8");
    mode = "invalid";
    await expect(catalog.update(NO_CHECK)).rejects.toMatchObject({
      code: "catalog_schema_unsupported",
    });
    expect(await readFile(file, "utf8")).toBe(original);
    mode = "offline";
    fetcher.mockClear();
    expect(await catalog.list({ limit: 20, offset: 0 }, NO_CHECK)).toMatchObject({ count: 1 });
    expect(await catalog.show("demo/base", NO_CHECK)).toMatchObject({
      endpoints: [{ path: "/pay" }],
    });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(catalog.show("demo/missing", NO_CHECK)).rejects.toMatchObject({
      code: "provider_error",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it.each([undefined, 0, 2, "1"])(
  "rejects catalog version %s before using providers",
  async (version) => {
    const catalog = new X402ProviderCatalog(async () => Response.json({ version, providers: [] }));
    await expect(catalog.list({ limit: 1, offset: 0 }, NO_CHECK)).rejects.toMatchObject({
      code: "catalog_schema_unsupported",
    });
  },
);
it("classifies missing providers and filesystem failures without leaking paths", async () => {
  const missing = new X402ProviderCatalog(async () => new Response(null, { status: 404 }));
  await expect(missing.show("demo/missing", NO_CHECK)).rejects.toMatchObject({
    code: "provider_not_found",
  });
  const root = await mkdtemp(join(tmpdir(), "catalog-errors-"));
  try {
    await writeFile(join(root, "not-directory"), "x");
    const catalog = new X402ProviderCatalog(
      async () => Response.json({ version: 1, providers: [] }),
      join(root, "not-directory", "catalog.json"),
    );
    await expect(catalog.update(NO_CHECK)).rejects.toMatchObject({
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
  const result = await catalog.list({ limit: 20, offset: 0 }, NO_CHECK);
  expect(result.results[0]).toEqual({
    fqn: "demo/provider",
    endpointCount: 1,
    extraMetadata: { billingMode: "usage" },
  });
});

it("returns an empty page for a valid chain absent from the provider catalog", async () => {
  const catalog = new X402ProviderCatalog(async () =>
    Response.json({ version: 1, providers: [{ fqn: "demo", chains: ["tron:728126428"] }] }),
  );
  await expect(
    catalog.list({ limit: 20, offset: 0, network: "tron:3448148188" }, NO_CHECK),
  ).resolves.toMatchObject({
    count: 0,
    results: [],
    pagination: { total: 0 },
  });
  await expect(
    catalog.list({ limit: 20, offset: 0, network: "typo" }, NO_CHECK),
  ).rejects.toMatchObject({
    code: "invalid_value",
  });
});

describe("provider network resolution", () => {
  it("accepts every global alias, including configured aliases, without changing unfiltered lists", async () => {
    const { ConfigLoader, NetworkRegistry } = await import("../config/index.js");
    const { X402Service } = await import("../../../application/use-cases/x402-service.js");
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = mkdtempSync(join(tmpdir(), "provider-alias-"));
    try {
      const config = ConfigLoader.load({ WALLET_CLI_HOME: root });
      config.aliases["my-testnet"] = "eip155:11155111";
      const registry = new NetworkRegistry(config);
      const providers = registry
        .all()
        .map(({ id }) => ({ fqn: `demo/${id.replace(":", "-")}`, chains: [id] }));
      const catalog = new X402ProviderCatalog(async () => Response.json({ version: 1, providers }));
      const service = new X402Service({} as never, {} as never, catalog, registry);
      for (const alias of Object.keys(config.aliases)) {
        const id = registry.resolve(alias).id;
        for (const input of [alias, alias.toUpperCase()]) {
          await expect(
            service.providerList(NO_DEADLINE, { limit: 100, offset: 0, network: input }),
          ).resolves.toMatchObject({
            count: 1,
            filters: { network: id },
            results: [{ chains: [id] }],
          });
        }
      }
      await expect(
        service.providerList(NO_DEADLINE, { limit: 100, offset: 0 }),
      ).resolves.toMatchObject({
        count: providers.length,
        filters: {},
      });
      await expect(
        service.providerList(NO_DEADLINE, { limit: 100, offset: 0, network: "eip155:999999" }),
      ).resolves.toMatchObject({ count: 0, results: [] });
      await expect(
        service.providerList(NO_DEADLINE, { limit: 100, offset: 0, network: "tron:0xcd8690dc" }),
      ).resolves.toMatchObject({ count: 1, filters: { network: "tron:3448148188" } });
      expect(() =>
        service.providerList(NO_DEADLINE, { limit: 100, offset: 0, network: "typo" }),
      ).toThrow("unknown network: typo");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

it("reports a catalog 429 with the rate-limit keys and refuses redirects", async () => {
  const fetcher = vi.fn(
    async (_request: Parameters<typeof fetch>[0], _init?: RequestInit) =>
      new Response("{}", { status: 429, headers: { "retry-after": "12" } }),
  );
  await expect(new X402ProviderCatalog(fetcher).show("fixture", NO_CHECK)).rejects.toMatchObject({
    code: "provider_rate_limited",
    details: { httpStatus: 429, retryAfterSeconds: 12 },
  });
  expect(fetcher.mock.calls[0]![1]).toMatchObject({ redirect: "error" });
});

it.each([
  ["a non-object body", () => Response.json([1])],
  ["a body that is not JSON", () => new Response("{")],
])("refuses %s as invalid catalog JSON", async (_name, response) => {
  await expect(
    new X402ProviderCatalog(async () => response()).show("fixture", NO_CHECK),
  ).rejects.toMatchObject({ code: "invalid_x402_response" });
});

it("keeps a generic status as provider_error", async () => {
  await expect(
    new X402ProviderCatalog(async () => new Response(null, { status: 503 })).update(NO_CHECK),
  ).rejects.toMatchObject({ code: "provider_error", message: "x402 catalog returned HTTP 503" });
});
