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
  /** a flat key, or a nested `networks.<id-or-alias>[.<field>]` path (§2.4). */
  key?: string;
  value?: string;
}

/**
 * What a user may configure ON a network — as opposed to what the network IS (family, chainId,
 * feeModel, gasfree…), which `wallet-cli networks` and `chain node` report.
 *
 * `config` renders exactly this set, so a field added here surfaces in the whole-config view, the
 * `networks` listing, the single-network read and `--output json` at once, with no display site
 * to update per view.
 */
export const NETWORK_CONFIG_FIELDS = ["httpEndpoint", "apiKeyHeader", "apiKey"] as const;
export type NetworkConfigField = (typeof NETWORK_CONFIG_FIELDS)[number];

/** `networks.<id-or-alias>` (the whole network) or `networks.<id-or-alias>.<field>` (one field). */
const NETWORK_KEY = /^networks\.(.+)\.([^.]+)$/;

interface NetworkKey {
  networkRef: string;
  /** absent → the caller addressed the network itself, not one of its fields. */
  field?: string;
}

/** A canonical id holds a colon, never a dot (`tron:nile`), so the last dot — when there is one —
 *  always separates the field. An alias containing a dot would be misread as `<ref>.<field>`; the
 *  book is hand-written and no builtin does that. */
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
      // canonical id -> its configurable fields. A LISTING keeps the endpoint trimmed to its host:
      // the full URL may carry an API key in its path, and this is output people paste whole.
      // Naming one network (`config networks.<id>`) is the deliberate act that reveals it.
      networks: Object.fromEntries(
        Object.entries(effective.networks).map(([id, n]) => [id, networkView(n, false)]),
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

  /** `networks.<id-or-alias>.<field>` — the key's network ref is normalised to its canonical
   *  id before writing, so config.yaml can never hold the same network under two names (§2.4). */
  private setNetworkField(
    { networkRef, field }: NetworkKey,
    value: string,
    networks: NetworkRegistry,
  ): Record<string, unknown> {
    const configurable = assertConfigurableNetworkField(field);
    const id = networks.resolve(networkRef).id;
    const key = `networks.${id}.${configurable}`;
    const normalized = normalizeNetworkValue(configurable, value, key);
    // The key never travels back out, in the receipt or in the echoed input.
    const secret = configurable === "apiKey";
    return this.documents.update((current) => {
      const existing = (current as { networks?: Record<string, Record<string, unknown>> }).networks;
      return {
        document: {
          ...current,
          networks: { ...existing, [id]: { ...existing?.[id], [configurable]: normalized } },
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
    return networks.resolve(raw).id;
  }
}

function maskSecret(value: string | undefined): string | undefined {
  return value ? "********" : undefined;
}

/**
 * One network's configurable fields, or a single field of it — addressed by alias or canonical id
 * alike, and answered with the effective value rather than only what config.yaml happens to hold.
 *
 * Naming ONE network is as deliberate as naming its endpoint leaf, so both reveal the endpoint in
 * full; only the breadth-first listings (`config`, `config networks`) trim it to the host.
 */
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

/** the configurable sub-keys; named in the error so a typo says which ones are supported. */
function assertConfigurableNetworkField(field: string | undefined): NetworkConfigField {
  if (!(NETWORK_CONFIG_FIELDS as readonly string[]).includes(field ?? "")) {
    throw new UsageError(
      "invalid_value",
      `only networks.<id>.{${NETWORK_CONFIG_FIELDS.join(" | ")}} is readable or writable; got networks.<id>.${field}`,
    );
  }
  return field as NetworkConfigField;
}

/** the user-configurable half of a network; `full` reveals an endpoint URL that may carry a key. */
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

/** an unset field is absent, not an empty line: the view says what IS configured. */
function omitUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}

function normalizeNetworkValue(field: NetworkConfigField, value: string, key: string): string {
  if (field === "httpEndpoint") return httpsEndpoint(value, key);
  if (field === "apiKeyHeader") return headerName(value, key);
  return credentialValue(value, key);
}

/**
 * An HTTP field name per RFC 9110 — the token production, which excludes whitespace, `:` and CR/LF.
 *
 * This value is written verbatim into a request's header list, so accepting a newline here would
 * let config.yaml smuggle in a second header (or a request line): header injection sourced from a
 * file the user edits by hand.
 */
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
