import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Config, NetworkDescriptor, OutputMode } from "../../../domain/types/index.js";
import type { NetworkRegistry as INetworkRegistry } from "../../../application/ports/network-registry.js";
import { UsageError } from "../../../domain/errors/index.js";
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
  TIMEOUT_MS_RULE,
  WAIT_TIMEOUT_MS_RULE,
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
    let waitTimeoutMs = CONFIG_DEFAULTS.waitTimeoutMs;
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
      if (WAIT_TIMEOUT_MS_RULE.accepts(raw.waitTimeoutMs)) waitTimeoutMs = raw.waitTimeoutMs;
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
          if (networks[key] !== undefined) continue;
          const forwarded = aliases[key];
          if (forwarded !== undefined && forwarded !== target) aliases[alias] = forwarded;
        }
      }
      if (raw.networks && typeof raw.networks === "object") {
        const seen = new Map<string, string>();
        for (const [key, d] of Object.entries(
          raw.networks as Record<string, Record<string, unknown>>,
        )) {
          const id = aliases[key.toLowerCase()] ?? key;
          const claimedBy = seen.get(id);
          if (claimedBy !== undefined) {
            throw new UsageError(
              "invalid_value",
              `config.yaml configures ${id} twice, under "${claimedBy}" and "${key}"; keep one`,
            );
          }
          seen.set(id, key);
          const base = networks[id] ?? {};
          const own = { ...d, ...validConnectionFields(id, d) };
          networks[id] = validNetwork(id, { ...base, ...own, ...mergedFeatureBlocks(base, d), id });
        }
      }
    }
    return {
      defaultNetwork,
      defaultOutput,
      timeoutMs,
      waitTimeoutMs,
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
  validSunSwapBlock(id, merged.sunswap);
  validSunPumpBlock(id, merged.sunpump);
  return { capabilities: [], ...merged } as unknown as NetworkDescriptor;
}

// Merge feature fields so omitted settings retain their builtin values.
function mergedFeatureBlocks(
  base: Record<string, unknown>,
  user: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const name of ["sunswap", "sunpump"]) {
    const builtin = base[name];
    const own = user[name];
    if (isMapping(builtin) && isMapping(own)) merged[name] = { ...builtin, ...own };
  }
  return merged;
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validSunSwapBlock(id: string, block: unknown): void {
  validServiceBlock(id, "sunswap", block, ["marketApiBaseUrl", "routerApiBaseUrl"], ["liquidity"], {
    contracts: "contract addresses now come from the SDK; set sunswap.liquidity: true instead",
  });
}

function validSunPumpBlock(id: string, block: unknown): void {
  validServiceBlock(id, "sunpump", block, ["apiBaseUrl"], ["curve"], {
    launchpad: "the launchpad address now comes from the SDK; set sunpump.curve: true instead",
  });
}

function validServiceBlock(
  id: string,
  name: string,
  block: unknown,
  urls: readonly string[],
  switches: readonly string[],
  retired: Readonly<Record<string, string>>,
): void {
  if (block === undefined) return;
  if (typeof block !== "object" || block === null || Array.isArray(block)) {
    throw new UsageError("invalid_value", `network ${id} in config.yaml has an invalid ${name}`);
  }
  const fields = block as Record<string, unknown>;
  for (const [field, hint] of Object.entries(retired)) {
    if (fields[field] !== undefined) {
      throw new UsageError(
        "invalid_value",
        `network ${id} in config.yaml has ${name}.${field}, which is no longer read: ${hint}`,
      );
    }
  }
  for (const field of urls) {
    const value = fields[field];
    if (value === undefined) continue;
    if (typeof value !== "string" || !isHttpUrl(value)) {
      throw new UsageError(
        "invalid_value",
        `network ${id} in config.yaml has an invalid ${name}.${field}: expected an http(s) URL`,
      );
    }
  }
  for (const field of switches) {
    const value = fields[field];
    if (value !== undefined && typeof value !== "boolean") {
      throw new UsageError(
        "invalid_value",
        `network ${id} in config.yaml has an invalid ${name}.${field}: expected true or false`,
      );
    }
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

// Do not expose YAML or OS errors: they can contain credentials.
function readConfigDocument(path: string) {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new UsageError("invalid_config", `config.yaml cannot be read: ${path}`);
  }
  try {
    return parseYaml(text) ?? {};
  } catch {
    throw new UsageError("invalid_config", `config.yaml is not valid YAML: ${path}`);
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
      throw new UsageError("missing_network", "this command requires --network <id>");
    }
    const key = id.toLowerCase();
    // Resolve canonical ids before aliases so aliases cannot redirect a real network id.
    const direct = this.#byId.get(key);
    if (direct) return { ...direct };

    const target = this.config.aliases[key];
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
