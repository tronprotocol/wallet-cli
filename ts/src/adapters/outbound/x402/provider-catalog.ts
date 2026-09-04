import { mkdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type {
  ProviderCatalogPort,
  ProviderListInput,
} from "../../../application/ports/provider-catalog.js";
import { TransportError, UsageError } from "../../../domain/errors/index.js";

const CATALOG_URL = "https://x402-catalog.bankofai.io/api/catalog.json";

export class X402ProviderCatalog implements ProviderCatalogPort {
  constructor(
    private readonly fetcher: typeof fetch = globalThis.fetch,
    private readonly cacheFile = join(homedir(), ".cache", "wallet-cli", "x402", "catalog.json"),
  ) {}

  async list(input: ProviderListInput) {
    const payload = await this.catalog();
    let providers = arrayOfObjects(payload.providers).map(normalizeObject);
    validateFilter(providers, "type", input.type, "type is not exposed by the catalog yet");
    validateFilter(providers, "category", input.category);
    validateArrayFilter(providers, "featuredTags", input.capability);
    const wantedNetwork = input.network ? normalizeNetworkAlias(input.network) : undefined;
    validateArrayFilter(providers, "chains", wantedNetwork);
    providers = providers.filter(
      (provider) =>
        matches(provider, "type", input.type) &&
        matches(provider, "category", input.category) &&
        includes(provider, "featuredTags", input.capability) &&
        includes(provider, "chains", wantedNetwork) &&
        (input.includeBlocked === true || provider.blocked !== true),
    );
    const total = providers.length;
    return {
      catalog: CATALOG_URL,
      generatedAt: payload.generated_at,
      count: Math.min(input.limit, Math.max(0, total - input.offset)),
      filters: Object.fromEntries(
        Object.entries({
          type: input.type,
          category: input.category,
          capability: input.capability,
          network: wantedNetwork,
        }).filter((entry) => entry[1] !== undefined),
      ),
      results: providers.slice(input.offset, input.offset + input.limit),
      pagination: { offset: input.offset, limit: input.limit, total },
    };
  }

  async show(fqn: string) {
    safeFqn(fqn);
    return normalizeObject(await this.readJson(detailUrl("providers", fqn)));
  }

  async endpoints(fqn: string) {
    const provider = await this.show(fqn);
    return { fqn, endpoints: Array.isArray(provider.endpoints) ? provider.endpoints : [] };
  }

  async update() {
    const payload = await this.readJson(CATALOG_URL);
    const body = `${JSON.stringify(payload, null, 2)}\n`;
    const temporary = `${this.cacheFile}.${process.pid}.tmp`;
    await mkdir(dirname(this.cacheFile), { recursive: true, mode: 0o700 });
    await writeFile(temporary, body, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.cacheFile);
    return {
      updated: true,
      cache: this.cacheFile,
      providers: arrayOfObjects(payload.providers).length,
    };
  }

  private catalog() {
    return this.readJson(CATALOG_URL);
  }

  private async readJson(url: string): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.fetcher(url, { headers: { accept: "application/json" } });
    } catch {
      throw new TransportError("provider_error", "x402 catalog request failed");
    }
    if (!response.ok) {
      throw new TransportError("provider_error", `x402 catalog returned HTTP ${response.status}`);
    }
    try {
      const value: unknown = await response.json();
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
      return value as Record<string, unknown>;
    } catch {
      throw new TransportError("invalid_x402_response", "x402 catalog returned invalid JSON");
    }
  }
}

function safeFqn(fqn: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/.test(fqn) || fqn.includes("..")) {
    throw new UsageError("invalid_value", "provider must be a safe FQN");
  }
}

function detailUrl(section: "providers" | "pay", fqn: string): string {
  const filename = `${fqn.replace(/\//g, "__")}.json`;
  return new URL(`${section}/${filename}`, CATALOG_URL).toString();
}

function arrayOfObjects(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function normalizeObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [camel(key), normalize(item)]),
  );
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") return normalizeObject(value as Record<string, unknown>);
  if (typeof value === "string") return normalizeNetwork(value);
  return value;
}

function camel(value: string): string {
  return value.replace(/_([a-z])/g, (_all, letter: string) => letter.toUpperCase());
}

function normalizeNetwork(value: string): string {
  const match = /^tron:0x([0-9a-f]+)$/i.exec(value);
  return match ? `tron:${Number.parseInt(match[1]!, 16)}` : value;
}

function matches(provider: Record<string, unknown>, field: string, expected?: string): boolean {
  return (
    expected === undefined || String(provider[field] ?? "").toLowerCase() === expected.toLowerCase()
  );
}

function includes(provider: Record<string, unknown>, field: string, expected?: string): boolean {
  if (expected === undefined) return true;
  const values = provider[field];
  return (
    Array.isArray(values) &&
    values.some((value) => String(value).toLowerCase() === expected.toLowerCase())
  );
}

function validateFilter(
  providers: Record<string, unknown>[],
  field: string,
  expected?: string,
  unavailable?: string,
): void {
  if (expected === undefined) return;
  const matches = [
    ...new Set(
      providers
        .map((provider) => provider[field])
        .filter((value): value is string => typeof value === "string"),
    ),
  ].sort();
  if (!matches.some((value) => value.toLowerCase() === expected.toLowerCase())) {
    throw new UsageError("invalid_value", unavailable ?? `unknown provider ${field}: ${expected}`, {
      matches,
    });
  }
}

function validateArrayFilter(
  providers: Record<string, unknown>[],
  field: string,
  expected?: string,
): void {
  if (expected === undefined) return;
  const matches = [
    ...new Set(
      providers.flatMap((provider) =>
        Array.isArray(provider[field]) ? provider[field].map(String) : [],
      ),
    ),
  ].sort();
  if (!matches.some((value) => value.toLowerCase() === expected.toLowerCase())) {
    throw new UsageError("invalid_value", `unknown provider ${field}: ${expected}`, { matches });
  }
}

function normalizeNetworkAlias(value: string): string {
  const aliases: Record<string, string> = {
    tron: "tron:728126428",
    nile: "tron:3448148188",
    shasta: "tron:2494104990",
    bsc: "eip155:56",
    "bsc-testnet": "eip155:97",
  };
  return aliases[value.toLowerCase()] ?? normalizeNetwork(value);
}
