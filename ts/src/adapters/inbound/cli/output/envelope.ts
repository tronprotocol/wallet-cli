/**
 * OutputEnvelope — the result/error envelope builder for the OutputFormatter. Shapes
 * the user-facing `wallet-cli.result.v1` contract: schema version, chain view, and meta.
 * Pure (no I/O); the formatter turns the envelope into strings.
 */
import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import type { ChainView, ErrorEnvelope, Meta, ResultEnvelope, WarningItem } from "../contracts/index.js";

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

function meta(durationMs: number, warnings: WarningItem[]): Meta {
  return { durationMs, warnings };
}

export const OutputEnvelope = {
  success(
    command: string,
    net: NetworkDescriptor | undefined,
    data: unknown,
    m: { durationMs: number; warnings: WarningItem[] },
  ): ResultEnvelope {
    const env: ResultEnvelope = {
      schema: SCHEMA_VERSION,
      success: true,
      command,
      data: data ?? {},
      meta: meta(m.durationMs, m.warnings),
    };
    if (net) env.chain = chainView(net); // neutral commands omit chain
    return env;
  },

  error(
    command: string,
    net: NetworkDescriptor | undefined,
    err: CliErrorEnvelopeShape,
    m: { durationMs: number; warnings: WarningItem[] },
  ): ErrorEnvelope {
    const env: ErrorEnvelope = {
      schema: SCHEMA_VERSION,
      success: false,
      command,
      error: err,
      meta: meta(m.durationMs, m.warnings),
    };
    if (net) env.chain = chainView(net);
    return env;
  },
};
