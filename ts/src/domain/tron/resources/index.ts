export const RESOURCES = ["energy", "bandwidth"] as const;
export type Resource = (typeof RESOURCES)[number];

// Unstaking (UnfreezeV2) entries an account may have pending at once.
export const MAX_UNFREEZING_ENTRIES = 32;

export type RpcResourceCode = "ENERGY" | "BANDWIDTH";

export interface ResourceMeta {
  resource: Resource;
  rpcCode: RpcResourceCode;
  label: string;
}

export const RESOURCE_META: Record<Resource, ResourceMeta> = {
  energy: { resource: "energy", rpcCode: "ENERGY", label: "Energy" },
  bandwidth: { resource: "bandwidth", rpcCode: "BANDWIDTH", label: "Bandwidth" },
};

export function toRpcCode(r: Resource): RpcResourceCode {
  return RESOURCE_META[r].rpcCode;
}
