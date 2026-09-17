/** Current SUN/energy, preserving integer precision; invalid/missing prices stay unknown. */
export function currentTronEnergyPrice(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  if (/^[1-9]\d*$/.test(value)) return value;
  const last = value.split(",").at(-1);
  const match = /^(?:0|[1-9]\d*):([1-9]\d*)$/.exec(last ?? "");
  return match?.[1];
}
