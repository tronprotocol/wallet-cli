import { describe, expect, it } from "vitest";
import { bestRoute } from "./route-choice.js";

const route = (amountOutRaw: string, fee = "0", hops = 2) => ({
  amountOutRaw,
  fee,
  path: Array.from({ length: hops }, (_, i) => i),
});

describe("bestRoute", () => {
  it("takes the most received, not the first returned nor the cheapest", () => {
    const routes = [
      route("34344609", "0.050000", 3),
      route("34376047", "0.349846", 3),
      route("34356307", "0.349849", 4),
    ];
    expect(bestRoute(routes).amountOutRaw).toBe("34376047");
  });

  it("compares amounts as integers, past what a double holds", () => {
    const routes = [route("251195108099911856524055"), route("251195108099911856524056")];
    expect(bestRoute(routes).amountOutRaw).toBe("251195108099911856524056");
    expect(Number("251195108099911856524055")).toBe(Number("251195108099911856524056"));
  });

  it("breaks a tie on output by the lower fee", () => {
    const routes = [route("100", "0.30"), route("100", "0.05"), route("100", "0.10")];
    expect(bestRoute(routes).fee).toBe("0.05");
  });

  it("breaks a tie on fee by the fewest hops, because each hop can fail", () => {
    const routes = [route("100", "0.05", 4), route("100", "0.05", 2), route("100", "0.05", 3)];
    expect(bestRoute(routes).path).toHaveLength(2);
  });

  it("breaks a full tie by the order the router returned", () => {
    const first = route("100", "0.05", 2);
    const second = route("100", "0.05", 2);
    expect(bestRoute([first, second])).toBe(first);
    expect(bestRoute([second, first])).toBe(second);
  });

  it("compares fees without floats", () => {
    const routes = [route("100", "0.1"), route("100", "0.10"), route("100", "0.0999999999999999")];
    expect(bestRoute(routes).fee).toBe("0.0999999999999999");
  });

  it("refuses an empty candidate list rather than returning nothing", () => {
    expect(() => bestRoute([])).toThrow(/no route/);
  });
});
