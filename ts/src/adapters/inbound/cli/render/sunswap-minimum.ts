interface FlaggedSide {
  readonly symbol: string;
  readonly acceptsAnyAmount?: boolean;
}

export function zeroMinimumNote(token0: FlaggedSide, token1: FlaggedSide): string | undefined {
  const open = [token0, token1].filter((side) => side.acceptsAnyAmount);
  if (open.length === 2) return "No minimum set — this transaction accepts any output amount.";
  const [side] = open;
  if (side === undefined) return undefined;
  return `No minimum set for ${side.symbol} — this transaction accepts any amount of ${side.symbol}.`;
}
