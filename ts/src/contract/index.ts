/**
 * Contract (L1) — the mechanism for defining a command: shared zod primitives and
 * the OutputEnvelope builder. Per-command schemas live with each chain command.
 * One zod = validation + types + help + agent schema (no drift). (plan §3 L1 / §7.7)
 */
import { z } from "zod";
import type {
  ChainFamily,
  ChainView,
  CommandDefinition,
  ErrorEnvelope,
  Meta,
  NetworkDescriptor,
  ResultEnvelope,
} from "../types/index.js";
import { addressCodec } from "../address/index.js";

type CliErrorEnvelopeShape = { code: string; message: string; details?: object };

/** shared, reusable zod primitives (values). */
export const Schemas = {
  evmAddress: () =>
    z.string().refine((v) => addressCodec("evm").validate(v), { message: "invalid EVM address" }),
  base58Address: () =>
    z.string().refine((v) => addressCodec("tron").validate(v), { message: "invalid TRON address" }),
  addressFor: (family: ChainFamily) =>
    z.string().refine((v) => addressCodec(family).validate(v), { message: `invalid ${family} address` }),
  /** non-negative big integer as a string (wei/sun are always safe as strings). */
  uintString: () => z.string().regex(/^\d+$/, "must be a non-negative integer string"),
  amount: () => z.string().regex(/^\d+$/, "amount must be a non-negative integer string"),
  label: () => z.string().trim().min(1).max(64),
};

const SCHEMA_VERSION = "wallet-cli.result.v1" as const;

/** JSON serialization that keeps big numbers as strings (plan §7.7). */
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
    networkId: net.id,
    network: net.aliases[0] ?? net.chainId,
    chainId: net.chainId,
  };
}

function meta(durationMs: number, warnings: string[]): Meta {
  return { durationMs, warnings };
}

export const OutputEnvelope = {
  success(
    cmd: CommandDefinition,
    net: NetworkDescriptor | undefined,
    data: unknown,
    m: { durationMs: number; warnings: string[] },
  ): ResultEnvelope {
    const env: ResultEnvelope = {
      schema: SCHEMA_VERSION,
      success: true,
      command: cmd.id,
      data: data ?? {},
      meta: meta(m.durationMs, m.warnings),
    };
    if (net) env.chain = chainView(net); // 修正⑥: neutral commands omit chain
    return env;
  },

  error(
    commandId: string,
    net: NetworkDescriptor | undefined,
    err: CliErrorEnvelopeShape,
    m: { durationMs: number; warnings: string[] },
  ): ErrorEnvelope {
    const env: ErrorEnvelope = {
      schema: SCHEMA_VERSION,
      success: false,
      command: commandId,
      error: err,
      meta: meta(m.durationMs, m.warnings),
    };
    if (net) env.chain = chainView(net);
    return env;
  },
};
