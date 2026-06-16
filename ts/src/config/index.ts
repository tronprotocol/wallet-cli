/**
 * ConfigLoader / NetworkRegistry (L1) — resolve the root dir, layer-merge config,
 * build the network registry, resolve alias→canonical, attach an RpcClient (plan §7.2/§7.5).
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  Config,
  Globals,
  NetworkDescriptor,
  NetworkRegistry as INetworkRegistry,
  OutputMode,
} from "../types/index.js";
import { UsageError } from "../errors/index.js";
import { BUILTIN_NETWORKS, DEFAULT_CONFIG } from "./builtins.js";

export class ConfigLoader {
  /** bootstrap: must run before locating config.yaml (plan §7.2). */
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

    let defaultOutput: OutputMode = DEFAULT_CONFIG.defaultOutput;
    let timeoutMs = DEFAULT_CONFIG.timeoutMs;

    const path = ConfigLoader.configPath(env);
    if (existsSync(path)) {
      const raw = parseYaml(readFileSync(path, "utf8")) ?? {};
      if (raw.defaultOutput === "json" || raw.defaultOutput === "text") defaultOutput = raw.defaultOutput;
      if (typeof raw.timeoutMs === "number") timeoutMs = raw.timeoutMs;
      if (raw.networks && typeof raw.networks === "object") {
        for (const [id, d] of Object.entries(raw.networks as Record<string, Partial<NetworkDescriptor>>)) {
          networks[id] = { ...(networks[id] ?? {}), ...(d as NetworkDescriptor), id };
        }
      }
    }
    return { defaultOutput, timeoutMs, networks };
  }
}

export interface EndpointOverrides {
  rpcUrl?: string;
  grpcEndpoint?: string;
}

export class NetworkRegistry implements INetworkRegistry {
  #byId = new Map<string, NetworkDescriptor>();
  #aliasToId = new Map<string, string[]>();

  constructor(
    private readonly config: Config,
    private readonly rpcFactory: (d: NetworkDescriptor) => NetworkDescriptor["rpc"],
    private readonly overrides: EndpointOverrides = {},
  ) {
    for (const d of Object.values(config.networks)) {
      this.#byId.set(d.id, d);
      for (const a of d.aliases) {
        const list = this.#aliasToId.get(a) ?? [];
        list.push(d.id);
        this.#aliasToId.set(a, list);
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
    let id = idOrAlias;
    if (!this.#byId.has(idOrAlias)) {
      const matches = this.#aliasToId.get(idOrAlias);
      if (!matches || matches.length === 0) {
        throw new UsageError("unsupported_network", `unknown network: ${idOrAlias}`);
      }
      if (matches.length > 1) {
        throw new UsageError("ambiguous_network_alias", `alias '${idOrAlias}' maps to: ${matches.join(", ")}`);
      }
      id = matches[0]!;
    }
    const base = this.#byId.get(id)!;
    // per-run endpoint overrides + attach a live rpc client
    const descriptor: NetworkDescriptor = { ...base };
    if (this.overrides.rpcUrl) descriptor.rpcUrl = this.overrides.rpcUrl;
    if (this.overrides.grpcEndpoint) descriptor.grpcEndpoint = this.overrides.grpcEndpoint;
    descriptor.rpc = this.rpcFactory(descriptor);
    return descriptor;
  }
}
