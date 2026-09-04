/**
 * The family identity: the named, value-level enum of chain families. Prefer `ChainFamily.tron`
 * over the bare `"tron"` string in comparisons/switches. Kept as a const-object (not a TS `enum`)
 * so the derived type stays a plain `"tron"` string union — bare strings (config data,
 * CLI/RPC boundaries) remain assignable, and references can migrate incrementally.
 *
 * It lives in its own module, apart from the family registry that re-exports it, because the
 * registry depends on the address codec at runtime while this identity depends on nothing. Sharing
 * a module made every type that names a family reach through the registry, which is what closed the
 * `types → family → address → types` cycle.
 */
export const ChainFamily = { tron: "tron", evm: "evm" } as const;
export type ChainFamily = (typeof ChainFamily)[keyof typeof ChainFamily];
