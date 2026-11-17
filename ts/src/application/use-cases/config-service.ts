import { endpointHost, type Config } from "../../domain/types/index.js";
import type { NetworkRegistry } from "../ports/network-registry.js";
import { UsageError } from "../../domain/errors/index.js";
import type { PluginCredentialManifest } from "../../domain/plugins/index.js";
import type {
  ConfigDocument,
  ConfigDocumentRepository,
  ConfigDocumentValue,
} from "../ports/config-document-repository.js";
import {
  CREDENTIAL_VALUE_RULE,
  HEADER_NAME_RULE,
  type ValueRule,
  HTTP_URL_RULE,
  isCredentialConfigKey,
  isOutputMode,
  NETWORK_CREDENTIAL_FIELD,
  normalizeRegistryUrl,
  OUTPUT_MODES,
  TIMEOUT_MS_RULE,
  timeoutMsFromText,
  withNetworkField,
} from "../../domain/config/index.js";

export const TRONLINK_CONFIG_KEYS = [
  "tronlinkSecretId",
  "tronlinkSecretKey",
  "tronlinkChannel",
] as const;
export const CONFIG_KEYS = [
  "defaultNetwork",
  "defaultOutput",
  "timeoutMs",
  "pluginRegistry",
  "networks",
  "aliases",
  ...TRONLINK_CONFIG_KEYS,
] as const;
export const WRITABLE_CONFIG_KEYS = [
  "defaultNetwork",
  "defaultOutput",
  "timeoutMs",
  "pluginRegistry",
  ...TRONLINK_CONFIG_KEYS,
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

// Every credential value in effect; outputs mask them.
export function configuredCredentials(config: Config): string[] {
  const values = [
    config.tronlinkSecretId,
    config.tronlinkSecretKey,
    ...config.credentials.values(),
    ...Object.values(config.networks).map((network) => network.apiKey),
  ];
  return values.filter((value): value is string => typeof value === "string" && value !== "");
}

// The last dot separates the field; dotted aliases cannot be addressed unambiguously.
function parseNetworkKey(key: string): NetworkKey | null {
  const match = NETWORK_KEY.exec(key);
  if (match) return { networkRef: match[1]!, field: match[2]! };
  return key.startsWith("networks.") ? { networkRef: key.slice("networks.".length) } : null;
}

// Credentials are masked in every view.
export interface NetworkConfigView {
  httpEndpoint?: string;
  apiKeyHeader?: string;
  apiKey?: string;
}

// The core keys, then each declared plugin credential key, masked.
export type ConfigView = CoreConfigView & {
  readonly [credentialKey: string]: string | undefined;
};

interface CoreConfigView {
  defaultNetwork: Config["defaultNetwork"];
  defaultOutput: Config["defaultOutput"];
  timeoutMs: Config["timeoutMs"];
  pluginRegistry: Config["pluginRegistry"];
  networks: Record<string, NetworkConfigView>;
  aliases: Config["aliases"];
  tronlinkSecretId: string | undefined;
  tronlinkSecretKey: string | undefined;
  tronlinkChannel: Config["tronlinkChannel"];
}

export type ConfigReadResult = {
  key: string;
  value: CoreConfigView[keyof CoreConfigView] | NetworkConfigView;
};

export type ConfigWriteResult = { key: string; value: string | number | undefined; input: string };

export type ConfigResult = ConfigView | ConfigReadResult | ConfigWriteResult;

export class ConfigService {
  readonly #credentials: ReadonlyMap<string, PluginCredentialManifest>;

  // `credentials`: the credential keys the plugins declare, in listing order, one entry per key.
  constructor(
    private readonly documents: ConfigDocumentRepository,
    credentials: readonly PluginCredentialManifest[] = [],
  ) {
    this.#credentials = new Map(credentials.map((c) => [c.key, c]));
  }

  get credentials(): readonly PluginCredentialManifest[] {
    return [...this.#credentials.values()];
  }

  // True for a key accepted only from the secret input channel.
  isCredentialKey(key: string): boolean {
    return (
      isCredentialConfigKey(key) ||
      this.#credentials.has(key) ||
      parseNetworkKey(key)?.field === NETWORK_CREDENTIAL_FIELD
    );
  }

  // Unknown keys fail before anything else is checked, also when a value comes from stdin.
  assertKnownKey(key: string): void {
    if (parseNetworkKey(key) || CONFIG_KEYS.includes(key as ConfigKey)) return;
    if (this.#credentials.has(key)) return;
    throw new UsageError("invalid_value", `unknown config key: ${key}`);
  }

  execute(input: ConfigCommandInput, effective: Config, networks: NetworkRegistry): ConfigResult {
    const core: CoreConfigView = {
      defaultNetwork: effective.defaultNetwork,
      defaultOutput: effective.defaultOutput,
      timeoutMs: effective.timeoutMs,
      pluginRegistry: effective.pluginRegistry,
      // Listings hide endpoint paths that may contain API keys; explicit network reads reveal them.
      networks: Object.fromEntries(
        Object.entries(effective.networks).map(([id, n]) => [id, networkView(n, false)]),
      ),
      aliases: effective.aliases,
      tronlinkSecretId: maskSecret(effective.tronlinkSecretId),
      tronlinkSecretKey: maskSecret(effective.tronlinkSecretKey),
      tronlinkChannel: effective.tronlinkChannel,
    };
    const declared = [...this.#credentials.keys()].map(
      (key) => [key, maskSecret(effective.credentials.get(key))] as const,
    );
    if (input.key === undefined) return { ...core, ...Object.fromEntries(declared) } as ConfigView;

    const networkKey = parseNetworkKey(input.key);
    if (networkKey) {
      return input.value === undefined
        ? readNetworkField(networkKey, effective, networks)
        : this.setNetworkField(networkKey, input.value, networks);
    }

    this.assertKnownKey(input.key);
    if (this.#credentials.has(input.key)) {
      const key = input.key;
      if (input.value === undefined) {
        return { key, value: maskSecret(effective.credentials.get(key)) };
      }
      const value = ruled(key, input.value, CREDENTIAL_VALUE_RULE);
      return this.documents.update((current) => ({
        document: { ...current, [key]: value },
        result: { key, value: maskSecret(value), input: "********" },
      }));
    }
    if (input.value === undefined) {
      return { key: input.key, value: core[input.key as ConfigKey] };
    }
    if (!WRITABLE_CONFIG_KEYS.includes(input.key as WritableConfigKey)) {
      throw new UsageError("invalid_value", `${input.key} is read-only`);
    }

    const key = input.key as WritableConfigKey;
    const value = this.normalize(key, input.value, networks);
    if (isCredentialConfigKey(key)) {
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
  ): ConfigWriteResult {
    const configurable = assertConfigurableNetworkField(field);
    const id = networks.resolve(networkRef).id;
    const key = `networks.${id}.${configurable}`;
    const normalized = normalizeNetworkValue(configurable, value, key);
    // Never echo the API key, including in the input field.
    const secret = configurable === NETWORK_CREDENTIAL_FIELD;
    return this.documents.update((current) => {
      const existing = (current as { networks?: Record<string, ConfigDocument> }).networks ?? {};
      const sameNetwork = (candidate: string): boolean => {
        try {
          return networks.resolve(candidate).id === id;
        } catch {
          return false;
        }
      };
      return {
        document: {
          ...current,
          networks: withNetworkField<ConfigDocumentValue>(
            existing,
            id,
            sameNetwork,
            configurable,
            normalized,
          ),
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
    if (key === "timeoutMs") return ruled(key, timeoutMsFromText(raw), TIMEOUT_MS_RULE);
    if (key === "pluginRegistry") return normalizeRegistryUrl(ruled(key, raw, HTTP_URL_RULE));
    if (key === "defaultOutput") {
      if (!isOutputMode(raw)) {
        throw new UsageError(
          "invalid_value",
          `defaultOutput must be ${OUTPUT_MODES.map((m) => `'${m}'`).join(" or ")}`,
        );
      }
      return raw;
    }
    if ((TRONLINK_CONFIG_KEYS as readonly string[]).includes(key)) {
      return ruled(key, raw, CREDENTIAL_VALUE_RULE);
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
): ConfigReadResult {
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
): NetworkConfigView {
  const endpoint = network.httpEndpoint;
  return omitUndefined({
    httpEndpoint: endpoint ? (full ? endpoint : endpointHost(endpoint)) : undefined,
    apiKeyHeader: network.apiKeyHeader,
    apiKey: maskSecret(network.apiKey),
  });
}

function omitUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

function normalizeNetworkValue(field: NetworkConfigField, value: string, key: string): string {
  if (field === "httpEndpoint") return new URL(ruled(key, value, HTTP_URL_RULE).trim()).toString();
  if (field === "apiKeyHeader") return ruled(key, value, HEADER_NAME_RULE).trim();
  return ruled(key, value, CREDENTIAL_VALUE_RULE);
}

function ruled<T>(key: string, value: unknown, rule: ValueRule<T>): T {
  if (!rule.accepts(value))
    throw new UsageError("invalid_value", `${key} must be ${rule.description}`);
  return value;
}
