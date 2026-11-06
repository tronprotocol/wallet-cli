// Validity of configuration values; loading, `config set`, and flags apply the same rules.
import type { OutputMode } from "../types/index.js";

export interface ValueRule<T> {
  accepts(value: unknown): value is T;
  // Completes "must be ...".
  description: string;
}

// The largest delay a Node timer accepts; 0 means no deadline.
export const MAX_TIMEOUT_MS = 2_147_483_647;

export const TIMEOUT_MS_RULE: ValueRule<number> = {
  accepts: (value): value is number =>
    Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_TIMEOUT_MS,
  description: `an integer from 0 to ${MAX_TIMEOUT_MS}`,
};

// Decimal digits only, so "", "1e3", and "0x10" do not pass as numbers; NaN fails the rule.
export function timeoutMsFromText(text: string): number {
  return /^\d+$/.test(text) ? Number(text) : Number.NaN;
}

export const OUTPUT_MODES = ["text", "json"] as const satisfies readonly OutputMode[];

export function isOutputMode(value: unknown): value is OutputMode {
  return OUTPUT_MODES.includes(value as OutputMode);
}

// Service credentials, read only from stdin and stored with mode 0600; networks.<id>.apiKey is the sixth.
export const CREDENTIAL_CONFIG_KEYS = [
  "tronlinkSecretId",
  "tronlinkSecretKey",
  "gasfreeApiKey",
  "gasfreeApiSecret",
  "baiApiKey",
] as const;
export type CredentialConfigKey = (typeof CREDENTIAL_CONFIG_KEYS)[number];
export const NETWORK_CREDENTIAL_FIELD = "apiKey";

export function isCredentialConfigKey(key: string): key is CredentialConfigKey {
  return (CREDENTIAL_CONFIG_KEYS as readonly string[]).includes(key);
}

// Credentials and the TronLink channel share this shape.
export const CREDENTIAL_VALUE_RULE: ValueRule<string> = {
  accepts: (value): value is string =>
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    !/[\u0000-\u001f\u007f]/.test(value),
  description: "1 to 256 characters without control characters",
};

// HTTP token syntax excludes separators and control characters that permit header injection.
export const HEADER_NAME_RULE: ValueRule<string> = {
  accepts: (value): value is string =>
    typeof value === "string" && /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,64}$/.test(value.trim()),
  description: "an HTTP header name: 1 to 64 characters, no spaces, colons or control characters",
};

export const HTTP_URL_RULE: ValueRule<string> = {
  accepts: (value): value is string => {
    if (typeof value !== "string") return false;
    try {
      const protocol = new URL(value.trim()).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  },
  description: "an absolute http(s) URL",
};

/**
 * Sets one field of a network's configuration, keyed by its canonical id. Entries that name the
 * same network by an alias are folded into it first: two keys for one network are invalid.
 */
export function withNetworkField<V>(
  entries: Readonly<Record<string, Readonly<Record<string, V>>>>,
  id: string,
  sameNetwork: (key: string) => boolean,
  field: string,
  value: V,
): Record<string, Record<string, V>> {
  const kept: Record<string, Record<string, V>> = {};
  let folded: Record<string, V> = {};
  for (const [key, fields] of Object.entries(entries)) {
    if (sameNetwork(key)) folded = { ...folded, ...fields };
    else kept[key] = { ...fields };
  }
  return { ...kept, [id]: { ...folded, [field]: value } };
}
