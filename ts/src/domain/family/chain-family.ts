// Keep family identity independent of the registry to avoid address/type import cycles.
export const ChainFamily = { tron: "tron", evm: "evm" } as const;
export type ChainFamily = (typeof ChainFamily)[keyof typeof ChainFamily];
