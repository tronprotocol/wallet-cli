export interface QrEncoder {
  // Null when the output device cannot safely display the full matrix.
  encode(payload: string): string | null;
}
