/**
 * ConfigLoader / NetworkRegistry — resolve the root dir, layer-merge config,
 * build the network registry, and resolve canonical network ids. The descriptor stays pure data;
 * live RPC clients are owned by the chain gateway provider, not attached here.
 */
import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Config, NetworkDescriptor, OutputMode } from "../../../domain/types/index.js";
import type { NetworkRegistry as INetworkRegistry } from "../../../application/ports/network-registry.js";
import { UsageError } from "../../../domain/errors/index.js";
import { BUILTIN_ALIASES, BUILTIN_NETWORKS, DEFAULT_CONFIG } from "./builtins.js";
import { CHAIN_FAMILIES } from "../../../domain/family/index.js";
import type { ChainFamily } from "../../../domain/family/index.js";

export class ConfigLoader {
  /** bootstrap: must run before locating config.yaml. */
  static resolveRoot(env: NodeJS.ProcessEnv = process.env): string {
    return env.WALLET_CLI_HOME && env.WALLET_CLI_HOME.trim() !== ""
      ? env.WALLET_CLI_HOME
      : join(homedir(), ".wallet-cli");
  }

  static configPath(env: NodeJS.ProcessEnv = process.env): string {
    return join(ConfigLoader.resolveRoot(env), "config.yaml");
  }

  /** builtins < config.yaml (env/flag overrides for runtime values applied by caller). */
  static load(env: NodeJS.ProcessEnv = process.env): Config {
    const networks: Record<string, NetworkDescriptor> = {};
    for (const [id, d] of Object.entries(BUILTIN_NETWORKS)) networks[id] = { ...d };
    const aliases: Record<string, string> = { ...BUILTIN_ALIASES };

    let defaultNetwork: string | undefined = DEFAULT_CONFIG.defaultNetwork;
    let defaultOutput: OutputMode = DEFAULT_CONFIG.defaultOutput;
    let timeoutMs = DEFAULT_CONFIG.timeoutMs;
    let waitTimeoutMs = DEFAULT_CONFIG.waitTimeoutMs;
    let price: Config["price"];
    let tronlinkSecretId: string | undefined;
    let tronlinkSecretKey: string | undefined;
    let tronlinkChannel: string | undefined;
    let gasfreeApiKey: string | undefined;
    let gasfreeApiSecret: string | undefined;

    const path = ConfigLoader.configPath(env);
    if (existsSync(path)) {
      const raw = readConfigDocument(path);
      if (
        (typeof raw.tronlinkSecretKey === "string" && raw.tronlinkSecretKey !== "") ||
        (typeof raw.gasfreeApiSecret === "string" && raw.gasfreeApiSecret !== "") ||
        // A network's RPC apiKey is a credential too, and it sits NESTED under `networks`; a gate
        // that only inspected top-level keys would hand out a 644 file holding one.
        holdsNetworkApiKey(raw.networks)
      ) {
        assertSecretConfigPermissions(path);
      }
      if (typeof raw.defaultNetwork === "string" && raw.defaultNetwork.trim() !== "") {
        defaultNetwork = raw.defaultNetwork;
      }
      if (raw.defaultOutput === "json" || raw.defaultOutput === "text")
        defaultOutput = raw.defaultOutput;
      if (typeof raw.timeoutMs === "number") timeoutMs = raw.timeoutMs;
      // Same rule ConfigService enforces on write — a hand-edited file must not slip through
      // negative or fractional values into the effective config.
      if (Number.isInteger(raw.waitTimeoutMs) && raw.waitTimeoutMs >= 0)
        waitTimeoutMs = raw.waitTimeoutMs;
      if (raw.price && typeof raw.price === "object") {
        const p = raw.price as Record<string, unknown>;
        const provider = p.provider === "none" ? "none" : "coingecko";
        price = { provider };
        if (typeof p.baseUrl === "string" && p.baseUrl.trim() !== "") price.baseUrl = p.baseUrl;
      }
      if (validCredential(raw.tronlinkSecretId)) tronlinkSecretId = raw.tronlinkSecretId;
      if (validCredential(raw.tronlinkSecretKey)) tronlinkSecretKey = raw.tronlinkSecretKey;
      if (validCredential(raw.tronlinkChannel)) tronlinkChannel = raw.tronlinkChannel;
      if (validCredential(raw.gasfreeApiKey)) gasfreeApiKey = raw.gasfreeApiKey;
      if (validCredential(raw.gasfreeApiSecret)) gasfreeApiSecret = raw.gasfreeApiSecret;
      // aliases first: a network key may be written as an alias, and normalising it needs the
      // book the same file may have just extended.
      if (raw.aliases && typeof raw.aliases === "object" && !Array.isArray(raw.aliases)) {
        for (const [alias, target] of Object.entries(raw.aliases as Record<string, unknown>)) {
          if (typeof target === "string") aliases[alias.toLowerCase()] = target;
        }
      }
      if (raw.networks && typeof raw.networks === "object") {
        const seen = new Map<string, string>(); // canonical id -> the key that claimed it
        for (const [key, d] of Object.entries(
          raw.networks as Record<string, Record<string, unknown>>,
        )) {
          // A hand-edited alias key must configure the network it names, not create a new one.
          // Silently ignoring it is the failure §2.4 calls out: the file looks configured and
          // does nothing.
          const id = aliases[key.toLowerCase()] ?? key;
          const claimedBy = seen.get(id);
          if (claimedBy !== undefined) {
            throw new UsageError(
              "invalid_value",
              `config.yaml configures ${id} twice, under "${claimedBy}" and "${key}"; keep one`,
            );
          }
          seen.set(id, key);
          networks[id] = validNetwork(id, { ...(networks[id] ?? {}), ...d, id });
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
    };
  }
}

function validCredential(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

/**
 * Read config.yaml, reporting the condition rather than the underlying error.
 *
 * Both failures carry material we must not surface: a YAML parse error quotes the offending line,
 * which may sit right beside `gasfreeApiSecret`, and a read error carries whatever the OS put in
 * its message. Classifying here also keeps the user out of the generic `internal_error` they would
 * otherwise get from the bootstrap boundary for what is simply a broken file.
 */
/**
 * A network from config.yaml, checked before it can travel.
 *
 * The merge is a bare cast, so anything missing used to survive until something dereferenced it:
 * an absent `capabilities` crashed composition with "Cannot read properties of undefined" before
 * any command ran, surfacing as a bare internal_error. A config mistake has to be reported as a
 * config mistake, naming the network and the field, at the moment the file is read.
 */
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
  // Traits are extras; having none is the normal case, not an error.
  return { capabilities: [], ...merged } as unknown as NetworkDescriptor;
}

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

/** true when any network in the document carries a non-empty `apiKey`. */
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
    // Keys are lower-cased so canonical ids remain case-insensitive.
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
    // Canonical FIRST, book second (ADR-0010): an alias can never shadow a real network id,
    // whatever a hand-edited config.yaml contains.
    const direct = this.#byId.get(key);
    if (direct) return { ...direct };

    const target = this.config.aliases[key];
    if (target === undefined) {
      throw new UsageError("unsupported_network", `unknown network: ${id}`);
    }
    const aliased = this.#byId.get(target.toLowerCase());
    if (!aliased) {
      // Aliases are hand-edited, so name the entry AND its target — otherwise the user hunts for
      // a network they never asked for instead of the alias line they mistyped.
      throw new UsageError(
        "unsupported_network",
        `alias "${id}" points at unknown network ${target}`,
      );
    }
    return { ...aliased };
  }

  /** default target for all chain commands when --network is omitted. */
  resolveDefault(): NetworkDescriptor {
    return this.resolve(this.config.defaultNetwork ?? DEFAULT_CONFIG.defaultNetwork);
  }
}
