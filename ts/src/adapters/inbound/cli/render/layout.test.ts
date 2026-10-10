import { describe, expect, it } from "vitest";
import stringWidth from "string-width";
import { table } from "./layout.js";

/** every line of a table must occupy the same number of terminal columns. */
const widths = (rendered: string) => [
  ...new Set(rendered.split("\n").map((line) => stringWidth(line))),
];

describe("table alignment", () => {
  it("aligns plain ASCII", () => {
    const out = table(
      ["Symbol", "Name"],
      [
        ["TRX", "TRX"],
        ["USDT", "Tether USD"],
      ],
    );
    expect(widths(out)).toHaveLength(1);
    expect(out.split("\n")[0]).toBe("| Symbol | Name       |");
  });

  /**
   * The case this exists for. `波场人生` is a real token name on this chain: four characters, eight
   * terminal columns. Padding by string length leaves its row four columns too wide and bends
   * every column to its right — and the value comes from a contract, so nothing on our side can
   * keep it ASCII.
   */
  it("aligns a CJK token name by display width, not character count", () => {
    const out = table(
      ["Symbol", "Name", "Protocol"],
      [
        ["TRX", "波场人生", "ALL"],
        ["USDT", "Tether USD", "ALL"],
      ],
    );
    expect(widths(out)).toHaveLength(1);
    // the CJK cell is padded to the same visible width as the longest name
    expect(out).toContain("| 波场人生   |");
  });

  it("aligns a full-width name that is the widest cell in its column", () => {
    const out = table(
      ["Name", "X"],
      [
        ["波场人生大世界", "1"],
        ["ok", "2"],
      ],
    );
    expect(widths(out)).toHaveLength(1);
  });

  it("aligns an emoji, which is also two columns wide", () => {
    const out = table(
      ["Name", "X"],
      [
        ["🚀 moon", "1"],
        ["plain", "2"],
      ],
    );
    expect(widths(out)).toHaveLength(1);
  });

  it("handles a mixed-width column where the header is the widest", () => {
    const out = table(["Protocol", "N"], [["V3", "1"]]);
    expect(widths(out)).toHaveLength(1);
  });

  it("renders a header-only table", () => {
    const out = table(["A", "B"], []);
    expect(out.split("\n")).toHaveLength(2);
    expect(widths(out)).toHaveLength(1);
  });
});
