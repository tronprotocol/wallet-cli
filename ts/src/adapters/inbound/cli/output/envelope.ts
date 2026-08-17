/**
 * OutputEnvelope — the result/error envelope builder for the OutputFormatter. Shapes
 * the user-facing `wallet-cli.result.v1` contract: schema version, chain view, and meta.
 * Pure (no I/O); the formatter turns the envelope into strings.
 */
import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import type { ChainView, ErrorEnvelope, Meta, ResultEnvelope } from "../contracts/index.js";

type CliErrorEnvelopeShape = { code: string; message: string; details?: object };

const SCHEMA_VERSION = "wallet-cli.result.v1" as const;

/** JSON serialization that keeps big numbers as strings. */
export function toJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (typeof v === "bigint") return v.toString();
    if (v instanceof Uint8Array) return Buffer.from(v).toString("hex");
    return v;
  });
}

function chainView(net: NetworkDescriptor): ChainView {
  return {
    family: net.family,
    network: net.id,
    chainId: net.chainId,
  };
}

/** Copy so the caller's object cannot be mutated through the envelope. Takes the whole Meta rather
 *  than field-by-field arguments: optional members (pagination) are then carried automatically
 *  instead of being silently dropped each time one is added. */
function meta(m: Meta): Meta {
  return { ...m };
}

export const OutputEnvelope = {
  success(
    command: string,
    net: NetworkDescriptor | undefined,
    data: unknown,
    m: Meta,
  ): ResultEnvelope {
    const env: ResultEnvelope = {
      schema: SCHEMA_VERSION,
      success: true,
      command,
      data: data ?? {},
      meta: meta(m),
    };
    if (net) env.chain = chainView(net); // neutral commands omit chain
    return env;
  },

  error(
    command: string,
    net: NetworkDescriptor | undefined,
    err: CliErrorEnvelopeShape,
    m: Meta,
  ): ErrorEnvelope {
    const env: ErrorEnvelope = {
      schema: SCHEMA_VERSION,
      success: false,
      command,
      error: err,
      meta: meta(m),
    };
    if (net) env.chain = chainView(net);
    return env;
  },
};
