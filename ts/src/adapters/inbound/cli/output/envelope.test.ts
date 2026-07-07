import { describe, it, expect } from "vitest";
import { OutputEnvelope } from "./envelope.js";

// Single shipping family (TRON); the envelope no longer redacts addresses — it passes the
// command's result payload through verbatim under the wallet-cli.result.v1 contract.
const command = "current";
const m = { durationMs: 0, warnings: [] };

describe("OutputEnvelope.success — result payload passthrough", () => {
  it("passes a single descriptor's addresses map through unchanged", () => {
    const data = { accountId: "a.0", addresses: { tron: "Ttron" } };
    const env = OutputEnvelope.success(command, undefined, data, m);
    expect((env.data as { addresses: Record<string, string> }).addresses).toEqual({ tron: "Ttron" });
  });

  it("passes a list of descriptors through unchanged", () => {
    const data = [
      { accountId: "a.0", addresses: { tron: "Ttron0" } },
      { accountId: "a.1", addresses: { tron: "Ttron1" } },
    ];
    const env = OutputEnvelope.success(command, undefined, data, m);
    expect(env.data).toEqual(data);
  });

  it("leaves data without an addresses field untouched", () => {
    const data = { accountId: "a.0", scope: "wallet", secretRemoved: true };
    const env = OutputEnvelope.success(command, undefined, data, m);
    expect(env.data).toEqual(data);
  });
});
