import type { Config } from "../../domain/types/index.js";
import type { NetworkRegistry } from "../ports/network-registry.js";
import { UsageError } from "../../domain/errors/index.js";
import type { ConfigDocumentRepository } from "../ports/config-document-repository.js";

export const TRONLINK_CONFIG_KEYS = [
  "tronlinkSecretId",
  "tronlinkSecretKey",
  "tronlinkChannel",
] as const;
export const CONFIG_KEYS = [
  "defaultNetwork",
  "defaultOutput",
  "timeoutMs",
  "waitTimeoutMs",
  "networks",
  ...TRONLINK_CONFIG_KEYS,
] as const;
export const WRITABLE_CONFIG_KEYS = [
  "defaultNetwork",
  "defaultOutput",
  "timeoutMs",
  "waitTimeoutMs",
  ...TRONLINK_CONFIG_KEYS,
] as const;
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
      waitTimeoutMs: effective.waitTimeoutMs,
      networks: Object.keys(effective.networks),
      tronlinkSecretId: effective.tronlinkSecretId,
      tronlinkSecretKey: maskSecret(effective.tronlinkSecretKey),
      tronlinkChannel: effective.tronlinkChannel,
    };
    if (input.key === undefined) return view;
    if (input.value === undefined) return { key: input.key, value: view[input.key] };
    if (!WRITABLE_CONFIG_KEYS.includes(input.key as WritableConfigKey)) {
      throw new UsageError("invalid_value", `${input.key} is read-only`);
    }

    const key = input.key as WritableConfigKey;
    const value = this.normalize(key, input.value, networks);
    if (key === "tronlinkSecretKey") {
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
    if ((TRONLINK_CONFIG_KEYS as readonly string[]).includes(key)) {
      if (raw.length === 0 || raw.length > 256 || /[\u0000-\u001f\u007f]/.test(raw)) {
        throw new UsageError("invalid_value", `${key} must be 1 to 256 characters without control characters`);
      }
      return raw;
    }
    return networks.resolve(raw).id;
  }
}

function maskSecret(value: string | undefined): string | undefined {
  return value ? "********" : undefined;
}
