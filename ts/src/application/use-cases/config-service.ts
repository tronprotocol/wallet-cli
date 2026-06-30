import type { Config } from "../../domain/types/index.js";
import type { NetworkRegistry } from "../ports/network-registry.js";
import { UsageError } from "../../domain/errors/index.js";
import type { ConfigDocumentRepository } from "../ports/config-document-repository.js";

export const CONFIG_KEYS = ["defaultNetwork", "defaultOutput", "timeoutMs", "networks"] as const;
export const WRITABLE_CONFIG_KEYS = ["defaultNetwork", "defaultOutput", "timeoutMs"] as const;
export type ConfigKey = (typeof CONFIG_KEYS)[number];
export type WritableConfigKey = (typeof WRITABLE_CONFIG_KEYS)[number];

export interface ConfigCommandInput {
  key?: ConfigKey;
  value?: string;
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
      networks: Object.keys(effective.networks),
    };
    if (input.key === undefined) return view;
    if (input.value === undefined) return { key: input.key, value: view[input.key] };
    if (!WRITABLE_CONFIG_KEYS.includes(input.key as WritableConfigKey)) {
      throw new UsageError("invalid_value", `${input.key} is read-only`);
    }

    const key = input.key as WritableConfigKey;
    const value = this.normalize(key, input.value, networks);
    return this.documents.update((current) => ({
      document: { ...current, [key]: value },
      result: { key, value, input: input.value! },
    }));
  }

  private normalize(
    key: WritableConfigKey,
    raw: string,
    networks: NetworkRegistry,
  ): string | number {
    if (key === "timeoutMs") {
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0) {
        throw new UsageError("invalid_value", "timeoutMs must be a non-negative number");
      }
      return value;
    }
    if (key === "defaultOutput") {
      if (raw !== "text" && raw !== "json") {
        throw new UsageError("invalid_value", "defaultOutput must be 'text' or 'json'");
      }
      return raw;
    }
    return networks.resolve(raw).id;
  }
}
