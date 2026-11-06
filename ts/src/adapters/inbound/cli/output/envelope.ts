import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import type { ChainView, ErrorEnvelope, Meta, ResultEnvelope } from "../contracts/index.js";

type CliErrorEnvelopeShape = { code: string; message: string; details?: object };

const SCHEMA_VERSION = "wallet-cli.result.v1" as const;

// Serialize bigint as decimal strings and Uint8Array as hex.
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
    if (net) env.chain = chainView(net);
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
