import { createHmac } from "node:crypto";
import { ChainError } from "../../../domain/errors/index.js";

export interface TronLinkCredentials {
  secretId: string;
  secretKey: string;
  channel: string;
}

export function canonicalTronLinkQuery(parameters: Readonly<Record<string, string>>): string {
  const entries = Object.entries(parameters);
  if (entries.length === 0) {
    throw new ChainError("provider_error", "TronLink signature parameters are empty");
  }
  return entries
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

/** Canonical form used by Java MultiSignService; values are signed before URL encoding. */
export function signTronLinkRequest(
  method: string,
  path: string,
  parameters: Readonly<Record<string, string>>,
  secretKey: string,
): { canonical: string; signature: string } {
  if (!secretKey) throw new ChainError("provider_error", "TronLink multi-sign secret key is not configured");
  if (!/^\/[a-z0-9/_-]+$/i.test(path)) {
    throw new ChainError("provider_error", "invalid TronLink request path");
  }
  const canonical = `${method.toUpperCase()}${path}?${canonicalTronLinkQuery(parameters)}`;
  return {
    canonical,
    signature: createHmac("sha256", secretKey).update(canonical, "utf8").digest("base64"),
  };
}

export function tronLinkAuthParameters(
  credentials: TronLinkCredentials,
  clock: () => number,
  uuid: () => string,
): Record<string, string> {
  return {
    sign_version: "v1",
    channel: credentials.channel,
    secret_id: credentials.secretId,
    ts: String(clock()),
    uuid: uuid(),
  };
}

export function encodeTronLinkQuery(parameters: Readonly<Record<string, string>>): string {
  return Object.entries(parameters)
    .map(([key, value]) => `${javaUrlEncode(key)}=${javaUrlEncode(value)}`)
    .join("&");
}

/** java.net.URLEncoder compatibility: form encoding uses '+' for spaces and escapes '~'. */
function javaUrlEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()~]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, "+");
}
