import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseDocument } from "yaml";
import type {
  Config,
  JsonValue,
  NetworkDescriptor,
  OutputMode,
} from "../../../domain/types/index.js";
import type { NetworkRegistry as INetworkRegistry } from "../../../application/ports/network-registry.js";
import { errorMessage, inputRef, UsageError } from "../../../domain/errors/index.js";
import { BUILTIN_ALIASES, BUILTIN_NETWORKS } from "./builtins.js";
import { CONFIG_DEFAULTS } from "../../../application/contracts/config-defaults.js";
import { CHAIN_FAMILIES } from "../../../domain/family/index.js";
import type { ChainFamily } from "../../../domain/family/index.js";
import {
  CREDENTIAL_CONFIG_KEYS,
  CREDENTIAL_VALUE_RULE,
  HEADER_NAME_RULE,
  HTTP_URL_RULE,
  isOutputMode,
  NETWORK_CREDENTIAL_FIELD,
  normalizeRegistryUrl,
  TIMEOUT_MS_RULE,
} from "../../../domain/config/index.js";

export class ConfigLoader {
  static resolveRoot(env: NodeJS.ProcessEnv = process.env): string {
    return env.WALLET_CLI_HOME && env.WALLET_CLI_HOME.trim() !== ""
      ? env.WALLET_CLI_HOME
      : join(homedir(), ".wallet-cli");
  }

  static configPath(env: NodeJS.ProcessEnv = process.env): string {
    return join(ConfigLoader.resolveRoot(env), "config.yaml");
  }

