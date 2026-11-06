import { describe, expect, it } from "vitest";
import { TerminalQrEncoder } from "./index.js";

const ADDRESS = "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC";

describe("TerminalQrEncoder", () => {
  it("renders a complete fixed-width ANSI-free matrix on a wide TTY", () => {
    const output = new TerminalQrEncoder().encode(ADDRESS, {
      isTTY: true,
      columns: 120,
    });
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
    const first = new TerminalQrEncoder().encode(ADDRESS, terminal);
    const second = new TerminalQrEncoder().encode("TEkj3ndMVEmFLYaFrATMwMjBRZ1EAZkucT", terminal);
    expect(first).not.toBe(second);
  });

  it("degrades for non-TTY and narrow terminals", () => {
    expect(
      new TerminalQrEncoder().encode(ADDRESS, {
        isTTY: false,
        columns: 120,
      }),
    ).toBeNull();
    expect(
      new TerminalQrEncoder().encode(ADDRESS, {
        isTTY: true,
        columns: 10,
      }),
    ).toBeNull();
  });

  it("rejects unsafe payload text before encoding", () => {
    expect(() =>
      new TerminalQrEncoder().encode("address\u202e", {
        isTTY: true,
        columns: 120,
      }),
    ).toThrow(/safe characters/);
  });
});
