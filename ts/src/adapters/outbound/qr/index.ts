import QRCode from "qrcode";
import type { QrEncoder } from "../../../application/ports/qr-encoder.js";
import { UsageError } from "../../../domain/errors/index.js";

interface TerminalShape {
  isTTY?: boolean;
  columns?: number;
}

/** Compact ANSI-free half-block QR renderer with a four-module quiet zone. */
export class TerminalQrEncoder implements QrEncoder {
  constructor(
    private readonly terminal: TerminalShape = process.stdout,
  ) {}

  encode(payload: string): string | null {
    if (
      payload.length === 0
      || payload.length > 512
      || /[\p{Cc}\p{Cf}]/u.test(payload)
    ) {
      throw new UsageError(
        "invalid_value",
        "QR payload must contain 1-512 safe characters",
      );
    }
    if (!this.terminal.isTTY) return null;

    let matrix: ReturnType<typeof QRCode.create>["modules"];
    try {
      matrix = QRCode.create(payload, {
        errorCorrectionLevel: "M",
      }).modules;
    } catch {
      throw new UsageError(
        "invalid_value",
        "could not encode the receive address as a QR code",
      );
    }
    const quietZone = 4;
    const width = matrix.size + quietZone * 2;
    if ((this.terminal.columns ?? 0) < width) return null;

    const bit = (row: number, column: number): boolean =>
      row >= quietZone
      && row < matrix.size + quietZone
      && column >= quietZone
      && column < matrix.size + quietZone
      && matrix.get(
        row - quietZone,
        column - quietZone,
      ) === 1;
    const lines: string[] = [];
    for (let row = 0; row < width; row += 2) {
      let line = "";
      for (let column = 0; column < width; column += 1) {
        const top = bit(row, column);
        const bottom = bit(row + 1, column);
        line +=
          top
            ? bottom ? "█" : "▀"
            : bottom ? "▄" : " ";
      }
      // Retain the right quiet zone; it is part of the scannable symbol.
      lines.push(line);
    }
    return lines.join("\n");
  }
}