  // config.yaml overrides builtins; callers apply runtime environment and flag overrides.
  static load(env: NodeJS.ProcessEnv = process.env): Config {
    const networks: Record<string, NetworkDescriptor> = {};
    for (const [id, d] of Object.entries(BUILTIN_NETWORKS)) networks[id] = { ...d };
    const aliases: Record<string, string> = { ...BUILTIN_ALIASES };

    let defaultNetwork: string | undefined = CONFIG_DEFAULTS.defaultNetwork;
    let defaultOutput: OutputMode = CONFIG_DEFAULTS.defaultOutput;
    let timeoutMs = CONFIG_DEFAULTS.timeoutMs;
    let pluginRegistry = CONFIG_DEFAULTS.pluginRegistry;
    let price: Config["price"];
    let tronlinkSecretId: string | undefined;
    let tronlinkSecretKey: string | undefined;
    let tronlinkChannel: string | undefined;
    let gasfreeApiKey: string | undefined;
    let gasfreeApiSecret: string | undefined;
    let baiApiKey: string | undefined;

    const path = ConfigLoader.configPath(env);
    if (existsSync(path)) {
      const raw = readConfigDocument(path);
      if (
        CREDENTIAL_CONFIG_KEYS.some((key) => typeof raw[key] === "string" && raw[key] !== "") ||
        holdsNetworkApiKey(raw.networks)
      ) {
        assertSecretConfigPermissions(path);
      }
      if (typeof raw.defaultNetwork === "string" && raw.defaultNetwork.trim() !== "") {
        defaultNetwork = raw.defaultNetwork;
      }
      // Invalid scalar values fall back to their defaults.
      if (isOutputMode(raw.defaultOutput)) defaultOutput = raw.defaultOutput;
      if (TIMEOUT_MS_RULE.accepts(raw.timeoutMs)) timeoutMs = raw.timeoutMs;
      if (HTTP_URL_RULE.accepts(raw.pluginRegistry)) {
        pluginRegistry = normalizeRegistryUrl(raw.pluginRegistry);
      }
      if (raw.price && typeof raw.price === "object") {
        const p = raw.price as Record<string, unknown>;
        const provider = p.provider === "none" ? "none" : "coingecko";
        price = { provider };
        if (typeof p.baseUrl === "string" && p.baseUrl.trim() !== "") price.baseUrl = p.baseUrl;
      }
      const credential = (value: unknown) =>
        CREDENTIAL_VALUE_RULE.accepts(value) ? value : undefined;
      tronlinkSecretId = credential(raw.tronlinkSecretId);
      tronlinkSecretKey = credential(raw.tronlinkSecretKey);
      tronlinkChannel = credential(raw.tronlinkChannel);
      gasfreeApiKey = credential(raw.gasfreeApiKey);
      gasfreeApiSecret = credential(raw.gasfreeApiSecret);
      baiApiKey = credential(raw.baiApiKey);
      // Load aliases before networks so alias-keyed network overrides resolve correctly.
      if (raw.aliases && typeof raw.aliases === "object" && !Array.isArray(raw.aliases)) {
        for (const [alias, target] of Object.entries(raw.aliases as Record<string, unknown>)) {
          if (typeof target === "string") aliases[alias.toLowerCase()] = target;
        }
        // Fold alias targets here because registry resolution follows only one hop.
        // Canonical targets must stop folding to prevent an alias from redirecting a builtin network.
        for (const [alias, target] of Object.entries(aliases)) {
          const key = target.toLowerCase();
          if (ownValue(networks, key) !== undefined) continue;
          const forwarded = ownValue(aliases, key);
          if (forwarded !== undefined && forwarded !== target) aliases[alias] = forwarded;
        }
      }
      if (raw.networks && typeof raw.networks === "object") {
        const seen = new Map<string, string>();
        for (const [key, d] of Object.entries(
          raw.networks as Record<string, Record<string, unknown>>,
        )) {
          const id = ownValue(aliases, key.toLowerCase()) ?? key;
          const claimedBy = seen.get(id);
          if (claimedBy !== undefined) {
            throw new UsageError(
              "invalid_value",
              `config.yaml configures ${id} twice, under "${claimedBy}" and "${key}"; keep one`,
            );
          }
          seen.set(id, key);
          const base = ownValue(networks, id) ?? {};
          const written = isMapping(d) ? d : {};
          const own = { ...coreFields(written), ...validConnectionFields(id, written) };
          const extensions = extensionBlocks(written);
          networks[id] = validNetwork(id, {
            ...base,
            ...own,
            id,
            ...(extensions ? { extensions } : {}),
          });
        }
      }
    }
    return {
      defaultNetwork,
      defaultOutput,
      timeoutMs,
      pluginRegistry,
      networks,
      aliases,
      price,
      tronlinkSecretId,
      tronlinkSecretKey,
      tronlinkChannel,
      gasfreeApiKey,
      gasfreeApiSecret,
      baiApiKey,
    };
  }
}

// The fields `config set networks.<id>.<field>` writes; messages never echo the values.
function validConnectionFields(
  id: string,
  network: Record<string, unknown>,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const rules = {
    httpEndpoint: HTTP_URL_RULE,
    apiKeyHeader: HEADER_NAME_RULE,
    [NETWORK_CREDENTIAL_FIELD]: CREDENTIAL_VALUE_RULE,
  };
  for (const [field, rule] of Object.entries(rules)) {
    const value = network[field];
    if (value === undefined) continue;
    if (!rule.accepts(value)) {
      throw new UsageError(
        "invalid_value",
        `network ${id} in config.yaml has an invalid ${field}: expected ${rule.description}`,
      );
    }
    if (field === "apiKeyHeader") fields[field] = value.trim();
  }
  return fields;
}

function validNetwork(id: string, merged: Record<string, unknown>): NetworkDescriptor {
  const require = (field: string): unknown => {
    const value = merged[field];
    if (typeof value !== "string" || value === "") {
      throw new UsageError("invalid_value", `network ${id} in config.yaml is missing ${field}`);
    }
    return value;
  };
  require("chainId");
  require("nativeSymbol");
  const family = require("family");
  if (!CHAIN_FAMILIES.includes(family as ChainFamily)) {
    throw new UsageError(
      "invalid_value",
      `network ${id} in config.yaml has an unsupported family: ${String(family)}`,
    );
  }
  return { capabilities: [], ...merged } as unknown as NetworkDescriptor;
}

