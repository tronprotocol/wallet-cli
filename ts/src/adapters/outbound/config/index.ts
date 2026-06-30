/**
 * ConfigLoader / NetworkRegistry — resolve the root dir, layer-merge config,
 * build the network registry, resolve alias→canonical. The descriptor stays pure data;
 * live RPC clients are owned by the chain gateway provider, not attached here.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  Config, NetworkDescriptor, OutputMode } from "../../../domain/types/index.js";
import type { NetworkRegistry as INetworkRegistry } from "../../../application/ports/network-registry.js";
import { UsageError } from "../../../domain/errors/index.js";
import { BUILTIN_NETWORKS, DEFAULT_CONFIG } from "./builtins.js";

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

    let defaultNetwork: string | undefined = DEFAULT_CONFIG.defaultNetwork;
    let defaultOutput: OutputMode = DEFAULT_CONFIG.defaultOutput;
    let timeoutMs = DEFAULT_CONFIG.timeoutMs;
    let price: Config["price"];

    const path = ConfigLoader.configPath(env);
    if (existsSync(path)) {
      const raw = parseYaml(readFileSync(path, "utf8")) ?? {};
      if (typeof raw.defaultNetwork === "string" && raw.defaultNetwork.trim() !== "") {
        defaultNetwork = raw.defaultNetwork;
      }
      if (raw.defaultOutput === "json" || raw.defaultOutput === "text") defaultOutput = raw.defaultOutput;
      if (typeof raw.timeoutMs === "number") timeoutMs = raw.timeoutMs;
      if (raw.price && typeof raw.price === "object") {
        const p = raw.price as Record<string, unknown>;
        const provider = p.provider === "none" ? "none" : "coingecko";
        price = { provider };
        if (typeof p.baseUrl === "string" && p.baseUrl.trim() !== "") price.baseUrl = p.baseUrl;
        if (typeof p.apiKey === "string" && p.apiKey.trim() !== "") price.apiKey = p.apiKey;
      }
      if (raw.networks && typeof raw.networks === "object") {
        for (const [id, d] of Object.entries(raw.networks as Record<string, Record<string, unknown>>)) {
          networks[id] = { ...(networks[id] ?? {}), ...d, id } as NetworkDescriptor;
        }
      }
    }
    return { defaultNetwork, defaultOutput, timeoutMs, networks, price };
  }
}

export class NetworkRegistry implements INetworkRegistry {
  #byId = new Map<string, NetworkDescriptor>();
  #aliasToId = new Map<string, string[]>();

  constructor(private readonly config: Config) {
    // keys are lower-cased so resolve() is case-insensitive (users type `Nile`/`TRON`, the
    // canonical TRON branding, while ids/aliases are stored lowercase).
    for (const d of Object.values(config.networks)) {
      this.#byId.set(d.id.toLowerCase(), d);
      for (const a of d.aliases) {
        const key = a.toLowerCase();
        const list = this.#aliasToId.get(key) ?? [];
        list.push(d.id);
        this.#aliasToId.set(key, list);
      }
    }
  }

  all(): NetworkDescriptor[] {
    return [...this.#byId.values()];
  }

  resolve(idOrAlias: string | undefined): NetworkDescriptor {
    if (!idOrAlias || idOrAlias.trim() === "") {
      throw new UsageError("missing_network", "this command requires --network <id|alias>");
    }
    const key = idOrAlias.toLowerCase();
    let id = key;
    if (!this.#byId.has(key)) {
      const matches = this.#aliasToId.get(key);
      if (!matches || matches.length === 0) {
        throw new UsageError("unsupported_network", `unknown network: ${idOrAlias}`);
      }
      if (matches.length > 1) {
        throw new UsageError("ambiguous_network_alias", `alias '${idOrAlias}' maps to: ${matches.join(", ")}`);
      }
      id = matches[0]!.toLowerCase();
    }
    return { ...this.#byId.get(id)! };
  }

  /** default target for all chain commands when --network is omitted. */
  resolveDefault(): NetworkDescriptor {
    return this.resolve(this.config.defaultNetwork ?? DEFAULT_CONFIG.defaultNetwork);
  }
}
