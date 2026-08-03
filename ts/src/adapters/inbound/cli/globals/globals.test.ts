import { describe, it, expect } from "vitest";
import { GLOBAL_FLAG_SPECS } from "./index.js";
import { gasFreeTransferSpec } from "../commands/gasfree.js";

const spec = (name: string) => GLOBAL_FLAG_SPECS.find((f) => f.name === name)!;

// Global flag descriptions are rendered verbatim under every command that offers the flag, so they
// have to hold for all of them. `gasfree transfer` sets broadcasts:true — which is what surfaces
// --wait — but it does not broadcast anything: it submits to the GasFree provider and returns a
// traceId, and --wait polls the provider's trace API. Wording written for the on-chain path was
// therefore not merely vague on that command, it was false.
describe("global --wait / --timeout wording holds for every command that shows them", () => {
  it("offers --wait on gasfree transfer, which never broadcasts", () => {
    expect(gasFreeTransferSpec.broadcasts).toBe(true);
  });

  it("does not describe --wait as an on-chain broadcast returning a txid", () => {
    const text = spec("wait").description;
    expect(text).not.toMatch(/broadcast/i);
    expect(text).not.toMatch(/txid/i);
    // it still has to say what waiting buys you and what the default does
    expect(text).toMatch(/confirmed/i);
    expect(text).toMatch(/without blocking/i);
  });

  // --timeout really does cap Ledger calls, so naming the device is right; the defect was that
  // "per RPC/device call" enumerated only those two and left out the service APIs (GasFree,
  // TronLink) it equally bounds, on commands that touch no node and no device at all.
  it("covers service calls too, not just node RPC and the device", () => {
    const text = spec("timeout").description;
    expect(text).toMatch(/service/i);
    expect(text).toMatch(/device/i);
    expect(text).toMatch(/node/i);
  });
});
