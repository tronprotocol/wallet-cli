import { describe, expect, it } from "vitest";
import { reportFatal } from "./fatal.js";

function capture() {
  const lines: string[] = [];
  return { lines, streams: { errorLine: (line: string) => void lines.push(line) } };
}

describe("reportFatal", () => {
  it("writes the error message as one fatal line and exits 1", () => {
    const { lines, streams } = capture();
    expect(reportFatal(new Error("boom"), streams)).toBe(1);
    expect(lines).toEqual(["fatal: boom"]);
  });

  it("falls back to the value's text when it has no message", () => {
    const { lines, streams } = capture();
    reportFatal("plain", streams);
    reportFatal(undefined, streams);
    expect(lines).toEqual(["fatal: plain", "fatal: undefined"]);
  });
});