const CORE_NETWORK_FIELDS: ReadonlySet<string> = new Set([
  "id",
  "chainId",
  "nativeSymbol",
  "testnet",
  "feeModel",
  "capabilities",
  "apiKeyHeader",
  "apiKey",
  "family",
  "httpEndpoint",
  "tronlinkHttpEndpoint",
]);

function coreFields(network: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(network).filter(([key]) => CORE_NETWORK_FIELDS.has(key)),
  );
}

// Every key that is not a core field, as written, for the plugin that owns the block.
function extensionBlocks(
  network: Record<string, unknown>,
): Readonly<Record<string, JsonValue>> | undefined {
  const blocks = Object.entries(network).filter(([key]) => !CORE_NETWORK_FIELDS.has(key));
  return blocks.length === 0
    ? undefined
    : (Object.fromEntries(blocks) as Record<string, JsonValue>);
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Names come from argv and config.yaml, so inherited members such as `constructor` must not match.
function ownValue<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

// Do not expose YAML or OS errors: they can contain credentials.
function readConfigDocument(path: string) {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new UsageError("invalid_config", `config.yaml cannot be read: ${path}`);
  }
  return parseConfigYaml(text, path);
}

// parseDocument records YAML warnings instead of emitting them; they are not shown because they quote the source line.
export function parseConfigYaml(text: string, path: string) {
  const invalid = () => new UsageError("invalid_config", `config.yaml is not valid YAML: ${path}`);
  let document: ReturnType<typeof parseDocument>;
  try {
    document = parseDocument(text);
  } catch {
    throw invalid();
  }
  if (document.errors.length > 0) throw invalid();
  try {
    return document.toJS() ?? {};
  } catch {
    throw invalid();
  }
}

function holdsNetworkApiKey(networks: unknown): boolean {
  if (!networks || typeof networks !== "object") return false;
  return Object.values(networks as Record<string, unknown>).some((network) => {
    const key = (network as { apiKey?: unknown } | null)?.apiKey;
    return typeof key === "string" && key !== "";
  });
}

function assertSecretConfigPermissions(path: string): void {
  if (process.platform === "win32") return;
  if (lstatSync(path).isSymbolicLink()) {
    throw new UsageError(
      "insecure_config",
      "config.yaml containing service credentials must not be a symbolic link",
    );
  }
  if ((statSync(path).mode & 0o077) !== 0) {
    throw new UsageError(
      "insecure_config",
      "config.yaml containing service credentials must have mode 0600; run chmod 600 on the file",
    );
  }
}

export class NetworkRegistry implements INetworkRegistry {
  #byId = new Map<string, NetworkDescriptor>();

  constructor(private readonly config: Config) {
    for (const d of Object.values(config.networks)) {
      this.#byId.set(d.id.toLowerCase(), d);
    }
  }

  aliasOf(id: string): string | undefined {
    return Object.entries(this.config.aliases).find(([, target]) => target === id)?.[0];
  }

  all(): NetworkDescriptor[] {
    return [...this.#byId.values()];
  }

  resolve(id: string | undefined): NetworkDescriptor {
    if (!id || id.trim() === "") {
      throw new UsageError(
        "missing_network",
        errorMessage`this command requires ${inputRef("network")} <id>`,
      );
    }
    const key = id.toLowerCase();
    // Resolve canonical ids before aliases so aliases cannot redirect a real network id.
    const direct = this.#byId.get(key);
    if (direct) return { ...direct };

    const target = ownValue(this.config.aliases, key);
    if (target === undefined) {
      throw new UsageError("unsupported_network", `unknown network: ${id}`);
    }
    const aliased = this.#byId.get(target.toLowerCase());
    if (!aliased) {
      throw new UsageError(
        "unsupported_network",
        `alias "${id}" points at unknown network ${target}`,
      );
    }
    return { ...aliased };
  }

  resolveDefault(): NetworkDescriptor {
    return this.resolve(this.config.defaultNetwork ?? CONFIG_DEFAULTS.defaultNetwork);
  }
}
