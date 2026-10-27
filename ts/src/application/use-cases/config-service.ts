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
export const BAI_CONFIG_KEYS = ["baiApiKey"] as const;
export const CONFIG_KEYS = [
  "defaultNetwork",
  "defaultOutput",
  "timeoutMs",
  "waitTimeoutMs",
  "networks",
  "aliases",
  ...TRONLINK_CONFIG_KEYS,
  ...GASFREE_CONFIG_KEYS,
  ...BAI_CONFIG_KEYS,
] as const;
export const WRITABLE_CONFIG_KEYS = [
  "defaultNetwork",
  "defaultOutput",
  "timeoutMs",
  "waitTimeoutMs",
  ...TRONLINK_CONFIG_KEYS,
  ...GASFREE_CONFIG_KEYS,
  ...BAI_CONFIG_KEYS,
] as const;
export type ConfigKey = (typeof CONFIG_KEYS)[number];
export type WritableConfigKey = (typeof WRITABLE_CONFIG_KEYS)[number];

export interface ConfigCommandInput {
  /** a flat key, or a nested `networks.<id-or-alias>[.<field>]` path. */
  key?: string;
  value?: string;
}

export const NETWORK_CONFIG_FIELDS = ["httpEndpoint", "apiKeyHeader", "apiKey"] as const;
export type NetworkConfigField = (typeof NETWORK_CONFIG_FIELDS)[number];

const NETWORK_KEY = /^networks\.(.+)\.([^.]+)$/;

interface NetworkKey {
  networkRef: string;
  // Absent selects the whole network.
  field?: string;
}

// The last dot separates the field; dotted aliases cannot be addressed unambiguously.
function parseNetworkKey(key: string): NetworkKey | null {
  const match = NETWORK_KEY.exec(key);
  if (match) return { networkRef: match[1]!, field: match[2]! };
  return key.startsWith("networks.") ? { networkRef: key.slice("networks.".length) } : null;
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
      // Listings hide endpoint paths that may contain API keys; explicit network reads reveal them.
      networks: Object.fromEntries(
        Object.entries(effective.networks).map(([id, n]) => [id, networkView(n, false)]),
      ),
      aliases: effective.aliases,
      tronlinkSecretId: maskSecret(effective.tronlinkSecretId),
      tronlinkSecretKey: maskSecret(effective.tronlinkSecretKey),
      tronlinkChannel: effective.tronlinkChannel,
      gasfreeApiKey: maskSecret(effective.gasfreeApiKey),
      gasfreeApiSecret: maskSecret(effective.gasfreeApiSecret),
      baiApiKey: maskSecret(effective.baiApiKey),
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
    if (
      [
        "tronlinkSecretId",
        "tronlinkSecretKey",
        "gasfreeApiKey",
        "gasfreeApiSecret",
        "baiApiKey",
      ].includes(key)
    ) {
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

  private setNetworkField(
    { networkRef, field }: NetworkKey,
    value: string,
    networks: NetworkRegistry,
  ): Record<string, unknown> {
    const configurable = assertConfigurableNetworkField(field);
    const id = networks.resolve(networkRef).id;
    const key = `networks.${id}.${configurable}`;
    const normalized = normalizeNetworkValue(configurable, value, key);
    // Never echo the API key, including in the input field.
    const secret = configurable === "apiKey";
    return this.documents.update((current) => {
      const existing =
        (current as { networks?: Record<string, Record<string, unknown>> }).networks ?? {};
      // Fold alias entries into the canonical ID; duplicate network keys are invalid.
      const sameNetwork = (candidate: string): boolean => {
        try {
          return networks.resolve(candidate).id === id;
        } catch {
          return false;
        }
      };
      const kept: Record<string, Record<string, unknown>> = {};
      let folded: Record<string, unknown> = {};
      for (const [existingKey, fields] of Object.entries(existing)) {
        if (sameNetwork(existingKey)) folded = { ...folded, ...fields };
        else kept[existingKey] = fields;
      }
      return {
        document: {
          ...current,
          networks: { ...kept, [id]: { ...folded, [configurable]: normalized } },
        },
        result: {
          key,
          value: secret ? maskSecret(normalized) : normalized,
          input: secret ? "********" : value,
        },
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
    if (key === "baiApiKey") {
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

function readNetworkField(
  { networkRef, field }: NetworkKey,
  effective: Config,
  networks: NetworkRegistry,
): Record<string, unknown> {
  const id = networks.resolve(networkRef).id;
  const network = effective.networks[id];
  if (field === undefined) {
    return { key: `networks.${id}`, value: network ? networkView(network, true) : {} };
  }
  const configurable = assertConfigurableNetworkField(field);
  const value = network?.[configurable];
  return {
    key: `networks.${id}.${configurable}`,
    value: configurable === "apiKey" ? maskSecret(value) : value,
  };
}

function assertConfigurableNetworkField(field: string | undefined): NetworkConfigField {
  if (!(NETWORK_CONFIG_FIELDS as readonly string[]).includes(field ?? "")) {
    throw new UsageError(
      "invalid_value",
      `only networks.<id>.{${NETWORK_CONFIG_FIELDS.join(" | ")}} is readable or writable; got networks.<id>.${field}`,
    );
  }
  return field as NetworkConfigField;
}

function networkView(
  network: { httpEndpoint?: string; apiKeyHeader?: string; apiKey?: string },
  full: boolean,
): Record<string, unknown> {
  const endpoint = network.httpEndpoint;
  return omitUndefined({
    httpEndpoint: endpoint ? (full ? endpoint : endpointHost(endpoint)) : undefined,
    apiKeyHeader: network.apiKeyHeader,
    apiKey: maskSecret(network.apiKey),
  });
}

function omitUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}

function normalizeNetworkValue(field: NetworkConfigField, value: string, key: string): string {
  if (field === "httpEndpoint") return httpsEndpoint(value, key);
  if (field === "apiKeyHeader") return headerName(value, key);
  return credentialValue(value, key);
}

// HTTP token syntax excludes separators and control characters that permit header injection.
function headerName(value: string, key: string): string {
  const name = value.trim();
  if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,64}$/.test(name)) {
    throw new UsageError(
      "invalid_value",
      `${key} must be an HTTP header name: 1 to 64 characters, no spaces, colons or control characters`,
    );
  }
  return name;
}

function credentialValue(value: string, key: string): string {
  if (value.length === 0 || value.length > 256 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new UsageError(
      "invalid_value",
      `${key} must be 1 to 256 characters without control characters`,
    );
  }
  return value;
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
