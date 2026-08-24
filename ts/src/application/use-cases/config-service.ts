import { endpointHost, type Config } from "../../domain/types/index.js";
import type { NetworkRegistry } from "../ports/network-registry.js";
import { UsageError } from "../../domain/errors/index.js";
import type { ConfigDocumentRepository } from "../ports/config-document-repository.js";

export const TRONLINK_CONFIG_KEYS = [
  "tronlinkSecretId",
  "tronlinkSecretKey",
  "tronlinkChannel",
] as const;
export const GASFREE_CONFIG_KEYS = ["gasfreeApiKey", "gasfreeApiSecret"] as const;
export const CONFIG_KEYS = [
  "defaultNetwork",
  "defaultOutput",
  "timeoutMs",
  "waitTimeoutMs",
  "networks",
  "aliases",
  ...TRONLINK_CONFIG_KEYS,
  ...GASFREE_CONFIG_KEYS,
] as const;
export const WRITABLE_CONFIG_KEYS = [
  "defaultNetwork",
  "defaultOutput",
  "timeoutMs",
  "waitTimeoutMs",
  ...TRONLINK_CONFIG_KEYS,
  ...GASFREE_CONFIG_KEYS,
] as const;
export type ConfigKey = (typeof CONFIG_KEYS)[number];
export type WritableConfigKey = (typeof WRITABLE_CONFIG_KEYS)[number];

export interface ConfigCommandInput {
  /** a flat key, or the nested `networks.<id-or-alias>.httpEndpoint` path (§2.4). */
  key?: string;
  value?: string;
}

/** `networks.<id-or-alias>.httpEndpoint` — the only nested key. Parsed, not string-matched, so a
 *  wrong sub-key says which one is supported instead of "read-only". */
const NETWORK_ENDPOINT_KEY = /^networks\.(.+)\.([^.]+)$/;

interface NetworkEndpointKey {
  networkRef: string;
  field: string;
}

function parseNetworkKey(key: string): NetworkEndpointKey | null {
  const match = NETWORK_ENDPOINT_KEY.exec(key);
  return match ? { networkRef: match[1]!, field: match[2]! } : null;
}

export class ConfigService {
  constructor(private readonly documents: ConfigDocumentRepository) {}

  execute(
    input: ConfigCommandInput,
    effective: Config,
    networks: NetworkRegistry,
  ): Record<string, unknown> {
    const view: Record<ConfigKey, unknown> = {
      defaultNetwork: effective.defaultNetwork,
      defaultOutput: effective.defaultOutput,
      timeoutMs: effective.timeoutMs,
      waitTimeoutMs: effective.waitTimeoutMs,
      // canonical id -> endpoint HOST. Ids alone gave no way to confirm a change took effect,
      // and the full URL may carry an API key this listing has no business echoing.
      networks: Object.fromEntries(
        Object.entries(effective.networks).map(([id, n]) => [id, endpointHost(n.httpEndpoint)]),
      ),
      // Read-only, and the book's only visibility surface: there is no `config set aliases.*`,
      // so without this the only way to see what a short name resolves to is to open config.yaml.
      aliases: effective.aliases,
      tronlinkSecretId: effective.tronlinkSecretId,
      tronlinkSecretKey: maskSecret(effective.tronlinkSecretKey),
      tronlinkChannel: effective.tronlinkChannel,
      gasfreeApiKey: effective.gasfreeApiKey,
      gasfreeApiSecret: maskSecret(effective.gasfreeApiSecret),
    };
    if (input.key === undefined) return view;

    const networkKey = parseNetworkKey(input.key);
    if (networkKey) {
      return input.value === undefined
        ? readNetworkField(networkKey, effective, networks)
        : this.setNetworkField(networkKey, input.value, networks);
    }

    if (!CONFIG_KEYS.includes(input.key as ConfigKey)) {
      throw new UsageError("invalid_value", `unknown config key: ${input.key}`);
    }
    if (input.value === undefined) return { key: input.key, value: view[input.key as ConfigKey] };
    if (!WRITABLE_CONFIG_KEYS.includes(input.key as WritableConfigKey)) {
      throw new UsageError("invalid_value", `${input.key} is read-only`);
    }

    const key = input.key as WritableConfigKey;
    const value = this.normalize(key, input.value, networks);
    if (key === "tronlinkSecretKey" || key === "gasfreeApiSecret") {
      return this.documents.update((current) => ({
        document: { ...current, [key]: value },
        result: { key, value: maskSecret(String(value)), input: "********" },
      }));
    }
    return this.documents.update((current) => ({
      document: { ...current, [key]: value },
      result: { key, value, input: input.value! },
    }));
  }

