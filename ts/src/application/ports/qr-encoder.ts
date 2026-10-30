// The output device the symbol is drawn on.
export interface QrDisplay {
  isTTY: boolean;
  columns: number;
}

export interface QrEncoder {
  // Null when the display cannot safely show the full matrix.
  encode(payload: string, display: QrDisplay): string | null;
}
