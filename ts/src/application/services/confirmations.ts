// Excludes the including block; omits unknown or lagging heads.
export function confirmationsOf(head: unknown, block: unknown): { confirmations?: number } {
  if (head === undefined || head === null || block === undefined || block === null) return {};
  const depth = Number(head) - Number(block);
  return Number.isFinite(depth) && depth >= 0 ? { confirmations: depth } : {};
}
