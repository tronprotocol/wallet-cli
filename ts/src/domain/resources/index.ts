/**
 * Resource Registry — the single source of TRON resource facts. Folds the scattered
 * `resource === "energy" ? "ENERGY" : "BANDWIDTH"` ternaries and the repeated
 * `"ENERGY" | "BANDWIDTH"` unions into one canonical table.
 *
 * Scope is deliberately narrow: the user-facing name, the canonical RPC code, and the display
 * label. TRON response field shapes (EnergyUsed/NetUsed, energy_usage_total) stay where they're
 * parsed — they track the node's JSON, not this enum, so binding them here would over-couple.
 *
 * Adding a resource = one entry in RESOURCE_META (+ the matching node fields where they're read).
 */

/** canonical, lowercase, user-facing resource names — also the ciEnum source tuple. */
export const RESOURCES = ["energy", "bandwidth"] as const;
export type Resource = (typeof RESOURCES)[number];

/** the casing TRON's gRPC/transaction builder expects. */
export type RpcResourceCode = "ENERGY" | "BANDWIDTH";

export interface ResourceMeta {
  resource: Resource;
  rpcCode: RpcResourceCode; // canonical case for the tx builder / node
  label: string; // human display ("Energy" / "Bandwidth")
}

export const RESOURCE_META: Record<Resource, ResourceMeta> = {
  energy: { resource: "energy", rpcCode: "ENERGY", label: "Energy" },
  bandwidth: { resource: "bandwidth", rpcCode: "BANDWIDTH", label: "Bandwidth" },
};

/** lowercase user input → canonical RPC code (was stake.ts's toResourceCode ternary). */
export function toRpcCode(r: Resource): RpcResourceCode {
  return RESOURCE_META[r].rpcCode;
}

/** RPC code (e.g. a frozenV2 `type`) → resource; undefined if unrecognized. */
export function resourceOfRpcCode(code: string): Resource | undefined {
  return RESOURCES.find((r) => RESOURCE_META[r].rpcCode === code);
}