  /** `networks.<id-or-alias>.httpEndpoint` — the key's network ref is normalised to its canonical
   *  id before writing, so config.yaml can never hold the same network under two names (§2.4). */
  private setNetworkField(
    { networkRef, field }: NetworkEndpointKey,
    value: string,
    networks: NetworkRegistry,
  ): Record<string, unknown> {
    assertWritableNetworkField(field);
    const id = networks.resolve(networkRef).id;
    const key = `networks.${id}.httpEndpoint`;
    const endpoint = httpsEndpoint(value, key);
    return this.documents.update((current) => {
      const existing = (current as { networks?: Record<string, Record<string, unknown>> }).networks;
      return {
        document: {
          ...current,
          networks: { ...existing, [id]: { ...existing?.[id], httpEndpoint: endpoint } },
        },
        result: { key, value: endpoint, input: value },
      };
    });
  }

  private normalize(
    key: WritableConfigKey,
    raw: string,
    networks: NetworkRegistry,
  ): string | number {
    if (key === "timeoutMs") {
      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0) {
        throw new UsageError("invalid_value", "timeoutMs must be a positive number");
      }
      return value;
    }
    if (key === "waitTimeoutMs") {
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 0) {
        throw new UsageError("invalid_value", "waitTimeoutMs must be a non-negative integer");
      }
      return value;
    }
    if (key === "defaultOutput") {
      if (raw !== "text" && raw !== "json") {
        throw new UsageError("invalid_value", "defaultOutput must be 'text' or 'json'");
      }
      return raw;
    }
    if (
      (TRONLINK_CONFIG_KEYS as readonly string[]).includes(key) ||
      (GASFREE_CONFIG_KEYS as readonly string[]).includes(key)
    ) {
      if (raw.length === 0 || raw.length > 256 || /[\u0000-\u001f\u007f]/.test(raw)) {
        throw new UsageError(
          "invalid_value",
          `${key} must be 1 to 256 characters without control characters`,
        );
      }
      return raw;
    }
    return networks.resolve(raw).id;
  }
}

function maskSecret(value: string | undefined): string | undefined {
  return value ? "********" : undefined;
}

/** Reading the same key that `config set` writes — addressed by alias or canonical id alike, and
 *  answered with the effective value rather than only what config.yaml happens to hold. */
function readNetworkField(
  { networkRef, field }: NetworkEndpointKey,
  effective: Config,
  networks: NetworkRegistry,
): Record<string, unknown> {
  assertWritableNetworkField(field);
  const id = networks.resolve(networkRef).id;
  return { key: `networks.${id}.httpEndpoint`, value: effective.networks[id]?.httpEndpoint };
}

/** the one writable sub-key; named in the error so a typo says which one is supported. */
function assertWritableNetworkField(field: string): void {
  if (field !== "httpEndpoint") {
    throw new UsageError(
      "invalid_value",
      `only networks.<id>.httpEndpoint is readable or writable; got networks.<id>.${field}`,
    );
  }
}

function httpsEndpoint(value: string, key: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new UsageError("invalid_value", `${key} must be an absolute URL`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new UsageError("invalid_value", `${key} must be an http(s) URL`);
  }
  return parsed.toString();
}
