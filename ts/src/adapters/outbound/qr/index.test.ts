import { describe, expect, it } from "vitest";
import { TerminalQrEncoder } from "./index.js";

const ADDRESS = "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC";

describe("TerminalQrEncoder", () => {
  it("renders a complete fixed-width ANSI-free matrix on a wide TTY", () => {
    const output = new TerminalQrEncoder({
      isTTY: true,
      columns: 120,
    }).encode(ADDRESS);
    const lines = output!.split("\n");

    expect(output).toContain("█");
    expect(output).not.toMatch(/\u001b/);
    expect(lines.length).toBeGreaterThan(10);
    expect(new Set(lines.map((line) => line.length))).toHaveLength(1);
    expect(lines[0]!.trim()).toBe("");
    expect(lines.at(-1)!.trim()).toBe("");
  });

  it("encodes the exact payload rather than returning a static symbol", () => {
    const terminal = { isTTY: true, columns: 120 };
    const first = new TerminalQrEncoder(terminal).encode(ADDRESS);
    const second = new TerminalQrEncoder(terminal).encode(
      "TEkj3ndMVEmFLYaFrATMwMjBRZ1EAZkucT",
    );
    expect(first).not.toBe(second);
  });

  it("degrades for non-TTY and narrow terminals", () => {
    expect(new TerminalQrEncoder({
      isTTY: false,
      columns: 120,
    }).encode(ADDRESS)).toBeNull();
    expect(new TerminalQrEncoder({
      isTTY: true,
      columns: 10,
    }).encode(ADDRESS)).toBeNull();
  });

  it("rejects unsafe payload text before encoding", () => {
    expect(() =>
      new TerminalQrEncoder({
        isTTY: true,
        columns: 120,
      }).encode("address\u202e")
    ).toThrow(/safe characters/);
  });
});
