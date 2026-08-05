export interface QrEncoder {
  /** Returns null when the output device cannot display the full matrix safely. */
  encode(payload: string): string | null;
}
